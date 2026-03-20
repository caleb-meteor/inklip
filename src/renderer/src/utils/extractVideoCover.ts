/**
 * 使用浏览器 Video API 从本地视频路径提取封面（不读取、不返回时长）
 * 依赖 media:// 协议加载视频
 */
import { getMediaUrl } from './media'

/** 仅封面相关结果，不含时长 */
export interface VideoCoverExtract {
  width: number
  height: number
  coverBase64?: string
}

/**
 * 从视频路径提取首帧封面（不计算或返回 duration）
 */
export function extractVideoCover(path: string): Promise<VideoCoverExtract> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'

    const url = getMediaUrl(path)
    video.src = url

    const cleanup = () => {
      video.src = ''
      video.load()
    }

    video.onerror = () => {
      cleanup()
      reject(new Error(`无法加载视频: ${path}`))
    }

    video.onloadeddata = () => {
      try {
        const width = video.videoWidth || 0
        const height = video.videoHeight || 0
        let coverBase64: string | undefined

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (ctx && width > 0 && height > 0) {
          ctx.drawImage(video, 0, 0, width, height)
          coverBase64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1]
        }
        cleanup()
        resolve({ width, height, coverBase64 })
      } catch {
        const width = video.videoWidth || 0
        const height = video.videoHeight || 0
        cleanup()
        resolve({ width, height })
      }
    }

    video.load()
  })
}
