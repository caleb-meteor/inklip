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
  ids?: number[], 
  anchor_id?: number, 
  product_id?: number 
}): Promise<VideoItem[]> {
  return request({
    url: '/api/videos',
    method: 'get',
    params: params
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
  promptBuiltId?: number
): Promise<SmartCutResponse> {
  return request({
    url: '/api/smart-cut',
    method: 'post',
    data: {
      video_ids: videoIds,
      anchor_id: anchorId,
      product_id: productId,
      product_name: productName,
      min_duration: minDuration,
      max_duration: maxDuration,
      prompt_text: prompt,
      prompt_built_id: promptBuiltId
    },
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

export interface PromptBuiltin {
  id: string
  name: string
  description: string
}

export interface PromptBuiltinsResponse {
  list: PromptBuiltin[]
}

/**
 * Get built-in prompts
 * @returns Promise with list of built-in prompts
 */
export function getPromptBuiltinsApi(): Promise<PromptBuiltinsResponse> {
  return request({
    url: '/api/prompt-builtins',
    method: 'get'
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

/**
 * Add video category
 * @param id Video ID
 * @param categoryId Category ID
 * @returns Promise with updated video response
 */
export function addVideoCategoryApi(id: number, categoryId: number): Promise<VideoItem> {
  return request({
    url: '/api/video/category',
    method: 'post',
    data: {
      id,
      category_id: categoryId
    }
  })
}

/**
 * Remove video category
 * @param id Video ID
 * @param categoryId Category ID
 * @returns Promise with updated video response
 */
export function removeVideoCategoryApi(id: number, categoryId: number): Promise<VideoItem> {
  return request({
    url: '/api/video/category',
    method: 'delete',
    data: {
      id,
      category_id: categoryId
    }
  })
}
