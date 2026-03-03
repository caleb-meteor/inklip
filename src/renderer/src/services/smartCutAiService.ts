import { ref, type Ref } from 'vue'
import { getVideosApi, smartCutApi } from '../api/video'
import { getAnchorsApi, type Anchor } from '../api/anchor'
import { getProductsApi, type Product } from '../api/product'
import { recognizeIntentApi } from '../api/intent'
import { fuzzyMatchCandidates, fuzzyMatchByQueries } from '../utils/fuzzyMatch'
import { addAiChatMessageApi, updateAiChatMessageApi } from '../api/aiChat'
import type { DictItem } from '../api/dict'
import type { Message, MessagePayload } from '../types/chat'
import { aiChatStore } from './aiChatStore'
import { isUsageAvailable, useRealtimeStore } from '../stores/realtime'
import { videosForMessagePayload } from '../utils/videoPayload'

// 导出类型以便在其他地方使用
export type { AiChatTopic } from '../api/aiChat'

export interface ChatStep {
  label: string
  state: 'wait' | 'process' | 'finish' | 'error'
}

/** 待确认数据：视频选择（原有）| 主播多选一 | 产品多选一 */
export type PendingConfirmationData =
  | {
      selectionType: 'video_selection'
      msgId: string
      dicts: DictItem[]
      videos: any[]
      options: SmartCutOptions
      prompt: string
      anchorId?: number
      productId?: number
      productName?: string
    }
  | {
      selectionType: 'anchor_selection'
      selectionMsgId: string
      taskCardMsgId: string
      candidates: Anchor[]
      prompt: string
      currentAiChatId: number
      options: SmartCutOptions
    }
  | {
      selectionType: 'product_selection'
      selectionMsgId: string
      taskCardMsgId: string
      matchedAnchor: Anchor
      candidates: Product[]
      prompt: string
      currentAiChatId: number
      options: SmartCutOptions
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
    this.state.chatSteps.value.forEach((s) => {
      s.state = 'wait'
    })
  }

  /**
   * 过滤视频，并只保留封面、地址、名称、时长信息
   */
  private filterVideosByDicts(videos: any[], dicts: DictItem[]): any[] {
    const dictIds = dicts.map((d) => d.id)
    return videos
      .filter((video) => {
        // 检查 categories 数组中是否有任何分类ID与字典ID匹配
        if (video.categories && Array.isArray(video.categories)) {
          return video.categories.some((cat: any) => dictIds.includes(cat.id))
        }
        // 向后兼容：也检查单个的 category_id 字段
        return dictIds.includes(video.category_id) || dictIds.includes(video.cate_id)
      })
      .map((video) => ({
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
    this.state.chatSteps.value.forEach((step) => {
      if (step.state === 'wait') {
        step.state = 'error'
      }
    })

    // 更新任务卡片为错误状态
    const messages = aiChatStore.getMessages().value
    const taskCardMsg = messages.find((m) => m.payload?.taskCard && m.role === 'assistant')

    if (taskCardMsg) {
      const errorPayload = {
        type: 'task_card',
        taskCard: {
          steps: [{ label: '正在解析关键信息', status: 'error' as const, detail: '未找到相关内容' }]
        }
      }

      aiChatStore.updateMessage(taskCardMsg.id, { payload: errorPayload })

      // 更新数据库
      if (currentAiChatId) {
        await updateAiChatMessageApi(Number(taskCardMsg.id), {
          payload: errorPayload
        })
      }
    }

    // 记录到系统
    if (currentAiChatId) {
      const failureMessage = `❌ 解析失败\n\n无法找到与 "${prompt}" 相关的视频内容\n\n💡 建议：\n• 尝试使用不同的描述方式\n• 确保素材库中包含内容\n\n请调整后重新尝试。`

      // 添加到本地消息
      const msgId = `new_message_${Date.now() + 100}`
      aiChatStore.addMessage({
        id: msgId,
        role: 'assistant',
        content: failureMessage,
        timestamp: new Date()
      })
      await addAiChatMessageApi({
        ai_chat_id: currentAiChatId,
        role: 'assistant',
        content: failureMessage
      })
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
        data = {
          selectionType: 'video_selection' as const,
          msgId: msgId,
          dicts: msg.payload.dicts || [],
          videos: msg.payload.videos,
          options: {
            minDuration: msg.payload.minDuration || 80,
            maxDuration: msg.payload.maxDuration || 100,
            maxRetries: msg.payload.maxRetries || 20,
            retryInterval: msg.payload.retryInterval || 3000
          },
          prompt: msg.payload.prompt || '',
          anchorId: msg.payload.anchorId,
          productId: msg.payload.productId,
          productName: msg.payload.productName
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

    if (data.selectionType === 'anchor_selection' || data.selectionType === 'product_selection') {
      console.error('主播/产品选择请使用 confirmAnchorAndProceed 或 confirmProductAndProceed')
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
      data.anchorId!,
      data.productId!,
      data.productName!,
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
   * 取消当前待确认（视频/主播/产品选择）
   * @param msgId 可选，点击取消时传入当前消息 id；若未传则从 pendingConfirmationData 取，避免刷新或状态丢失后无法正确结束
   */
  async cancelConfirmation(msgId?: string): Promise<void> {
    const data = this.state.pendingConfirmationData.value
    let targetMsgId: string

    if (data) {
      targetMsgId = data.selectionType === 'video_selection' ? data.msgId : data.selectionMsgId
    } else if (msgId) {
      targetMsgId = msgId
    } else {
      console.error('没有待确认的数据')
      return
    }

    const currentMsg = aiChatStore.getMessages().value.find((m) => m.id === targetMsgId)
    const currentAiChatId = aiChatStore.getCurrentAiChatId().value

    if (currentMsg) {
      const payloadType =
        data?.selectionType === 'video_selection'
          ? 'video_selection'
          : (currentMsg?.payload?.type as string) || 'video_selection'
      const cancelledPayload = {
        ...(currentMsg?.payload || {}),
        type: payloadType,
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
   * 用户选择主播后继续：匹配产品 -> 若唯一则查视频并展示视频选择卡，若多个则展示产品选择
   */
  async confirmAnchorAndProceed(selectionMsgId: string, selectedAnchorId: number): Promise<void> {
    const data = this.state.pendingConfirmationData.value
    if (
      !data ||
      data.selectionType !== 'anchor_selection' ||
      data.selectionMsgId !== selectionMsgId
    ) {
      return
    }
    const matchedAnchor = data.candidates.find((a) => a.id === selectedAnchorId)
    if (!matchedAnchor) return

    this.state.isAwaitingConfirmation.value = false
    const { taskCardMsgId, prompt: sanitizedPrompt, currentAiChatId, options } = data
    const { minDuration, maxDuration, maxRetries, retryInterval } = options

    // 更新选择消息为已确认，且仅保留选中的主播
    const selMsg = aiChatStore.getMessages().value.find((m) => m.id === selectionMsgId)
    if (selMsg?.payload) {
      const updatedPayload = {
        ...selMsg.payload,
        anchors: [matchedAnchor],
        awaitingConfirmation: false,
        isInteractive: false
      }
      aiChatStore.updateMessage(selectionMsgId, { payload: updatedPayload })
      await updateAiChatMessageApi(Number(selectionMsgId), { payload: updatedPayload })
    }

    // 更新任务卡：主播已匹配
    const updatedPayload1 = {
      type: 'video_filter_task',
      steps: [
        {
          label: '正在匹配主播',
          status: 'completed' as const,
          detail: `已匹配主播：${matchedAnchor.name}`
        },
        { label: '正在匹配主播产品', status: 'processing' as const },
        { label: '正在查询产品视频', status: 'pending' as const }
      ]
    }
    aiChatStore.updateMessage(taskCardMsgId, { payload: updatedPayload1 })
    await updateAiChatMessageApi(Number(taskCardMsgId), { payload: updatedPayload1 })

    this.state.chatSteps.value[0].state = 'finish'
    this.state.chatSteps.value[1].state = 'process'

    const productRes = await getProductsApi({ all: true, anchor_id: matchedAnchor.id })
    let matchedProducts = fuzzyMatchCandidates(sanitizedPrompt, productRes.list, (p) => p.name)
    if (matchedProducts.length === 0 && productRes.list.length > 0) {
      const kwRes = await recognizeIntentApi(sanitizedPrompt).then((r) => r.keywords || [])
      if (kwRes.length) {
        matchedProducts = fuzzyMatchByQueries(
          kwRes,
          productRes.list,
          (p) => p.name,
          (p) => p.id
        )
      }
    }

    if (matchedProducts.length === 0) {
      const errorPayload = {
        type: 'video_filter_task',
        steps: [
          {
            label: '正在匹配主播',
            status: 'completed' as const,
            detail: `已匹配主播：${matchedAnchor.name}`
          },
          {
            label: '正在匹配主播产品',
            status: 'error' as const,
            detail: `在主播 ${matchedAnchor.name} 下未找到对应的产品`
          },
          { label: '正在查询产品视频', status: 'pending' as const }
        ]
      } as unknown as MessagePayload
      aiChatStore.updateMessage(taskCardMsgId, { payload: errorPayload })
      await updateAiChatMessageApi(Number(taskCardMsgId), { payload: errorPayload })
      this.state.chatSteps.value[1].state = 'error'
      const failureContent = `在主播 ${matchedAnchor.name} 下未找到对应的产品，请检查输入的产品名称是否正确，或先在设置中为该主播添加产品数据。`
      aiChatStore.addMessage({
        id: `new_message_${Date.now()}`,
        role: 'assistant',
        content: failureContent,
        timestamp: new Date()
      })
      if (currentAiChatId)
        await addAiChatMessageApi({
          ai_chat_id: currentAiChatId,
          role: 'assistant',
          content: failureContent
        })
      this.state.pendingConfirmationData.value = null
      return
    }

    if (matchedProducts.length > 1) {
      const productSelectionPayload = {
        type: 'product_selection' as const,
        products: matchedProducts,
        anchorName: matchedAnchor.name,
        awaitingConfirmation: true as const,
        isInteractive: true as const
      }
      const selectionMessage = await addAiChatMessageApi({
        ai_chat_id: currentAiChatId,
        role: 'assistant',
        content: `<span style="font-size: 12px; color: #a1a1aa;">在主播 <strong>${matchedAnchor.name}</strong> 下找到 <strong>${matchedProducts.length}</strong> 个匹配的产品，请选择：</span>`,
        payload: productSelectionPayload
      })
      aiChatStore.addMessage({
        id: selectionMessage.id.toString(),
        role: 'assistant',
        content: selectionMessage.content,
        timestamp: new Date(),
        payload: productSelectionPayload
      })
      this.state.isAwaitingConfirmation.value = true
      this.state.pendingConfirmationData.value = {
        selectionType: 'product_selection',
        selectionMsgId: selectionMessage.id.toString(),
        taskCardMsgId,
        matchedAnchor,
        candidates: matchedProducts,
        prompt: sanitizedPrompt,
        currentAiChatId,
        options: { minDuration, maxDuration, maxRetries, retryInterval }
      }
      return
    }

    const matchedProduct = matchedProducts[0]
    await this.continueAfterProductMatched(
      taskCardMsgId,
      matchedAnchor,
      matchedProduct,
      sanitizedPrompt,
      currentAiChatId,
      { minDuration, maxDuration, maxRetries, retryInterval }
    )
    this.state.pendingConfirmationData.value = null
  }

  /**
   * 用户选择产品后继续：查询视频并展示视频选择卡
   */
  async confirmProductAndProceed(selectionMsgId: string, selectedProductId: number): Promise<void> {
    const data = this.state.pendingConfirmationData.value
    if (
      !data ||
      data.selectionType !== 'product_selection' ||
      data.selectionMsgId !== selectionMsgId
    ) {
      return
    }
    const matchedProduct = data.candidates.find((p) => p.id === selectedProductId)
    if (!matchedProduct) return

    this.state.isAwaitingConfirmation.value = false
    const { taskCardMsgId, matchedAnchor, prompt: sanitizedPrompt, currentAiChatId, options } = data

    const selMsg = aiChatStore.getMessages().value.find((m) => m.id === selectionMsgId)
    if (selMsg?.payload) {
      const updatedPayload = {
        ...selMsg.payload,
        products: [matchedProduct],
        awaitingConfirmation: false,
        isInteractive: false
      }
      aiChatStore.updateMessage(selectionMsgId, { payload: updatedPayload })
      await updateAiChatMessageApi(Number(selectionMsgId), { payload: updatedPayload })
    }

    await this.continueAfterProductMatched(
      taskCardMsgId,
      matchedAnchor,
      matchedProduct,
      sanitizedPrompt,
      currentAiChatId,
      options
    )
    this.state.pendingConfirmationData.value = null
  }

  /**
   * 主播与产品均已确定后：更新任务卡、拉取视频、展示视频选择卡
   */
  private async continueAfterProductMatched(
    taskCardMsgId: string,
    matchedAnchor: Anchor,
    matchedProduct: Product,
    sanitizedPrompt: string,
    currentAiChatId: number,
    options: SmartCutOptions
  ): Promise<void> {
    const { minDuration = 80, maxDuration = 100, maxRetries = 20, retryInterval = 3000 } = options

    const updatedPayload2 = {
      type: 'video_filter_task',
      steps: [
        {
          label: '正在匹配主播',
          status: 'completed' as const,
          detail: `已匹配主播：${matchedAnchor.name}`
        },
        {
          label: '正在匹配主播产品',
          status: 'completed' as const,
          detail: `已匹配产品：${matchedProduct.name}`
        },
        { label: '正在查询产品视频', status: 'processing' as const }
      ]
    }
    aiChatStore.updateMessage(taskCardMsgId, { payload: updatedPayload2 })
    await updateAiChatMessageApi(Number(taskCardMsgId), { payload: updatedPayload2 })
    this.state.chatSteps.value[1].state = 'finish'
    this.state.chatSteps.value[2].state = 'process'
    await new Promise((resolve) => setTimeout(resolve, 300))

    const videos = await getVideosApi({ product_id: matchedProduct.id })
    if (!videos || videos.length === 0) {
      const errorPayload = {
        type: 'video_filter_task',
        steps: [
          {
            label: '正在匹配主播',
            status: 'completed' as const,
            detail: `已匹配主播：${matchedAnchor.name}`
          },
          {
            label: '正在匹配主播产品',
            status: 'completed' as const,
            detail: `已匹配产品：${matchedProduct.name}`
          },
          {
            label: '正在查询产品视频',
            status: 'error' as const,
            detail: `未找到 "${matchedProduct.name}" 相关的素材视频`
          }
        ]
      } as unknown as MessagePayload
      aiChatStore.updateMessage(taskCardMsgId, { payload: errorPayload })
      await updateAiChatMessageApi(Number(taskCardMsgId), { payload: errorPayload })
      this.state.chatSteps.value[2].state = 'error'
      const failureContent = `未找到 "${matchedProduct.name}" 相关的素材视频，请检查该产品下是否有已解析的视频，或稍后再试。`
      aiChatStore.addMessage({
        id: `new_message_${Date.now()}`,
        role: 'assistant',
        content: failureContent,
        timestamp: new Date()
      })
      if (currentAiChatId)
        await addAiChatMessageApi({
          ai_chat_id: currentAiChatId,
          role: 'assistant',
          content: failureContent
        })
      return
    }

    const updatedPayload3 = {
      type: 'video_filter_task',
      steps: [
        {
          label: '正在匹配主播',
          status: 'completed' as const,
          detail: `已匹配主播：${matchedAnchor.name}`
        },
        {
          label: '正在匹配主播产品',
          status: 'completed' as const,
          detail: `已匹配产品：${matchedProduct.name}`
        },
        {
          label: '正在查询产品视频',
          status: 'completed' as const,
          detail: `找到 ${videos.length} 个相关素材`
        }
      ]
    }
    aiChatStore.updateMessage(taskCardMsgId, { payload: updatedPayload3 })
    await updateAiChatMessageApi(Number(taskCardMsgId), { payload: updatedPayload3 })
    this.state.chatSteps.value[2].state = 'finish'
    await new Promise((resolve) => setTimeout(resolve, 400))

    const selectionPayload = {
      type: 'video_selection',
      videos: videosForMessagePayload(videos),
      awaitingConfirmation: true,
      isInteractive: true,
      options: { minDuration, maxDuration, maxRetries, retryInterval },
      prompt: sanitizedPrompt,
      anchorId: matchedAnchor.id,
      productId: matchedProduct.id,
      productName: matchedProduct.name
    }
    const selectionMessage = await addAiChatMessageApi({
      ai_chat_id: currentAiChatId,
      role: 'assistant',
      content: `<span style="font-size: 12px; color: #a1a1aa;">已为您筛选出主播 <strong>${matchedAnchor.name}</strong> 的 <strong>${matchedProduct.name}</strong> 相关素材，请勾选：</span>`,
      payload: selectionPayload
    })
    const selectionMessageId = selectionMessage.id.toString()
    aiChatStore.addMessage({
      id: selectionMessageId,
      role: 'assistant',
      content: selectionMessage.content,
      timestamp: new Date(),
      payload: selectionPayload
    })
    this.state.isAwaitingConfirmation.value = true
    this.state.pendingConfirmationData.value = {
      selectionType: 'video_selection',
      msgId: selectionMessageId,
      dicts: [],
      videos,
      options: { minDuration, maxDuration, maxRetries, retryInterval },
      prompt: sanitizedPrompt,
      anchorId: matchedAnchor.id,
      productId: matchedProduct.id,
      productName: matchedProduct.name
    }
    this.state.isProcessing.value = false
    aiChatStore.setCurrentChatProcessing(false)
  }

  /**
   * 启动智能剪辑 AI 流程
   * @param prompt 用户输入的提示词
   * @param options 剪辑选项
   * @param recognizeResult 意图识别结果（含 keywords）；若不传且 prompt 匹配不到主播/产品时会内部请求 recognize 做关键词兜底匹配
   */
  async startSmartCut(
    prompt: string,
    options: SmartCutOptions = {},
    recognizeResult?: RecognizeResultForMatch
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

    const { minDuration = 80, maxDuration = 100, maxRetries = 20, retryInterval = 3000 } = options

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

    if (currentAiChatId) {
      await addAiChatMessageApi({
        ai_chat_id: currentAiChatId,
        role: 'user',
        content: sanitizedPrompt
      })
    }

    // Step 1: 创建筛选任务卡片消息
    const filterTaskPayload = {
      type: 'video_filter_task',
      steps: [
        { label: '正在匹配主播', status: 'processing' as const },
        { label: '正在匹配主播产品', status: 'pending' as const },
        { label: '正在查询产品视频', status: 'pending' as const }
      ]
    }

    // 先保存到数据库获取真实 ID
    if (!currentAiChatId) {
      const failureContent = '当前没有活跃的对话，无法创建任务，请刷新页面后重试。'
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

    // 流程一：主播 -> 产品 -> 视频（模糊匹配，多选时由用户选择）
    this.state.chatSteps.value[0].state = 'process'
    const anchorRes = await getAnchorsApi({ all: true })
    let matchedAnchors = fuzzyMatchCandidates(sanitizedPrompt, anchorRes.list, (a) => a.name)
    if (matchedAnchors.length === 0 && anchorRes.list.length > 0) {
      const keywords = recognizeResult?.keywords?.length
        ? recognizeResult.keywords
        : await recognizeIntentApi(sanitizedPrompt).then((r) => r.keywords || [])
      if (keywords.length) {
        matchedAnchors = fuzzyMatchByQueries(
          keywords,
          anchorRes.list,
          (a) => a.name,
          (a) => a.id
        )
      }
    }

    if (matchedAnchors.length === 0) {
      const errorPayload = {
        type: 'video_filter_task',
        steps: [
          { label: '正在匹配主播', status: 'error' as const, detail: '未找到提及的主播信息' },
          { label: '正在匹配主播产品', status: 'pending' as const },
          { label: '正在查询产品视频', status: 'pending' as const }
        ]
      } as unknown as MessagePayload
      aiChatStore.updateMessage(taskCardMsgId, { payload: errorPayload })
      await updateAiChatMessageApi(Number(taskCardMsgId), { payload: errorPayload })
      this.state.chatSteps.value[0].state = 'error'
      const failureContent = `未找到提及的主播信息，请检查输入的主播名称是否正确，或先在设置中添加主播数据。`
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

    // 多个主播匹配时，让用户选择
    if (matchedAnchors.length > 1) {
      const anchorSelectionPayload = {
        type: 'anchor_selection' as const,
        anchors: matchedAnchors,
        awaitingConfirmation: true as const,
        isInteractive: true as const
      }
      const selectionMessage = await addAiChatMessageApi({
        ai_chat_id: currentAiChatId!,
        role: 'assistant',
        content: `<span style="font-size: 12px; color: #a1a1aa;">找到 <strong>${matchedAnchors.length}</strong> 个匹配的主播，请选择要剪辑的主播：</span>`,
        payload: anchorSelectionPayload
      })
      aiChatStore.addMessage({
        id: selectionMessage.id.toString(),
        role: 'assistant',
        content: selectionMessage.content,
        timestamp: new Date(),
        payload: anchorSelectionPayload
      })
      this.state.isAwaitingConfirmation.value = true
      this.state.pendingConfirmationData.value = {
        selectionType: 'anchor_selection',
        selectionMsgId: selectionMessage.id.toString(),
        taskCardMsgId,
        candidates: matchedAnchors,
        prompt: sanitizedPrompt,
        currentAiChatId: currentAiChatId!,
        options: { minDuration, maxDuration, maxRetries, retryInterval }
      }
      this.state.isProcessing.value = false
      aiChatStore.setCurrentChatProcessing(false)
      return
    }

    const matchedAnchor = matchedAnchors[0]
    // 更新状态：主播已匹配
    const updatedPayload1 = {
      type: 'video_filter_task',
      steps: [
        {
          label: '正在匹配主播',
          status: 'completed' as const,
          detail: `已匹配主播：${matchedAnchor.name}`
        },
        { label: '正在匹配主播产品', status: 'processing' as const },
        { label: '正在查询产品视频', status: 'pending' as const }
      ]
    }
    aiChatStore.updateMessage(taskCardMsgId, { payload: updatedPayload1 })
    await updateAiChatMessageApi(Number(taskCardMsgId), { payload: updatedPayload1 })
    this.state.chatSteps.value[0].state = 'finish'
    await new Promise((resolve) => setTimeout(resolve, 300))

    // 2. 匹配产品（模糊匹配，多选时由用户选择；拿不到时用 recognize 关键词兜底）
    this.state.chatSteps.value[1].state = 'process'
    const productRes = await getProductsApi({ all: true, anchor_id: matchedAnchor.id })
    let matchedProducts = fuzzyMatchCandidates(sanitizedPrompt, productRes.list, (p) => p.name)
    if (matchedProducts.length === 0 && productRes.list.length > 0) {
      const keywords = recognizeResult?.keywords?.length
        ? recognizeResult.keywords
        : await recognizeIntentApi(sanitizedPrompt).then((r) => r.keywords || [])
      if (keywords.length) {
        matchedProducts = fuzzyMatchByQueries(
          keywords,
          productRes.list,
          (p) => p.name,
          (p) => p.id
        )
      }
    }

    if (matchedProducts.length === 0) {
      const errorPayload = {
        type: 'video_filter_task',
        steps: [
          {
            label: '正在匹配主播',
            status: 'completed' as const,
            detail: `已匹配主播：${matchedAnchor.name}`
          },
          {
            label: '正在匹配主播产品',
            status: 'error' as const,
            detail: `在主播 ${matchedAnchor.name} 下未找到对应的产品`
          },
          { label: '正在查询产品视频', status: 'pending' as const }
        ]
      } as unknown as MessagePayload
      aiChatStore.updateMessage(taskCardMsgId, { payload: errorPayload })
      await updateAiChatMessageApi(Number(taskCardMsgId), { payload: errorPayload })
      this.state.chatSteps.value[1].state = 'error'
      const failureContent = `在主播 ${matchedAnchor.name} 下未找到对应的产品，请检查输入的产品名称是否正确，或先在设置中为该主播添加产品数据。`
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

    // 多个产品匹配时，让用户选择
    if (matchedProducts.length > 1) {
      const productSelectionPayload = {
        type: 'product_selection' as const,
        products: matchedProducts,
        anchorName: matchedAnchor.name,
        awaitingConfirmation: true as const,
        isInteractive: true as const
      }
      const selectionMessage = await addAiChatMessageApi({
        ai_chat_id: currentAiChatId!,
        role: 'assistant',
        content: `<span style="font-size: 12px; color: #a1a1aa;">在主播 <strong>${matchedAnchor.name}</strong> 下找到 <strong>${matchedProducts.length}</strong> 个匹配的产品，请选择：</span>`,
        payload: productSelectionPayload
      })
      aiChatStore.addMessage({
        id: selectionMessage.id.toString(),
        role: 'assistant',
        content: selectionMessage.content,
        timestamp: new Date(),
        payload: productSelectionPayload
      })
      this.state.isAwaitingConfirmation.value = true
      this.state.pendingConfirmationData.value = {
        selectionType: 'product_selection',
        selectionMsgId: selectionMessage.id.toString(),
        taskCardMsgId,
        matchedAnchor,
        candidates: matchedProducts,
        prompt: sanitizedPrompt,
        currentAiChatId: currentAiChatId!,
        options: { minDuration, maxDuration, maxRetries, retryInterval }
      }
      this.state.isProcessing.value = false
      aiChatStore.setCurrentChatProcessing(false)
      return
    }

    const matchedProduct = matchedProducts[0]
    // 更新状态：产品已匹配
    const updatedPayload2 = {
      type: 'video_filter_task',
      steps: [
        {
          label: '正在匹配主播',
          status: 'completed' as const,
          detail: `已匹配主播：${matchedAnchor.name}`
        },
        {
          label: '正在匹配主播产品',
          status: 'completed' as const,
          detail: `已匹配产品：${matchedProduct.name}`
        },
        { label: '正在查询产品视频', status: 'processing' as const }
      ]
    }
    aiChatStore.updateMessage(taskCardMsgId, { payload: updatedPayload2 })
    await updateAiChatMessageApi(Number(taskCardMsgId), { payload: updatedPayload2 })
    this.state.chatSteps.value[1].state = 'finish'
    await new Promise((resolve) => setTimeout(resolve, 300))

    // 3. 查询视频
    this.state.chatSteps.value[2].state = 'process'
    const videos = await getVideosApi({ product_id: matchedProduct.id })

    if (!videos || videos.length === 0) {
      const errorPayload = {
        type: 'video_filter_task',
        steps: [
          {
            label: '正在匹配主播',
            status: 'completed' as const,
            detail: `已匹配主播：${matchedAnchor.name}`
          },
          {
            label: '正在匹配主播产品',
            status: 'completed' as const,
            detail: `已匹配产品：${matchedProduct.name}`
          },
          {
            label: '正在查询产品视频',
            status: 'error' as const,
            detail: `未找到 "${matchedProduct.name}" 相关的素材视频`
          }
        ]
      } as unknown as MessagePayload
      aiChatStore.updateMessage(taskCardMsgId, { payload: errorPayload })
      await updateAiChatMessageApi(Number(taskCardMsgId), { payload: errorPayload })
      this.state.chatSteps.value[2].state = 'error'
      const failureContent = `未找到 "${matchedProduct.name}" 相关的素材视频，请检查该产品下是否有已解析的视频，或稍后再试。`
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

    // 更新状态：视频已找到
    const updatedPayload3 = {
      type: 'video_filter_task',
      steps: [
        {
          label: '正在匹配主播',
          status: 'completed' as const,
          detail: `已匹配主播：${matchedAnchor.name}`
        },
        {
          label: '正在匹配主播产品',
          status: 'completed' as const,
          detail: `已匹配产品：${matchedProduct.name}`
        },
        {
          label: '正在查询产品视频',
          status: 'completed' as const,
          detail: `找到 ${videos.length} 个相关素材`
        }
      ]
    }
    aiChatStore.updateMessage(taskCardMsgId, { payload: updatedPayload3 })
    await updateAiChatMessageApi(Number(taskCardMsgId), { payload: updatedPayload3 })
    this.state.chatSteps.value[2].state = 'finish'

    // 4. 显示视频选择卡片
    await new Promise((resolve) => setTimeout(resolve, 400))

    const selectionPayload = {
      type: 'video_selection',
      videos: videosForMessagePayload(videos),
      awaitingConfirmation: true,
      isInteractive: true,
      options: {
        minDuration,
        maxDuration,
        maxRetries,
        retryInterval
      },
      prompt: sanitizedPrompt,
      anchorId: matchedAnchor.id,
      productId: matchedProduct.id,
      productName: matchedProduct.name
    }

    const selectionMessage = await addAiChatMessageApi({
      ai_chat_id: currentAiChatId,
      role: 'assistant',
      content: `<span style="font-size: 12px; color: #a1a1aa;">已为您筛选出主播 <strong>${matchedAnchor.name}</strong> 的 <strong>${matchedProduct.name}</strong> 相关素材，请勾选：</span>`,
      payload: selectionPayload
    })

    const selectionMessageId = selectionMessage.id.toString()
    aiChatStore.addMessage({
      id: selectionMessageId,
      role: 'assistant',
      content: selectionMessage.content,
      timestamp: new Date(),
      payload: selectionPayload
    })

    // 暂停流程，等待用户确认
    this.state.isAwaitingConfirmation.value = true
    this.state.pendingConfirmationData.value = {
      selectionType: 'video_selection',
      msgId: selectionMessageId,
      dicts: [], // 流程一暂时不用传统字典匹配
      videos: videos,
      options: { minDuration, maxDuration, maxRetries, retryInterval },
      prompt: sanitizedPrompt,
      anchorId: matchedAnchor.id,
      productId: matchedProduct.id,
      productName: matchedProduct.name
    }

    this.state.isProcessing.value = false
    aiChatStore.setCurrentChatProcessing(false)
    return
  }
}

// 导出单例
export const smartCutAiService = new SmartCutAiService()
