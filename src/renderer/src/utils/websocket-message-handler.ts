/**
 * WebSocket 消息处理器
 * 处理不同类型的 WebSocket 消息
 */

export interface MessageHandlers {
  onVideoProgress?: (data: {
    video_id: number | string
    percentage?: number
    status?: 'completed' | 'failed' | 'transcribing' | 'parsing' | number | string
  }) => void
  onVideoCompleted?: (videoId: number) => void
  onVideoFailed?: (videoId: number, error: string) => void
  onSmartCutUpdated?: (data: {
    task_status?: number
    ai_gen_video_status?: number
    ai_gen_video_id?: number
  }) => void
  onVideoUploaded?: () => void
  onVideoStatus?: (data: {
    video_id: number | string
    status: number
    message?: string
    error?: string
    step?: string
  }) => void
  onVideoUploadBatch?: (data: {
    success_count: number
    error_count: number
    errors: Array<{ path: string; error: string }>
  }) => void
  onUsageInfo?: (data: {
    usageSeconds: number
    dailyLimit: number
    totalSeconds: number
    remainingSeconds: number
    isVip: boolean
    /** 过期日期 */
    expiredAt?: string
  }) => void
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
      case 'video_status':
        this.handleVideoStatus(data)
        break
      case 'video_uploaded':
        this.handleVideoUploaded(data)
        break
      case 'video_upload_batch':
        this.handleVideoUploadBatch(data)
        break
      case 'smart_cut':
        this.handleSmartCut(data)
        break
      case 'video_upload':
        this.handleVideoUpload()
        break
      case 'usage_info':
        this.handleUsageInfo(data)
        break
      default:
        console.log('Unknown message type:', data.type, data)
    }
  }

  private handleParseVideo(data: any): void {
    // 先处理进度更新
    this.handlers.onVideoProgress?.(data)

    // 然后处理完成和失败状态
    // 只有字幕解析完成（status === 'completed' 且 percentage === 100）时才显示通知
    // 其他步骤完成时不会发送 parse_video 消息，所以不会触发通知
    if ((data.status === 'completed' || data.status === 4) && data.percentage === 100) {
      // 字幕解析完成，显示通知
      this.handlers.onVideoCompleted?.(Number(data.video_id))
    } else if (data.status === 'failed' || data.status === 5) {
      // 任何步骤失败，都显示通知
      this.handlers.onVideoFailed?.(Number(data.video_id), data.error || '解析过程中出现错误')
    }
    // 其他情况（如 status === 'running' 或 'transcribing'）只更新进度，不显示通知
  }

  private handleSmartCut(data: any): void {
    console.log('Smart cut status updated:', data)
    this.handlers.onSmartCutUpdated?.({
      task_status: data.task_status,
      ai_gen_video_status: data.ai_gen_video_status,
      ai_gen_video_id: data.ai_gen_video_id
    })
  }

  private handleVideoUpload(): void {
    console.log('Video upload analysis completed')
    this.handlers.onVideoUploaded?.()
  }

  private handleVideoStatus(data: any): void {
    console.log('Video status updated:', data)
    this.handlers.onVideoStatus?.({
      video_id: data.video_id,
      status: data.status,
      message: data.message,
      error: data.error,
      step: data.step
    })
  }

  private handleVideoUploaded(data: any): void {
    console.log('Video uploaded:', data)
    this.handlers.onVideoUploaded?.()
  }

  private handleVideoUploadBatch(data: any): void {
    console.log('Video upload batch completed:', data)
    this.handlers.onVideoUploadBatch?.(data)
  }

  private handleUsageInfo(data: any): void {
    console.log('Usage info updated:', data)
    this.handlers.onUsageInfo?.({
      usageSeconds: data.usageSeconds,
      dailyLimit: data.dailyLimit,
      totalSeconds: data.totalSeconds,
      remainingSeconds: data.remainingSeconds,
      isVip: data.isVip,
      expiredAt: data.expiredAt
    })
  }
}
