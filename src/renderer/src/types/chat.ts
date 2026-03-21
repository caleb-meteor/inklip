export type StepState = 'wait' | 'process' | 'finish' | 'error'

export interface WorkflowStep {
  label: string
  state: StepState
}

/** 筛选/任务卡片等使用的步骤（与思考步骤的 `state` 不同，此处为 `status`） */
export interface FilterTaskStep {
  label: string
  status: 'pending' | 'processing' | 'completed' | 'error'
  detail?: string
}

export interface SmartCutTaskPayload {
  taskId?: string // 旧的字段，保持兼容性
  aiGenVideoId?: number // AI 剪辑视频的 ID
  videoCount: number
  durationMin: number
  durationMax: number
  status: number
  fileUrl?: string // 视频文件 URL
  duration?: number // 视频时长
  cover?: string // 视频封面
  name?: string // 视频名称
}

export interface MessagePayload {
  videos?: any[]
  steps?: WorkflowStep[] | FilterTaskStep[]
  smartCutTask?: SmartCutTaskPayload
  error?: {
    message: string
  }
  awaitingConfirmation?: boolean // 是否等待用户确认视频选择
  selectedVideoIds?: number[] // 用户选择的视频ID
  isInteractive?: boolean // 是否可交互（默认为 true）
  cancelled?: boolean // 是否已取消
  // 确认数据（用于从加载的消息中恢复待确认状态）
  minDuration?: number
  maxDuration?: number
  maxRetries?: number
  retryInterval?: number
  prompt?: string
  // 任务卡片
  taskCard?: {
    steps: Array<{
      label: string
      status: 'pending' | 'processing' | 'completed'
      detail?: string
    }>
  }
  // 意图识别结果（用户消息）
  intent?: number
  intent_label?: string
  keywords?: string[]
  keyword_weights?: { word: string; weight: number }[]
  // 搜索结果（assistant 消息）
  type?: string
  results?: any[]
  /** 智能剪辑记录 ID（常与 task_card 并列保存在 payload 根上） */
  aiGenVideoId?: number
  /** 扁平字段：与 smartCutTask 二选一或并存，供 SmartCutResultMessage */
  status?: number
  videoCount?: number
  durationMin?: number
  durationMax?: number
  fileUrl?: string
}
export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  steps?: any[]
  videos?: any[]
  isAnalyzing?: boolean
  payload?: MessagePayload
  timestamp: Date
  isTyping?: boolean // 是否正在打字
  displayedContent?: string // 显示的内容（用于打字机效果）
  /** 是否已读（仅对 assistant 消息有意义） */
  isRead?: boolean
}
