import request from '../utils/request'

export interface ConfigData {
  videoDataDirectory?: string
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

export function setApiKey(apiKey: string): Promise<{ api_key: string }> {
  return request({
    url: '/user/api-key',
    method: 'post',
    data: { api_key: apiKey }
  })
}

export function getApiKey(): Promise<{ api_key: string }> {
  return request({
    url: '/user/api-key',
    method: 'get'
  })
}

export function validateApiKey(apiKey: string): Promise<{ status: boolean }> {
  return request({
    url: '/api/validate-api-key',
    method: 'post',
    data: { api_key: apiKey }
  })
}
