import request from '../utils/request'

export interface VideoItem {
  id: number
  user_id: number
  name: string
  path: string
  size: number
  cover: string
  duration: number
  width?: number
  height?: number
  subtitle: string | any // Backend may return parsed JSON object or string
  feature?: {
    main_content?: string
    product_name?: string
    pain_points?: string
    selling_points?: string
    price?: string
    anchor_info?: string
  } | null // 视频特征：字幕提取内容
  audio: string
  silent: string
  status: number
  task_id: number
  task_status?: number // 任务状态：0=待执行, 1=完成, 2=执行中, 3=失败
  sha256: string
  parse_percentage?: number
  group_id?: number
  categories?: Array<{ id: number; name: string; type: string }>
  anchor_id?: number
  product_id?: number
  created_at: string
  updated_at: string
}

export interface VideoUploadResponse {
  id: number
  path: string
  name?: string
  size: number
  cover?: string
  duration?: number
  width?: number
  height?: number
  status?: number
  parse_percentage?: number
  anchor_id?: number
  product_id?: number
  created_at?: string
  updated_at: string
}

/**
 * Get all videos or filter by IDs, anchor, or product
 * @param params Optional filters
 * @returns Promise with list of videos
 */
export function getVideosApi(params?: {
  ids?: number[]
  anchor_id?: number
  product_id?: number
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
 * 识别到搜索意图后调用，返回匹配视频及字幕片段（含时间）
 */
export function searchVideosApi(query: string, limit?: number): Promise<VideoSearchResponse> {
  return request({
    url: '/api/videos/search',
    method: 'post',
    data: { query: query.trim(), limit: limit ?? 5 }
  })
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

/**
 * Upload multiple video files by their local paths
 * @param paths Array of absolute paths of video files
 * @param categoryIds Optional list of category IDs to assign to all videos
 * @param subtitleFiles Optional map of video path to subtitle file path
 * @returns Promise with array of upload responses (Python backend) or object with videos array (Go backend)
 */
export function uploadVideosBatchApi(
  paths: string[],
  subtitleFiles?: Record<string, string>,
  anchorId?: number,
  productId?: number
): Promise<
  VideoUploadResponse[] | { videos: VideoUploadResponse[]; task_ids?: string[]; status?: string }
> {
  return request({
    url: '/api/video/upload/batch',
    method: 'post',
    data: {
      video_paths: paths,
      subtitle_files: subtitleFiles,
      anchor_id: anchorId,
      product_id: productId
    },
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
 * Start smart cut processing for selected videos
 * @param videoIds Array of video IDs to process
 * @param anchorId Anchor ID (required)
 * @param productId Product ID (required)
 * @param productName Product name (required)
 * @param minDuration Optional minimum duration of the output video in seconds
 * @param maxDuration Optional maximum duration of the output video in seconds
 * @param prompt Optional editing ideas or instructions
 * @param promptBuiltId Optional built-in prompt ID (0 for custom prompt)
 * @param aiChatId Optional AI 对话 ID，后端用于完成/异常时标记该会话下任务卡片未读
 * @returns Promise with smart cut task response
 */
export function smartCutApi(
  videoIds: number[],
  anchorId: number,
  productId: number,
  productName: string,
  minDuration?: number,
  maxDuration?: number,
  prompt?: string,
  promptBuiltId?: number,
  aiChatId?: number
): Promise<SmartCutResponse> {
  const data: Record<string, unknown> = {
    video_ids: videoIds,
    anchor_id: anchorId,
    product_id: productId,
    product_name: productName,
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
  user_id: number
  name: string
  subtitle: string | any // Can be array or string
  path: string
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
  video: VideoItem | SmartCutItem | { id: number; name: string; path: string }
  videoType: 'material' | 'edited' | 'exported'
}

export interface SmartCutsResponse {
  list: SmartCutItem[]
  total: number
  page: number
  page_size: number
}

/**
 * Get smart cut history with pagination
 * @param page Page number
 * @param pageSize Items per page
 * @param anchorId Filter by anchor
 * @param productId Filter by product
 * @returns Promise with paginated smart cut items
 */
export function getSmartCutsApi(
  page: number,
  pageSize: number,
  anchorId?: number,
  productId?: number
): Promise<SmartCutsResponse> {
  return request({
    url: '/api/smart-cuts',
    method: 'get',
    params: {
      page,
      page_size: pageSize,
      anchor_id: anchorId,
      product_id: productId
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
 */
export function exportSegmentsApi(
  segments: ExportSegmentsRequestItem[],
  anchorId?: number | null,
  suggestedName?: string | null
): Promise<ExportSegmentResult> {
  const data: Record<string, unknown> = { segments, anchor_id: anchorId || 0 }
  if (suggestedName != null && suggestedName.trim() !== '') {
    data.suggested_name = suggestedName.trim()
  }
  return request({
    url: '/api/videos/export-segments',
    method: 'post',
    data,
    timeout: 30 * 60 * 1000 // 30 minutes in milliseconds for large exports
  })
}

/** 导出视频历史项（与 export_videos 表对应） */
export interface ExportHistoryItem {
  id: number
  anchor_id: number
  suggested_name: string
  output_path: string
  segment_count: number
  created_at: string
}

/**
 * 获取该主播下的导出视频历史
 */
export function getExportHistoryApi(anchorId: number): Promise<{ list: ExportHistoryItem[] }> {
  return request({
    url: '/api/videos/export-history',
    method: 'get',
    params: { anchor_id: anchorId }
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
