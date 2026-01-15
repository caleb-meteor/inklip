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
  created_at?: string
  updated_at: string
}

/**
 * Get all videos
 * @returns Promise with list of videos
 */
export function getVideosApi(): Promise<VideoItem[]> {
  return request({
    url: '/api/videos',
    method: 'get'
  })
}

/**
 * Upload a video file by its local path
 * @param path The absolute path of the video file
 * @param categoryIds Optional list of category IDs to assign to the video
 * @returns Promise with upload response
 */
export function uploadVideoApi(path: string, categoryIds?: number[]): Promise<VideoUploadResponse> {
  return request({
    url: '/api/video/upload',
    method: 'post',
    data: {
      video_path: path,
      category_ids: categoryIds
    }
  })
}

/**
 * Upload multiple video files by their local paths
 * @param paths Array of absolute paths of video files
 * @param categoryIds Optional list of category IDs to assign to all videos
 * @returns Promise with array of upload responses
 */
export function uploadVideosBatchApi(paths: string[], categoryIds?: number[]): Promise<VideoUploadResponse[]> {
  return request({
    url: '/api/video/upload/batch',
    method: 'post',
    data: {
      video_paths: paths,
      category_ids: categoryIds
    }
  })
}

export interface SmartCutResponse {
  task_id: number
  status: string
  message: string
}

/**
 * Start smart cut processing for selected videos
 * @param videoIds Array of video IDs to process
 * @param prompt Optional editing ideas or instructions
 * @param minDuration Optional minimum duration of the output video in seconds
 * @param maxDuration Optional maximum duration of the output video in seconds
 * @param productName Optional product name
 * @param promptBuiltId Optional built-in prompt ID (0 for custom prompt)
 * @returns Promise with smart cut task response
 */
export function smartCutApi(
  videoIds: number[],
  prompt?: string,
  minDuration?: number,
  maxDuration?: number,
  productName?: string,
  promptBuiltId?: number
): Promise<SmartCutResponse> {
  return request({
    url: '/api/smart-cut',
    method: 'post',
    data: {
      video_ids: videoIds,
      prompt_text: prompt,
      prompt_built_id: promptBuiltId,
      min_duration: minDuration,
      max_duration: maxDuration,
      product_name: productName
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
 * @returns Promise with paginated smart cut items
 */
export function getSmartCutsApi(page: number, pageSize: number): Promise<SmartCutsResponse> {
  return request({
    url: '/api/smart-cuts',
    method: 'get',
    params: {
      page,
      page_size: pageSize
    }
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
