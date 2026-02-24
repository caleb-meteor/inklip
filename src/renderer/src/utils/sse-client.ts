/**
 * SSE 客户端：与后端 /api/sse 建立长连接，接收 JSON 推送事件（消息格式与历史实现保持一致）
 * 用于接收后端实时推送（SSE）
 */

export interface SSEClientHandlers {
  onOpen?: () => void
  onClose?: () => void
  onError?: (event: Event) => void
  onMessage?: (data: any) => void
}

export class SSEClient {
  private url: string = ''
  private handlers: SSEClientHandlers = {}
  private eventSource: EventSource | null = null

  constructor(url: string, handlers: SSEClientHandlers = {}) {
    this.url = url
    this.handlers = handlers
  }

  connect(): void {
    if (this.eventSource) {
      if (this.eventSource.readyState === EventSource.OPEN) return
      this.disconnect()
    }

    console.log('[SSEClient] Connecting to:', this.url)
    this.eventSource = new EventSource(this.url)
    this.eventSource.onopen = () => {
      console.log('[SSEClient] Connected')
      this.handlers.onOpen?.()
    }
    this.eventSource.onerror = (event: Event) => {
      console.error('[SSEClient] Error:', event)
      this.handlers.onError?.(event)
      // EventSource 会自动重连，无需在此重连
    }
    this.eventSource.onmessage = (event: MessageEvent) => {
      console.log('[SSEClient] Message:', event.data)
      const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
      this.handlers.onMessage?.(data)
    }
  }

  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close()
      this.eventSource = null
      this.handlers.onClose?.()
      console.log('[SSEClient] Disconnected')
    }
  }

  isConnected(): boolean {
    return this.eventSource?.readyState === EventSource.OPEN
  }
}
