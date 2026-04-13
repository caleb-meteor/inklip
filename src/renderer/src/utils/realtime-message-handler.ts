/**
 * 实时消息处理器（SSE）
 * 处理不同类型的后端推送消息（与历史推送消息格式保持一致）
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
    ai_chat_id?: number
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
    /** 会员类型：common / vip / svip */
    userType?: string
    /** 过期日期 */
    expiredAt?: string
    /** 云端对当前授权码：1=可用，非1=不可用 */
    status?: number
    /** 与本地 Go 约定：true 表示数据已由云端 SSE 同步到桌面端 */
    syncedFromCloud?: boolean
  }) => void
  /** 发现新版本（后端通过 SSE 推送），用于弹窗更新；force_update 为 true 时弹窗不可关闭 */
  onVersionUpdate?: (data: {
    version: string
    force_update: boolean
    changelog: string
  }) => void
  /** 工作空间入库完成（ingest 或 watcher 处理完成），前端刷新工作区/视频列表 */
  onWorkspaceUpdated?: (data: { workspace_id: number; added?: number; updated?: number; deleted?: number }) => void
  /** 字幕剪辑批量导出：FFmpeg -progress 解析后的百分比 */
  onExportSegmentsProgress?: (data: { export_request_id: string; percentage: number }) => void
  /** 工作空间目录入库进度（选择目录 / ingest / switch 扫描时由后端 SSE 推送） */
  onWorkspaceIngestProgress?: (data: {
    workspace_id: number
    phase: string
    current: number
    total: number
    percentage: number
    file?: string
  }) => void
  /** 本地 Go 已更新授权码；activated 由 SSE 载荷携带，无需再 GET /user/api-key */
  onApiKeySynced?: (detail: { activated: boolean }) => void
}

export class RealtimeMessageHandler {
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
      case 'version_update':
        this.handleVersionUpdate(data)
        break
      case 'workspace_ingest_done':
      case 'workspace_files_updated':
        this.handleWorkspaceUpdated(data)
        break
      case 'export_segments_progress':
        this.handleExportSegmentsProgress(data)
        break
      case 'workspace_ingest_progress':
        this.handleWorkspaceIngestProgress(data)
        break
      case 'api_key_synced':
        this.handleApiKeySynced(data)
        break
      default:
        console.log('Unknown message type:', data.type, data)
    }
  }

  private handleParseVideo(data: any): void {
    this.handlers.onVideoProgress?.(data)

    if ((data.status === 'completed' || data.status === 4) && data.percentage === 100) {
      this.handlers.onVideoCompleted?.(Number(data.video_id))
    } else if (data.status === 'failed' || data.status === 5) {
      this.handlers.onVideoFailed?.(Number(data.video_id), data.error || '解析过程中出现错误')
    }
  }

  private handleSmartCut(data: any): void {
    console.log('Smart cut status updated:', data)
    this.handlers.onSmartCutUpdated?.({
      task_status: data.task_status,
      ai_gen_video_status: data.ai_gen_video_status,
      ai_gen_video_id: data.ai_gen_video_id,
      ai_chat_id: data.ai_chat_id
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
      userType: data.userType,
      expiredAt: data.expiredAt,
      status: data.status,
      syncedFromCloud: data.syncedFromCloud
    })
  }

  private handleVersionUpdate(data: any): void {
    this.handlers.onVersionUpdate?.({
      version: data.version ?? '',
      force_update: Boolean(data.force_update),
      changelog: data.changelog ?? ''
    })
  }

  private handleWorkspaceUpdated(data: any): void {
    this.handlers.onWorkspaceUpdated?.({
      workspace_id: data.workspace_id ?? 0,
      added: data.added,
      updated: data.updated,
      deleted: data.deleted
    })
  }

  private handleExportSegmentsProgress(data: any): void {
    const id = data.export_request_id
    if (id == null || id === '') return
    this.handlers.onExportSegmentsProgress?.({
      export_request_id: String(id),
      percentage: Math.min(100, Math.max(0, Number(data.percentage) || 0))
    })
  }

  private handleWorkspaceIngestProgress(data: any): void {
    const wid = data.workspace_id
    this.handlers.onWorkspaceIngestProgress?.({
      workspace_id: wid == null ? 0 : Number(wid),
      phase: String(data.phase ?? ''),
      current: Math.max(0, Number(data.current) || 0),
      total: Math.max(0, Number(data.total) || 0),
      percentage: Math.min(100, Math.max(0, Number(data.percentage) || 0)),
      file: data.file != null && data.file !== '' ? String(data.file) : undefined
    })
  }

  private handleApiKeySynced(data: any): void {
    const raw = data?.activated
    const activated =
      raw === true || (typeof raw === 'string' && raw.toLowerCase() === 'true')
    this.handlers.onApiKeySynced?.({ activated })
  }
}
