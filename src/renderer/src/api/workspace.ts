import request from '../utils/request'

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
    data: params
  })
}

export function updateWorkspaceApi(
  id: number,
  params: { name?: string; path?: string }
): Promise<WorkspaceItem> {
  return request({
    url: `/api/workspaces/${id}`,
    method: 'put',
    data: params
  })
}

/** 切换工作空间：重新扫描目录并启动监听 */
export function switchWorkspaceApi(id: number): Promise<{ added: number; updated: number; deleted: number }> {
  return request({ url: `/api/workspaces/${id}/switch`, method: 'post' })
}

/** 触发工作区目录扫描入库并同步视频 */
export function ingestWorkspaceApi(id: number): Promise<{ added: number; updated: number }> {
  return request({
    url: `/api/workspaces/${id}/ingest`,
    method: 'post'
  })
}
