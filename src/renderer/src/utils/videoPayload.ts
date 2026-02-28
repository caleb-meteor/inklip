/**
 * AI 消息 payload 中使用的视频数据：不包含字幕等大字段，避免存入对话消息
 */
const FIELDS_TO_OMIT = ['subtitle', 'audio', 'silent', 'feature'] as const

function omitKeys<T extends object>(obj: T, keys: readonly string[]): T {
  const out = { ...obj } as Record<string, unknown>
  for (const key of keys) {
    delete out[key]
  }
  return out as T
}

export function videoForMessagePayload<T extends object>(video: T): T {
  return omitKeys(video, FIELDS_TO_OMIT as unknown as string[])
}

export function videosForMessagePayload<T extends object>(videos: T[]): T[] {
  return videos.map((v) => videoForMessagePayload(v)) as T[]
}
