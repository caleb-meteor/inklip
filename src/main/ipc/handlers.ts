import { ipcMain, BrowserWindow, app, dialog, Notification, net } from 'electron'
import fs from 'fs'
import path, { join } from 'path'
import { downloadFile, downloadFileSimple } from '../utils/download'
import { BackendService } from '../services/backend'
import { is } from '@electron-toolkit/utils'

export function registerIpcHandlers(
  getMainWindow: () => BrowserWindow | null,
  isQuitting: () => boolean
): void {
  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  ipcMain.handle('download-video', async (_event, sourcePath: string, fileName: string) => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return { success: false, error: '没有活动窗口' }

    // Normalize path: if it's a URL (file:// or media://), convert to plain path
    let normalizedPath = sourcePath
    if (sourcePath.startsWith('file://')) {
      normalizedPath = sourcePath.replace(/^file:\/\//, '')
    } else if (sourcePath.startsWith('media://')) {
      normalizedPath = sourcePath.replace(/^media:\/+/, '/') // Ensure single leading slash
    }

    // Decode URI in case of special characters
    normalizedPath = decodeURIComponent(normalizedPath)

    if (!fs.existsSync(normalizedPath)) {
      console.error('[IPC] Export source not found:', normalizedPath, '(original:', sourcePath, ')')
      return { success: false, error: `源文件不存在: ${normalizedPath}` }
    }

    const ext = path.extname(normalizedPath).toLowerCase().replace('.', '') || 'mp4'

    const { filePath, canceled } = await dialog.showSaveDialog(win, {
      title: '另存为',
      defaultPath: path.join(app.getPath('downloads'), fileName),
      filters: [{ name: '视频文件', extensions: [ext] }]
    })

    if (canceled || !filePath) {
      return { success: false, canceled: true }
    }

    try {
      await fs.promises.copyFile(normalizedPath, filePath)
      return { success: true, path: filePath }
    } catch (error) {
      console.error('[IPC] Export failed:', error)
      return { success: false, error: `导出失败: ${(error as Error).message}` }
    }
  })

  ipcMain.on('show-notification', (_event, title: string, body: string, route: string) => {
    const notification = new Notification({ title, body })
    notification.on('click', () => {
      const mainWindow = getMainWindow()
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.show()
        mainWindow.focus()
        mainWindow.webContents.send('navigate-to', route)
      }
    })
    notification.show()
  })

  ipcMain.handle('get-backend-port', () => BackendService.getInstance().getPort())
  ipcMain.handle('get-backend-startup-error', () => BackendService.getInstance().getStartupError())

  // 检查后端服务健康状态
  ipcMain.handle('check-backend-health', async () => {
    const port = BackendService.getInstance().getPort()
    if (!port) {
      return { available: false, reason: '后端服务未启动' }
    }

    return new Promise((resolve) => {
      const request = net.request({
        method: 'GET',
        url: `http://127.0.0.1:${port}/health`
      })

      let timeout: NodeJS.Timeout | null = null
      let responseData = ''

      // 设置超时
      timeout = setTimeout(() => {
        request.abort()
        resolve({ available: false, reason: '连接超时（3秒）' })
      }, 3000)

      request.on('response', (response) => {
        response.on('data', (chunk) => {
          responseData += chunk.toString()
        })

        response.on('end', () => {
          if (timeout) clearTimeout(timeout)

          if (response.statusCode === 200) {
            try {
              const data = JSON.parse(responseData)
              if (data.status === 'ok') {
                resolve({ available: true })
              } else {
                resolve({ available: false, reason: '后端服务响应异常' })
              }
            } catch (error) {
              resolve({ available: false, reason: '无法解析后端响应' })
            }
          } else {
            resolve({ available: false, reason: `后端服务响应错误: ${response.statusCode}` })
          }
        })
      })

      request.on('error', (error) => {
        if (timeout) clearTimeout(timeout)
        console.error('[IPC] 后端健康检查失败:', error)
        resolve({ 
          available: false, 
          reason: `无法连接到后端服务: ${error.message}` 
        })
      })

      request.end()
    })
  })

  // 视频数据目录配置相关 IPC
  // 注意：实际配置由 Python 后端管理，这里只返回默认值作为后备
  ipcMain.handle('get-video-data-directory', () => {
    return app.getPath('userData')
  })


  ipcMain.handle('select-video-data-directory', async () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return { success: false, error: '没有活动窗口' }

    // 注意：实际配置由 Python 后端管理，这里只返回默认值作为后备
    const currentDir = app.getPath('userData')
    const result = await dialog.showOpenDialog(win, {
      title: '选择视频数据目录',
      defaultPath: currentDir,
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: '选择'
    })

    if (result.canceled || !result.filePaths.length) {
      return { success: false, canceled: true }
    }

    const selectedDir = result.filePaths[0]
    
    // 只返回选择的目录，迁移工作由前端调用 Python API 完成
    return { 
      success: true, 
      directory: selectedDir,
      oldDirectory: currentDir
    }
  })

  // 选择视频文件（使用中文对话框，支持多选，文件后缀大小写不敏感）
  ipcMain.handle('select-video-file', async () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return { success: false, error: '没有活动窗口' }

    const result = await dialog.showOpenDialog(win, {
      title: '选择视频文件（可多选）',
      properties: ['openFile', 'multiSelections'],
      buttonLabel: '选择',
      filters: [
        { name: '视频文件', extensions: ['mp4', 'webm', 'mov', 'avi', 'mkv', 'flv', 'wmv', 'm4v'] }
      ]
    })

    if (result.canceled || !result.filePaths.length) {
      return { success: false, canceled: true }
    }

    // 验证文件扩展名（大小写不敏感）
    const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.flv', '.wmv', '.m4v']
    const validFilePaths: string[] = []
    
    for (const filePath of result.filePaths) {
      const ext = path.extname(filePath).toLowerCase() // 转换为小写，实现大小写不敏感
      if (videoExtensions.includes(ext)) {
        validFilePaths.push(filePath)
      } else {
        console.warn(`[IPC] 跳过后缀不支持的文件: ${filePath} (扩展名: ${path.extname(filePath)})`)
      }
    }

    if (validFilePaths.length === 0) {
      return { 
        success: false, 
        error: '没有选择有效的视频文件（支持格式: mp4, webm, mov, avi, mkv, flv, wmv, m4v）' 
      }
    }

    // 统一返回 filePaths，单个或多个文件都使用批量上传
    return { 
      success: true, 
      filePaths: validFilePaths
    }
  })

  // 选择文件夹（支持文件夹上传，自动检测视频和字幕文件）
  ipcMain.handle('select-video-folder', async () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return { success: false, error: '没有活动窗口' }

    const result = await dialog.showOpenDialog(win, {
      title: '选择包含视频的文件夹',
      properties: ['openDirectory'],
      buttonLabel: '选择'
    })

    if (result.canceled || !result.filePaths.length) {
      return { success: false, canceled: true }
    }

    const folderPath = result.filePaths[0]
    
    // 扫描文件夹，查找视频文件和字幕文件
    // 使用小写扩展名列表，通过 toLowerCase() 实现大小写不敏感匹配
    const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.flv', '.wmv', '.m4v']
    const subtitleExtensions = ['.srt', '.json']
    
    const videoFiles: string[] = []
    const subtitleFiles: Record<string, string> = {} // 视频文件名 -> 字幕文件路径
    
    try {
      const entries = await fs.promises.readdir(folderPath, { withFileTypes: true })
      
      // 先收集所有文件信息，用于字幕文件匹配（大小写不敏感）
      const allFiles: Array<{ name: string; path: string; ext: string; baseName: string }> = []
      
      for (const entry of entries) {
        if (!entry.isFile()) continue
        
        const fileName = entry.name
        const filePath = path.join(folderPath, fileName)
        const ext = path.extname(fileName).toLowerCase() // 转换为小写，实现大小写不敏感
        const baseName = path.basename(fileName, path.extname(fileName)) // 使用原始扩展名提取基础名
        
        allFiles.push({ name: fileName, path: filePath, ext, baseName })
        
        // 检查是否是视频文件（大小写不敏感）
        if (videoExtensions.includes(ext)) {
          videoFiles.push(filePath)
        }
      }
      
      // 为每个视频文件查找匹配的字幕文件（大小写不敏感）
      for (const videoFile of videoFiles) {
        const videoInfo = allFiles.find(f => f.path === videoFile)
        if (!videoInfo) continue
        
        // 查找匹配的字幕文件（通过文件名匹配，大小写不敏感）
        for (const fileInfo of allFiles) {
          // 跳过视频文件本身
          if (fileInfo.path === videoFile) continue
          
          // 检查基础名是否匹配
          if (fileInfo.baseName.toLowerCase() === videoInfo.baseName.toLowerCase()) {
            // 检查是否是字幕文件扩展名（大小写不敏感）
            if (subtitleExtensions.includes(fileInfo.ext)) {
              subtitleFiles[videoFile] = fileInfo.path
              break // 找到匹配的字幕文件就停止
            }
          }
        }
      }
      
      return {
        success: true,
        folderPath,
        videoFiles,
        subtitleFiles
      }
    } catch (error) {
      console.error('扫描文件夹失败:', error)
      return { 
        success: false, 
        error: `扫描文件夹失败: ${(error as Error).message}` 
      }
    }
  })

  ipcMain.handle('get-app-config', () => {
    // 注意：实际配置由 Python 后端管理，这里只返回默认值作为后备
    return { videoDataDirectory: app.getPath('userData') }
  })

  ipcMain.handle('restart-backend', () => {
    const mainWindow = getMainWindow()
    BackendService.getInstance().restart(mainWindow)
    return { success: true }
  })

  ipcMain.handle('check-resources', async () => {
    const dataPath = app.getPath('userData')
    const modelsDir = join(dataPath, 'models')
    if (!fs.existsSync(modelsDir)) {
      return false
    }

    const models = ['ggml-large-v3-turbo-q5_0.bin', 'ggml-silero-v6.2.0.bin']

    for (const model of models) {
      const filePath = join(modelsDir, model)
      // If final file doesn't exist, it's not ready
      if (!fs.existsSync(filePath)) {
        return false
      }

      // If any .part files exist, it means merge hasn't happened or was interrupted
      // (Though with new logic, part files are deleted after merge)
      // Check for targetPath.part0 etc.
      if (fs.existsSync(`${filePath}.part0`) || fs.existsSync(`${filePath}.part1`)) {
        return false
      }
    }
    return true
  })

  ipcMain.handle('download-resources', async () => {
    const dataPath = app.getPath('userData')
    const modelsDir = join(dataPath, 'models')
    if (!fs.existsSync(modelsDir)) {
      fs.mkdirSync(modelsDir, { recursive: true })
    }

    // 使用 HF Mirror 镜像站点下载模型，提升国内下载速度
    // 参考: https://hf-mirror.com/
    // 
    // Shell 脚本中的 URL 构建逻辑解析：
    // 1. 定义源仓库: src="https://huggingface.co/ggerganov/whisper.cpp"
    // 2. 定义路径前缀: pfx="resolve/main/ggml"
    // 3. 构建下载 URL: $src/$pfx-"$model".bin
    //    结果: https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-{model}.bin
    //
    // HuggingFace URL 转换规则：
    // - 浏览页面 URL: https://hf-mirror.com/ggml-org/whisper-vad/tree/main/ggml-silero-v6.2.0.bin
    // - 真实下载 URL: https://hf-mirror.com/ggml-org/whisper-vad/resolve/main/ggml-silero-v6.2.0.bin
    // - 关键转换：将 /tree/ 替换为 /resolve/ 即可获取真实下载链接
    //
    // URL 格式说明：
    // {repo_url}/resolve/{branch}/{filename}
    // 例如: https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin
    const resources = [
      {
        // Whisper 模型：从 ggerganov/whisper.cpp 仓库下载
        // 仓库 URL: https://hf-mirror.com/ggerganov/whisper.cpp
        // 分支: main
        // 文件名: ggml-large-v3-turbo-q5_0.bin
        // 构建方式: {repo}/resolve/{branch}/{filename}
        url: 'https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin',
        name: 'ggml-large-v3-turbo-q5_0.bin',
        sha256: '394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2' // TODO: 更新为新模型的 SHA256 校验和
      },
      {
        // VAD 模型：从 ggml-org/whisper-vad 仓库下载
        // 仓库 URL: https://hf-mirror.com/ggml-org/whisper-vad
        // 分支: main
        // 文件名: ggml-silero-v6.2.0.bin
        // 构建方式: {repo}/resolve/{branch}/{filename}
        // 如果看到浏览 URL: https://hf-mirror.com/ggml-org/whisper-vad/tree/main/ggml-silero-v6.2.0.bin
        // 只需将 /tree/ 替换为 /resolve/ 即可
        url: 'https://hf-mirror.com/ggml-org/whisper-vad/resolve/main/ggml-silero-v6.2.0.bin',
        name: 'ggml-silero-v6.2.0.bin',
        sha256: '2aa269b785eeb53a82983a20501ddf7c1d9c48e33ab63a41391ac6c9f7fb6987'
      }
    ]

    for (const resource of resources) {
      const filePath = join(modelsDir, resource.name)
      // 使用简化的单线程下载（适合镜像站点）
      await downloadFileSimple(
        resource.url,
        filePath,
        (progress) => {
          const mainWindow = getMainWindow()
          if (mainWindow) {
            console.log(`[IPC] Sending progress for ${resource.name}: ${progress.percentage}%`)
            mainWindow.webContents.send('download-progress', {
              file: resource.name,
              ...progress
            })
          } else {
            console.warn('[IPC] No mainWindow to send progress to')
          }
        },
        isQuitting,
        resource.sha256
      )
    }
  })
}
