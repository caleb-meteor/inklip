import { app, type BrowserWindow } from 'electron'
import { spawn, type ChildProcess } from 'child_process'
import fs from 'fs'
import path, { join } from 'path'

export class BackendService {
  private static instance: BackendService
  private backendProcess: ChildProcess | null = null
  private backendPort: number | null = null
  private startupError: { code: string; message: string } | null = null
  private isExplicitKill = false

  private constructor() {
    // Private constructor for singleton
  }

  public static getInstance(): BackendService {
    if (!BackendService.instance) {
      BackendService.instance = new BackendService()
    }
    return BackendService.instance
  }

  public getPort(): number | null {
    return this.backendPort
  }

  public getStartupError(): { code: string; message: string } | null {
    return this.startupError
  }

  public start(mainWindow: BrowserWindow | null): void {
    // Check if in debug mode
    const isDebugMode = process.env.DEBUG_MODE === 'true'
    if (isDebugMode) {
      const debugPort = parseInt(process.env.DEBUG_PORT || '12698', 10)
      console.log('[Backend Service] Debug mode enabled, using port:', debugPort)
      this.backendPort = debugPort
      if (mainWindow) {
        mainWindow.webContents.send('backend-port', debugPort)
      }
      return
    }

    const isDev = !app.isPackaged
    const platform = process.platform
    const isWin = platform === 'win32'
    this.isExplicitKill = false
    this.startupError = null

    if (platform !== 'darwin' && platform !== 'win32') {
      const msg = `不支持的平台: ${platform}`
      const error = { code: 'E100', message: msg }
      console.error('[Backend Service]', msg)
      this.startupError = error
      if (mainWindow) mainWindow.webContents.send('backend-start-failed', error)
      return
    }

    const exeName = isWin ? 'inklip_base.exe' : 'inklip_base'
    const platformArch = `${process.platform}-${process.arch}`
    let backendPath = ''

    if (isDev) {
      backendPath = join(app.getAppPath(), 'resources', platformArch)
    } else {
      backendPath = join(process.resourcesPath, platformArch)
    }

    backendPath = join(backendPath, 'inklip_base', exeName)

    console.log('[Backend Service] Starting backend from:', backendPath)

    if (!fs.existsSync(backendPath)) {
      const msg = `未找到后端可执行文件: ${backendPath}`
      const error = { code: 'E101', message: msg }
      console.error('[Backend Service]', msg)
      this.startupError = error
      if (mainWindow) mainWindow.webContents.send('backend-start-failed', error)
      return
    }

    // APP_DATA_PATH 使用默认的 userData（用于 models、db 等）
    const appDataPath = app.getPath('userData')
    // VIDEO_DATA_PATH 默认等于 APP_DATA_PATH，Python 后端会从配置文件读取实际值
    const videoDataPath = appDataPath
    
    // For both Windows and Mac (flat binary), the bin path is the directory containing the executable
    const binPath = path.dirname(path.dirname(backendPath))

    console.log('[Backend Service] Backend app data path:', appDataPath)
    console.log('[Backend Service] Backend video data path:', videoDataPath)
    console.log('[Backend Service] Backend bin path:', binPath)

    const args = ['--app_data_path', appDataPath, '--bin_path', binPath]
    
    // 始终设置 VIDEO_DATA_PATH 环境变量（可能与 APP_DATA_PATH 相等）
    const env = { ...process.env }
    env.VIDEO_DATA_PATH = videoDataPath
    const commandStr = `cd "${binPath}" && "${backendPath}" ${args.map((a) => `"${a}"`).join(' ')}`
    console.log('[Backend Service] Backend command to run manually:')
    console.log(commandStr)

    this.backendProcess = spawn(backendPath, args, {
      cwd: binPath,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: env
    })

    this.backendProcess.stdout?.on('data', (data) => {
      const output = data.toString()
      console.log('[Backend]', output.trim())
      const match = output.match(/PORT:(\d+)/)
      if (match) {
        const port = parseInt(match[1], 10)
        console.log('[Backend Service] Backend port detected:', port)
        this.backendPort = port
        if (mainWindow) {
          mainWindow.webContents.send('backend-port', port)
        }
      }
    })

    this.backendProcess.stderr?.on('data', (data) => {
      console.error('[Backend Error]', data.toString())
    })

    this.backendProcess.on('exit', (code) => {
      console.log('[Backend Service] Backend exited with code:', code)
      this.backendProcess = null

      // If NOT an explicit kill, it's a crash or failed start
      if (!this.isExplicitKill) {
        const msg = `后端服务异常退出 (代码: ${code})`
        const error = { code: 'E102', message: msg }
        console.error('[Backend Service]', msg)
        this.startupError = error
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('backend-start-failed', error)
        }
      }
    })
  }

  public kill(): void {
    if (this.backendProcess) {
      console.log('[Backend Service] Killing backend process...')
      this.isExplicitKill = true
      this.backendProcess.kill()
      this.backendProcess = null
      this.backendPort = null
      this.startupError = null
    }
  }

  public restart(mainWindow: BrowserWindow | null): void {
    console.log('[Backend Service] Restarting backend...')
    this.kill()
    // Wait a bit for the process to fully terminate
    setTimeout(() => {
      this.start(mainWindow)
    }, 500)
  }
}
