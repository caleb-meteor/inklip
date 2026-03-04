import { app, type BrowserWindow } from 'electron'
import { spawn, execSync, type ChildProcess } from 'child_process'
import fs from 'fs'
import path, { join } from 'path'

/**
 * Windows 下将长路径转为 8.3 短路径，避免中文路径导致 spawn 的子进程无法启动或参数乱码
 */
function getShortPathWin(longPath: string): string {
  if (process.platform !== 'win32') return longPath
  if (!longPath || !fs.existsSync(longPath)) return longPath
  try {
    const escaped = longPath.replace(/'/g, "''")
    const result = execSync(
      `powershell -NoProfile -NonInteractive -Command "(New-Object -ComObject Scripting.FileSystemObject).GetFolder('${escaped}').ShortPath"`,
      { encoding: 'utf8', windowsHide: true, timeout: 5000 }
    )
    const short = result.trim()
    return short || longPath
  } catch {
    return longPath
  }
}

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

    const exeName = isWin ? 'inklip-base.exe' : 'inklip-base'
    const platformArch = `${process.platform}-${process.arch}`
    let backendPath = ''

    if (isDev) {
      backendPath = join(app.getAppPath(), 'resources', platformArch)
    } else {
      backendPath = join(process.resourcesPath, platformArch)
    }

    backendPath = join(backendPath, 'inklip-base', exeName)

    console.log('[Backend Service] Starting backend from:', backendPath)

    if (!fs.existsSync(backendPath)) {
      const msg = `未找到后端可执行文件: ${backendPath}`
      const error = { code: 'E101', message: msg }
      console.error('[Backend Service]', msg)
      this.startupError = error
      if (mainWindow) mainWindow.webContents.send('backend-start-failed', error)
      return
    }

    // 数据目录：Windows 打包版为 C:\ProgramData\Inklip，否则为 userData
    const appDataPath = app.getPath('userData')
    const videoDataPath = appDataPath

    // For both Windows and Mac (flat binary), the bin path is the directory containing the executable
    const binPath = path.dirname(path.dirname(backendPath))
    let pathToSpawn = backendPath
    let cwdToSpawn = binPath
    let appDataPathForArgs = appDataPath

    // Windows 中文路径会导致 spawn 的子进程无法正确启动，使用 8.3 短路径
    if (isWin) {
      if (!fs.existsSync(appDataPath)) fs.mkdirSync(appDataPath, { recursive: true })
      pathToSpawn = getShortPathWin(backendPath)
      cwdToSpawn = getShortPathWin(binPath)
      appDataPathForArgs = getShortPathWin(appDataPath)
      console.log('[Backend Service] Using short paths for spawn (Chinese path fix)')
    }

    const args = ['--app_data_path', appDataPathForArgs, '--bin_path', cwdToSpawn]

    console.log('[Backend Service] Backend app data path:', appDataPath)
    console.log('[Backend Service] Backend video data path:', videoDataPath)
    console.log('[Backend Service] Backend bin path:', binPath)

    // 始终设置 VIDEO_DATA_PATH、APP_VERSION（前端版本，供后端注册设备时上报云端）
    const env = { ...process.env }
    env.VIDEO_DATA_PATH = videoDataPath
    const appVersion = app.getVersion()
    if (appVersion) env.APP_VERSION = appVersion
    const commandStr = `cd "${cwdToSpawn}" && "${pathToSpawn}" ${args.map((a) => `"${a}"`).join(' ')}`
    console.log('[Backend Service] Backend command to run manually:')
    console.log(commandStr)

    this.backendProcess = spawn(pathToSpawn, args, {
      cwd: cwdToSpawn,
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
      console.error('[Backend Log]', data.toString())
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
