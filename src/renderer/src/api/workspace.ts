import request from '../utils/request'

/** 选择/切换工作空间时服务端会全量扫描目录（含大文件 SHA256），耗时可能很长 */
const WORKSPACE_SCAN_TIMEOUT_MS = 10 * 60 * 1000

export interface WorkspaceItem {
  id: number
  name: string
  path: string
  created_at: string
  updated_at: string
}

export function getWorkspacesApi(): Promise<WorkspaceItem[]> {
  return request({
    url: '/api/workspaces',
    method: 'get'
  })
}

export function createWorkspaceApi(params: { name: string; path?: string }): Promise<WorkspaceItem> {
  return request({
    url: '/api/workspaces',
    method: 'post',
    data: params,
    timeout: params.path ? WORKSPACE_SCAN_TIMEOUT_MS : undefined
  })
}

export function updateWorkspaceApi(
  id: number,
  params: { name?: string; path?: string }
): Promise<WorkspaceItem> {
  return request({
    url: `/api/workspaces/${id}`,
    method: 'put',
    data: params,
    timeout: params.path !== undefined ? WORKSPACE_SCAN_TIMEOUT_MS : undefined
  })
}

/** 切换工作空间：重新扫描目录并启动监听 */
export function switchWorkspaceApi(id: number): Promise<{ added: number; updated: number; deleted: number }> {
  return request({
    url: `/api/workspaces/${id}/switch`,
    method: 'post',
    timeout: WORKSPACE_SCAN_TIMEOUT_MS
  })
}

/** 触发工作区目录扫描入库并同步视频 */
export function ingestWorkspaceApi(id: number): Promise<{ added: number; updated: number }> {
  return request({
    url: `/api/workspaces/${id}/ingest`,
    method: 'post',
    timeout: WORKSPACE_SCAN_TIMEOUT_MS
  })
}

/** 删除工作空间（会停止监听，删除后需切换至其他工作空间） */
export function deleteWorkspaceApi(id: number): Promise<void> {
  return request({
    url: `/api/workspaces/${id}`,
    method: 'delete'
  })
}
