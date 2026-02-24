import { defineStore } from 'pinia'
import { computed, reactive, ref } from 'vue'
import { SSEClient } from '../utils/sse-client'
import { RealtimeMessageHandler } from '../utils/realtime-message-handler'
import { aiChatStore } from '../services/aiChatStore'

export interface VideoParseProgress {
  videoId: number
  percentage: number
  status?: 'parsing' | 'transcribing' | 'completed' | 'failed'
  error?: string
}

export interface UsageInfo {
  usageSeconds: number
  dailyLimit: number
  totalSeconds: number
  remainingSeconds: number
  isVip: boolean
  /** 过期日期（云端下发的过期时间） */
  expiredAt?: string
}

/** 判断余量是否可用：是 VIP 且未过期（无 expiredAt 或 expiredAt 大于当前时间） */
export function isUsageAvailable(info: UsageInfo | null | undefined): boolean {
  if (!info?.isVip) return false
  if (!info.expiredAt) return true
  return new Date(info.expiredAt) > new Date()
}

const normalizeBaseUrl = (url: string): string => url.replace(/\/+$/, '')

export const useRealtimeStore = defineStore('realtime', () => {
  const connected = ref(false)
  const smartCutUpdated = ref(0)
  const videoUploaded = ref(0)

  /** 后端 HTTP 基地址，例如 http://127.0.0.1:12698 */
  const baseUrl = ref<string>(import.meta.env.VITE_API_URL || '')

  const videoParseProgress = reactive<Record<number, VideoParseProgress>>({})

  const usageInfo = ref<UsageInfo>({
    usageSeconds: 0,
    dailyLimit: 0,
    totalSeconds: 0,
    remainingSeconds: 0,
    isVip: false,
    expiredAt: undefined
  })

  const isVipAvailable = computed(() => isUsageAvailable(usageInfo.value))

  let sseClient: SSEClient | null = null
  let messageHandler: RealtimeMessageHandler | null = null

  const setBaseUrl = (url: string): void => {
    baseUrl.value = url
  }

  const updateVideoProgress = (data: {
    video_id: number | string
    percentage?: number
    status?: 'completed' | 'failed' | 'parsing' | 'transcribing' | number | string
    error?: string
  }): void => {
    const videoId = Number(data.video_id)
    const existing = videoParseProgress[videoId]

    let status: 'parsing' | 'transcribing' | 'completed' | 'failed' = 'parsing'
    if (data.status === 'completed' || data.status === 4) {
      status = 'completed'
    } else if (data.status === 'failed' || data.status === 5) {
      status = 'failed'
    } else if (data.status === 'transcribing' || data.status === 3 || data.status === 'running') {
      status = 'transcribing'
    } else if (data.status === 'parsing') {
      status = 'parsing'
    } else if (data.percentage !== undefined && data.percentage < 100) {
      status = 'transcribing'
    }

    videoParseProgress[videoId] = {
      videoId,
      percentage: data.percentage ?? existing?.percentage ?? 0,
      status,
      error: data.error
    }
  }

  const clearVideoProgress = (videoId: number): void => {
    delete videoParseProgress[videoId]
  }

  const getVideoProgress = (videoId: number): VideoParseProgress | undefined => {
    return videoParseProgress[videoId]
  }

  const connect = (url?: string): void => {
    const targetBaseUrl = normalizeBaseUrl(url || baseUrl.value)
    if (!targetBaseUrl) {
      console.warn('[SSE] connection aborted: no baseUrl provided')
      return
    }

    disconnect()

    messageHandler = new RealtimeMessageHandler({
      onVideoProgress: (data) => {
        updateVideoProgress(data)
      },
      onVideoCompleted: () => {
        window.api.showNotification('视频解析完成', '字幕已成功提取', '/home')
        videoUploaded.value = Date.now()
      },
      onVideoFailed: (_videoId, error) => {
        window.api.showNotification('视频解析失败', error, '/home')
      },
      onVideoStatus: (data) => {
        const videoId = Number(data.video_id)
        const status = Number(data.status)
        if (status === 4) {
          updateVideoProgress({ video_id: videoId, status: 'completed', percentage: 100 })
        } else if (status === 5) {
          updateVideoProgress({
            video_id: videoId,
            status: 'failed',
            error: data.error || '处理失败'
          })
        } else if (status === 3) {
          updateVideoProgress({ video_id: videoId, status: 'transcribing' })
        } else if (status === 1 || status === 2) {
          updateVideoProgress({ video_id: videoId, status: 'parsing' })
        } else if (status === 0) {
          updateVideoProgress({ video_id: videoId, status: 'parsing', percentage: 0 })
        }
      },
      onVideoUploadBatch: (data) => {
        window.api.showNotification(
          '批量上传完成',
          data.error_count > 0
            ? `成功: ${data.success_count}, 失败: ${data.error_count}`
            : `成功上传 ${data.success_count} 个视频`,
          '/home'
        )
        videoUploaded.value = Date.now()
      },
      onSmartCutUpdated: (data) => {
        smartCutUpdated.value = Date.now()
        const isDone =
          data.task_status === 2 ||
          data.task_status === 3 ||
          data.ai_gen_video_status === 1 ||
          data.ai_gen_video_status === 3 ||
          data.ai_gen_video_status === 4
        if (isDone && data.ai_chat_id != null) {
          aiChatStore.incrementUnreadCountForChat(data.ai_chat_id)
        }
        if (data.task_status === 2 || data.ai_gen_video_status === 1) {
          window.api.showNotification('智能剪辑完成', '点击查看最新剪辑结果', '/smart-editor')
        } else if (
          data.task_status === 3 ||
          data.ai_gen_video_status === 3 ||
          data.ai_gen_video_status === 4
        ) {
          window.api.showNotification('智能剪辑失败', '请检查任务详情', '/smart-editor')
        }
      },
      onVideoUploaded: () => {
        videoUploaded.value = Date.now()
      },
      onUsageInfo: (data) => {
        usageInfo.value = data
      }
    })

    const sseUrl = `${targetBaseUrl}/api/sse`
    sseClient = new SSEClient(sseUrl, {
      onOpen: () => {
        connected.value = true
      },
      onClose: () => {
        connected.value = false
      },
      onError: () => {
        connected.value = false
      },
      onMessage: (data) => {
        messageHandler?.handle(data)
      }
    })
    sseClient.connect()
  }

  const disconnect = (): void => {
    if (sseClient) {
      sseClient.disconnect()
      sseClient = null
    }
    messageHandler = null
    connected.value = false
  }

  const reauthenticate = (): void => {
    connect()
  }

  return {
    connected,
    smartCutUpdated,
    videoUploaded,
    baseUrl,
    videoParseProgress,
    setBaseUrl,
    connect,
    disconnect,
    reauthenticate,
    updateVideoProgress,
    usageInfo,
    isVipAvailable,
    clearVideoProgress,
    getVideoProgress
  }
})
