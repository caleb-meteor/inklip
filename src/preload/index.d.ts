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
      /** 返回取消监听函数，组件卸载时应调用以避免监听器泄漏 */
      onNavigate: (callback: (route: string) => void) => () => void
      onBackendPort: (callback: (port: number) => void) => () => void
      onBackendStartFailed: (callback: (error: { code: string; message: string }) => void) => () => void
      getVideoDataDirectory: () => Promise<string>
      setVideoDataDirectory: (directory: string) => Promise<{ success: boolean; error?: string }>
      /** 统一选择目录，options: title / defaultPath / buttonLabel */
      selectDirectory: (options: {
        title: string
        defaultPath?: string
        buttonLabel?: string
      }) => Promise<{
        success: boolean
        canceled?: boolean
        error?: string
        directory?: string
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
      /** 在资源管理器中打开文件所在文件夹并选中该文件 */
      showItemInFolder: (filePath: string) => Promise<void>
      /** 导出时选择保存位置，返回 { canceled, filePath } */
      showExportSaveDialog: (suggestedName: string) => Promise<{ canceled: boolean; filePath?: string }>
      /** 在默认浏览器中打开链接（如更新下载页） */
      openExternal: (url: string) => Promise<void>
    }
  }
}
