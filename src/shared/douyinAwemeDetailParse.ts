/**
 * 解析 aweme/v1/web/aweme/detail 等接口返回的 JSON，提取 play_addr.url_list（主进程离屏下载用）。
 */
function extractPlayUrlListFromVideoNode(v: unknown): string[] {
  if (!v || typeof v !== 'object') return []
  const urlListRaw = (v as { play_addr?: { url_list?: unknown } }).play_addr?.url_list
  if (!Array.isArray(urlListRaw)) return []
  return urlListRaw.filter((u): u is string => typeof u === 'string' && u.trim().startsWith('https://'))
}

export function parseDouyinAwemeDetailPlayUrls(raw: string): { urlList: string[]; error?: string } {
  const trimmed = raw.trim()
  if (!trimmed) return { urlList: [], error: '响应为空' }
  try {
    const obj = JSON.parse(trimmed) as Record<string, unknown>

    const sc = obj.status_code
    if (typeof sc === 'number' && sc !== 0) {
      const sm = obj.status_msg
      const hint =
        typeof sm === 'string' && sm.trim() !== ''
          ? sm.trim()
          : '接口返回非成功状态，可能需登录、验证或地区限制'
      return { urlList: [], error: `抖音接口 status_code=${sc}：${hint}` }
    }

    const detail = obj.aweme_detail
    if (detail && typeof detail === 'object') {
      const v = (detail as { video?: unknown }).video
      const list = extractPlayUrlListFromVideoNode(v)
      if (list.length > 0) return { urlList: list }
    }

    const rootVideo = obj.video
    const list2 = extractPlayUrlListFromVideoNode(rootVideo)
    if (list2.length > 0) return { urlList: list2 }

    return {
      urlList: [],
      error: 'JSON 合法但未找到 aweme_detail.video 或 video 下的 play_addr.url_list'
    }
  } catch {
    return { urlList: [], error: '非合法 JSON' }
  }
}
