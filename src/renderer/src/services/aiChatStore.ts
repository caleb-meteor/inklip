import { ref, type Ref } from 'vue'
import { getAiChatListApi, getAiChatMessagesApi, createAiChatApi, type AiChatTopic, type AiChatMessage, updateAiChatMessageApi, deleteAiChatApi } from '../api/aiChat'
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
    this.aiChatPage = 1
    try {
      const res = await getAiChatListApi(1, 20)
      this.aiChats.value = res.list || []
      this.hasMoreAiChats.value = this.aiChats.value.length < res.total
      if (this.hasMoreAiChats.value) {
        this.aiChatPage = 2
      }
    } catch (error) {
      console.error('加载 AI 对话失败:', error)
      throw error
    } finally {
      this.isLoadingAiChats.value = false
    }
  }

  /**
   * 加载更多 AI 对话
   */
  async loadMoreAiChats(): Promise<void> {
    if (this.isLoadingAiChats.value || !this.hasMoreAiChats.value) return
    this.isLoadingAiChats.value = true
    try {
      const res = await getAiChatListApi(this.aiChatPage, 20)
      if (res.list.length > 0) {
        this.aiChats.value = [...this.aiChats.value, ...res.list]
      }
      this.hasMoreAiChats.value = this.aiChats.value.length < res.total
      if (this.hasMoreAiChats.value) {
        this.aiChatPage++
      }
    } catch (error) {
      console.error('加载更多 AI 对话失败:', error)
      throw error
    } finally {
      this.isLoadingAiChats.value = false
    }
  }

  /**
   * 加载对话消息
   */
  async loadAiChatMessages(aiChatId: number): Promise<void> {
    try {
      const list: AiChatMessage[] = await getAiChatMessagesApi(aiChatId)
      this.messages.value = list.map(item => ({
        id: item.id.toString(), // 从数据库加载的 id 是纯数字字符串
        role: item.role,
        content: item.content,
        payload: item.payload ? (typeof item.payload === 'string' ? JSON.parse(item.payload) : item.payload) : undefined,
        timestamp: new Date(item.created_at)
      }))
    } catch (error) {
      console.error('加载对话详情失败:', error)
      throw error
    }
  }

  /**
   * 创建新的 AI 对话
   * 这是所有 AI 流程的共同入口
   */
  async createAiChat(topic: string): Promise<AiChatTopic> {
    try {
      const aiTopic = await createAiChatApi(topic || '新建对话')
      this.aiChats.value = [aiTopic, ...this.aiChats.value]
      this.currentAiChatId.value = aiTopic.id
      // 不在这里清空消息，让调用者决定是否清空
      return aiTopic
    } catch (error) {
      console.error('创建 AI 对话失败:', error)
      throw error
    }
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
   * 添加消息
   */
  addMessage(message: Message): void {
    this.messages.value.push(message)
  }

  /**
   * 更新消息
   */
  updateMessage(id: string, updates: Partial<Message>): void {
    const msg = this.messages.value.find(m => m.id === id)
    if (msg) {
      Object.assign(msg, updates)
    }
  }

  /**
   * 替换消息 ID（将临时 ID 替换为数据库 ID）
   */
  replaceMessageId(oldId: string, newId: string): void {
    const msg = this.messages.value.find(m => m.id === oldId)
    if (msg) {
      msg.id = newId
    }
  }

  /**
   * 删除对话
   */
  async deleteAiChat(aiChatId: number): Promise<void> {
    try {
      await deleteAiChatApi(aiChatId)
      this.aiChats.value = this.aiChats.value.filter(chat => chat.id !== aiChatId)
      if (this.currentAiChatId.value === aiChatId) {
        this.newChat()
      }
    } catch (error) {
      console.error('删除 AI 对话失败:', error)
      throw error
    }
  }

  /**
   * 选择对话
   */
  async selectChat(chat: AiChatTopic): Promise<void> {
    this.currentAiChatId.value = chat.id
    await this.loadAiChatMessages(chat.id)

    // 加载完消息后，检查是否存在处理中的任务，如果有则请求最新状态
    await this.refreshProcessingTasks()
  }

  /**
   * 刷新处理中的任务状态
   * 检查当前聊天的最后一条消息中是否存在处理中的 AI 剪辑任务，如果有则请求后端最新状态
   */
  async refreshProcessingTasks(): Promise<void> {
    try {
      const currentMessages = this.messages.value

      // Only check the last message as per user request
      if (currentMessages.length === 0) return

      const msg = currentMessages[currentMessages.length - 1]

      // Use any cast to handle potential legacy flat structure or type definition mismatches
      const payload = msg.payload as any

      // Check if aiGenVideoId exists
      const aiGenVideoId = payload?.smartCutTask?.aiGenVideoId || payload?.aiGenVideoId

      if (!aiGenVideoId) return

      // Note: Based on api/video.ts and WebSocket logic:
      // status 0 = Pending
      // status 1 = Completed
      // status 2 = Processing
      // status 3 = AI Error
      // status 4 = Video Error (视频处理异常)
      // status 5 = AI Cutting
      // We want to refresh if it's NOT Completed (1), NOT AI Error (3), and NOT Video Error (4)
      const status = payload?.smartCutTask?.status !== undefined ? payload.smartCutTask.status : payload?.status

      // Check if we should refresh:
      // 1. aiGenVideoId exists (already checked)
      // 2. Status is undefined OR (NOT 1 AND NOT 3 AND NOT 4)
      if (status === undefined || (status !== 1 && status !== 3 && status !== 4)) {
        try {
          console.log(`[aiChatStore] Refreshing status for AI gen video ${aiGenVideoId}, current status: ${status}`)

          // Request latest status from backend
          const latestData = await getSmartCutApi(aiGenVideoId)

          // Prepare updated payload
          // Need to handle both payload structures (nested in smartCutTask or flat)
          const updatedPayload: any = { ...payload }

          // Map fields from backend response
          // based on user provided JSON: path -> fileUrl, status -> status, duration -> duration, cover -> cover, name -> name

          if (updatedPayload.smartCutTask) {
            updatedPayload.smartCutTask = {
              ...updatedPayload.smartCutTask,
              status: latestData.status,
              fileUrl: latestData.path, // Using path from user provided JSON
              duration: latestData.duration,
              cover: latestData.cover,
              name: latestData.name
            }
          } else {
            updatedPayload.status = latestData.status
            updatedPayload.fileUrl = latestData.path // Using path from user provided JSON
            updatedPayload.duration = latestData.duration
            updatedPayload.cover = latestData.cover
            updatedPayload.name = latestData.name
          }

          // Update taskCard steps if it exists
          if (updatedPayload.taskCard && updatedPayload.taskCard.steps) {
            const steps = updatedPayload.taskCard.steps
            const backendStatus = latestData.status

            // Status 1: Completed
            if (backendStatus === 1) {
              steps.forEach(step => step.status = 'completed')
            }
            // Status 2: Processing or 5: AI Cutting
            else if (backendStatus === 2 || backendStatus === 5) {
              // Ensure Request (0) and Parsing (1) are completed
              if (steps.length > 0) steps[0].status = 'completed'
              if (steps.length > 1) {
                steps[1].status = 'completed'
                if (steps.length > 2) steps[2].status = 'processing'
              }
            }
            // Status 3: AI Error or 4: Video Error
            else if (backendStatus === 3 || backendStatus === 4) {
              // Mark pending/processing steps as error? Or just the current one?
              // Simplest approach: find the processing one and mark as error, or last one
              const processIdx = steps.findIndex(s => s.status === 'processing')
              if (processIdx !== -1) {
                steps[processIdx].status = 'error' // Note: 'error' might not be in the strict type definition, check chat.ts
                // But wait, chat.ts definition said: status: 'pending' | 'processing' | 'completed' for taskCard
                // Using 'completed' with error detail might be safer if 'error' is not allowed
                // Let's check types. chat.ts StepState has error, but taskCard inside MessagePayload has restricted union.
                // MessagePayload.taskCard.steps[].status is 'pending' | 'processing' | 'completed'
                // So we cannot set 'error' directly on status.
                // We should leave it as is or completed with error detail?
                // Usually for error, we might set it to 'completed' but with an error detail text, but UI might want a red state.
                // If the type is strict, we might need to update the type definition or just leave it processing?
                // Wait, StepState IS 'wait' | 'process' | 'finish' | 'error', but MessagePayload.taskCard.steps has different definition.
                // Let's look at chat.ts again.
              }
            }
          }

          // Update database first
          try {
            await updateAiChatMessageApi(Number(msg.id), {
              payload: updatedPayload
            })
          } catch (error) {
            console.error('[aiChatStore] Failed to update message in database:', error)
            // If DB update fails, we might still want to update UI
          }

          // Update local store
          this.updateMessage(msg.id, { payload: updatedPayload })

          console.log(`[aiChatStore] Refreshed AI gen video ${aiGenVideoId} status to ${latestData.status}`)
        } catch (error) {
          console.error(`[aiChatStore] Failed to refresh AI gen video ${aiGenVideoId}:`, error)
        }
      }

      // Check for Pending Video Uploads (video_upload type)
      if (payload?.type === 'video_upload' && payload?.videos && payload.videos.length > 0) {
        try {
          // Refresh videos that are incomplete OR completed but missing metadata (cover/duration)
          const videosToRefresh = payload.videos.filter((v: any) => {
            const isCompleted = v.status === 4 || v.status === 'completed'
            const isMissingMetadata = !v.cover || !v.duration
            return !isCompleted || isMissingMetadata
          })
          
          if (videosToRefresh.length > 0) {
             const idsToFetch = videosToRefresh.map((v: any) => v.id)
             console.log(`[aiChatStore] Refreshing status for ${idsToFetch.length} uploaded videos (incomplete/missing meta)`)
             
             const latestVideos = await getVideosApi(idsToFetch)
             const videoMap = new Map(latestVideos.map((v: any) => [v.id, v]))
             
             let hasUpdates = false
             const updatedVideos = payload.videos.map((v: any) => {
               const latest = videoMap.get(v.id)
               if (latest) {
                 if (latest.status !== v.status || latest.cover !== v.cover || latest.duration !== v.duration) {
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

              // Update database first
              try {
                await updateAiChatMessageApi(Number(msg.id), {
                  payload: updatedPayload
                })
              } catch (error) {
                console.error('[aiChatStore] Failed to update video upload message in database:', error)
              }

               this.updateMessage(msg.id, { payload: updatedPayload })
               console.log(`[aiChatStore] Updated uploaded videos info for message ${msg.id}`)
             }
          }
        } catch (error) {
          console.error('[aiChatStore] Failed to refresh uploaded video status:', error)
        }
      }
    } catch (error) {
      console.error('[aiChatStore] Failed to refresh processing tasks:', error)
    }
  }

  /**
   * 新建对话
   */
  newChat(): void {
    this.currentAiChatId.value = null
    this.isCurrentChatProcessing.value = false
    this.clearMessages()
  }
}

// 导出单例
export const aiChatStore = new AiChatStore()
