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
  status?: number
  parse_percentage?: number
  group_id?: number
  categories?: Array<{ id: number; name: string; type: string }>
  created_at?: string
  updated_at?: string
  imageError?: boolean
}

