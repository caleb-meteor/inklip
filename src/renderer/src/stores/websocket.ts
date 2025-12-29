import { defineStore } from 'pinia'
import { ref, reactive } from 'vue'
import { WebSocketClient } from '../utils/websocket-client'
import { WebSocketMessageHandler } from '../utils/websocket-message-handler'

export interface VideoParseProgress {
  videoId: number
  percentage: number
  status?: 'parsing' | 'completed' | 'failed'
  error?: string
}

export const useWebsocketStore = defineStore('websocket', () => {
  const connected = ref(false)
  const smartCutUpdated = ref(0)
  const videoUploaded = ref(0)
  const baseUrl = ref<string>(import.meta.env.VITE_WS_URL || '')
  const videoParseProgress = reactive<Record<number, VideoParseProgress>>({})

  let wsClient: WebSocketClient | null = null
  let messageHandler: WebSocketMessageHandler | null = null

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
    status?: 'completed' | 'failed'
    error?: string
  }): void => {
    const videoId = Number(data.video_id)
    const existing = videoParseProgress[videoId]

    const progress: VideoParseProgress = {
      videoId,
      percentage: data.percentage ?? existing?.percentage ?? 0,
      status: data.status === 'completed' ? 'completed' : data.status === 'failed' ? 'failed' : 'parsing',
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
   * 连接到 WebSocket 服务器
   */
  const connect = (url?: string): void => {
    const targetUrl = url || baseUrl.value
    if (!targetUrl) {
      console.warn('WebSocket connection aborted: no target URL provided')
      return
    }

    const token = localStorage.getItem('token')
    if (!token) {
      console.log('WebSocket connection skipped: no authentication token')
      return
    }

    // 断开现有连接
    disconnect()

    // 创建消息处理器
    messageHandler = new WebSocketMessageHandler({
      onVideoProgress: (data) => {
        updateVideoProgress(data)
      },
      onVideoCompleted: (videoId) => {
        window.api.showNotification('视频解析完成', '字幕已成功提取', '/video-manager')
        videoUploaded.value = Date.now()
      },
      onVideoFailed: (videoId, error) => {
        window.api.showNotification('视频解析失败', error, '/video-manager')
      },
      onSmartCutUpdated: () => {
        smartCutUpdated.value = Date.now()
        window.api.showNotification(
          '智能剪辑状态已更新',
          '点击查看最新剪辑结果',
          '/smart-editor'
        )
      },
      onVideoUploaded: () => {
        videoUploaded.value = Date.now()
        window.api.showNotification('上传视频已分析', '点击查看视频管理', '/video-manager')
      }
    })

    // 创建 WebSocket 客户端
    wsClient = new WebSocketClient(targetUrl, {
      onOpen: () => {
        connected.value = true
        sendAuthToken(token)
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

    wsClient.connect()
  }

  /**
   * 发送认证 token
   */
  const sendAuthToken = (token: string): void => {
    if (wsClient?.isOpen()) {
      wsClient.send({ Authorization: token })
      console.log('WebSocket sent authorization token')
    }
  }

  /**
   * 断开连接
   */
  const disconnect = (): void => {
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
    updateVideoProgress,
    clearVideoProgress,
    getVideoProgress
  }
})