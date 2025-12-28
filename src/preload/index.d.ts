import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      getPathForFile: (file: File) => string
      downloadVideo: (
        sourcePath: string,
        fileName: string
      ) => Promise<{ success: boolean; canceled?: boolean; error?: string; path?: string }>
      getBackendPort: () => Promise<number | null>
      getBackendStartupError: () => Promise<{ code: string; message: string } | null>
      showNotification: (title: string, body: string, route: string) => void
      onNavigate: (callback: (route: string) => void) => void
      onBackendPort: (callback: (port: number) => void) => void
      checkResources: () => Promise<boolean>
      downloadResources: () => Promise<void>
      onDownloadProgress: (
        callback: (progress: {
          file: string
          percentage: number
          current: number
          total: number
        }) => void
      ) => void
      onBackendStartFailed: (callback: (error: { code: string; message: string }) => void) => void
    }
  }
}
