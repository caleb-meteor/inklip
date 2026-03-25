import { session, type BrowserWindow, type WebContents } from 'electron'

/** 与 DouyinBrowse.vue 中 webview partition 一致 */
export const DOUYIN_SESSION_PARTITION = 'persist:inklip_douyin'

/** 单视频详情（仅离屏下载 worker 通过 CDP 抓响应体） */
export const DOUYIN_AWEME_DETAIL_SUBPATH = 'aweme/v1/web/aweme/detail'

/** 普通日志截断上限 */
const MAX_RESPONSE_CHARS = 48 * 1024
/** aweme/detail 需完整 JSON 解析播放地址，勿截到过短导致解析失败、离屏流程假死等超时 */
const MAX_AWEME_DETAIL_BODY_CHARS = 5 * 1024 * 1024

export function isDouyinAwemeDetailUrl(url: string): boolean {
  return url.includes(DOUYIN_AWEME_DETAIL_SUBPATH)
}

let registered = false

const wiredDouyinGuests = new WeakSet<WebContents>()

const offscreenDouyinWorkerWebContents = new WeakSet<WebContents>()

const awemeDetailHandlers = new Map<number, (body: string, url: string) => void>()

export function markDouyinWebContentsAsOffscreenWorker(wc: WebContents): void {
  offscreenDouyinWorkerWebContents.add(wc)
}

export function isDouyinOffscreenWorkerWebContents(wc: WebContents): boolean {
  return offscreenDouyinWorkerWebContents.has(wc)
}

export function setDouyinAwemeDetailBodyHandler(
  wcId: number,
  handler: ((body: string, url: string) => void) | null
): void {
  if (handler == null) awemeDetailHandlers.delete(wcId)
  else awemeDetailHandlers.set(wcId, handler)
}

function isSameDouyinPartitionWebContents(wc: WebContents): boolean {
  const douyinSes = session.fromPartition(DOUYIN_SESSION_PARTITION)
  if (wc.session === douyinSes) return true
  const ga =
    typeof wc.session.getStoragePath === 'function' ? wc.session.getStoragePath() : undefined
  const ta = typeof douyinSes.getStoragePath === 'function' ? douyinSes.getStoragePath() : undefined
  return Boolean(ga && ta && ga === ta)
}

/** 离屏下载辅助窗口的主框架挂 CDP，仅处理 aweme/detail */
export function attachDouyinDebuggerForOffscreenWorker(
  wc: WebContents,
  _getMainWindow: () => BrowserWindow | null
): void {
  if (wc.getType() !== 'window') return
  if (!isSameDouyinPartitionWebContents(wc)) return
  attachDouyinNetworkDebugger(wc)
}

function attachDouyinNetworkDebugger(wc: WebContents): void {
  if (wiredDouyinGuests.has(wc)) return

  const dbg = wc.debugger
  try {
    if (dbg.isAttached()) return
    dbg.attach('1.3')
  } catch {
    wc.once('did-finish-load', () => attachDouyinNetworkDebugger(wc))
    return
  }

  wiredDouyinGuests.add(wc)

  const reqState = new Map<
    string,
    { url: string; method: string; resourceType: string; statusCode?: number; mimeType?: string }
  >()

  const onMessage = async (_event: Electron.Event, method: string, params: Record<string, unknown>) => {
    if (method === 'Network.requestWillBeSent') {
      const requestId = params.requestId as string | undefined
      const request = params.request as { url?: string; method?: string } | undefined
      const resourceType = String(params.type ?? 'other')
      if (requestId && request?.url) {
        reqState.set(requestId, {
          url: request.url,
          method: request.method || 'GET',
          resourceType
        })
      }
    }

    if (method === 'Network.responseReceived') {
      const requestId = params.requestId as string | undefined
      const response = params.response as { status?: number; mimeType?: string } | undefined
      const st = requestId ? reqState.get(requestId) : undefined
      if (st && response) {
        st.statusCode = response.status
        st.mimeType = response.mimeType
      }
    }

    if (method === 'Network.loadingFinished') {
      const requestId = params.requestId as string | undefined
      if (!requestId) return
      const st = reqState.get(requestId)
      reqState.delete(requestId)
      if (!st) return
      if (!isDouyinAwemeDetailUrl(st.url)) return
      if (!offscreenDouyinWorkerWebContents.has(wc)) return

      let responseBody: string | undefined
      let responseNote: string | undefined
      try {
        const result = (await dbg.sendCommand('Network.getResponseBody', {
          requestId
        })) as { body: string; base64Encoded: boolean }
        if (result.base64Encoded) {
          responseNote = '二进制响应，未解码'
        } else {
          let t = result.body
          const cap = awemeDetailHandlers.has(wc.id)
            ? MAX_AWEME_DETAIL_BODY_CHARS
            : MAX_RESPONSE_CHARS
          if (t.length > cap) {
            t = `${t.slice(0, cap)}\n…（已截断）`
            responseNote = `仅保留前 ${cap} 个字符`
          }
          responseBody = t
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        responseNote = `无法读取响应体: ${msg.slice(0, 160)}`
      }

      if (typeof responseBody === 'string') {
        const h = awemeDetailHandlers.get(wc.id)
        if (h) {
          try {
            h(responseBody, st.url)
          } catch {
            /* ignore */
          }
        }
      }
    }
  }

  dbg.on('message', onMessage)
  void dbg.sendCommand('Network.enable').catch(() => {})

  wc.once('destroyed', () => {
    awemeDetailHandlers.delete(wc.id)
    dbg.removeListener('message', onMessage)
    try {
      if (dbg.isAttached()) dbg.detach()
    } catch {
      /* ignore */
    }
  })
}

/**
 * 保留注册入口（兼容既有启动流程）。已不再向内嵌 webview 挂 CDP、不再转发网络日志到渲染进程。
 */
export function registerDouyinNetworkMonitor(_getMainWindow: () => BrowserWindow | null): void {
  void _getMainWindow
  if (registered) return
  registered = true
}
