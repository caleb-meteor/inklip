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
      getVideoDataDirectory: () => Promise<string>
      setVideoDataDirectory: (directory: string) => Promise<{ success: boolean; error?: string }>
      selectVideoDataDirectory: () => Promise<{
        success: boolean
        canceled?: boolean
        error?: string
        directory?: string
        oldDirectory?: string
      }>
      getAppConfig: () => Promise<{ videoDataDirectory?: string }>
      restartBackend: () => Promise<{ success: boolean }>
      checkBackendHealth: () => Promise<{ available: boolean; reason?: string }>
      selectVideoFile: () => Promise<{
        success: boolean
        canceled?: boolean
        error?: string
        filePaths: string[]
      }>
      selectVideoFolder: () => Promise<{
        success: boolean
        canceled?: boolean
        error?: string
        folderPath?: string
        videoFiles?: string[]
        subtitleFiles?: Record<string, string>
      }>
      getAppVersion: () => Promise<string>
    }
  }
}
