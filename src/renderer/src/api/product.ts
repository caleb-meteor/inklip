import request from '../utils/request'

export interface Product {
  id: number
  name: string
  cover: string
  anchor_id: number
  created_at?: string
  updated_at?: string
}

export interface ProductListResponse {
  list: Product[]
  total: number
}

export function getProductsApi(params?: {
  all?: boolean
  anchor_id?: number
  page?: number
  page_size?: number
}): Promise<ProductListResponse> {
  return request({
    url: '/api/products',
    method: 'get',
    params
  })
}

export function createProductApi(data: {
  name: string
  anchor_id: number
  cover?: string
}): Promise<Product> {
  return request({
    url: '/api/product',
    method: 'post',
    data
  })
}

export function updateProductApi(data: {
  id: number
  name?: string
  cover?: string
}): Promise<Product> {
  return request({
    url: '/api/product',
    method: 'put',
    data
  })
}

export function deleteProductApi(id: number): Promise<void> {
  return request({
    url: '/api/product',
    method: 'delete',
    data: { id }
  })
}
