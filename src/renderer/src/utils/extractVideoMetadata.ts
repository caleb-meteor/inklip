/**
 * 使用浏览器 Video API 从本地视频路径提取元数据（封面、时长、尺寸）
 * 依赖 media:// 协议加载视频
 */
import { getMediaUrl } from './media'

export interface VideoMetadata {
  duration: number
  width: number
  height: number
  coverBase64?: string
}

/**
 * 从视频路径提取元数据
 */
export function extractVideoMetadata(path: string): Promise<VideoMetadata> {
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
        const duration = Math.round(video.duration) || 0
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
        resolve({ duration, width, height, coverBase64 })
      } catch {
        const duration = Math.round(video.duration) || 0
        const width = video.videoWidth || 0
        const height = video.videoHeight || 0
        cleanup()
        resolve({ duration, width, height })
      }
    }

    video.load()
  })
}

/**
 * 批量提取视频元数据
 */
export async function extractVideoMetadatas(
  paths: string[]
): Promise<Map<string, VideoMetadata>> {
  const results = new Map<string, VideoMetadata>()
  const settled = await Promise.allSettled(
    paths.map(async (p) => {
      const meta = await extractVideoMetadata(p)
      return { path: p, meta }
    })
  )
  for (const s of settled) {
    if (s.status === 'fulfilled') {
      results.set(s.value.path, s.value.meta)
    }
  }
  return results
}
