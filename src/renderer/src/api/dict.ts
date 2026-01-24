import request from '../utils/request'

export interface DictItem {
  id: number
  user_id: number
  name: string
  type: string
  created_at?: string
  updated_at?: string
}

/**
 * Create a dict item
 * @param name Dict name
 * @param type Dict type
 * @returns Promise with created dict item
 */
export function createDictApi(name: string, type: string): Promise<DictItem> {
  return request({
    url: '/api/dict',
    method: 'post',
    data: {
      name,
      type
    }
  })
}

/**
 * Get dict items by type
 * @param type Dict type
 * @returns Promise with list of dict items
 */
export function getDictsByTypeApi(type: string): Promise<DictItem[]> {
  return request({
    url: '/api/dicts',
    method: 'get',
    params: {
      type
    }
  })
}

/**
 * Update dict item
 * @param id Dict id
 * @param name Optional new name
 * @param type Optional new type
 * @returns Promise with updated dict item
 */
export function updateDictApi(id: number, name?: string, type?: string): Promise<DictItem> {
  return request({
    url: '/api/dict',
    method: 'put',
    data: {
      id,
      name,
      type
    }
  })
}

/**
 * Delete dict item
 * @param id Dict id
 * @returns Promise
 */
export function deleteDictApi(id: number): Promise<void> {
  return request({
    url: '/api/dict',
    method: 'delete',
    data: {
      id
    }
  })
}

