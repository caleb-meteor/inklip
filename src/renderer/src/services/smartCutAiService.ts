import { ref, type Ref } from 'vue'
import { getVideosApi, smartCutApi } from '../api/video'
import { addAiChatMessageApi, updateAiChatMessageApi } from '../api/aiChat'
import { getDictsFromSentenceApi, type DictItem } from '../api/dict'
import type { Message } from '../types/chat'
import { aiChatStore } from './aiChatStore'

// 导出类型以便在其他地方使用
export type { AiChatTopic } from '../api/aiChat'

export interface ChatStep {
  label: string
  state: 'wait' | 'process' | 'finish' | 'error'
}

export interface SmartCutAiServiceState {
  messages: Ref<Message[]>
  isProcessing: Ref<boolean>
  chatSteps: Ref<ChatStep[]>
  isAwaitingConfirmation: Ref<boolean>
  pendingConfirmationData: Ref<{
    msgId: string
    dicts: DictItem[]
    videos: any[]
    options: SmartCutOptions
    prompt: string
  } | null>
}

export interface SmartCutOptions {
  minDuration?: number
  maxDuration?: number
  maxRetries?: number
  retryInterval?: number
}

/**
 * 智能剪辑 AI 服务
 * 负责处理智能剪辑流程的全部逻辑
 * 对话数据由 aiChatStore 统一管理
 */
export class SmartCutAiService {
  private state: SmartCutAiServiceState

  constructor() {
    this.state = {
      messages: aiChatStore.getMessages(),
      isProcessing: ref(false),
      isAwaitingConfirmation: ref(false),
      pendingConfirmationData: ref(null),
      chatSteps: ref([
        { label: '正在分析主播与产品', state: 'wait' },
        { label: '正在挑选符合条件的视频', state: 'wait' },
        { label: '正在分析视频', state: 'wait' },
        { label: '视频已分析，正在智能剪辑', state: 'wait' },
        { label: '视频', state: 'wait' }
      ])
    }
  }

  /**
   * 获取当前状态
   */
  getState(): SmartCutAiServiceState {
    return this.state
  }

  /**
   * 加载 AI 对话消息
   */
  async loadAiChatMessages(aiChatId: number): Promise<void> {
    await aiChatStore.loadAiChatMessages(aiChatId)
  }

  /**
   * 重置对话步骤
   */
  private resetChatSteps(): void {
    this.state.chatSteps.value.forEach(s => {
      s.state = 'wait'
    })
  }

  /**
   * 过滤视频，并只保留封面、地址、名称、时长信息
   */
  private filterVideosByDicts(videos: any[], dicts: DictItem[]): any[] {
    const dictIds = dicts.map(d => d.id)
    return videos
      .filter(video => {
        // 检查 categories 数组中是否有任何分类ID与字典ID匹配
        if (video.categories && Array.isArray(video.categories)) {
          return video.categories.some((cat: any) => dictIds.includes(cat.id))
        }
        // 向后兼容：也检查单个的 category_id 字段
        return dictIds.includes(video.category_id) || dictIds.includes(video.cate_id)
      })
      .map(video => ({
        id: video.id,
        cover: video.cover,
        path: video.path,
        filename: video.filename || video.name,
        name: video.name,
        duration: video.duration
      }))
  }

  /**
   * 处理未找到相关字典的情况
   * 终止流程并记录信息到系统
   */
  private async handleNoDictsFound(prompt: string): Promise<void> {
    const currentAiChatId = aiChatStore.getCurrentAiChatId().value

    // 更新步骤状态为错误
    this.state.chatSteps.value.forEach(step => {
      if (step.state === 'wait') {
        step.state = 'error'
      }
    })

    // 更新任务卡片为错误状态
    const messages = aiChatStore.getMessages().value
    const taskCardMsg = messages.find(m => m.payload?.taskCard && m.role === 'assistant')
    
    if (taskCardMsg) {
      const errorPayload = {
        type: 'task_card',
        taskCard: {
          steps: [
            { label: '正在解析关键信息', status: 'error' as const, detail: '未找到相关关键词' }
          ]
        }
      }

      aiChatStore.updateMessage(taskCardMsg.id, { payload: errorPayload })

      // 更新数据库
      if (currentAiChatId) {
        try {
          await updateAiChatMessageApi(Number(taskCardMsg.id), {
            payload: errorPayload
          })
        } catch (error) {
          console.error('更新任务卡片到数据库失败:', error)
        }
      }
    }

    // 记录到系统
    if (currentAiChatId) {
      const failureMessage = `❌ 解析失败\n\n无法找到与 "${prompt}" 相关的视频内容\n\n💡 建议：\n• 检查输入的关键词是否准确\n• 尝试使用不同的描述方式\n• 确保素材库中包含相关内容\n\n请调整后重新尝试。`

      // 添加到本地消息
      const msgId = `new_message_${Date.now() + 100}`
      aiChatStore.addMessage({
        id: msgId,
        role: 'assistant',
        content: failureMessage,
        timestamp: new Date()
      })

      try {
        await addAiChatMessageApi({
          ai_chat_id: currentAiChatId,
          role: 'assistant',
          content: failureMessage
        })
      } catch (error) {
        console.error('记录失败信息到系统失败:', error)
      }
    }
  }

  /**
   * 处理用户确认视频列表
   * 继续执行剩余的智能剪辑步骤
   * @param msgId 消息ID（用于从payload中提取数据）
   * @param selectedVideoIds 用户选中的视频ID列表
   * @param durationOptions 用户自定义的剪辑时长选项
   */
  async confirmAndProceed(
    msgId?: string,
    selectedVideoIds?: number[],
    durationOptions?: { minDuration?: number; maxDuration?: number }
  ): Promise<void> {
    // 尝试从 pendingConfirmationData 中获取（新流程）
    let data = this.state.pendingConfirmationData.value

    console.log('[confirmAndProceed] pendingConfirmationData:', data ? '存在' : '不存在', 'msgId:', msgId)

    // 如果没有待确认数据且提供了 msgId，尝试从消息中恢复
    if (!data && msgId) {
      console.log('[confirmAndProceed] 尝试从消息中恢复数据, msgId:', msgId)
      const msg = aiChatStore.getMessages().value.find((m) => m.id === msgId)
      console.log('[confirmAndProceed] 消息查找结果:', {
        found: !!msg,
        hasPayload: !!msg?.payload,
        hasVideos: !!msg?.payload?.videos,
        videosLength: msg?.payload?.videos?.length || 0
      })

      if (msg?.payload?.videos && Array.isArray(msg.payload.videos) && msg.payload.videos.length > 0) {
        // 从消息payload中恢复数据（用于加载历史消息的情况）
        data = {
          msgId: msgId,
          dicts: msg.payload.dicts || [],
          videos: msg.payload.videos,
          options: {
            minDuration: msg.payload.minDuration || 80,
            maxDuration: msg.payload.maxDuration || 100,
            maxRetries: msg.payload.maxRetries || 20,
            retryInterval: msg.payload.retryInterval || 3000
          },
          prompt: msg.payload.prompt || ''
        }
        console.log('[confirmAndProceed] 从 payload 恢复数据成功')
      } else {
        console.log('[confirmAndProceed] videos 数据无效:', { videos: msg?.payload?.videos })
      }
    }

    if (!data) {
      console.error('没有待确认的数据')
      return
    }

    this.state.isAwaitingConfirmation.value = false

    // 更新确认消息：标记为不可交互，记录选择的视频
    const currentMsg = aiChatStore.getMessages().value.find(m => m.id === data.msgId)

    // 获取用户选择的视频
    let selectedVideos = data.videos
    if (selectedVideoIds && selectedVideoIds.length > 0) {
      selectedVideos = data.videos.filter((v: any) => selectedVideoIds.includes(v.id))
    }

    const updatedConfirmPayload = {
      ...(currentMsg?.payload || {}),
      type: 'video_selection',
      awaitingConfirmation: false,
      selectedVideoIds: selectedVideoIds,
      isInteractive: false,
      // 更新视频列表为用户实际选择的视频
      videos: selectedVideos
    }

    aiChatStore.updateMessage(data.msgId, {
      payload: updatedConfirmPayload
    })

    // 同时更新数据库中的消息
    const currentAiChatId = aiChatStore.getCurrentAiChatId().value
    if (currentAiChatId) {
      try {
        await updateAiChatMessageApi(Number(data.msgId), {
          payload: updatedConfirmPayload
        })
      } catch (error) {
        console.error('更新确认消息到数据库失败:', error)
      }
    }

    try {
      const currentAiChatId = aiChatStore.getCurrentAiChatId().value
      const { videos: filteredVideos } = data

      // 使用用户选中的视频，如果没有选择则使用所有视频
      let selectedVideos = filteredVideos
      if (selectedVideoIds && selectedVideoIds.length > 0) {
        selectedVideos = filteredVideos.filter((v: any) => selectedVideoIds.includes(v.id))
      }

      const {
        minDuration = 80,
        maxDuration = 100
      } = { ...data.options, ...durationOptions }

      // Step 1: 创建剪辑任务卡片（三个步骤）
      const clipTaskCardPayload = {
        type: 'task_card',
        taskCard: {
          steps: [
            { label: '正在请求视频解析', status: 'processing' as const },
            { label: '正在解析视频', status: 'pending' as const },
            { label: '正在智能剪辑', status: 'pending' as const }
          ]
        }
      }

      // 先保存到数据库获取真实 ID
      if (!currentAiChatId) {
        throw new Error('当前没有活跃的对话，无法创建任务卡片')
      }

      const savedClipMessage = await addAiChatMessageApi({
        ai_chat_id: currentAiChatId,
        role: 'assistant',
        content: '',
        payload: clipTaskCardPayload
      })
      const clipTaskCardMsgId = savedClipMessage.id.toString()

      // 然后添加到本地存储（使用真实 ID）
      aiChatStore.addMessage({
        id: clipTaskCardMsgId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        payload: clipTaskCardPayload
      })

      // Step 2: 模拟视频解析过程
      this.state.chatSteps.value[1].state = 'process'
      this.state.chatSteps.value[2].state = 'process'

      // Step 3: 执行智能剪辑 API
      const targetVideoIds = selectedVideos.map((v: any) => v.id)
      if (targetVideoIds.length === 0) {
        throw new Error('未找到符合条件的视频')
      }

      const res = await smartCutApi(targetVideoIds, '', minDuration, maxDuration)
      const aiGenVideoId = res.id // WebSocket 会用这个 ID 来通知剪辑状态

      // Step 5: 更新任务卡片 - 步骤1完成（请求已发送），步骤2开始（等待AI结果）
      const updatedClipStep1Payload = {
        type: 'task_card',
        taskCard: {
          steps: [
            { label: '正在请求视频解析', status: 'completed' as const, detail: '请求已接收' },
            { label: '正在解析视频', status: 'processing' as const, detail: '预计需要3-5分钟，可以开启新的剪辑任务' },
            { label: '正在智能剪辑', status: 'pending' as const }
          ]
        },
        aiGenVideoId, // 保存 aiGenVideoId 供 WebSocket 使用
        videoCount: targetVideoIds.length,
        durationMin: minDuration,
        durationMax: maxDuration
      }

      aiChatStore.updateMessage(clipTaskCardMsgId, { payload: updatedClipStep1Payload })

      // 更新数据库（现在 clipTaskCardMsgId 已经是真实 ID）
      if (currentAiChatId) {
        try {
          await updateAiChatMessageApi(Number(clipTaskCardMsgId), {
            payload: updatedClipStep1Payload
          })
        } catch (error) {
          console.error('更新剪辑任务卡片失败:', error)
        }
      }

      // 步骤2和步骤3的状态更新将由 WebSocket 在收到 AI 结果时完成

      this.state.chatSteps.value[2].state = 'finish'
      this.state.chatSteps.value[3].state = 'process'

      // 不再立即创建剪辑结果消息，等待 WebSocket 通知剪辑完成后再创建
      // 剪辑任务会在后台进行，完成后会通过 WebSocket 消息通知

      // 清除待确认数据
      this.state.pendingConfirmationData.value = null

    } catch (error) {
      console.error('确认流程失败:', error)
      const errStep = this.state.chatSteps.value.find(s => s.state === 'process')
      if (errStep) errStep.state = 'error'

      const currentAiChatId = aiChatStore.getCurrentAiChatId().value
      if (currentAiChatId) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        const formattedError = `⚠️ 流程出错\n\n错误信息: ${errorMessage}\n\n请检查日志或重新尝试。`

        await addAiChatMessageApi({
          ai_chat_id: currentAiChatId,
          role: 'assistant',
          content: formattedError
        }).catch(err => console.error('记录对话失败:', err))
      }
    } finally {
      this.state.isProcessing.value = false
    }
  }

  /**
   * 取消视频选择
   * 更新消息状态为已取消且不可交互
   */
  async cancelConfirmation(): Promise<void> {
    const data = this.state.pendingConfirmationData.value
    if (!data) {
      console.error('没有待确认的数据')
      return
    }

    // 更新消息：标记为已取消且不可交互
    const currentMsg = aiChatStore.getMessages().value.find(m => m.id === data.msgId)
    const cancelledPayload = {
      ...(currentMsg?.payload || {}),
      type: 'video_selection',
      awaitingConfirmation: false,
      isInteractive: false,
      cancelled: true
    }

    aiChatStore.updateMessage(data.msgId, {
      payload: cancelledPayload
    })

    // 同时更新数据库中的消息
    const currentAiChatId = aiChatStore.getCurrentAiChatId().value
    if (currentAiChatId) {
      try {
        await updateAiChatMessageApi(Number(data.msgId), {
          payload: cancelledPayload
        })
      } catch (error) {
        console.error('更新取消状态到数据库失败:', error)
      }
    }

    // 添加取消消息到对话记录
    if (currentAiChatId) {
      const cancelMessage = `⚠️ 操作已取消\n\n您已取消本次视频选择，智能剪辑流程已终止。\n\n如需重新开始，请重新发送剪辑指令。`

      // 添加到本地消息
      const msgId = `new_message_${Date.now() + 100}`
      aiChatStore.addMessage({
        id: msgId,
        role: 'assistant',
        content: cancelMessage,
        timestamp: new Date()
      })

      try {
        await addAiChatMessageApi({
          ai_chat_id: currentAiChatId,
          role: 'assistant',
          content: cancelMessage
        })
      } catch (error) {
        console.error('记录取消信息到系统失败:', error)
      }
    }

    // 清除待确认数据和处理标志
    this.state.pendingConfirmationData.value = null
    this.state.isAwaitingConfirmation.value = false
    this.state.isProcessing.value = false
  }

  /**
   * 启动智能剪辑 AI 流程
   * @param prompt 用户输入的提示词
   * @param options 剪辑选项
   */
  async startSmartCut(prompt: string, options: SmartCutOptions = {}): Promise<void> {
    if (this.state.isProcessing.value) return

    const {
      minDuration = 80,
      maxDuration = 100,
      maxRetries = 20,
      retryInterval = 3000
    } = options

    this.state.isProcessing.value = true
    this.resetChatSteps()

    try {
      const sanitizedPrompt = prompt.trim()

      // 重置对话：开始新剪辑时创建全新对话
      aiChatStore.newChat()

      // Step 1: 检查是否有当前对话，如果没有则创建新的
      let currentAiChatId = aiChatStore.getCurrentAiChatId().value
      if (!currentAiChatId) {
        // 先添加用户消息到本地（在创建对话前）
        aiChatStore.addMessage({
          id: `new_message_${Date.now()}`,
          role: 'user',
          content: sanitizedPrompt,
          timestamp: new Date()
        })

        // 再创建对话
        await aiChatStore.createAiChat(sanitizedPrompt || '新建对话')
        currentAiChatId = aiChatStore.getCurrentAiChatId().value
      } else {
        // 如果已有对话，直接添加用户消息
        aiChatStore.addMessage({
          id: `new_message_${Date.now()}`,
          role: 'user',
          content: sanitizedPrompt,
          timestamp: new Date()
        })
      }

      // 立即保存用户消息到数据库
      if (currentAiChatId) {
        try {
          await addAiChatMessageApi({
            ai_chat_id: currentAiChatId,
            role: 'user',
            content: sanitizedPrompt
          })
        } catch (error) {
          console.error('保存用户消息失败:', error)
        }
      }

      // Step 1: 创建任务卡片消息，显示两个步骤
      const taskCardPayload = {
        type: 'task_card',
        taskCard: {
          steps: [
            { label: '正在解析关键信息', status: 'processing' as const },
            { label: '正在获取视频', status: 'pending' as const }
          ]
        }
      }

      // 先保存到数据库获取真实 ID
      if (!currentAiChatId) {
        throw new Error('当前没有活跃的对话，无法创建任务卡片')
      }

      const savedMessage = await addAiChatMessageApi({
        ai_chat_id: currentAiChatId,
        role: 'assistant',
        content: '',
        payload: taskCardPayload
      })
      const taskCardMsgId = savedMessage.id.toString()

      // 然后添加到本地存储（使用真实 ID）
      aiChatStore.addMessage({
        id: taskCardMsgId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        payload: taskCardPayload
      })

      // Step 2: 分析提示词获取字典
      this.state.chatSteps.value[0].state = 'process'
      
      let matchedDicts: DictItem[] = []
      try {
        matchedDicts = await getDictsFromSentenceApi(sanitizedPrompt)
      } catch (error) {
        console.error('获取字典失败:', error)
        
        // 更新任务卡片为错误状态
        const errorPayload = {
          type: 'task_card',
          taskCard: {
            steps: [
              { label: '正在解析关键信息', status: 'error' as const, detail: '解析失败，请检查输入' }
            ]
          }
        }

        aiChatStore.updateMessage(taskCardMsgId, { payload: errorPayload })

        // 更新数据库
        if (currentAiChatId) {
          try {
            await updateAiChatMessageApi(Number(taskCardMsgId), {
              payload: errorPayload
            })
          } catch (err) {
            console.error('更新任务卡片到数据库失败:', err)
          }
        }

        this.state.chatSteps.value[0].state = 'error'
        throw error
      }

      this.state.chatSteps.value[0].state = 'finish'

      // 检查是否找到相关字典，如果没有则终止流程
      if (matchedDicts.length === 0) {
        await this.handleNoDictsFound(sanitizedPrompt)
        return
      }

      // Step 3: 更新任务卡片 - 第一步完成，第二步开始处理
      const dictNames = matchedDicts.map(d => d.name).join('、')
      const updatedStep1Payload = {
        type: 'task_card',
        taskCard: {
          steps: [
            { label: '正在解析关键信息', status: 'completed' as const, detail: `找到 ${matchedDicts.length} 个关键词：${dictNames}` },
            { label: `正在获取 ${dictNames} 的视频`, status: 'processing' as const }
          ]
        }
      }

      aiChatStore.updateMessage(taskCardMsgId, { payload: updatedStep1Payload })

      // 更新数据库（现在 taskCardMsgId 已经是真实 ID）
      if (currentAiChatId) {
        try {
          await updateAiChatMessageApi(Number(taskCardMsgId), {
            payload: updatedStep1Payload
          })
        } catch (error) {
          console.error('更新任务卡片失败:', error)
        }
      }

      // Step 4: 过滤视频
      await new Promise(resolve => setTimeout(resolve, 500))
      this.state.chatSteps.value[1].state = 'process'
      
      let videos: any[] = []
      let filteredVideos: any[] = []
      try {
        videos = await getVideosApi()
        filteredVideos = this.filterVideosByDicts(videos, matchedDicts)
      } catch (error) {
        console.error('获取或过滤视频失败:', error)
        
        // 更新任务卡片为错误状态
        const errorPayload = {
          type: 'task_card',
          taskCard: {
            steps: [
              { label: '正在解析关键信息', status: 'completed' as const, detail: `找到 ${matchedDicts.length} 个关键词：${dictNames}` },
              { label: `正在获取 ${dictNames} 的视频`, status: 'error' as const, detail: '获取视频失败' }
            ]
          }
        }

        aiChatStore.updateMessage(taskCardMsgId, { payload: errorPayload })

        // 更新数据库
        if (currentAiChatId) {
          try {
            await updateAiChatMessageApi(Number(taskCardMsgId), {
              payload: errorPayload
            })
          } catch (err) {
            console.error('更新任务卡片到数据库失败:', err)
          }
        }

        this.state.chatSteps.value[1].state = 'error'
        throw error
      }
      
      this.state.chatSteps.value[1].state = 'finish'

      // Step 5: 更新任务卡片 - 第二步完成
      const updatedStep2Payload = {
        type: 'task_card',
        taskCard: {
          steps: [
            { label: '正在解析关键信息', status: 'completed' as const, detail: `找到 ${matchedDicts.length} 个关键词：${dictNames}` },
            { label: `正在获取 ${dictNames} 的视频`, status: 'completed' as const, detail: `找到 ${filteredVideos.length} 个符合条件的视频` }
          ]
        }
      }

      aiChatStore.updateMessage(taskCardMsgId, { payload: updatedStep2Payload })

      // 更新数据库
      if (currentAiChatId) {
        try {
          await updateAiChatMessageApi(Number(taskCardMsgId), {
            payload: updatedStep2Payload
          })
        } catch (error) {
          console.error('更新任务卡片失败:', error)
        }
      }

      // Step 6: 显示过滤出来的视频卡片或提示
      if (filteredVideos.length > 0) {
        const confirmPayload = {
          type: 'video_selection',
          videos: filteredVideos,
          // dicts 已经在前一条消息中显示，这里不再包含避免重复
          awaitingConfirmation: true,
          // 不再显示思考过程步骤
          // 保存确认所需的参数
          minDuration,
          maxDuration,
          maxRetries,
          retryInterval,
          prompt: sanitizedPrompt
        }

        // 先保存到数据库获取真实 ID
        if (!currentAiChatId) {
          throw new Error('当前没有活跃的对话，无法创建视频确认消息')
        }

        const savedVideoMessage = await addAiChatMessageApi({
          ai_chat_id: currentAiChatId,
          role: 'assistant',
          content: `📹 找到 ${filteredVideos.length} 个符合条件的视频`,
          payload: confirmPayload
        })
        const videosMessageId = savedVideoMessage.id.toString()

        // 然后添加到本地存储（使用真实 ID）
        aiChatStore.addMessage({
          id: videosMessageId,
          role: 'assistant',
          content: '', // VideoSelectionMessage 组件会显示标题，这里不需要 content
          timestamp: new Date(),
          payload: confirmPayload
        })

        // 暂停流程，等待用户确认
        this.state.isAwaitingConfirmation.value = true
        this.state.pendingConfirmationData.value = {
          msgId: videosMessageId,
          dicts: matchedDicts,
          videos: filteredVideos,
          options: { minDuration, maxDuration, maxRetries, retryInterval },
          prompt: sanitizedPrompt
        }

        // 重置处理标志，但不完全退出
        this.state.isProcessing.value = false
        return
      } else {
        aiChatStore.addMessage({
          id: `new_message_${Date.now() + 1.5}`,
          role: 'assistant',
          content: '❌ 没有找到符合条件的视频',
          timestamp: new Date()
        })
        // 立即保存到数据库
        if (currentAiChatId) {
          try {
            await addAiChatMessageApi({
              ai_chat_id: currentAiChatId,
              role: 'assistant',
              content: '❌ 没有找到符合条件的视频'
            })
          } catch (error) {
            console.error('保存无视频消息失败:', error)
          }
        }
        this.state.isProcessing.value = false
        return
      }

    } catch (error) {
      console.error('智能剪辑流程失败:', error)
      const errStep = this.state.chatSteps.value.find(s => s.state === 'process')
      if (errStep) errStep.state = 'error'

      const currentAiChatId = aiChatStore.getCurrentAiChatId().value
      if (currentAiChatId) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        const formattedError = `⚠️ 流程出错\n\n错误信息: ${errorMessage}\n\n请检查日志或重新尝试。`

        await addAiChatMessageApi({
          ai_chat_id: currentAiChatId,
          role: 'assistant',
          content: formattedError
        }).catch(err => console.error('记录对话失败:', err))
      }
    } finally {
      this.state.isProcessing.value = false
    }
  }
}

// 导出单例
export const smartCutAiService = new SmartCutAiService()
