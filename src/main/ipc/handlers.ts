import { ipcMain, BrowserWindow, app, dialog, Notification, net } from 'electron'
import fs from 'fs'
import path, { join } from 'path'
import { downloadFile } from '../utils/download'
import { BackendService } from '../services/backend'

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

  // 选择视频文件（使用中文对话框）
  ipcMain.handle('select-video-file', async () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return { success: false, error: '没有活动窗口' }

    const result = await dialog.showOpenDialog(win, {
      title: '选择视频文件',
      defaultPath: app.getPath('videos'),
      properties: ['openFile'],
      buttonLabel: '选择',
      filters: [
        { name: '视频文件', extensions: ['mp4', 'webm', 'mov', 'avi', 'mkv', 'flv', 'wmv', 'm4v'] }
      ]
    })

    if (result.canceled || !result.filePaths.length) {
      return { success: false, canceled: true }
    }

    return { 
      success: true, 
      filePath: result.filePaths[0]
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

    const models = ['ggml-medium-q5_0.bin', 'ggml-silero-v6.2.0.bin']

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

    const resources = [
      {
        url: 'https://oss-inklip.caleb.center/models/ggml-medium-q5_0.bin',
        name: 'ggml-medium-q5_0.bin',
        sha256:'19fea4b380c3a618ec4723c3eef2eb785ffba0d0538cf43f8f235e7b3b34220f'
      },
      {
        url: 'https://oss-inklip.caleb.center/models/ggml-silero-v6.2.0.bin',
        name: 'ggml-silero-v6.2.0.bin',
        sha256:'2aa269b785eeb53a82983a20501ddf7c1d9c48e33ab63a41391ac6c9f7fb6987'
      }
    ]

    for (const resource of resources) {
      const filePath = join(modelsDir, resource.name)
      await downloadFile(
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
