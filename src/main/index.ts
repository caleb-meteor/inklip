import { app, shell, BrowserWindow, protocol, nativeImage } from 'electron'
import { join } from 'path'
import fs from 'fs'
import path from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { BackendService } from './services/backend'
import { registerIpcHandlers } from './ipc/handlers'
import { abortAllDownloads } from './utils/download'

let mainWindow: BrowserWindow | null = null
let isQuitting = false

// MIME type mapping
const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo'
} as const

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
    width: 1024,
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
  protocol.handle('media', handleMediaProtocol)

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

/**
 * Decode and normalize URL path
 */
function decodeUrlPath(url: string): string {
  let pathPart = url.replace(/^media:\/\/+/, '')
  
  try {
    pathPart = decodeURIComponent(pathPart)
  } catch (e) {
    console.warn('[Main] Failed to decode path:', pathPart, e)
    // Try to fix drive letter if missing
    if (pathPart.match(/^[A-Za-z]\//) && !pathPart.match(/^[A-Za-z]:\//)) {
      const driveLetter = pathPart[0].toUpperCase()
      pathPart = driveLetter + ':/' + pathPart.substring(2)
    }
  }
  
  return pathPart
}

/**
 * Normalize path to platform-specific format
 */
function normalizeFilePath(pathPart: string): string {
  if (process.platform === 'win32') {
    // Normalize to forward slashes first
    pathPart = pathPart.replace(/\\/g, '/')
    
    // Fix missing colon in drive letter (e/data -> E:/data)
    if (pathPart.match(/^[A-Za-z]\//) && !pathPart.match(/^[A-Za-z]:\//)) {
      const driveLetter = pathPart[0].toUpperCase()
      pathPart = driveLetter + ':/' + pathPart.substring(2)
    }
    
    // Convert to Windows native format (E:/path -> E:\path)
    if (pathPart.match(/^[A-Za-z]:\//)) {
      return pathPart.replace(/\//g, '\\')
    } else if (pathPart.match(/^[A-Za-z]:$/)) {
      return pathPart + '\\'
    } else if (pathPart.match(/^[A-Za-z]\//)) {
      const driveLetter = pathPart[0].toUpperCase()
      const rest = pathPart.substring(2).replace(/\//g, '\\')
      return driveLetter + ':\\' + rest
    } else {
      return pathPart.replace(/\//g, '\\')
    }
  } else {
    // Unix: ensure leading slash
    return pathPart.startsWith('/') ? pathPart : '/' + pathPart
  }
}

/**
 * Try alternative path formats if file not found (Windows only)
 */
function tryAlternativePaths(filePath: string, pathPart: string): string | null {
  if (process.platform !== 'win32') return null
  
  // Try uppercase drive letter
  if (filePath.match(/^[a-z]\\/)) {
    const altPath = filePath[0].toUpperCase() + filePath.substring(1)
    if (fs.existsSync(altPath)) {
      console.log('[Main] Found with uppercase drive:', altPath)
      return altPath
    }
  }
  
  // Try adding missing colon
  if (!filePath.match(/^[A-Za-z]:\\/) && filePath.match(/^[A-Za-z]\\/)) {
    const altPath = filePath[0].toUpperCase() + ':\\' + filePath.substring(2)
    if (fs.existsSync(altPath)) {
      console.log('[Main] Found with colon:', altPath)
      return altPath
    }
  }
  
  return null
}

/**
 * Get MIME type from file extension
 */
function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  return MIME_TYPES[ext] || 'application/octet-stream'
}

/**
 * Handle Range request for video files
 */
async function handleRangeRequest(
  filePath: string,
  rangeHeader: string,
  fileSize: number,
  mimeType: string
): Promise<Response | null> {
  const rangeMatch = rangeHeader.match(/bytes=(\d+)-(\d*)/)
  if (!rangeMatch) return null
  
  const start = parseInt(rangeMatch[1], 10)
  const end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : fileSize - 1
  const chunkSize = end - start + 1
  
  // Validate range
  if (start < 0 || end >= fileSize || start > end) {
    return new Response('Range Not Satisfiable', {
      status: 416,
      headers: {
        'Content-Range': `bytes */${fileSize}`
      }
    })
  }
  
  try {
    const fileHandle = await fs.promises.open(filePath, 'r')
    const buffer = Buffer.alloc(chunkSize)
    await fileHandle.read(buffer, 0, chunkSize, start)
    await fileHandle.close()
    
    return new Response(buffer, {
      status: 206, // Partial Content
      headers: {
        'Content-Type': mimeType,
        'Content-Length': chunkSize.toString(),
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes'
      }
    })
  } catch (error) {
    console.error('[Main] Error reading file range:', error)
    return new Response('Error reading file', { status: 500 })
  }
}

/**
 * Handle media:// protocol requests
 */
async function handleMediaProtocol(request: Request): Promise<Response> {
  const pathPart = decodeUrlPath(request.url)
  let filePath = normalizeFilePath(pathPart)
  
  // Log request (Chinese characters may appear as乱码 in console)
  console.log('[Main] Media protocol request:', {
    originalUrl: request.url,
    decodedPath: pathPart,
    normalizedPath: filePath,
    exists: fs.existsSync(filePath)
  })
  
  // Check if file exists, try alternatives if not
  if (!fs.existsSync(filePath)) {
    console.error('[Main] File not found:', filePath)
    const altPath = tryAlternativePaths(filePath, pathPart)
    if (altPath) {
      filePath = altPath
    } else {
      return new Response('File not found', { status: 404 })
    }
  }
  
  // Get file stats
  const stats = fs.statSync(filePath)
  if (!stats.isFile()) {
    return new Response('Not a file', { status: 400 })
  }
  
  // Determine MIME type
  const mimeType = getMimeType(filePath)
  const fileSize = stats.size
  const isVideo = mimeType.startsWith('video/')
  
  // Handle Range requests for videos
  const rangeHeader = request.headers.get('range')
  if (rangeHeader && isVideo) {
    const rangeResponse = await handleRangeRequest(filePath, rangeHeader, fileSize, mimeType)
    if (rangeResponse) return rangeResponse
  }
  
  // Read entire file for images or full requests
  try {
    const fileBuffer = fs.readFileSync(filePath)
    const headers: Record<string, string> = {
      'Content-Type': mimeType,
      'Content-Length': fileBuffer.length.toString()
    }
    
    // Add Accept-Ranges header for videos
    if (isVideo) {
      headers['Accept-Ranges'] = 'bytes'
    }
    
    return new Response(fileBuffer, { headers })
  } catch (error) {
    console.error('[Main] Error reading file:', error)
    return new Response('Error reading file', { status: 500 })
  }
}
