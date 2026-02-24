import { ref, type Ref } from 'vue'
import {
  getAiChatListApi,
  getAiChatMessagesApi,
  createAiChatApi,
  type AiChatTopic,
  type AiChatMessage,
  updateAiChatMessageApi,
  deleteAiChatApi,
  markTopicReadApi
} from '../api/aiChat'
import { getSmartCutApi, getVideosApi } from '../api/video'
import type { Message } from '../types/chat'

/**
 * AI 对话全局共享存储
 * 用于管理所有 AI 操作的对话数据
 */
export class AiChatStore {
  private aiChats: Ref<AiChatTopic[]>
  private currentAiChatId: Ref<number | null>
  private messages: Ref<Message[]>
  private hasMoreAiChats: Ref<boolean>
  private isLoadingAiChats: Ref<boolean>
  private isCurrentChatProcessing: Ref<boolean>
  private aiChatPage: number

  /** 新建/创建聊天后的回调，用于 focus 输入框等 */
  private onNewChatCallback: (() => void) | null = null

  setOnNewChatCallback(cb: (() => void) | null): void {
    this.onNewChatCallback = cb
  }

  constructor() {
    this.aiChats = ref<AiChatTopic[]>([])
    this.currentAiChatId = ref<number | null>(null)
    this.messages = ref<Message[]>([])
    this.hasMoreAiChats = ref<boolean>(true)
    this.isLoadingAiChats = ref<boolean>(false)
    this.isCurrentChatProcessing = ref<boolean>(false)
    this.aiChatPage = 1
  }

  /**
   * 获取 AI 对话列表
   */
  getAiChats(): Ref<AiChatTopic[]> {
    return this.aiChats
  }

  /**
   * 是否有更多对话可加载
   */
  getHasMoreAiChats(): Ref<boolean> {
    return this.hasMoreAiChats
  }

  /**
   * 是否正在加载对话列表
   */
  getIsLoadingAiChats(): Ref<boolean> {
    return this.isLoadingAiChats
  }

  /**
   * 获取当前对话 ID
   */
  getCurrentAiChatId(): Ref<number | null> {
    return this.currentAiChatId
  }

  /**
   * 获取当前对话消息
   */
  getMessages(): Ref<Message[]> {
    return this.messages
  }

  /**
   * 获取当前对话是否正在处理中
   */
  getIsCurrentChatProcessing(): Ref<boolean> {
    return this.isCurrentChatProcessing
  }

  /**
   * 设置当前对话处理状态
   */
  setCurrentChatProcessing(isProcessing: boolean): void {
    this.isCurrentChatProcessing.value = isProcessing
  }

  /**
   * 加载 AI 对话列表
   */
  async loadAiChats(): Promise<void> {
    if (this.isLoadingAiChats.value) return
    this.isLoadingAiChats.value = true
    const res = await getAiChatListApi(1, 20)
    this.aiChats.value = res.list || []
    this.aiChatPage = 1
    this.hasMoreAiChats.value = this.aiChats.value.length < res.total
    if (this.hasMoreAiChats.value) this.aiChatPage = 2
    this.isLoadingAiChats.value = false
  }

  /**
   * 加载更多 AI 对话
   */
  async loadMoreAiChats(): Promise<void> {
    if (this.isLoadingAiChats.value || !this.hasMoreAiChats.value) return
    this.isLoadingAiChats.value = true
    const res = await getAiChatListApi(this.aiChatPage, 20)
    if (res.list.length > 0) this.aiChats.value = [...this.aiChats.value, ...res.list]
    this.hasMoreAiChats.value = this.aiChats.value.length < res.total
    if (this.hasMoreAiChats.value) this.aiChatPage++
    this.isLoadingAiChats.value = false
  }

  /**
   * 加载对话消息
   */
  /** 加载对话消息，网络异常由 request 拦截器统一提示 */
  async loadAiChatMessages(aiChatId: number): Promise<void> {
    const list: AiChatMessage[] = await getAiChatMessagesApi(aiChatId)
    this.messages.value = list.map((item) => ({
      id: item.id.toString(),
      role: item.role,
      content: item.content,
      payload: item.payload
        ? typeof item.payload === 'string'
          ? JSON.parse(item.payload)
          : item.payload
        : undefined,
      timestamp: new Date(item.created_at),
      isRead: item.role === 'user' ? true : (item.is_read ?? true)
    }))
  }

  /**
   * 创建新的 AI 对话
   * 这是所有 AI 流程的共同入口
   */
  /** 创建新对话，网络异常由 request 拦截器统一提示 */
  async createAiChat(topic: string): Promise<AiChatTopic> {
    const aiTopic = await createAiChatApi(topic || '新建对话')
    this.aiChats.value = [aiTopic, ...this.aiChats.value]
    this.currentAiChatId.value = aiTopic.id
    this.onNewChatCallback?.()
    return aiTopic
  }

  /**
   * 添加对话到列表头部
   */
  addAiChat(chat: AiChatTopic): void {
    this.aiChats.value = [chat, ...this.aiChats.value]
  }

  /**
   * 设置当前对话 ID
   */
  setCurrentAiChatId(id: number | null): void {
    this.currentAiChatId.value = id
  }

  /**
   * 清空消息
   */
  clearMessages(): void {
    this.messages.value = []
  }

  /**
   * 添加消息（仅「开始执行智能剪辑」的任务卡片未读，筛选/选择等默认已读）
   */
  addMessage(message: Message): void {
    const msg = { ...message }
    if (msg.role === 'assistant' && msg.isRead === undefined) {
      const payload = msg.payload as any
      const isClipExecutionCard = payload?.type === 'task_card'
      msg.isRead = !isClipExecutionCard
    }
    this.messages.value.push(msg)
    // 仅智能剪辑未读消息计入列表未读数
    if (msg.role === 'assistant' && msg.isRead === false && this.currentAiChatId.value != null) {
      const id = this.currentAiChatId.value
      this.aiChats.value = this.aiChats.value.map((c) =>
        c.id === id ? { ...c, unread_count: (c.unread_count ?? 0) + 1 } : c
      )
    }
  }

  /**
   * 更新消息
   */
  updateMessage(id: string, updates: Partial<Message>): void {
    const msg = this.messages.value.find((m) => m.id === id)
    if (msg) {
      Object.assign(msg, updates)
    }
  }

  /**
   * 替换消息 ID（将临时 ID 替换为数据库 ID）
   */
  replaceMessageId(oldId: string, newId: string): void {
    const msg = this.messages.value.find((m) => m.id === oldId)
    if (msg) {
      msg.id = newId
    }
  }

  /**
   * 删除对话
   */
  async deleteAiChat(aiChatId: number): Promise<void> {
    await deleteAiChatApi(aiChatId)
    this.aiChats.value = this.aiChats.value.filter((chat) => chat.id !== aiChatId)
    if (this.currentAiChatId.value === aiChatId) this.newChat()
  }

  /**
   * 选择对话
   */
  async selectChat(chat: AiChatTopic): Promise<void> {
    this.currentAiChatId.value = chat.id
    await this.loadAiChatMessages(chat.id)

    await markTopicReadApi(chat.id)
    const idx = this.aiChats.value.findIndex((c) => c.id === chat.id)
    if (idx >= 0 && this.aiChats.value[idx].unread_count != null) {
      this.aiChats.value = this.aiChats.value.map((c, i) =>
        i === idx ? { ...c, unread_count: 0 } : c
      )
    }
    this.messages.value = this.messages.value.map((m) =>
      m.role === 'assistant' ? { ...m, isRead: true } : m
    )
    await this.refreshProcessingTasks()
  }

  /**
   * 刷新处理中的任务状态
   * 检查当前聊天的最后一条消息中是否存在处理中的 AI 剪辑任务，如果有则请求后端最新状态
   */
  async refreshProcessingTasks(): Promise<void> {
    const currentMessages = this.messages.value
    if (currentMessages.length === 0) return

    const msg = currentMessages[currentMessages.length - 1]
    const payload = msg.payload as any
    const aiGenVideoId = payload?.smartCutTask?.aiGenVideoId || payload?.aiGenVideoId
    if (!aiGenVideoId) return

    const status =
      payload?.smartCutTask?.status !== undefined ? payload.smartCutTask.status : payload?.status
    if (status === undefined || (status !== 1 && status !== 3 && status !== 4)) {
      const latestData = await getSmartCutApi(aiGenVideoId)
      const updatedPayload: any = { ...payload }
      if (updatedPayload.smartCutTask) {
        updatedPayload.smartCutTask = {
          ...updatedPayload.smartCutTask,
          status: latestData.status,
          fileUrl: latestData.path,
          duration: latestData.duration,
          cover: latestData.cover,
          name: latestData.name
        }
      } else {
        updatedPayload.status = latestData.status
        updatedPayload.fileUrl = latestData.path
        updatedPayload.duration = latestData.duration
        updatedPayload.cover = latestData.cover
        updatedPayload.name = latestData.name
      }
      if (updatedPayload.taskCard?.steps) {
        const steps = updatedPayload.taskCard.steps
        const backendStatus = latestData.status
        if (backendStatus === 1) steps.forEach((step) => (step.status = 'completed'))
        else if (backendStatus === 2 || backendStatus === 5) {
          if (steps.length > 0) steps[0].status = 'completed'
          if (steps.length > 1) {
            steps[1].status = 'completed'
            if (steps.length > 2) steps[2].status = 'processing'
          }
        } else if (backendStatus === 3 || backendStatus === 4) {
          const processIdx = steps.findIndex((s) => s.status === 'processing')
          if (processIdx !== -1) steps[processIdx].status = 'error'
        }
      }
      await updateAiChatMessageApi(Number(msg.id), { payload: updatedPayload })
      this.updateMessage(msg.id, { payload: updatedPayload })
    }

    if (payload?.type === 'video_upload' && payload?.videos?.length > 0) {
      const videosToRefresh = payload.videos.filter((v: any) => {
        const isCompleted = v.status === 4 || v.status === 'completed'
        const isMissingMetadata = !v.cover || !v.duration
        return !isCompleted || isMissingMetadata
      })
      if (videosToRefresh.length > 0) {
        const idsToFetch = videosToRefresh.map((v: any) => v.id)
        const latestVideos = await getVideosApi({ ids: idsToFetch })
        const videoMap = new Map(latestVideos.map((v: any) => [v.id, v]))
        let hasUpdates = false
        const updatedVideos = payload.videos.map((v: any) => {
          const latest = videoMap.get(v.id)
          if (latest) {
            if (
              latest.status !== v.status ||
              latest.cover !== v.cover ||
              latest.duration !== v.duration
            ) {
              hasUpdates = true
              return {
                ...v,
                status: latest.status,
                cover: latest.cover,
                duration: latest.duration,
                path: latest.path,
                name: latest.name
              }
            }
          }
          return v
        })
        if (hasUpdates) {
          const updatedPayload = { ...payload, videos: updatedVideos }
          await updateAiChatMessageApi(Number(msg.id), { payload: updatedPayload })
          this.updateMessage(msg.id, { payload: updatedPayload })
        }
      }
    }
  }

  /**
   * 新建对话
   */
  newChat(): void {
    this.currentAiChatId.value = null
    this.isCurrentChatProcessing.value = false
    this.clearMessages()
    this.onNewChatCallback?.()
  }

  /**
   * 智能剪辑完成/异常推送时由 realtime 调用：若推送的 ai_chat_id 不是当前会话，则仅本地将该会话未读数 +1（后端已标记消息未读）
   */
  incrementUnreadCountForChat(aiChatId: number): void {
    if (aiChatId === this.currentAiChatId.value) return
    const idx = this.aiChats.value.findIndex((c) => c.id === aiChatId)
    if (idx >= 0) {
      this.aiChats.value = this.aiChats.value.map((c, i) =>
        i === idx ? { ...c, unread_count: (c.unread_count ?? 0) + 1 } : c
      )
    }
  }
}

// 导出单例
export const aiChatStore = new AiChatStore()
