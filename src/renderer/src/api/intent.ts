import request from '../utils/request'

/** 意图类型：0 未知 1 搜索 2 剪辑 */
export type IntentType = 0 | 1 | 2

export type IntentLabel = 'unknown' | 'search' | 'clip'

export interface KeywordWeight {
  word: string
  weight: number
}

export interface RecognizeIntentResult {
  intent: IntentType
  intent_label: IntentLabel
  keywords: string[]
  keyword_weights?: KeywordWeight[]
  query: string
}

/**
 * 意图识别：根据用户输入识别意图（搜索/剪辑）并提取关键词
 * 用户输入后先调用此接口，再根据 intent 走搜索或剪辑流程
 */
export function recognizeIntentApi(query: string): Promise<RecognizeIntentResult> {
  return request({
    url: '/api/intent/recognize',
    method: 'post',
    data: { query: query.trim() }
  })
}
