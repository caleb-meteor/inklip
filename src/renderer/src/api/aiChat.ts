import request from '../utils/request'

export interface AiChatTopic {
  id: number
  topic: string
  /** 所属工作区，与后端 workspace_id 一致（创建后必有） */
  workspace_id: number
  created_at: string
  updated_at: string
  /** 该主题下未读的 assistant 消息数 */
  unread_count?: number
}

export interface AiChatMessage {
  id: number
  ai_chat_id: number
  role: 'user' | 'assistant'
  content: string
  payload?: any
  created_at: string
  /** 是否已读（仅对 assistant 消息有意义） */
  is_read?: boolean
}

export interface AddAiChatMessageInput {
  ai_chat_id: number
  role: 'user' | 'assistant'
  content: string
  payload?: any
  /** 仅智能剪辑流程对 assistant 消息传 false，其他不传则后端默认已读 */
  is_read?: boolean
}

export interface AiChatListResponse {
  list: AiChatTopic[]
  total: number
}

export function getAiChatListApi(
  page = 1,
  pageSize = 20,
  workspaceId: number
): Promise<AiChatListResponse> {
  if (workspaceId <= 0) {
    return Promise.reject(new Error('workspace_id 必填'))
  }
  return request({
    url: '/api/ai_chat/topic',
    method: 'get',
    params: { page, page_size: pageSize, workspace_id: workspaceId }
  })
}

export function createAiChatApi(topic: string, workspaceId: number): Promise<AiChatTopic> {
  if (workspaceId <= 0) {
    return Promise.reject(new Error('workspace_id 必填'))
  }
  return request({
    url: '/api/ai_chat/topic',
    method: 'post',
    data: { topic, workspace_id: workspaceId }
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
  /** 标记该条消息已读/未读 */
  is_read?: boolean
}

export function updateAiChatMessageApi(
  messageId: number,
  data: UpdateAiChatMessageInput
): Promise<void> {
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

/** 将指定主题下所有 assistant 消息标记为已读 */
export function markTopicReadApi(aiChatId: number): Promise<void> {
  return request({
    url: `/api/ai_chat/topic/${aiChatId}/read`,
    method: 'put'
  })
}
