import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useWebsocketStore = defineStore('websocket', () => {
  const ws = ref<WebSocket | null>(null)
  const connected = ref(false)
  const smartCutUpdated = ref(0)
  const videoUploaded = ref(0)
  const baseUrl = ref<string>(import.meta.env.VITE_WS_URL || '')

  let pingInterval: ReturnType<typeof setInterval> | null = null
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null

  const setBaseUrl = (url: string): void => {
    // Expecting something like 'ws://127.0.0.1:PORT'
    baseUrl.value = url
  }

  const connect = (url?: string): void => {
    const targetUrl = url || baseUrl.value
    if (!targetUrl) {
      console.warn('WebSocket connection aborted: no target URL provided')
      return
    }

    // Don't connect if there's no token
    const token = localStorage.getItem('token')
    if (!token) {
      console.log('WebSocket connection skipped: no authentication token')
      return
    }

    if (
      ws.value &&
      (ws.value.readyState === WebSocket.OPEN || ws.value.readyState === WebSocket.CONNECTING)
    ) {
      // If already connecting/connected to the SAME url, return
      return
    }

    try {
      console.log('WebSocket attempting to connect to:', targetUrl)
      ws.value = new WebSocket(targetUrl)

      ws.value.onopen = (): void => {
        console.log('WebSocket connected to', targetUrl)
        connected.value = true

        // Send Authorization token
        if (token && ws.value) {
          ws.value.send(JSON.stringify({ Authorization: token }))
          console.log('WebSocket sent authorization token')
        }

        startPing()
        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout)
          reconnectTimeout = null
        }
      }

      ws.value.onclose = (): void => {
        console.log('WebSocket disconnected')
        connected.value = false
        stopPing()
        ws.value = null

        // Auto reconnect after 5 seconds if not manually closed
        reconnectTimeout = setTimeout(() => {
          if (localStorage.getItem('token')) {
            console.log('Attempting to reconnect WebSocket...')
            connect(targetUrl)
          }
        }, 5000)
      }

      ws.value.onerror = (error: Event): void => {
        console.error('WebSocket error:', error)
      }

      ws.value.onmessage = (event: MessageEvent): void => {
        try {
          const data = JSON.parse(event.data)
          console.log('WebSocket message received:', data)
          if (data.type === 'smart_cut') {
            console.log('Smart cut status updated')
            smartCutUpdated.value = Date.now()
            window.api.showNotification(
              '智能剪辑状态已更新',
              '点击查看最新剪辑结果',
              '/smart-editor'
            )
          } else if (data.type === 'video_upload') {
            console.log('Video upload analysis completed')
            videoUploaded.value = Date.now()
            window.api.showNotification('上传视频已分析', '点击查看视频管理', '/video-manager')
          }
        } catch {
          // If message is 'pong' or similar, ignore if not JSON
          if (event.data !== 'pong') {
            console.log('WebSocket raw message:', event.data)
          }
        }
      }
    } catch (error) {
      console.error('Failed to create WebSocket:', error)
    }
  }

  const disconnect = (): void => {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout)
      reconnectTimeout = null
    }
    if (ws.value) {
      ws.value.close()
      ws.value = null
    }
    connected.value = false
  }

  const startPing = (): void => {
    stopPing()
    pingInterval = setInterval(() => {
      if (ws.value && ws.value.readyState === WebSocket.OPEN) {
        ws.value.send('ping')
        console.log('WebSocket sent ping')
      }
    }, 10000)
  }

  const stopPing = (): void => {
    if (pingInterval) {
      clearInterval(pingInterval)
      pingInterval = null
    }
  }

  return {
    connected,
    smartCutUpdated,
    videoUploaded,
    baseUrl,
    setBaseUrl,
    connect,
    disconnect
  }
})
