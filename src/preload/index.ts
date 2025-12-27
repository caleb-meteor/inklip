import { contextBridge, webUtils } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  downloadVideo: (sourcePath: string, fileName: string) =>
    electronAPI.ipcRenderer.invoke('download-video', sourcePath, fileName),
  getBackendPort: () => electronAPI.ipcRenderer.invoke('get-backend-port'),
  showNotification: (title: string, body: string, route: string) =>
    electronAPI.ipcRenderer.send('show-notification', title, body, route),
  onNavigate: (callback: (route: string) => void) =>
    electronAPI.ipcRenderer.on('navigate-to', (_event, route) => callback(route)),
  onBackendPort: (callback: (port: number) => void) =>
    electronAPI.ipcRenderer.on('backend-port', (_event, port) => callback(port)),
  checkResources: () => electronAPI.ipcRenderer.invoke('check-resources'),
  downloadResources: () => electronAPI.ipcRenderer.invoke('download-resources'),
  onDownloadProgress: (callback) =>
    electronAPI.ipcRenderer.on('download-progress', (_event, progress) => callback(progress))
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
