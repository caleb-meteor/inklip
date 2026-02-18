import { defineStore } from 'pinia'
import { ref, reactive, computed } from 'vue'
import { WebSocketClient } from '../utils/websocket-client'
import { WebSocketMessageHandler } from '../utils/websocket-message-handler'

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

  // 确保日期比较准确，将当前日期也设为当天开始（如果 expiredAt 只包含日期）
  const expireDate = new Date(info.expiredAt)
  const now = new Date()

  // 如果 expiredAt 只是日期（没有时间），则比较年、月、日
  return expireDate > now
}

export const useWebsocketStore = defineStore('websocket', () => {
  const connected = ref(false)
  const smartCutUpdated = ref(0)
  const videoUploaded = ref(0)
  const baseUrl = ref<string>(import.meta.env.VITE_WS_URL || '')
  const videoParseProgress = reactive<Record<number, VideoParseProgress>>({})
  // 默认 isVip 为 false，表示不可用
  const usageInfo = ref<UsageInfo>({
    usageSeconds: 0,
    dailyLimit: 0,
    totalSeconds: 0,
    remainingSeconds: 0,
    isVip: false,
    expiredAt: undefined
  })

  /** 是否可用：VIP 且未过期 */
  const isVipAvailable = computed(() => isUsageAvailable(usageInfo.value))

  let wsClient: WebSocketClient | null = null
  let messageHandler: WebSocketMessageHandler | null = null
  let baseUrlWithoutToken: string = '' // 保存不带 token 的基础 URL
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null

  /**
   * 设置 WebSocket 基础 URL
   */
  const setBaseUrl = (url: string): void => {
    baseUrl.value = url
  }

  /**
   * 更新视频解析进度
   */
  const updateVideoProgress = (data: {
    video_id: number | string
    percentage?: number
    status?: 'completed' | 'failed' | 'parsing' | 'transcribing' | number | string
    error?: string
  }): void => {
    const videoId = Number(data.video_id)
    const existing = videoParseProgress[videoId]

    // 处理状态：可能是字符串（'completed', 'failed', 'transcribing', 'parsing'）或数字（3 = TRANSCRIBING）
    let status: 'parsing' | 'transcribing' | 'completed' | 'failed' = 'parsing'
    if (data.status === 'completed' || data.status === 4) {
      status = 'completed'
    } else if (data.status === 'failed' || data.status === 5) {
      status = 'failed'
    } else if (data.status === 'transcribing' || data.status === 3 || data.status === 'running') {
      // 'running' 是后端发送的中间状态，应该映射为 'transcribing'
      status = 'transcribing'
    } else if (data.status === 'parsing') {
      status = 'parsing'
    } else {
      // 默认情况下，如果有百分比且小于100，认为是转录中
      if (data.percentage !== undefined && data.percentage < 100) {
        status = 'transcribing'
      } else {
        status = 'parsing'
      }
    }

    const progress: VideoParseProgress = {
      videoId,
      percentage: data.percentage ?? existing?.percentage ?? 0,
      status,
      error: data.error
    }

    videoParseProgress[videoId] = progress
    console.log('[WebSocket] Video parse progress updated:', progress)
  }

  /**
   * 清除视频进度
   */
  const clearVideoProgress = (videoId: number): void => {
    delete videoParseProgress[videoId]
  }

  /**
   * 获取视频进度
   */
  const getVideoProgress = (videoId: number): VideoParseProgress | undefined => {
    return videoParseProgress[videoId]
  }

  /**
   * 构建 WebSocket URL
   */
  const buildUrlWithApiKey = (url: string): string => {
    return url
  }

  /**
   * 连接到 WebSocket 服务器
   */
  const connect = (url?: string): void => {
    const targetUrl = url || baseUrl.value
    if (!targetUrl) {
      console.warn('WebSocket connection aborted: no target URL provided')
      return
    }

    // 断开现有连接
    disconnect()

    // 保存基础 URL
    baseUrlWithoutToken = targetUrl

    // 构建 WebSocket URL
    const urlWithApiKey = buildUrlWithApiKey(targetUrl)
    if (!urlWithApiKey) {
      console.error('Failed to build WebSocket URL')
      return
    }

    console.log('[WebSocket] URL:', urlWithApiKey)

    // 创建消息处理器
    messageHandler = new WebSocketMessageHandler({
      onVideoProgress: (data) => {
        updateVideoProgress(data)
      },
      onVideoCompleted: () => {
        window.api.showNotification('视频解析完成', '字幕已成功提取', '/home')
        videoUploaded.value = Date.now()
      },
      onVideoFailed: (videoId, error) => {
        window.api.showNotification('视频解析失败', error, '/home')
      },
      onVideoStatus: (data) => {
        // 更新视频状态
        const videoId = Number(data.video_id)
        const status = Number(data.status)

        // 根据视频状态更新进度
        if (status === 4) {
          // 处理完成
          updateVideoProgress({
            video_id: videoId,
            status: 'completed',
            percentage: 100
          })
        } else if (status === 5) {
          // 处理失败
          updateVideoProgress({
            video_id: videoId,
            status: 'failed',
            error: data.error || '处理失败'
          })
        } else if (status === 3) {
          // 转录音频中（分析视频中）
          updateVideoProgress({
            video_id: videoId,
            status: 'transcribing'
          })
        } else if (status === 1) {
          // 提取封面中
          updateVideoProgress({
            video_id: videoId,
            status: 'parsing'
          })
        } else if (status === 2) {
          // 提取音频中
          updateVideoProgress({
            video_id: videoId,
            status: 'parsing'
          })
        } else if (status === 0) {
          // 待处理
          updateVideoProgress({
            video_id: videoId,
            status: 'parsing',
            percentage: 0
          })
        }

        console.log('[WebSocket] Video status updated:', data)
      },
      onVideoUploadBatch: (data) => {
        if (data.error_count > 0) {
          window.api.showNotification(
            '批量上传完成',
            `成功: ${data.success_count}, 失败: ${data.error_count}`,
            '/home'
          )
        } else {
          window.api.showNotification(
            '批量上传完成',
            `成功上传 ${data.success_count} 个视频`,
            '/home'
          )
        }
        videoUploaded.value = Date.now()
      },
      onSmartCutUpdated: (data) => {
        smartCutUpdated.value = Date.now()
        // 只在任务完成时显示系统提醒
        // task_status: 0=待执行, 1=执行中, 2=已完成, 3=失败
        // ai_gen_video_status: 0=待处理, 1=已完成, 2=处理中, 3=AI异常, 4=视频异常, 5=AI剪辑中
        if (data.task_status === 2 || data.ai_gen_video_status === 1) {
          // 任务完成
          window.api.showNotification('智能剪辑完成', '点击查看最新剪辑结果', '/smart-editor')
        } else if (
          data.task_status === 3 ||
          data.ai_gen_video_status === 3 ||
          data.ai_gen_video_status === 4
        ) {
          // 任务失败
          window.api.showNotification('智能剪辑失败', '请检查任务详情', '/smart-editor')
        }
        // 其他状态（待执行、执行中）不显示通知
      },
      onVideoUploaded: () => {
        videoUploaded.value = Date.now()
        // 不显示通知，因为视频刚上传，还在处理中
      },
      onUsageInfo: (data) => {
        console.log('[WebSocket] Received usage info:', data)
        usageInfo.value = data
      }
    })

    // 创建 WebSocket 客户端
    wsClient = new WebSocketClient(urlWithApiKey, {
      onOpen: () => {
        connected.value = true
        console.log('[WebSocket] Connected successfully')
        // 清除重连定时器
        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout)
          reconnectTimeout = null
        }
      },
      onClose: (event) => {
        connected.value = false
        console.log('[WebSocket] Connection closed:', { code: event.code, reason: event.reason })
        // 如果不是正常关闭（code 1000），并且有基础 URL，则触发重连
        if (event.code !== 1000 && baseUrlWithoutToken) {
          console.log('[WebSocket] Scheduling reconnection...')
          handleReconnect()
        }
      },
      onError: () => {
        connected.value = false
        console.error('[WebSocket] Connection error occurred')
      },
      onMessage: (data) => {
        console.log('[WebSocket] Received RAW message:', JSON.stringify(data, null, 2))
        messageHandler?.handle(data)
      },
      // 禁用 WebSocketClient 的自动重连，由 store 层处理
      shouldReconnect: () => false
    })

    wsClient.connect()
  }

  /**
   * 处理重连逻辑
   */
  const handleReconnect = (): void => {
    // 清除现有的重连定时器
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout)
      reconnectTimeout = null
    }

    // 延迟重连
    console.log('[WebSocket] Will attempt to reconnect in 2 seconds...')
    reconnectTimeout = setTimeout(() => {
      if (baseUrlWithoutToken) {
        console.log('[WebSocket] Attempting to reconnect...')
        connect(baseUrlWithoutToken)
      }
    }, 2000) // 2秒后重连
  }

  /**
   * 重新连接
   * 当需要重新连接时调用此方法
   */
  const reauthenticate = (): void => {
    console.log('[WebSocket] Reauthenticating, reconnecting...')
    disconnect()
    if (baseUrlWithoutToken) {
      connect(baseUrlWithoutToken)
    }
  }

  /**
   * 断开连接
   */
  const disconnect = (): void => {
    // 清除重连定时器
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout)
      reconnectTimeout = null
    }

    if (wsClient) {
      wsClient.disconnect()
      wsClient = null
    }
    messageHandler = null
    connected.value = false
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
    getVideoProgress,
    buildUrlWithApiKey
  }
})
