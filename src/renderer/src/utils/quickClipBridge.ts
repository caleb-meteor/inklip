import type { InjectionKey, ShallowRef } from 'vue'
import type { SegmentWithVideo } from '../views/quick-clip/types'
import type { ExportVideoType } from '../api/video'

/** 首页字幕剪辑实例桥接（供对话内智能剪辑预览调用） */
export type QuickClipBridge = {
  appendSegmentsToSelected: (segments: SegmentWithVideo[]) => void
  exportSegmentsDirect: (
    segments: SegmentWithVideo[],
    workspaceId?: number | null,
    suggestedName?: string,
    exportType?: ExportVideoType
  ) => Promise<void>
}

export const quickClipBridgeKey: InjectionKey<ShallowRef<QuickClipBridge | null>> =
  Symbol('quickClipBridge')
