/**
 * 从视频 subtitle 字段解析为统一字幕条目（与 VideoPlayer 逻辑一致）
 */
export interface SubtitleSegmentItem {
  text: string
  fromMs: number
  toMs: number
  fromS: number
  toS: number
  timestamps?: { from: string; to: string }
}

export function parseSubtitleToSegments(subtitleData: unknown): SubtitleSegmentItem[] {
  if (!subtitleData) return []

  let arr: unknown[] = []
  if (Array.isArray(subtitleData)) {
    arr = subtitleData
  } else if (
    typeof subtitleData === 'object' &&
    subtitleData !== null &&
    'transcription' in (subtitleData as Record<string, unknown>) &&
    Array.isArray((subtitleData as { transcription: unknown[] }).transcription)
  ) {
    arr = (subtitleData as { transcription: unknown[] }).transcription
  } else if (typeof subtitleData === 'string') {
    try {
      const parsed = JSON.parse(subtitleData) as unknown
      if (Array.isArray(parsed)) arr = parsed
      else if (parsed && typeof parsed === 'object' && 'transcription' in (parsed as object))
        arr = (parsed as { transcription: unknown[] }).transcription
    } catch {
      return []
    }
  }

  return arr
    .filter(
      (item: unknown): item is { text?: string; offsets?: { from: number; to: number } } =>
        typeof item === 'object' &&
        item !== null &&
        'offsets' in (item as object) &&
        typeof (item as { offsets: { from: number; to: number } }).offsets.from === 'number' &&
        typeof (item as { offsets: { from: number; to: number } }).offsets.to === 'number'
    )
    .map((item) => {
      const off = item.offsets!
      const from = off.from
      const to = off.to
      return {
        text: typeof item.text === 'string' ? item.text : '',
        fromMs: from,
        toMs: to,
        fromS: from / 1000,
        toS: to / 1000,
        timestamps: undefined
      }
    })
}
