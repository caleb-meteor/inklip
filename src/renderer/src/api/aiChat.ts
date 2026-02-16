import request from '../utils/request'

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

export interface AiChatListResponse {
  list: AiChatTopic[]
  total: number
}

export function getAiChatListApi(page = 1, pageSize = 20): Promise<AiChatListResponse> {
  return request({
    url: '/api/ai_chat/topic',
    method: 'get',
    params: { page, page_size: pageSize }
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

export function deleteAiChatApi(aiChatId: number): Promise<void> {
  return request({
    url: `/api/ai_chat/topic/${aiChatId}`,
    method: 'delete'
  })
}

