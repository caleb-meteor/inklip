import type { DictItem } from '../api/dict'

export type StepState = 'wait' | 'process' | 'finish' | 'error'

export interface WorkflowStep {
  label: string
  state: StepState
}

export interface SmartCutTaskPayload {
  taskId: string
  videoCount: number
  durationMin: number
  durationMax: number
  status: number
}

export interface MessagePayload {
  dicts?: DictItem[]
  videos?: any[]
  steps?: WorkflowStep[]
  smartCutTask?: SmartCutTaskPayload
  error?: {
    message: string
  }
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  steps?: any[]
  dicts?: DictItem[]
  isAnalyzing?: boolean
  payload?: MessagePayload
  timestamp: Date
}
