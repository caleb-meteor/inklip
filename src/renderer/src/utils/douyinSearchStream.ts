/** 与主进程过滤路径一致，用于判断是否对响应做 stream 解析 */
export const DOUYIN_STREAM_SEARCH_SUBPATH = 'aweme/v1/web/general/search/stream'

/** search/single 为整段 JSON，与 stream 分块不同 */
export const DOUYIN_SINGLE_SEARCH_SUBPATH = 'aweme/v1/web/general/search/single'

/** 推荐/模块流；根字段 `aweme_list[].video` 含 aweme_id、duration、play_addr */
export const DOUYIN_MODULE_FEED_SUBPATH = 'aweme/v2/web/module/feed'

/** Tab 首页流；根字段 `aweme_list[].video`，结构与 module/feed 一致 */
export const DOUYIN_TAB_FEED_SUBPATH = 'aweme/v1/web/tab/feed'

/** 网络监控「默认仅展示」的接口（未开「全部 URL」时与主进程过滤一致） */
export function isDouyinPinnedSearchApiUrl(url: string): boolean {
  return (
    url.includes(DOUYIN_STREAM_SEARCH_SUBPATH) ||
    url.includes(DOUYIN_SINGLE_SEARCH_SUBPATH) ||
    url.includes(DOUYIN_MODULE_FEED_SUBPATH) ||
    url.includes(DOUYIN_TAB_FEED_SUBPATH)
  )
}

export interface DouyinStreamAwemeRow {
  awemeId: string
  /** play_addr.url_list，已 JSON.parse 解码（如 \\u0026 → &） */
  urlList: string[]
  /** video.duration 接口原始值（字符串化）；接口约定为毫秒 */
  durationRaw?: string
  /** video.duration 规范化后的毫秒（与接口一致）；未返回时为空 */
  durationMs?: number
}

/** 将 video.duration 原样转为展示用字符串（与 JSON 中类型一致） */
export function formatDouyinDurationRaw(raw: unknown): string | undefined {
  if (raw === undefined || raw === null) return undefined
  if (typeof raw === 'object') {
    try {
      return JSON.stringify(raw)
    } catch {
      return '[object]'
    }
  }
  return String(raw)
}

/** 抖音 `video.duration` 为毫秒，解析为整数毫秒 */
export function normalizeVideoDurationMs(raw: unknown): number | undefined {
  let n: number
  if (typeof raw === 'number' && Number.isFinite(raw)) n = raw
  else if (typeof raw === 'string') {
    const p = parseFloat(raw.trim())
    if (!Number.isFinite(p)) return undefined
    n = p
  } else {
    return undefined
  }
  if (n <= 0) return undefined
  return Math.round(n)
}

export interface ParseDouyinSearchStreamResult {
  rows: DouyinStreamAwemeRow[]
  /** 有文本但未解析出任何条目时说明原因 */
  error?: string
}

/** 成对分隔符（字符串内括号不计入深度） */
function findBalancedDelimited(
  s: string,
  start: number,
  open: '{' | '[',
  close: '}' | ']'
): { end: number; text: string } | null {
  if (s[start] !== open) return null
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < s.length; i++) {
    const c = s[i]
    if (escape) {
      escape = false
      continue
    }
    if (inString) {
      if (c === '\\') {
        escape = true
        continue
      }
      if (c === '"') inString = false
      continue
    }
    if (c === '"') {
      inString = true
      continue
    }
    if (c === open) depth++
    else if (c === close) {
      depth--
      if (depth === 0) return { end: i, text: s.slice(start, i + 1) }
    }
  }
  return null
}

/** 从任意位置开始的完整 `{ ... }` 对象 */
function findBalancedBraceObject(s: string, start: number): { end: number; text: string } | null {
  return findBalancedDelimited(s, start, '{', '}')
}

function extractStatusDataJsonChunks(raw: string): string[] {
  const chunks: string[] = []
  let i = 0
  while (i < raw.length) {
    if (raw[i] !== '{') {
      i++
      continue
    }
    const got = findBalancedBraceObject(raw, i)
    if (!got) {
      i++
      continue
    }
    const t = got.text
    if (t.includes('"status_code"') && t.includes('"data"')) {
      chunks.push(t)
    }
    i = got.end + 1
  }
  return chunks
}

type AwemeSinkValue = { urlList: string[]; durationRaw?: string; durationMs?: number }

/** single 接口的 `data` 可能是数组，也可能是单条对象 */
function collectFromSearchApiData(data: unknown, sink: Map<string, AwemeSinkValue>): void {
  if (data == null) return
  if (Array.isArray(data)) {
    collectFromDataArray(data, sink)
    return
  }
  if (typeof data === 'object') {
    collectFromDataArray([data as Record<string, unknown>], sink)
  }
}

function collectFromDataArray(data: unknown, sink: Map<string, AwemeSinkValue>): void {
  if (!Array.isArray(data)) return
  for (const el of data) {
    if (!el || typeof el !== 'object') continue
    const rec = el as {
      aweme_info?: Record<string, unknown>
      aweme_id?: unknown
      video?: Record<string, unknown> & { play_addr?: { url_list?: unknown } }
    }
    const info = rec.aweme_info
    const video = (info?.video ?? rec.video) as
      | (Record<string, unknown> & {
          aweme_id?: unknown
          awemeId?: unknown
          play_addr?: { url_list?: unknown }
        })
      | undefined
    const awemeId = String(
      (info?.aweme_id as string | undefined) ??
        (info?.awemeId as string | undefined) ??
        rec.aweme_id ??
        (video?.aweme_id as string | undefined) ??
        (video?.awemeId as string | undefined) ??
        ''
    ).trim()
    const urlListRaw = video?.play_addr?.url_list
    if (!awemeId || !Array.isArray(urlListRaw)) continue
    const urlList = urlListRaw.filter((u): u is string => typeof u === 'string' && u.length > 0)
    if (urlList.length === 0) continue
    const durationRaw = formatDouyinDurationRaw(video?.duration)
    const durationMs = normalizeVideoDurationMs(video?.duration)
    const prev = sink.get(awemeId)
    sink.set(awemeId, {
      urlList,
      durationRaw: durationRaw ?? prev?.durationRaw,
      durationMs: durationMs ?? prev?.durationMs
    })
  }
}

/**
 * 从 search/stream 的混杂响应（十六进制行、{1}…{5} 分帧等）中扫描可解析的 JSON，
 * 汇总 `data[].aweme_info` 的 aweme_id 与 `video.play_addr.url_list`。
 * 同一 aweme_id 多次出现则保留最后一次。
 */
export function parseDouyinSearchStreamResponse(raw: string): ParseDouyinSearchStreamResult {
  const trimmed = raw.trim()
  if (!trimmed) return { rows: [], error: '响应为空' }

  const sink = new Map<string, AwemeSinkValue>()
  const chunks = extractStatusDataJsonChunks(trimmed)

  for (const text of chunks) {
    try {
      const obj = JSON.parse(text) as { data?: unknown }
      collectFromSearchApiData(obj.data, sink)
    } catch {
      /* 跳过坏块 */
    }
  }

  const rows: DouyinStreamAwemeRow[] = [...sink.entries()].map(([awemeId, v]) =>
    sinkValueToRow(awemeId, v)
  )

  if (rows.length === 0) {
    return {
      rows: [],
      error:
        chunks.length === 0
          ? '未找到含 status_code、data 的 JSON 片段（可能被分帧/截断）'
          : '解析到 JSON 但未发现 aweme_info.play_addr.url_list'
    }
  }

  return { rows }
}

function sinkValueToRow(awemeId: string, v: AwemeSinkValue): DouyinStreamAwemeRow {
  const row: DouyinStreamAwemeRow = { awemeId, urlList: v.urlList }
  if (v.durationRaw != null) row.durationRaw = v.durationRaw
  if (v.durationMs != null) row.durationMs = v.durationMs
  return row
}

function collectFromAwemeListField(awemeList: unknown, sink: Map<string, AwemeSinkValue>): void {
  if (!Array.isArray(awemeList)) return
  for (const el of awemeList) {
    if (!el || typeof el !== 'object') continue
    const rec = el as {
      aweme_id?: unknown
      video?: Record<string, unknown> & {
        aweme_id?: unknown
        awemeId?: unknown
        play_addr?: { url_list?: unknown }
        duration?: unknown
      }
    }
    const v = rec.video
    if (!v || typeof v !== 'object') continue
    const awemeId = String(
      (v.aweme_id as string | undefined) ??
        (v.awemeId as string | undefined) ??
        rec.aweme_id ??
        ''
    ).trim()
    const urlListRaw = v.play_addr?.url_list
    if (!awemeId || !Array.isArray(urlListRaw)) continue
    const urlList = urlListRaw.filter((u): u is string => typeof u === 'string' && u.length > 0)
    if (urlList.length === 0) continue
    const durationRaw = formatDouyinDurationRaw(v.duration)
    const durationMs = normalizeVideoDurationMs(v.duration)
    const prev = sink.get(awemeId)
    sink.set(awemeId, {
      urlList,
      durationRaw: durationRaw ?? prev?.durationRaw,
      durationMs: durationMs ?? prev?.durationMs
    })
  }
}

/**
 * aweme/v2/web/module/feed、aweme/v1/web/tab/feed：根对象 `aweme_list`，每项 `video.aweme_id` + `video.play_addr.url_list`。
 */
export function parseDouyinModuleFeedResponse(raw: string): ParseDouyinSearchStreamResult {
  const trimmed = raw.trim()
  if (!trimmed) return { rows: [], error: '响应为空' }
  try {
    const obj = JSON.parse(trimmed) as { aweme_list?: unknown }
    const sink = new Map<string, AwemeSinkValue>()
    collectFromAwemeListField(obj.aweme_list, sink)
    const rows: DouyinStreamAwemeRow[] = [...sink.entries()].map(([awemeId, v]) =>
      sinkValueToRow(awemeId, v)
    )
    if (rows.length === 0) {
      return {
        rows: [],
        error: 'JSON 合法但 aweme_list 中未发现 video.play_addr.url_list'
      }
    }
    return { rows }
  } catch {
    return { rows: [], error: '非合法 JSON' }
  }
}

/**
 * search/single 返回完整 JSON，直接解析根对象 `data`（数组或单对象），字段含义与 stream 一致。
 */
export function parseDouyinSearchSingleResponse(raw: string): ParseDouyinSearchStreamResult {
  const trimmed = raw.trim()
  if (!trimmed) return { rows: [], error: '响应为空' }

  try {
    const obj = JSON.parse(trimmed) as { data?: unknown }
    const sink = new Map<string, AwemeSinkValue>()
    collectFromSearchApiData(obj.data, sink)
    const rows: DouyinStreamAwemeRow[] = [...sink.entries()].map(([awemeId, v]) =>
      sinkValueToRow(awemeId, v)
    )
    if (rows.length === 0) {
      return {
        rows: [],
        error: 'JSON 合法但 data 中未发现 aweme 播放地址（可能为空列表或结构变化）'
      }
    }
    return { rows }
  } catch {
    return { rows: [], error: '非合法 JSON' }
  }
}

const PLAY_ADDR_JSON_KEY = '"play_addr"'
const EXTRACT_PLAY_ADDR_MAX = 48

/**
 * 从响应文本中截取独立的 `"play_addr": { ... }` / `[ ... ]` 片段（不含同级其它字段）。
 */
export function extractPlayAddrJsonBlocks(raw: string): string[] {
  const blocks: string[] = []
  let searchStart = 0
  while (blocks.length < EXTRACT_PLAY_ADDR_MAX) {
    const i = raw.indexOf(PLAY_ADDR_JSON_KEY, searchStart)
    if (i === -1) break
    let j = i + PLAY_ADDR_JSON_KEY.length
    while (j < raw.length && /\s/.test(raw[j])) j++
    if (raw[j] !== ':') {
      searchStart = i + 1
      continue
    }
    j++
    while (j < raw.length && /\s/.test(raw[j])) j++
    const ch = raw[j]
    let got: { end: number; text: string } | null = null
    if (ch === '{') got = findBalancedDelimited(raw, j, '{', '}')
    else if (ch === '[') got = findBalancedDelimited(raw, j, '[', ']')
    if (got) {
      blocks.push(`"play_addr": ${got.text}`)
      searchStart = got.end + 1
    } else {
      searchStart = i + PLAY_ADDR_JSON_KEY.length
    }
  }
  return blocks
}

export function responseHasExtractablePlayAddr(raw: string): boolean {
  return extractPlayAddrJsonBlocks(raw).length > 0
}

/** 仅用于「play_addr」Tab，与「完整响应」内容隔离 */
export function formatPlayAddrBlocksForDisplay(raw: string): string {
  const blocks = extractPlayAddrJsonBlocks(raw)
  if (blocks.length === 0) {
    return '（未解析到 JSON 键 "play_addr" 的独立对象/数组，请到「完整响应」查看原文）'
  }
  return blocks.map((b, idx) => `/* #${idx + 1} */\n${b}`).join('\n\n────────\n\n')
}
