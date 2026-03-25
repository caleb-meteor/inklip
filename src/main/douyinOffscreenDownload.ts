import { BrowserWindow, screen, type WebContents } from 'electron'
import { parseDouyinAwemeDetailPlayUrls } from '../shared/douyinAwemeDetailParse'
import { cancelDouyinPartitionDownload, douyinDownloadPlayViaGuest, type DouyinDownloadPlayResult } from './douyinGuestDownload'
import { buildChromeLikeUserAgent } from './utils/chromeUa'
import {
  DOUYIN_SESSION_PARTITION,
  attachDouyinDebuggerForOffscreenWorker,
  markDouyinWebContentsAsOffscreenWorker,
  setDouyinAwemeDetailBodyHandler
} from './douyinNetworkMonitor'

const OFFSCREEN_W = 1280
const OFFSCREEN_H = 720
const DETAIL_WAIT_MS = 45_000

/** 与 cancelDouyinOffscreenWorker 中 reject 一致，用于识别用户取消 */
export const DOUYIN_OFFSCREEN_USER_CANCEL = 'DOUYIN_OFFSCREEN_USER_CANCEL'

let activeOffscreenWorker: BrowserWindow | null = null
let activeDetailWaitReject: ((e: Error) => void) | null = null
let offscreenPipelineUserCanceled = false

function isUserCancelError(err: unknown): boolean {
  return err instanceof Error && err.message === DOUYIN_OFFSCREEN_USER_CANCEL
}

/**
 * 取消当前屏外下载：中断等待 detail、取消 Chromium 下载项、关闭 worker 窗口。
 * 不在此释放 exclusive pipeline（由发起下载的 IPC finally 统一释放）。
 */
export function cancelDouyinOffscreenWorker(): void {
  offscreenPipelineUserCanceled = true
  cancelDouyinPartitionDownload()
  if (activeDetailWaitReject) {
    const r = activeDetailWaitReject
    activeDetailWaitReject = null
    r(new Error(DOUYIN_OFFSCREEN_USER_CANCEL))
  }
  const win = activeOffscreenWorker
  activeOffscreenWorker = null
  if (win && !win.isDestroyed()) {
    try {
      setDouyinAwemeDetailBodyHandler(win.webContents.id, null)
    } catch {
      /* ignore */
    }
    try {
      win.destroy()
    } catch {
      /* ignore */
    }
  }
}

/** 置于所有显示器边界之外，并尽量透明、不抢焦点，避免用户看到闪烁 */
function placeWindowFullyHidden(win: BrowserWindow): void {
  const displays = screen.getAllDisplays()
  let minX = Infinity
  for (const d of displays) {
    minX = Math.min(minX, d.bounds.x)
  }
  if (!Number.isFinite(minX)) minX = 0
  const gap = 640
  const y = screen.getPrimaryDisplay().workArea.y
  win.setBounds({
    x: Math.round(minX - OFFSCREEN_W - gap),
    y: Math.round(y),
    width: OFFSCREEN_W,
    height: OFFSCREEN_H
  })
  try {
    win.setOpacity(0)
  } catch {
    /* ignore */
  }
}

function waitForAwemeDetailBody(wc: WebContents, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    activeDetailWaitReject = reject
    const t = setTimeout(() => {
      activeDetailWaitReject = null
      setDouyinAwemeDetailBodyHandler(wc.id, null)
      reject(new Error('等待 aweme/detail 超时'))
    }, timeoutMs)
    setDouyinAwemeDetailBodyHandler(wc.id, (body) => {
      const { urlList, error: parseErr } = parseDouyinAwemeDetailPlayUrls(body)
      if (urlList.length > 0) {
        clearTimeout(t)
        activeDetailWaitReject = null
        setDouyinAwemeDetailBodyHandler(wc.id, null)
        resolve(body)
        return
      }
      // 已收到 detail 响应但无播放地址：若继续 silent return 会空等到超时，用户误以为卡死
      clearTimeout(t)
      activeDetailWaitReject = null
      setDouyinAwemeDetailBodyHandler(wc.id, null)
      reject(new Error(parseErr ?? 'detail 响应中未找到 play_addr.url_list'))
    })
  })
}

/**
 * 屏外 BrowserWindow（坐标在所有屏幕左侧外 + 透明度 0）加载 video 页，抓 detail 后由该窗口发起 downloadURL。
 */
export async function runDouyinOffscreenDetailDownload(opts: {
  getMainWindow: () => BrowserWindow | null
  awemeId: string
  suggestedName: string
  savePath?: string
}): Promise<DouyinDownloadPlayResult> {
  const awemeId = opts.awemeId.trim()
  if (!/^\d+$/.test(awemeId)) {
    return { success: false, error: '无效的 aweme id' }
  }

  offscreenPipelineUserCanceled = false

  const win = new BrowserWindow({
    width: OFFSCREEN_W,
    height: OFFSCREEN_H,
    skipTaskbar: true,
    focusable: false,
    title: '影氪 · 抖音下载',
    show: true,
    webPreferences: {
      partition: DOUYIN_SESSION_PARTITION,
      sandbox: false,
      backgroundThrottling: false
    }
  })

  activeOffscreenWorker = win
  win.once('closed', () => {
    if (activeOffscreenWorker === win) activeOffscreenWorker = null
  })

  placeWindowFullyHidden(win)
  const wc = win.webContents
  markDouyinWebContentsAsOffscreenWorker(wc)
  wc.setUserAgent(buildChromeLikeUserAgent())

  const getMainWindow = opts.getMainWindow
  attachDouyinDebuggerForOffscreenWorker(wc, getMainWindow)

  const videoUrl = `https://www.douyin.com/video/${awemeId}`
  const bodyPromise = waitForAwemeDetailBody(wc, DETAIL_WAIT_MS)

  const cleanupIfOpen = (): void => {
    setDouyinAwemeDetailBodyHandler(wc.id, null)
    activeDetailWaitReject = null
    if (!win.isDestroyed()) win.destroy()
    if (activeOffscreenWorker === win) activeOffscreenWorker = null
  }

  try {
    try {
      await win.loadURL(videoUrl)
    } catch (e) {
      if (isUserCancelError(e)) {
        cleanupIfOpen()
        return { success: false, canceled: true }
      }
      cleanupIfOpen()
      return { success: false, error: (e as Error).message }
    }

    if (offscreenPipelineUserCanceled || win.isDestroyed()) {
      cleanupIfOpen()
      return { success: false, canceled: true }
    }

    let body: string
    try {
      body = await bodyPromise
    } catch (e) {
      if (isUserCancelError(e)) {
        cleanupIfOpen()
        return { success: false, canceled: true }
      }
      cleanupIfOpen()
      return { success: false, error: (e as Error).message }
    }

    if (offscreenPipelineUserCanceled || win.isDestroyed()) {
      cleanupIfOpen()
      return { success: false, canceled: true }
    }

    const { urlList, error: parseErr } = parseDouyinAwemeDetailPlayUrls(body)
    if (urlList.length === 0) {
      cleanupIfOpen()
      return { success: false, error: parseErr ?? '未解析到 https 播放地址' }
    }

    const suggestedName = opts.suggestedName.trim() || `douyin_${awemeId}.mp4`
    let lastError: string | undefined

    for (let i = 0; i < Math.min(2, urlList.length); i++) {
      if (offscreenPipelineUserCanceled || win.isDestroyed()) {
        cleanupIfOpen()
        return { success: false, canceled: true }
      }
      const playUrl = urlList[i]!.trim()
      if (!playUrl.startsWith('https://')) continue
      const r = await douyinDownloadPlayViaGuest({
        guestWebContentsId: wc.id,
        playUrl,
        suggestedName,
        pageUrl: videoUrl,
        savePath: opts.savePath?.trim() || undefined
      })
      if (r.success) {
        if (!win.isDestroyed()) win.destroy()
        if (activeOffscreenWorker === win) activeOffscreenWorker = null
        return r
      }
      if ('canceled' in r && r.canceled) {
        cleanupIfOpen()
        return r
      }
      lastError = r.error ?? '下载失败'
    }

    cleanupIfOpen()
    return { success: false, error: lastError ?? '没有可用的 https 播放地址' }
  } finally {
    offscreenPipelineUserCanceled = false
  }
}
