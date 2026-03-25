import process from 'node:process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { contextBridge, webUtils } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { buildChromeLikeUserAgent } from '../shared/chromeUa'

const __preloadDir = dirname(fileURLToPath(import.meta.url))

// Custom APIs for renderer
const api = {
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  downloadVideo: (sourcePath: string, fileName: string) =>
    electronAPI.ipcRenderer.invoke('download-video', sourcePath, fileName),
  getBackendPort: () => electronAPI.ipcRenderer.invoke('get-backend-port'),
  getBackendStartupError: () => electronAPI.ipcRenderer.invoke('get-backend-startup-error'),
  showNotification: (title: string, body: string, route: string) =>
    electronAPI.ipcRenderer.send('show-notification', title, body, route),
  onNavigate: (callback: (route: string) => void) =>
    electronAPI.ipcRenderer.on('navigate-to', (_event, route) => callback(route)),
  onBackendPort: (callback: (port: number) => void) =>
    electronAPI.ipcRenderer.on('backend-port', (_event, port) => callback(port)),
  onBackendStartFailed: (callback: (error: { code: string; message: string }) => void) =>
    electronAPI.ipcRenderer.on('backend-start-failed', (_event, error) => callback(error)),
  getVideoDataDirectory: () => electronAPI.ipcRenderer.invoke('get-video-data-directory'),
  /** 统一选择目录（标题、默认路径等通过 options 传入） */
  selectDirectory: (options: { title: string; defaultPath?: string; buttonLabel?: string }) =>
    electronAPI.ipcRenderer.invoke('select-directory', options),
  getAppConfig: () => electronAPI.ipcRenderer.invoke('get-app-config'),
  restartBackend: () => electronAPI.ipcRenderer.invoke('restart-backend'),
  checkBackendHealth: () => electronAPI.ipcRenderer.invoke('check-backend-health'),
  selectVideoFile: () => electronAPI.ipcRenderer.invoke('select-video-file'),
  selectVideoFolder: () => electronAPI.ipcRenderer.invoke('select-video-folder'),
  getAppVersion: () => electronAPI.ipcRenderer.invoke('get-app-version'),
  /** 在资源管理器中打开文件所在文件夹并选中该文件 */
  showItemInFolder: (filePath: string) => electronAPI.ipcRenderer.invoke('show-item-in-folder', filePath),
  /** 导出时选择保存位置，返回用户选择的完整路径 */
  showExportSaveDialog: (suggestedName: string) =>
    electronAPI.ipcRenderer.invoke('show-export-save-dialog', suggestedName),
  /** 在默认浏览器中打开链接（如更新下载页） */
  openExternal: (url: string) => electronAPI.ipcRenderer.invoke('open-external', url),
  /** 与当前 Electron Chromium 版本一致的 Chrome 桌面 UA（不含 Electron） */
  getBrowserLikeUserAgent: (): string =>
    buildChromeLikeUserAgent(process.versions.chrome ?? '132.0.0.0', process.platform),
  /** 抖音内嵌 webview 的 preload 绝对路径（webpreferences 要求 absolute path） */
  getDouyinWebviewPreloadPath: (): string =>
    join(__preloadDir, 'douyin-webview.js'),
  /** 主进程打开「类浏览器」独立窗口（无影氪 preload，UA 与 Chrome 对齐） */
  openBrowserLikeWindow: (url: string) => electronAPI.ipcRenderer.invoke('open-browser-like-window', url),
  /** 屏外窗口拉 detail 后下载（不跳转主 webview） */
  downloadDouyinOffscreen: (opts: { awemeId: string; suggestedName: string; savePath?: string }) =>
    electronAPI.ipcRenderer.invoke('douyin-offscreen-download', opts) as Promise<
      | { success: true; path: string }
      | { success: false; error?: string; canceled?: boolean }
    >,
  cancelDouyinDownload: () =>
    electronAPI.ipcRenderer.invoke('douyin-cancel-download') as Promise<{ success: boolean }>,
  onDouyinDownloadProgress: (
    callback: (
      payload:
        | {
            phase: 'update'
            received: number
            total: number
            percent: number | null
            fileLabel: string
          }
        | { phase: 'done' }
    ) => void
  ) => {
    const fn = (
      _event: Electron.IpcRendererEvent,
      payload:
        | {
            phase: 'update'
            received: number
            total: number
            percent: number | null
            fileLabel: string
          }
        | { phase: 'done' }
    ) => callback(payload)
    electronAPI.ipcRenderer.on('douyin-download-progress', fn)
    return () => electronAPI.ipcRenderer.removeListener('douyin-download-progress', fn)
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
