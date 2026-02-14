import request, { getApiBaseUrl } from '../utils/request'

export interface AiChatTopic {
  id: number
  topic: string
  created_at: string
  updated_at: string
}

export interface AiChatMessage {
  id: number
  ai_chat_id: number
  role: 'user' | 'assistant'
  content: string
  payload?: any
  created_at: string
}

export interface AddAiChatMessageInput {
  ai_chat_id: number
  role: 'user' | 'assistant'
  content: string
  payload?: any
}

export function getAiChatListApi(limit = 20): Promise<AiChatTopic[]> {
  return request({
    url: '/api/ai_chat/topic',
    method: 'get',
    params: { limit }
  })
}

export function createAiChatApi(topic: string): Promise<AiChatTopic> {
  return request({
    url: '/api/ai_chat/topic',
    method: 'post',
    data: { topic }
  })
}

export function addAiChatMessageApi(data: AddAiChatMessageInput): Promise<AiChatMessage> {
  return request({
    url: '/api/ai_chat/message',
    method: 'post',
    data
  })
}

export function getAiChatMessagesApi(aiChatId: number): Promise<AiChatMessage[]> {
  return request({
    url: `/api/ai_chat/${aiChatId}/messages`,
    method: 'get'
  })
}

export interface UpdateAiChatMessageInput {
  content?: string
  payload?: any
}

export function updateAiChatMessageApi(messageId: number, data: UpdateAiChatMessageInput): Promise<void> {
  return request({
    url: `/api/ai_chat/message/${messageId}`,
    method: 'put',
    data
  })
}

/** 意图分析：判断用户是想搜索视频还是剪辑视频（后端用 AI 分析） */
export type AnalyzeIntentResult = {
  intent: 'search_video' | 'cut_video' | 'chat'
  search_content: string
  anchor_name: string
  product_name: string
  /** 解析思路：AI 为何判断为该意图、提取了哪些关键信息 */
  reasoning?: string
}

export function analyzeIntentApi(message: string): Promise<AnalyzeIntentResult> {
  return request({
    url: '/api/ai/analyze-intent',
    method: 'post',
    data: { message }
  }) as Promise<AnalyzeIntentResult>
}

/** 意图分析流式事件（SSE） */
export type IntentStreamEvent = {
  type: 'delta' | 'result' | 'done'
  content?: string
  intent?: string
  search_content?: string
  anchor_name?: string
  product_name?: string
  reasoning?: string
}

/**
 * 流式意图分析：通过 SSE 逐字返回 AI 解析内容，最后返回 result。
 * 使用与 axios 相同的 base（如 http://127.0.0.1:12698），与 /api/ai_chat/topic 等接口同源。
 */
export async function analyzeIntentStreamApi(
  message: string,
  callbacks: {
    onDelta: (content: string) => void
    onResult: (result: AnalyzeIntentResult) => void
    onError?: (err: Error) => void
  }
): Promise<void> {
  const base = getApiBaseUrl()
  const path = base ? `${base}/api/ai/analyze-intent?stream=true` : '/api/ai/analyze-intent?stream=true'
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message })
  })
  if (!res.ok) {
    const err = new Error(res.statusText || '意图分析请求失败')
    callbacks.onError?.(err)
    throw err
  }
  const reader = res.body?.getReader()
  if (!reader) {
    callbacks.onError?.(new Error('无法读取流'))
    throw new Error('无法读取流')
  }
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data === '[DONE]') return
        try {
          const ev = JSON.parse(data) as IntentStreamEvent
          if (ev.type === 'delta' && ev.content) callbacks.onDelta(ev.content)
          if (ev.type === 'result' && ev.intent !== undefined) {
            callbacks.onResult({
              intent: ev.intent as AnalyzeIntentResult['intent'],
              search_content: ev.search_content ?? '',
              anchor_name: ev.anchor_name ?? '',
              product_name: ev.product_name ?? '',
              reasoning: ev.reasoning
            })
          }
        } catch {
          // ignore parse error for single line
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
