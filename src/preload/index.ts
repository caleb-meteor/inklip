import { contextBridge, webUtils } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

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
  openExternal: (url: string) => electronAPI.ipcRenderer.invoke('open-external', url)
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
