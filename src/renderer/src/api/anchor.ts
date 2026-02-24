import request from '../utils/request'

export interface Anchor {
  id: number
  name: string
  avatar: string
  created_at?: string
  updated_at?: string
}

export interface AnchorListResponse {
  list: Anchor[]
  total: number
}

export function getAnchorsApi(params?: {
  all?: boolean
  page?: number
  page_size?: number
}): Promise<AnchorListResponse> {
  return request({
    url: '/api/anchors',
    method: 'get',
    params
  })
}

export function createAnchorApi(data: { name: string; avatar?: string }): Promise<Anchor> {
  return request({
    url: '/api/anchor',
    method: 'post',
    data
  })
}

export function updateAnchorApi(data: {
  id: number
  name?: string
  avatar?: string
}): Promise<Anchor> {
  return request({
    url: '/api/anchor',
    method: 'put',
    data
  })
}

export function deleteAnchorApi(id: number): Promise<void> {
  return request({
    url: '/api/anchor',
    method: 'delete',
    data: { id }
  })
}
