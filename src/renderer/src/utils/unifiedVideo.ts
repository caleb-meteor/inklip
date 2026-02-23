import type { VideoItem, SmartCutItem } from '../api/video'
import type { FileItem } from '../types/video'
import type { VideoParseProgress } from '../stores/realtime'

/** 统一视频项：兼容上传素材与智能剪辑 */
export type UnifiedVideoSource = VideoItem | SmartCutItem | FileItem | UnifiedVideoLike

/** 最小化的视频-like 结构（如 SmartCutTask 中的完成态） */
export interface UnifiedVideoLike {
  id?: number
  name?: string
  path?: string
  cover?: string
  duration?: number
  status?: number
  task_status?: number
  subtitle?: any
}

export type VideoDisplayStatus = 'processing' | 'completed' | 'failed' | 'pending'

export interface NormalizedVideo {
  id: number
  name: string
  path: string
  cover: string
  duration: number
  status: number
  displayStatus: VideoDisplayStatus
  videoType: 'material' | 'edited'
  subtitle?: any
}

function toDisplayStatus(
  status?: number,
  videoType: 'material' | 'edited' = 'material'
): VideoDisplayStatus {
  if (videoType === 'edited') {
    // 智能剪辑: 1=完成, 3/4=失败
    if (status === 1) return 'completed'
    if (status === 3 || status === 4) return 'failed'
    return 'processing'
  }
  // 上传素材: 仅看 status，0=PENDING, 1-3=处理中, 4=COMPLETED, 5=FAILED
  if (status === 4) return 'completed'
  if (status === 5) return 'failed'
  if (status !== undefined && status >= 1 && status <= 3) return 'processing'
  return 'pending'
}

/**
 * 将任意视频源规范化为统一结构
 */
export function normalizeVideo(
  source: UnifiedVideoSource | null | undefined,
  videoType: 'material' | 'edited' = 'material'
): NormalizedVideo {
  if (!source) {
    return {
      id: 0,
      name: '',
      path: '',
      cover: '',
      duration: 0,
      status: 0,
      displayStatus: 'pending',
      videoType
    }
  }
  const raw = source as any
  const path = raw.path ?? raw.fileUrl ?? ''
  const status = raw.status ?? 0
  const resolvedType = videoType === 'edited' || 'fileUrl' in raw ? 'edited' : videoType

  return {
    id: raw.id ?? 0,
    name: raw.name ?? raw.filename ?? '',
    path,
    cover: raw.cover ?? '',
    duration: raw.duration ?? 0,
    status: raw.status ?? 0,
    displayStatus: toDisplayStatus(status, resolvedType),
    videoType: resolvedType,
    subtitle: raw.subtitle
  }
}
