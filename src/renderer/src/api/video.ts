import request from '../utils/request'

export interface VideoItem {
  id: number
  user_id: number
  name: string
  path: string
  /** 该视频对应的其他文件路径（同内容不同名），与 path 一起表示所有路径 */
  other_paths?: string[]
  size: number
  cover: string
  duration: number
  width?: number
  height?: number
  subtitle: string | any // Backend may return parsed JSON object or string
  feature?: {
    main_content?: string
    pain_points?: string
    selling_points?: string
    price?: string
  } | null // 视频特征：字幕提取内容
  audio: string
  silent: string
  status: number
  task_id: number
  task_status?: number // 任务状态：0=待执行, 1=完成, 2=执行中, 3=失败
  sha256: string
  parse_percentage?: number
  group_id?: number
  workspace_id?: number
  created_at: string
  updated_at: string
}

/**
 * 获取视频列表，支持按 ids / workspace_id 筛选
 */
export function getVideosApi(params?: {
  ids?: number[]
  workspace_id?: number
}): Promise<VideoItem[]> {
  return request({
    url: '/api/videos',
    method: 'get',
    params: params
  })
}

/** 全文搜索命中的字幕片段（带时间与相关度分） */
export interface SearchSegment {
  video_id: number
  text: string
  start_ms: number
  end_ms: number
  start_s: number
  end_s: number
  /** 字幕相关度分，越高越相关 */
  score?: number
}

/** 全文搜索结果单项 */
export interface VideoSearchResultItem {
  video: VideoItem
  segments: SearchSegment[]
  match_in: string[]
  score: number
}

export interface VideoSearchResponse {
  intent: number
  intent_label: string
  keywords: string[]
  results: VideoSearchResultItem[]
}

/**
 * 全文搜索视频（字幕 + 名称，带关键词权重）
 */
export function searchVideosApi(
  query: string,
  limit?: number,
  workspaceId?: number | null
): Promise<VideoSearchResponse> {
  const data: { query: string; limit: number; workspace_id?: number } = {
    query: query.trim(),
    limit: limit ?? 50
  }
  if (workspaceId != null && workspaceId > 0) data.workspace_id = workspaceId
  return request({
    url: '/api/videos/search',
    method: 'post',
    data
  })
}

/** 仅字幕全文搜索单项（一条字幕 + 所属视频） */
export interface SubtitleSearchResultItem {
  video: VideoItem
  segment: SearchSegment
}

export interface SubtitleSearchResponse {
  results: SubtitleSearchResultItem[]
  total: number
}

/**
 * 仅针对字幕的全文搜索（GET，支持翻页）
 * @param query 搜索词
 * @param limit 每页条数，默认 20
 * @param offset 偏移量，默认 0
 * @param workspaceId 可选：限定在指定工作区下的视频中搜索
 */
export function searchSubtitlesApi(
  query: string,
  limit?: number,
  offset?: number,
  workspaceId?: number | null
): Promise<{ results: SubtitleSearchResultItem[]; total: number }> {
  const params: Record<string, string | number> = {
    query: query.trim(),
    limit: limit ?? 20,
    offset: offset ?? 0
  }
  if (workspaceId != null && workspaceId > 0) params.workspace_id = workspaceId
  return request({
    url: '/api/videos/search-subtitles',
    method: 'get',
    params
  }).then((res: any) => ({
    results: res?.results ?? [],
    total: res?.total ?? 0
  }))
}

/** 导出单段视频片段（AI 搜索结果每条字幕导出对应片段），返回临时文件路径与建议文件名 */
export interface ExportSegmentResult {
  path: string
  suggested_name: string
}

export function exportSegmentApi(
  videoId: number,
  startS: number,
  endS: number
): Promise<ExportSegmentResult> {
  return request({
    url: '/api/videos/export-segment',
    method: 'post',
    data: { video_id: videoId, start_s: startS, end_s: endS },
    timeout: 10 * 60 * 1000 // 10 minutes in milliseconds
  })
}

export interface SmartCutResponse {
  id: number // ai_gen_video 的 ID
  task_id?: number
  status?: string
  message?: string
}

/**
 * Start smart cut processing for selected videos（工作区素材）
 * @param workspaceId 必填，与后端 ai_gen_videos.workspace_id 及所选视频的 workspace 一致
 */
export function smartCutApi(
  videoIds: number[],
  workspaceId: number,
  minDuration?: number,
  maxDuration?: number,
  prompt?: string,
  promptBuiltId?: number,
  aiChatId?: number
): Promise<SmartCutResponse> {
  if (workspaceId == null || workspaceId <= 0) {
    return Promise.reject(new Error('workspace_id 必填'))
  }
  const data: Record<string, unknown> = {
    video_ids: videoIds,
    workspace_id: workspaceId,
    min_duration: minDuration,
    max_duration: maxDuration,
    prompt_text: prompt,
    prompt_built_id: promptBuiltId
  }
  if (aiChatId != null) {
    data.ai_chat_id = aiChatId
  }
  return request({
    url: '/api/smart-cut',
    method: 'post',
    data,
    timeout: 20 * 60 * 1000 // 20 minutes in milliseconds
  })
}
export interface SmartCutItem {
  id: number
  workspace_id?: number
  user_id: number
  name: string
  subtitle: string | any // Can be array or string
  path: string
  /** 部分历史数据或接口可能仍返回 fileUrl */
  fileUrl?: string
  size?: number
  cover?: string
  duration?: number
  width?: number
  height?: number
  status: number
  created_at: string
  updated_at: string
}

/** 首页播放载荷：区分素材/智能剪辑/导出历史，以便无字幕时正确拉取字幕接口 */
export type HomePlayPayload = {
  video:
    | VideoItem
    | SmartCutItem
    | { id: number; name: string; path: string; subtitle?: string | any }
  videoType: 'material' | 'edited' | 'exported'
}

export interface SmartCutsResponse {
  list: SmartCutItem[]
  total: number
  page: number
  page_size: number
}

/**
 * Get smart cut history with pagination（按工作区筛选）
 */
export function getSmartCutsApi(
  page: number,
  pageSize: number,
  workspaceId?: number
): Promise<SmartCutsResponse> {
  return request({
    url: '/api/smart-cuts',
    method: 'get',
    params: {
      page,
      page_size: pageSize,
      ...(workspaceId != null && workspaceId > 0 ? { workspace_id: workspaceId } : {})
    }
  })
}

/**
 * Get single smart cut status by ID
 * @param id Smart cut ID
 * @returns Promise with smart cut item
 */
export function getSmartCutApi(id: number): Promise<any> {
  return request({
    url: `/api/smart-cut/${id}`,
    method: 'get'
  })
}

/**
 * Delete a smart cut history item
 * @param id Smart cut history item ID
 * @returns Promise with delete response
 */
export function deleteSmartCutApi(id: number): Promise<void> {
  return request({
    url: '/api/smart-cut',
    method: 'delete',
    data: {
      id
    }
  })
}

/**
 * Rename a video
 * @param id Video ID
 * @param name New name for the video
 * @returns Promise with updated video response
 */
export function renameVideoApi(id: number, name: string): Promise<VideoItem> {
  return request({
    url: '/api/video/rename',
    method: 'put',
    data: {
      id,
      name
    }
  })
}

/**
 * Delete a video
 * @param id Video ID
 * @returns Promise with delete response
 */
export function deleteVideoApi(id: number): Promise<void> {
  return request({
    url: '/api/video',
    method: 'delete',
    data: {
      id
    }
  })
}

/** 导出记录来源：字幕剪辑（默认）| 智能剪辑/AI */
export type ExportVideoType = 'subtitle_clip' | 'ai'

export function labelForExportVideoType(t?: string | null): string {
  return t === 'ai' ? 'AI 导出' : '字幕剪辑'
}

export interface ExportSegmentsRequestItem {
  video_id: number
  start_s: number
  end_s: number
  /** 字幕文本，用于写入导出视频字幕表 */
  subtitle_text?: string
}

/**
 * 批量导出并拼接视频片段
 * @param suggestedName 可选，自定义导出文件名（如 "我的剪辑.mp4"）
 * @param outputPath 可选，用户通过另存为选择的完整保存路径；若提供则后端直接写入该路径，你可通过 path.dirname(outputPath) 得到目录
 * @param exportRequestId 可选；若传则后端用 FFmpeg -progress 并通过 SSE 推送 export_segments_progress
 * @param exportType 可选；subtitle_clip 字幕剪辑（默认）、ai 智能剪辑导出
 */
export function exportSegmentsApi(
  segments: ExportSegmentsRequestItem[],
  options?: { workspaceId?: number | null; exportType?: ExportVideoType | null },
  suggestedName?: string | null,
  outputPath?: string | null,
  exportRequestId?: string | null
): Promise<ExportSegmentResult> {
  const data: Record<string, unknown> = { segments }
  if (options?.workspaceId != null && options.workspaceId > 0) {
    data.workspace_id = options.workspaceId
  }
  if (options?.exportType === 'ai') {
    data.export_type = 'ai'
  }
  if (suggestedName != null && suggestedName.trim() !== '') {
    data.suggested_name = suggestedName.trim()
  }
  if (outputPath != null && outputPath.trim() !== '') {
    data.output_path = outputPath.trim()
  }
  if (exportRequestId != null && exportRequestId.trim() !== '') {
    data.export_request_id = exportRequestId.trim()
  }
  return request({
    url: '/api/videos/export-segments',
    method: 'post',
    data,
    timeout: 30 * 60 * 1000 // 30 minutes in milliseconds for large exports
  })
}

/** 导出视频历史项（与 export_videos 表对应；output_missing 由 Go 在列表接口中本机 stat） */
export interface ExportHistoryItem {
  id: number
  workspace_id?: number
  suggested_name: string
  output_path: string
  segment_count: number
  /** subtitle_clip 字幕剪辑（默认）| ai 智能剪辑导出 */
  export_type?: ExportVideoType | string
  created_at: string
  /** 有 output_path 但本机文件不存在或路径为空时为 true */
  output_missing?: boolean
}

/**
 * 获取导出视频历史（按工作区）
 */
export function getExportHistoryApi(params: {
  workspace_id?: number
}): Promise<{ list: ExportHistoryItem[] }> {
  const p: Record<string, number> = {}
  if (params.workspace_id != null && params.workspace_id > 0) {
    p.workspace_id = params.workspace_id
  }
  return request({
    url: '/api/videos/export-history',
    method: 'get',
    params: p
  })
}

/**
 * 获取包含指定视频的导出历史
 */
export function getVideoRelatedExportsApi(videoId: number): Promise<{ list: ExportHistoryItem[] }> {
  return request({
    url: `/api/videos/${videoId}/related-exports`,
    method: 'get'
  })
}

/**
 * 获取使用指定视频的智能剪辑记录（简化结构）
 */
export interface VideoRelatedSmartCutItem {
  id: number
  name: string
  path: string
  cover?: string
  duration?: number
  status: number
  created_at: string
}

export function getVideoRelatedSmartCutsApi(
  videoId: number
): Promise<{ list: VideoRelatedSmartCutItem[] }> {
  return request({
    url: `/api/videos/${videoId}/related-smart-cuts`,
    method: 'get'
  })
}

/**
 * 删除一条导出历史记录（仅删除记录，不删除磁盘文件）
 */
export function deleteExportHistoryApi(exportVideoId: number): Promise<void> {
  return request({
    url: `/api/videos/export-history/${exportVideoId}`,
    method: 'delete'
  })
}

/** 某次导出的字幕片段（含视频信息，用于回填选择字幕区） */
export interface ExportHistorySubtitleItem {
  id: number
  video_id: number
  start_s: number
  end_s: number
  subtitle_text: string
  sort_order: number
  video_name: string
  path: string
}

/**
 * 获取某次导出视频的字幕片段列表
 */
export function getExportHistorySubtitlesApi(exportVideoId: number): Promise<{ list: ExportHistorySubtitleItem[] }> {
  return request({
    url: `/api/videos/export-history/${exportVideoId}/subtitles`,
    method: 'get'
  })
}

/** 爆款复刻：单条结果（清洗文案子串 + 精排后的字幕；同宏观段可能多条，按 offset 序） */
export interface ReplicateHitMatchItem {
  sentence: string
  match: {
    video: VideoItem
    segment: {
      video_id: number
      text: string
      start_ms: number
      end_ms: number
      start_s: number
      end_s: number
      score: number
    }
  } | null
  /** 后端返回的剪辑思路：分层检索、多轮比较、首句回流等 */
  debug?: Record<string, unknown>
}

/** 复刻接口顶层调试：宏观段拆分与精排参数说明 */
export interface ReplicateHitDebugMeta {
  debug_outline?: Array<Record<string, unknown>>
  debug_constants?: Record<string, unknown>
}

/**
 * 爆款复刻：去标点 → jieba → FTS Top30 → Levenshtein 滑窗精排，按原文 offset 输出
 * 长文案 / 大工作区 FTS 与顺序轮次耗时高，超时与全量扫描类接口对齐为 10 分钟
 */
export function replicateHitApi(text: string, workspaceId: number | null): Promise<{ results: ReplicateHitMatchItem[] } & ReplicateHitDebugMeta> {
  return request({
    url: '/api/videos/replicate-hit',
    method: 'post',
    data: { text, workspace_id: workspaceId },
    timeout: 10 * 60 * 1000
  })
}
