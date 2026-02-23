import type { DictItem } from '../api/dict'

export type StepState = 'wait' | 'process' | 'finish' | 'error'

export interface WorkflowStep {
  label: string
  state: StepState
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
  dicts?: DictItem[]
  videos?: any[]
  steps?: WorkflowStep[]
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
}
export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  steps?: any[]
  dicts?: DictItem[]
  videos?: any[]
  isAnalyzing?: boolean
  payload?: MessagePayload
  timestamp: Date
  isTyping?: boolean // 是否正在打字
  displayedContent?: string // 显示的内容（用于打字机效果）
  /** 是否已读（仅对 assistant 消息有意义） */
  isRead?: boolean
}
