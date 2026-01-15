export interface FileItem {
  id: number
  name: string
  type: 'video' | 'image' | 'document' | 'audio'
  size: string
  modified: string
  path: string
  parentId: number | null
  cover?: string
  duration?: number
  width?: number
  height?: number
  status?: number // 视频状态：0=PENDING, 1=EXTRACTING_COVER, 2=EXTRACTING_AUDIO, 3=TRANSCRIBING, 4=COMPLETED, 5=FAILED
  task_status?: number // 任务状态：0=待执行, 1=完成, 2=执行中, 3=失败
  parse_percentage?: number
  group_id?: number
  categories?: Array<{ id: number; name: string; type: string }>
  created_at?: string
  updated_at?: string
  imageError?: boolean
}

