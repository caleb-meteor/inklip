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
    return (
      this.ws?.readyState === WebSocket.OPEN ||
      this.ws?.readyState === WebSocket.CONNECTING
    )
  }

  private closeExistingConnection(): void {
    if (this.ws && this.ws.readyState !== WebSocket.CLOSED) {
      this.ws.close()
      this.ws = null
    }
  }

  private createConnection(): void {
    try {
      this.ws = new WebSocket(this.url)
      this.setupEventHandlers()
    } catch (error) {
      console.error('Failed to create WebSocket:', error)
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
    this.handlers.onClose?.(event)
    this.scheduleReconnect(event)
  }

  private handleError(error: Event): void {
    console.error('WebSocket error:', error)
    this.handlers.onError?.(error)
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

    // 只有在非正常关闭时才重连
    if (event.code === 1006 || !event.wasClean) {
      this.reconnectTimeout = setTimeout(() => {
        if (this.shouldReconnect) {
          console.log('Attempting to reconnect WebSocket...')
          this.connect()
        }
      }, RECONNECT_DELAY)
    }
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
      this.ws.close()
      this.ws = null
    }
  }
}
