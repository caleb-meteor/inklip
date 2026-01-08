import request from '../utils/request'

export interface MigrateRequest {
  old_dir: string
  new_dir: string
}

export interface MigrateResponse {
  success: boolean
  movedFiles: number
  errors: string[]
}

export interface ConfigData {
  videoDataDirectory?: string
}

export function migrateVideoDataDirectory(data: MigrateRequest): Promise<MigrateResponse> {
  return request({
    url: '/api/migrate/video-data-directory',
    method: 'post',
    data
  })
}

export function getConfig(): Promise<ConfigData> {
  return request({
    url: '/api/config',
    method: 'get'
  })
}

export function saveConfig(config: ConfigData): Promise<void> {
  return request({
    url: '/api/config',
    method: 'post',
    data: { config }
  })
}

