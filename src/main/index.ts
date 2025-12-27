import { app, shell, BrowserWindow, protocol, net, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { BackendService } from './services/backend'
import { registerIpcHandlers } from './ipc/handlers'
import { abortAllDownloads } from './utils/download'

let mainWindow: BrowserWindow | null = null
let isQuitting = false

// Register privileged protocol 'media'
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
      stream: true,
      codeCache: true,
      allowServiceWorkers: true
    }
  }
])

function createWindow(): void {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    title: '影氪',
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    const backendPort = BackendService.getInstance().getPort()
    if (backendPort) {
      mainWindow?.webContents.send('backend-port', backendPort)
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Disable DevTools and context menu in production
  if (!is.dev) {
    mainWindow.webContents.on('devtools-opened', () => {
      mainWindow?.webContents.closeDevTools()
    })
  }

  mainWindow.webContents.on('context-menu', (e) => {
    if (!is.dev) {
      e.preventDefault()
    }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.commandLine.appendSwitch('lang', 'zh-CN')
app.whenReady().then(() => {
  // Set app icon for macOS dock
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(nativeImage.createFromPath(icon))
  }

  createWindow()

  // Register custom protocol for local media
  protocol.handle('media', (request) => {
    const pathPart = request.url.replace(/^media:\/\/+/, '')
    const url = 'file:///' + pathPart
    console.log('[Main] Media protocol:', request.url, '->', url)
    return net.fetch(url)
  })

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.inklip.app')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Register IPC handlers
  registerIpcHandlers(
    () => mainWindow,
    () => isQuitting
  )

  // Start backend
  BackendService.getInstance().start(mainWindow)

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  isQuitting = true
  console.log('[Main] App is quitting. Cleanup...')

  abortAllDownloads()
  BackendService.getInstance().kill()
})

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
