import request from '../utils/request'

export interface AiChatTopic {
  id: number
  topic: string
  created_at: string
  updated_at: string
}

export interface AddAiChatMessagePayload {
  ai_chat_id: number
  user_input: string
  system_output: string
}

export interface AiChatMessage {
  id: number
  ai_chat_id: number
  user_input: string
  system_output: string
  created_at: string
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

export function addAiChatMessageApi(data: AddAiChatMessagePayload): Promise<void> {
  return request({
    url: '/api/ai_chat_message/detail',
    method: 'post',
    data
  })
}

export function getAiChatMessagesApi(aiChatId: number): Promise<AiChatMessage[]> {
  return request({
    url: `/api/ai_chat/topic/${aiChatId}/messages`,
    method: 'get'
  })
}
