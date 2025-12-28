import { app, type BrowserWindow } from 'electron'
import { spawn, type ChildProcess } from 'child_process'
import fs from 'fs'
import path from 'path'
import { join } from 'path'

export class BackendService {
  private static instance: BackendService
  private backendProcess: ChildProcess | null = null
  private backendPort: number | null = null

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

  public start(mainWindow: BrowserWindow | null): void {
    const isDev = !app.isPackaged
    const platform = process.platform
    const isWin = platform === 'win32'

    if (platform !== 'darwin' && platform !== 'win32') {
      console.error('[Backend Service] Unsupported platform:', platform)
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

    backendPath = join(backendPath, 'inklip_base',exeName)

    console.log('[Backend Service] Starting backend from:', backendPath)

    if (!fs.existsSync(backendPath)) {
      console.error('[Backend Service] Backend executable not found at:', backendPath)
      return
    }

    const userDataPath = app.getPath('userData')
    // For both Windows and Mac (flat binary), the bin path is the directory containing the executable
    const binPath = path.dirname(backendPath)

    console.log('[Backend Service] Backend data path:', userDataPath)
    console.log('[Backend Service] Backend bin path:', binPath)

    const args = ['--app_data_path', userDataPath, '--bin_path', binPath]
    const commandStr = `cd "${binPath}" && "${backendPath}" ${args.map((a) => `"${a}"`).join(' ')}`
    console.log('[Backend Service] Backend command to run manually:')
    console.log(commandStr)

    this.backendProcess = spawn(backendPath, args, {
      cwd: binPath,
      stdio: ['ignore', 'pipe', 'pipe']
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
    })
  }

  public kill(): void {
    if (this.backendProcess) {
      console.log('[Backend Service] Killing backend process...')
      this.backendProcess.kill()
      this.backendProcess = null
    }
  }
}
