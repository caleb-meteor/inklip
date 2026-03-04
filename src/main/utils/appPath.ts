import { app } from 'electron'

/**
 * 应用数据根目录。
 * 主进程启动时（index.ts）在 Windows 打包版会执行 app.setPath('userData', exe同目录/User Data)，
 * 故此处直接返回 userData，即：Windows 打包版为 exe 同目录，其他为默认 userData。
 */
export function getDataRoot(): string {
  return app.getPath('userData')
}
