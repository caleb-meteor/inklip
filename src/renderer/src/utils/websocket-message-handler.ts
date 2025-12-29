/**
 * WebSocket 消息处理器
 * 处理不同类型的 WebSocket 消息
 */

export interface MessageHandlers {
  onVideoProgress?: (data: {
    video_id: number | string
    percentage?: number
    status?: 'completed' | 'failed'
    error?: string
  }) => void
  onVideoCompleted?: (videoId: number) => void
  onVideoFailed?: (videoId: number, error: string) => void
  onSmartCutUpdated?: () => void
  onVideoUploaded?: () => void
}

export class WebSocketMessageHandler {
  private handlers: MessageHandlers = {}

  constructor(handlers: MessageHandlers = {}) {
    this.handlers = handlers
  }

  /**
   * 处理接收到的消息
   */
  handle(data: any): void {
    switch (data.type) {
      case 'parse_video':
        this.handleParseVideo(data)
        break
      case 'smart_cut':
        this.handleSmartCut()
        break
      case 'video_upload':
        this.handleVideoUpload()
        break
      default:
        console.log('Unknown message type:', data.type)
    }
  }

  private handleParseVideo(data: any): void {
    this.handlers.onVideoProgress?.(data)

    if (data.status === 'completed') {
      this.handlers.onVideoCompleted?.(Number(data.video_id))
    } else if (data.status === 'failed') {
      this.handlers.onVideoFailed?.(Number(data.video_id), data.error || '解析过程中出现错误')
    }
  }

  private handleSmartCut(): void {
    console.log('Smart cut status updated')
    this.handlers.onSmartCutUpdated?.()
  }

  private handleVideoUpload(): void {
    console.log('Video upload analysis completed')
    this.handlers.onVideoUploaded?.()
  }
}
