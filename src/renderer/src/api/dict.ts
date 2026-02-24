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
 * Get dict items from sentence (matches dict names in the sentence)
 * @param sentence Input sentence to analyze
 * @returns Promise with list of matched dict items
 */
export function getDictsFromSentenceApi(sentence: string): Promise<DictItem[]> {
  return request({
    url: '/api/dict/sentence',
    method: 'post',
    data: { sentence }
  })
}
