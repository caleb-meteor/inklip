import { ref, type Ref } from 'vue'
import { smartCutApi, searchVideosApi } from '../api/video'
import { addAiChatMessageApi, updateAiChatMessageApi } from '../api/aiChat'
import type { Message, MessagePayload } from '../types/chat'
import { aiChatStore } from './aiChatStore'
import { isUsageAvailable, useRealtimeStore } from '../stores/realtime'
import { videosForMessagePayload } from '../utils/videoPayload'

/** 判断视频是否有有效字幕（无字幕不能参与智能剪辑） */
function hasSubtitle(v: any): boolean {
  const s = v?.subtitle
  if (s == null) return false
  if (Array.isArray(s)) return s.length > 0
  if (typeof s === 'string') {
    const t = s.trim()
    if (!t || t === '[]') return false
    try {
      const arr = JSON.parse(t)
      return Array.isArray(arr) && arr.length > 0
    } catch {
      return false
    }
  }
  return false
}

// 导出类型以便在其他地方使用
export type { AiChatTopic } from '../api/aiChat'

export interface ChatStep {
  label: string
  state: 'wait' | 'process' | 'finish' | 'error'
}

/** 待确认数据：视频选择 */
export type PendingConfirmationData = {
  selectionType: 'video_selection'
  msgId: string
  videos: any[]
  options: SmartCutOptions
  prompt: string
}

export interface SmartCutAiServiceState {
  messages: Ref<Message[]>
  isProcessing: Ref<boolean>
  chatSteps: Ref<ChatStep[]>
  isAwaitingConfirmation: Ref<boolean>
  pendingConfirmationData: Ref<PendingConfirmationData | null>
}

export interface SmartCutOptions {
  minDuration?: number
  maxDuration?: number
  maxRetries?: number
  retryInterval?: number
  /** 限定在指定工作区下搜索视频 */
  workspaceId?: number | null
}

/** 意图识别结果（可由 Home 传入，避免重复请求） */
export interface RecognizeResultForMatch {
  keywords: string[]
  keyword_weights?: { word: string; weight: number }[]
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
        { label: '正在搜索相关视频', state: 'wait' },
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
    this.state.chatSteps.value.forEach((s) => {
      s.state = 'wait'
    })
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

    console.log(
      '[confirmAndProceed] pendingConfirmationData:',
      data ? '存在' : '不存在',
      'msgId:',
      msgId
    )

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

      if (
        msg?.payload?.videos &&
        Array.isArray(msg.payload.videos) &&
        msg.payload.videos.length > 0
      ) {
        // 从消息payload中恢复数据（用于加载历史消息的情况）
        const po = msg.payload.options as SmartCutOptions | undefined
        data = {
          selectionType: 'video_selection' as const,
          msgId: msgId,
          videos: msg.payload.videos,
          options: {
            minDuration: po?.minDuration ?? msg.payload.minDuration ?? 80,
            maxDuration: po?.maxDuration ?? msg.payload.maxDuration ?? 100,
            maxRetries: po?.maxRetries ?? msg.payload.maxRetries ?? 20,
            retryInterval: po?.retryInterval ?? msg.payload.retryInterval ?? 3000,
            workspaceId: po?.workspaceId ?? (msg.payload as { workspace_id?: number }).workspace_id
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
    const currentMsg = aiChatStore.getMessages().value.find((m) => m.id === data.msgId)

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
      // 更新视频列表为用户实际选择的视频（不保存字幕等大字段）
      videos: videosForMessagePayload(selectedVideos)
    }

    aiChatStore.updateMessage(data.msgId, {
      payload: updatedConfirmPayload
    })

    // 同时更新数据库中的消息
    const currentAiChatId = aiChatStore.getCurrentAiChatId().value
    if (currentAiChatId) {
      await updateAiChatMessageApi(Number(data.msgId), {
        payload: updatedConfirmPayload
      })
    }

    // selectedVideos 已在上方根据 selectedVideoIds 计算
    const { minDuration = 80, maxDuration = 100 } = { ...data.options, ...durationOptions }

    const scopeWid = aiChatStore.getWorkspaceScopeId()
    const workspaceIdForCut =
      data.options.workspaceId != null && data.options.workspaceId > 0
        ? data.options.workspaceId
        : scopeWid
    if (workspaceIdForCut == null || workspaceIdForCut <= 0) {
      const failureContent = '缺少工作空间信息，无法提交智能剪辑。请先在左侧选择工作区后重试。'
      aiChatStore.addMessage({
        id: `new_message_${Date.now()}`,
        role: 'assistant',
        content: failureContent,
        timestamp: new Date()
      })
      if (currentAiChatId) {
        await addAiChatMessageApi({
          ai_chat_id: currentAiChatId,
          role: 'assistant',
          content: failureContent
        })
      }
      this.state.isProcessing.value = false
      aiChatStore.setCurrentChatProcessing(false)
      return
    }

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
      const failureContent = '当前没有活跃的对话，无法创建任务卡片，请刷新页面后重试。'
      aiChatStore.addMessage({
        id: `new_message_${Date.now()}`,
        role: 'assistant',
        content: failureContent,
        timestamp: new Date()
      })
      this.state.isProcessing.value = false
      aiChatStore.setCurrentChatProcessing(false)
      return
    }

    const savedClipMessage = await addAiChatMessageApi({
      ai_chat_id: currentAiChatId,
      role: 'assistant',
      content: '',
      payload: clipTaskCardPayload,
      is_read: false
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
      const failureContent = '请至少选择一个视频后再确认。'
      aiChatStore.addMessage({
        id: `new_message_${Date.now()}`,
        role: 'assistant',
        content: failureContent,
        timestamp: new Date()
      })
      if (currentAiChatId) {
        await addAiChatMessageApi({
          ai_chat_id: currentAiChatId,
          role: 'assistant',
          content: failureContent
        })
      }
      this.state.isProcessing.value = false
      aiChatStore.setCurrentChatProcessing(false)
      return
    }

    const res = await smartCutApi(
      targetVideoIds,
      workspaceIdForCut,
      minDuration,
      maxDuration,
      '',
      undefined,
      currentAiChatId ?? undefined
    )
    const aiGenVideoId = res.id // 后端会用这个 ID 通过实时推送通知剪辑状态

    // Step 5: 更新任务卡片 - 步骤1完成（请求已发送），步骤2开始（等待AI结果）
    const updatedClipStep1Payload = {
      type: 'task_card',
      taskCard: {
        steps: [
          { label: '正在请求视频解析', status: 'completed' as const, detail: '请求已接收' },
          {
            label: '正在解析视频',
            status: 'processing' as const,
            detail: '预计需要3-5分钟，可以开启新的剪辑任务'
          },
          { label: '正在智能剪辑', status: 'pending' as const }
        ]
      },
      aiGenVideoId, // 保存 aiGenVideoId 供实时推送使用
      workspace_id: workspaceIdForCut,
      videoCount: targetVideoIds.length,
      durationMin: minDuration,
      durationMax: maxDuration
    }

    aiChatStore.updateMessage(clipTaskCardMsgId, { payload: updatedClipStep1Payload })

    // 更新数据库（现在 clipTaskCardMsgId 已经是真实 ID）
    if (currentAiChatId) {
      await updateAiChatMessageApi(Number(clipTaskCardMsgId), {
        payload: updatedClipStep1Payload
      })
    }

    // 步骤2和步骤3的状态更新将由实时推送在收到 AI 结果时完成；未读标记由后端根据 ai_chat_id 处理

    this.state.chatSteps.value[2].state = 'finish'
    this.state.chatSteps.value[3].state = 'process'

    // 不再立即创建剪辑结果消息，等待实时推送通知剪辑完成后再创建
    // 剪辑任务会在后台进行，完成后会通过实时推送通知

    this.state.pendingConfirmationData.value = null
    this.state.isProcessing.value = false
  }

  /**
   * 取消当前待确认（视频选择）
   * @param msgId 可选，点击取消时传入当前消息 id；若未传则从 pendingConfirmationData 取，避免刷新或状态丢失后无法正确结束
   */
  async cancelConfirmation(msgId?: string): Promise<void> {
    const data = this.state.pendingConfirmationData.value
    let targetMsgId: string

    if (data) {
      targetMsgId = data.msgId
    } else if (msgId) {
      targetMsgId = msgId
    } else {
      console.error('没有待确认的数据')
      return
    }

    const currentMsg = aiChatStore.getMessages().value.find((m) => m.id === targetMsgId)
    const currentAiChatId = aiChatStore.getCurrentAiChatId().value

    if (currentMsg) {
      const cancelledPayload = {
        ...(currentMsg?.payload || {}),
        type: 'video_selection',
        awaitingConfirmation: false,
        isInteractive: false,
        cancelled: true
      }
      aiChatStore.updateMessage(targetMsgId, {
        payload: cancelledPayload
      })
      if (currentAiChatId) {
        await updateAiChatMessageApi(Number(targetMsgId), {
          payload: cancelledPayload
        })
      }
    }

    // 添加取消提示到对话记录
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

      await addAiChatMessageApi({
        ai_chat_id: currentAiChatId,
        role: 'assistant',
        content: cancelMessage
      })
    }

    // 清除待确认数据和处理标志
    this.state.pendingConfirmationData.value = null
    this.state.isAwaitingConfirmation.value = false
  }

  /**
   * 启动智能剪辑 AI 流程
   * @param prompt 用户输入的提示词
   * @param options 剪辑选项
   */
  async startSmartCut(
    prompt: string,
    options: SmartCutOptions = {},
    _recognizeResult?: RecognizeResultForMatch
  ): Promise<void> {
    if (this.state.isProcessing.value) return

    // 检查 VIP 是否可用（是 VIP 且未过期）
    const rtStore = useRealtimeStore()
    if (!isUsageAvailable(rtStore.usageInfo)) {
      // 非会员或额度不足，显示临时提示消息（不创建对话，不保存数据库）
      const info = rtStore.usageInfo
      const isQuotaExhausted =
        info?.isVip && (info?.dailyLimit ?? 0) > 0 && (info?.remainingSeconds ?? 0) <= 0
      const tipContent = isQuotaExhausted
        ? '今日额度已用完，请明日再试'
        : '非会员暂不支持剪辑服务，请升级会员后再试'
      const assistantMessage = {
        id: `message_${Date.now()}`,
        role: 'assistant' as const,
        content: tipContent,
        timestamp: new Date(),
        payload: {
          type: 'vip_upgrade_prompt'
        }
      }

      aiChatStore.addMessage(assistantMessage)
      // 注意：不创建 ai_chat 记录，不保存到数据库，仅本地显示

      return
    }

    const { minDuration = 80, maxDuration = 100, maxRetries = 20, retryInterval = 3000, workspaceId } = options

    if (!workspaceId || workspaceId <= 0) {
      const tipContent = '请先选择工作空间，智能剪辑将在选中的工作空间内搜索视频。'
      aiChatStore.addMessage({
        id: `message_${Date.now()}`,
        role: 'assistant' as const,
        content: tipContent,
        timestamp: new Date()
      })
      return
    }

    this.state.isProcessing.value = true
    aiChatStore.setCurrentChatProcessing(true)
    this.resetChatSteps()

    const sanitizedPrompt = prompt.trim()

    // 重置对话：开始新剪辑时创建全新对话
    aiChatStore.newChat()
    aiChatStore.setCurrentChatProcessing(true)

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

      // 再创建对话（理论上前面已校验工作区；若仍失败则走下方无会话分支）
      const created = await aiChatStore.createAiChat(sanitizedPrompt || '新建对话')
      currentAiChatId = created ? created.id : aiChatStore.getCurrentAiChatId().value
    } else {
      // 如果已有对话，直接添加用户消息
      aiChatStore.addMessage({
        id: `new_message_${Date.now()}`,
        role: 'user',
        content: sanitizedPrompt,
        timestamp: new Date()
      })
    }

    if (currentAiChatId) {
      await addAiChatMessageApi({
        ai_chat_id: currentAiChatId,
        role: 'user',
        content: sanitizedPrompt
      })
    }

    // Step 1: 创建筛选任务卡片消息（搜索视频）
    const filterTaskPayload = {
      type: 'video_filter_task',
      steps: [{ label: '正在搜索相关视频', status: 'processing' as const }]
    } as unknown as MessagePayload

    // 先保存到数据库获取真实 ID
    if (!currentAiChatId) {
      const failureContent =
        '无法创建对话（请确认已在左侧选择工作区），请选好工作区后重试。'
      aiChatStore.addMessage({
        id: `new_message_${Date.now()}`,
        role: 'assistant',
        content: failureContent,
        timestamp: new Date()
      })
      this.state.isProcessing.value = false
      aiChatStore.setCurrentChatProcessing(false)
      return
    }

    const savedMessage = await addAiChatMessageApi({
      ai_chat_id: currentAiChatId,
      role: 'assistant',
      content: '',
      payload: filterTaskPayload
    })
    const taskCardMsgId = savedMessage.id.toString()

    // 然后添加到本地存储（使用真实 ID）
    aiChatStore.addMessage({
      id: taskCardMsgId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      payload: filterTaskPayload
    })

    // 流程：调用搜索接口确定视频 ID
    this.state.chatSteps.value[0].state = 'process'
    const searchRes = await searchVideosApi(sanitizedPrompt, 20, workspaceId ?? undefined)

    if (!searchRes?.results?.length) {
      const errorPayload = {
        type: 'video_filter_task',
        steps: [{ label: '正在搜索相关视频', status: 'error' as const, detail: '未找到相关视频' }]
      } as unknown as MessagePayload
      aiChatStore.updateMessage(taskCardMsgId, { payload: errorPayload })
      await updateAiChatMessageApi(Number(taskCardMsgId), { payload: errorPayload })
      this.state.chatSteps.value[0].state = 'error'
      const failureContent = `未找到与「${sanitizedPrompt}」相关的视频，请尝试换个描述或确保素材库中有对应内容。`
      aiChatStore.addMessage({
        id: `new_message_${Date.now()}`,
        role: 'assistant',
        content: failureContent,
        timestamp: new Date()
      })
      if (currentAiChatId) {
        await addAiChatMessageApi({
          ai_chat_id: currentAiChatId,
          role: 'assistant',
          content: failureContent
        })
      }
      this.state.isProcessing.value = false
      aiChatStore.setCurrentChatProcessing(false)
      return
    }

    // 去重：搜索结果可能包含同一视频多次（多段字幕命中）
    const videoMap = new Map<number, typeof searchRes.results[0]['video']>()
    for (const r of searchRes.results) {
      if (r.video?.id) videoMap.set(r.video.id, r.video)
    }
    const allVideos = Array.from(videoMap.values())
    // 无字幕视频不能参与智能剪辑，从结果中过滤
    const videos = allVideos.filter(hasSubtitle)
    const filteredOutCount = allVideos.length - videos.length

    if (videos.length === 0) {
      const errorPayload = {
        type: 'video_filter_task',
        steps: [
          {
            label: '正在搜索相关视频',
            status: 'error' as const,
            detail: allVideos.length > 0 ? '未找到带字幕的视频' : '未找到相关视频'
          }
        ]
      } as unknown as MessagePayload
      aiChatStore.updateMessage(taskCardMsgId, { payload: errorPayload })
      await updateAiChatMessageApi(Number(taskCardMsgId), { payload: errorPayload })
      this.state.chatSteps.value[0].state = 'error'
      const failureContent =
        allVideos.length > 0
          ? `未找到带字幕的视频，智能剪辑需要字幕才能进行。已过滤 ${allVideos.length} 个无字幕视频，请确保工作区内的视频已解析出字幕。`
          : `未找到与「${sanitizedPrompt}」相关的视频，请尝试换个描述或确保素材库中有对应内容。`
      aiChatStore.addMessage({
        id: `new_message_${Date.now()}`,
        role: 'assistant',
        content: failureContent,
        timestamp: new Date()
      })
      if (currentAiChatId) {
        await addAiChatMessageApi({
          ai_chat_id: currentAiChatId,
          role: 'assistant',
          content: failureContent
        })
      }
      this.state.isProcessing.value = false
      aiChatStore.setCurrentChatProcessing(false)
      return
    }

    const stepDetail =
      filteredOutCount > 0
        ? `找到 ${videos.length} 个相关视频（已过滤 ${filteredOutCount} 个无字幕视频）`
        : `找到 ${videos.length} 个相关视频`
    const updatedPayload = {
      type: 'video_filter_task',
      steps: [
        {
          label: '正在搜索相关视频',
          status: 'completed' as const,
          detail: stepDetail
        }
      ]
    } as unknown as MessagePayload
    aiChatStore.updateMessage(taskCardMsgId, { payload: updatedPayload })
    await updateAiChatMessageApi(Number(taskCardMsgId), { payload: updatedPayload })
    this.state.chatSteps.value[0].state = 'finish'
    this.state.chatSteps.value[1].state = 'finish'
    await new Promise((resolve) => setTimeout(resolve, 300))

    const filterReminder =
      filteredOutCount > 0
        ? `已过滤 <strong>${filteredOutCount}</strong> 个无字幕视频，仅带字幕的视频可参与智能剪辑。`
        : ''
    const contentHtml = `<span style="font-size: 12px; color: #a1a1aa;">已根据「${sanitizedPrompt}」搜索到 <strong>${videos.length}</strong> 个相关视频。${filterReminder}请勾选要剪辑的素材：</span>`

    const selectionPayload = {
      type: 'video_selection',
      videos: videosForMessagePayload(videos),
      awaitingConfirmation: true,
      isInteractive: true,
      options: {
        minDuration,
        maxDuration,
        maxRetries,
        retryInterval,
        workspaceId
      },
      prompt: sanitizedPrompt
    }

    const selectionMessage = await addAiChatMessageApi({
      ai_chat_id: currentAiChatId,
      role: 'assistant',
      content: contentHtml,
      payload: selectionPayload
    })

    const selectionMessageId = selectionMessage.id.toString()
    aiChatStore.addMessage({
      id: selectionMessageId,
      role: 'assistant',
      content: contentHtml,
      timestamp: new Date(),
      payload: selectionPayload
    })

    this.state.isAwaitingConfirmation.value = true
    this.state.pendingConfirmationData.value = {
      selectionType: 'video_selection',
      msgId: selectionMessageId,
      videos,
      options: { minDuration, maxDuration, maxRetries, retryInterval, workspaceId },
      prompt: sanitizedPrompt
    }

    this.state.isProcessing.value = false
    aiChatStore.setCurrentChatProcessing(false)
  }
}

// 导出单例
export const smartCutAiService = new SmartCutAiService()
