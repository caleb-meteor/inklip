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

/** 本地 Go 中的授权码状态；api_key 仅本机环回接口返回，用于设置页展示 */
export interface CloudActivation {
  activated: boolean
  api_key?: string
}

export function getCloudActivation(): Promise<CloudActivation> {
  return request({
    url: '/user/api-key',
    method: 'get'
  })
}

/** 与 getCloudActivation 相同，兼容设置页等处的命名 */
export function getApiKey(): Promise<CloudActivation> {
  return getCloudActivation()
}

export function getDeviceId(): Promise<{ device_id: string }> {
  return request({
    url: '/user/device-id',
    method: 'get',
    silent: true
  })
}

/** 更换授权码（写入 base-go 并重连云端 SSE） */
export function setApiKey(apiKey: string): Promise<{ success: boolean }> {
  return request({
    url: '/user/api-key',
    method: 'post',
    data: { api_key: apiKey }
  })
}

/** 在云端用本机设备注册新用户并绑定（显式操作，启动时不会自动调用） */
export function registerDeviceOnCloud(): Promise<{ success: boolean }> {
  return request({
    url: '/user/register-device-on-cloud',
    method: 'post'
  })
}

/** 将激活状态写入 localStorage（与 syncCloudActivationFromBackend / SSE 共用） */
export function applyCloudActivationToStorage(activated: boolean): void {
  localStorage.removeItem('apiKey')
  localStorage.setItem('cloudActivated', activated ? '1' : '0')
}

/** 与 base-go 同步「是否已有授权码」，并清理遗留的 localStorage apiKey */
export async function syncCloudActivationFromBackend(): Promise<boolean> {
  const { activated } = await getCloudActivation().catch(() => ({ activated: false }))
  applyCloudActivationToStorage(activated)
  return activated
}
