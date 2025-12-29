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
  subtitle: string
  audio: string
  silent: string
  status: number
  task_id: number
  sha256: string
  parse_percentage?: number
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
 * @returns Promise with upload response
 */
export function uploadVideoApi(path: string): Promise<VideoUploadResponse> {
  return request({
    url: '/api/video/upload',
    method: 'post',
    data: {
      video_path: path
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
 * @returns Promise with smart cut task response
 */
export function smartCutApi(
  videoIds: number[],
  prompt?: string,
  minDuration?: number,
  maxDuration?: number
): Promise<SmartCutResponse> {
  return request({
    url: '/api/smart-cut',
    method: 'post',
    data: {
      video_ids: videoIds,
      prompt_text: prompt || '',
      min_duration: minDuration,
      max_duration: maxDuration
    },
    timeout: 20 * 60 * 1000 // 20 minutes in milliseconds
  })
}
export interface SmartCutItem {
  id: number
  user_id: number
  name: string
  subtitle: string
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
