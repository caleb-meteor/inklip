import { ipcMain, BrowserWindow, app, dialog, Notification } from 'electron'
import fs from 'fs'
import path from 'path'
import { join } from 'path'
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
    if (!win) return { success: false, error: 'No active window' }

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
      return { success: false, error: `Source file does not exist: ${normalizedPath}` }
    }

    const ext = path.extname(normalizedPath).toLowerCase().replace('.', '') || 'mp4'

    const { filePath, canceled } = await dialog.showSaveDialog(win, {
      title: '另存为',
      defaultPath: path.join(app.getPath('downloads'), fileName),
      filters: [{ name: 'Video', extensions: [ext] }]
    })

    if (canceled || !filePath) {
      return { success: false, canceled: true }
    }

    try {
      await fs.promises.copyFile(normalizedPath, filePath)
      return { success: true, path: filePath }
    } catch (error) {
      console.error('[IPC] Export failed:', error)
      return { success: false, error: (error as Error).message }
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

  ipcMain.handle('check-resources', async () => {
    const userDataPath = app.getPath('userData')
    const modelsDir = join(userDataPath, 'models')
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
    const userDataPath = app.getPath('userData')
    const modelsDir = join(userDataPath, 'models')
    if (!fs.existsSync(modelsDir)) {
      fs.mkdirSync(modelsDir, { recursive: true })
    }

    const resources = [
      {
        url: 'https://oss-inklip.caleb.center/models/ggml-medium-q5_0.bin',
        name: 'ggml-medium-q5_0.bin'
      },
      {
        url: 'https://oss-inklip.caleb.center/models/ggml-silero-v6.2.0.bin',
        name: 'ggml-silero-v6.2.0.bin'
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
        isQuitting
      )
    }
  })
}
