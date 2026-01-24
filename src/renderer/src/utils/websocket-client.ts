/**
 * WebSocket 客户端连接管理器
 * 负责 WebSocket 连接的创建、维护和心跳管理
 */

const PING_INTERVAL = 10000 // 10秒
const RECONNECT_DELAY = 2000 // 2秒
const PING_MESSAGE = 'ping'

export interface WebSocketHandlers {
  onOpen?: () => void
  onClose?: (event: CloseEvent) => void
  onError?: (error: Event) => void
  onMessage?: (data: any) => void
  /**
   * 判断是否应该重连的回调函数
   * 返回 true 表示应该重连，false 表示不应该重连
   * 如果未提供，默认在非正常关闭时重连
   */
  shouldReconnect?: () => boolean
}

export class WebSocketClient {
  private ws: WebSocket | null = null
  private pingInterval: ReturnType<typeof setInterval> | null = null
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null
  private url: string = ''
  private handlers: WebSocketHandlers = {}
  private shouldReconnect: boolean = true

  constructor(url: string, handlers: WebSocketHandlers = {}) {
    this.url = url
    this.handlers = handlers
  }

  /**
   * 连接到 WebSocket 服务器
   */
  connect(): void {
    if (this.isConnectingOrOpen()) {
      return
    }

    this.shouldReconnect = true
    this.closeExistingConnection()
    this.createConnection()
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    this.shouldReconnect = false
    this.clearTimers()
    this.closeConnection()
  }

  /**
   * 发送消息
   */
  send(data: string | object): void {
    if (!this.isOpen()) {
      console.warn('WebSocket is not open, cannot send message')
      return
    }

    const message = typeof data === 'string' ? data : JSON.stringify(data)
    this.ws!.send(message)
  }

  /**
   * 检查连接状态
   */
  isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  private isConnectingOrOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING
  }

  private closeExistingConnection(): void {
    if (this.ws && this.ws.readyState !== WebSocket.CLOSED) {
      // 使用 code 1000 正常关闭，这样 scheduleReconnect 不会重连
      this.ws.close(1000, 'Reconnecting')
      this.ws = null
    }
  }

  private createConnection(): void {
    try {
      console.log('[WebSocketClient] Creating connection to:', this.url)
      this.ws = new WebSocket(this.url)
      this.setupEventHandlers()
    } catch (error) {
      console.error('[WebSocketClient] Failed to create WebSocket:', error)
      this.handleError(error as Event)
    }
  }

  private setupEventHandlers(): void {
    if (!this.ws) return

    this.ws.onopen = () => this.handleOpen()
    this.ws.onclose = (event) => this.handleClose(event)
    this.ws.onerror = (error) => this.handleError(error)
    this.ws.onmessage = (event) => this.handleMessage(event)
  }

  private handleOpen(): void {
    console.log('WebSocket connected to', this.url)
    this.handlers.onOpen?.()
    this.startPing()
  }

  private handleClose(event: CloseEvent): void {
    console.log('WebSocket disconnected', event)
    this.clearTimers()
    this.ws = null // 清空连接引用
    this.handlers.onClose?.(event)
    this.scheduleReconnect(event)
  }

  private handleError(error: Event): void {
    console.error('WebSocket error:', error)
    this.handlers.onError?.(error)
    // 注意：onerror 通常会伴随 onclose 事件，重连逻辑由 handleClose 处理
    // 这里只需要记录错误即可
  }

  private handleMessage(event: MessageEvent): void {
    if (!this.isOpen()) {
      return
    }

    // 忽略 pong 消息
    if (event.data === 'pong') {
      return
    }

    try {
      const data = JSON.parse(event.data)
      this.handlers.onMessage?.(data)
    } catch {
      // 非 JSON 消息忽略
      console.log('WebSocket raw message:', event.data)
    }
  }

  private startPing(): void {
    this.stopPing()
    this.pingInterval = setInterval(() => {
      if (this.isOpen()) {
        this.send(PING_MESSAGE)
        console.log('WebSocket sent ping')
      }
    }, PING_INTERVAL)
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
  }

  private scheduleReconnect(event: CloseEvent): void {
    if (!this.shouldReconnect) {
      return
    }

    // 排除正常关闭（code 1000），其他所有情况才考虑重连
    if (event.code === 1000) {
      console.log('WebSocket closed normally, not reconnecting', {
        code: event.code,
        reason: event.reason
      })
      return
    }

    // 如果提供了 shouldReconnect 回调，使用回调判断是否应该重连
    // 这样可以由外部（如 store）检查 token 是否存在
    if (this.handlers.shouldReconnect) {
      if (!this.handlers.shouldReconnect()) {
        console.log('WebSocket reconnection skipped by shouldReconnect callback')
        return
      }
    }

    // 执行重连
    this.reconnectTimeout = setTimeout(() => {
      if (this.shouldReconnect) {
        // 再次检查回调（token 可能在等待期间被清除）
        if (this.handlers.shouldReconnect && !this.handlers.shouldReconnect()) {
          console.log('WebSocket reconnection cancelled: token check failed')
          return
        }
        console.log('Attempting to reconnect WebSocket...', {
          code: event.code,
          reason: event.reason
        })
        this.connect()
      }
    }, RECONNECT_DELAY)
  }

  private clearTimers(): void {
    this.stopPing()
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }
  }

  private closeConnection(): void {
    if (this.ws) {
      // 使用 code 1000 正常关闭，确保不会触发重连
      // 注意：disconnect() 已经设置了 shouldReconnect = false，但这里也使用正常关闭更安全
      this.ws.close(1000, 'Disconnected by client')
      this.ws = null
    }
  }
}
