import { ipcMain, BrowserWindow, app, dialog, Notification, net, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import { BackendService } from '../services/backend'

export function registerIpcHandlers(
  getMainWindow: () => BrowserWindow | null,
  isQuitting: () => boolean
): void {
  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  /** 导出时弹出「另存为」对话框，返回用户选择的完整路径（可据此得到目录） */
  ipcMain.handle('show-export-save-dialog', async (_event, suggestedName: string) => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return { canceled: true as const, filePath: undefined }
    const defaultPath = path.join(app.getPath('downloads'), suggestedName || 'inklip_export.mp4')
    const { filePath, canceled } = await dialog.showSaveDialog(win, {
      title: '导出视频',
      defaultPath,
      filters: [{ name: '视频文件', extensions: ['mp4'] }]
    })
    if (canceled || !filePath) return { canceled: true as const, filePath: undefined }
    return { canceled: false as const, filePath }
  })

  /** 在资源管理器中定位到文件（打开所在文件夹并选中该文件） */
  ipcMain.handle('show-item-in-folder', async (_event, filePath: string) => {
    if (!filePath || typeof filePath !== 'string') return
    try {
      shell.showItemInFolder(filePath)
    } catch (e) {
      console.error('[IPC] showItemInFolder failed:', e)
    }
  })

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
            } catch {
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
  // 注意：实际配置由 Go 后端管理，这里只返回默认值作为后备
  ipcMain.handle('get-video-data-directory', () => {
    return app.getPath('userData')
  })

  ipcMain.handle('select-video-data-directory', async () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return { success: false, error: '没有活动窗口' }

    // 注意：实际配置由 Go 后端管理，这里只返回默认值作为后备
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
        {
          name: '视频和字幕文件',
          extensions: ['mp4', 'webm', 'mov', 'avi', 'mkv', 'flv', 'wmv', 'm4v', 'srt']
        }
      ]
    })

    if (result.canceled || !result.filePaths.length) {
      return { success: false, canceled: true }
    }

    // 验证文件扩展名（大小写不敏感）
    const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.flv', '.wmv', '.m4v']
    const subtitleExtensions = ['.srt']
    const validFilePaths: string[] = []
    const validSubtitlePaths: string[] = []

    for (const filePath of result.filePaths) {
      const ext = path.extname(filePath).toLowerCase() // 转换为小写，实现大小写不敏感
      if (videoExtensions.includes(ext)) {
        validFilePaths.push(filePath)
      } else if (subtitleExtensions.includes(ext)) {
        validSubtitlePaths.push(filePath)
      } else {
        console.warn(`[IPC] 跳过后缀不支持的文件: ${filePath} (扩展名: ${path.extname(filePath)})`)
      }
    }

    if (validFilePaths.length === 0) {
      return {
        success: false,
        error: '没有选择有效的视频文件'
      }
    }

    // 尝试自动匹配字幕
    const subtitleFiles: Record<string, string> = {}
    validFilePaths.forEach((videoPath) => {
      const videoBaseName = path.basename(videoPath, path.extname(videoPath)).toLowerCase()

      const matchedSubtitle = validSubtitlePaths.find((subPath) => {
        const subBaseName = path.basename(subPath, path.extname(subPath)).toLowerCase()
        return subBaseName === videoBaseName
      })

      if (matchedSubtitle) {
        subtitleFiles[videoPath] = matchedSubtitle
      }
    })

    // 统一返回 filePaths，单个或多个文件都使用批量上传
    return {
      success: true,
      filePaths: validFilePaths,
      subtitleFiles
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
    const subtitleExtensions = ['.srt']

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
        const videoInfo = allFiles.find((f) => f.path === videoFile)
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
    return { videoDataDirectory: app.getPath('userData') }
  })

  ipcMain.handle('get-app-version', () => {
    return app.getVersion()
  })

  ipcMain.handle('restart-backend', () => {
    const mainWindow = getMainWindow()
    BackendService.getInstance().restart(mainWindow)
    return { success: true }
  })

}
