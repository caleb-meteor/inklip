import type { SubtitleSegmentItem } from '../../utils/subtitle'

export interface SegmentWithVideo extends SubtitleSegmentItem {
  videoId: number
  videoName: string
  videoPath: string
  segmentIndex: number
}

export interface VideoSegmentGroup {
  videoId: number
  videoName: string
  segments: SegmentWithVideo[]
}

export interface VirtualListItem {
  type: 'header' | 'segment'
  key: string
  videoId?: number
  videoName?: string
  segment?: SegmentWithVideo
}
