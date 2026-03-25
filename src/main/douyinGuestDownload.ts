import { BrowserWindow, session, webContents, type DownloadItem, type Event, type WebContents } from 'electron'
import fs from 'fs'
import path from 'path'
import { app, dialog } from 'electron'
import { DOUYIN_SESSION_PARTITION, isDouyinOffscreenWorkerWebContents } from './douyinNetworkMonitor'

export type DouyinDownloadPlayResult =
  | { success: true; path: string }
  | { success: false; error?: string; canceled?: boolean }

export type DouyinDownloadProgressIpc =
  | {
      phase: 'update'
      received: number
      total: number
      percent: number | null
      fileLabel: string
    }
  | { phase: 'done' }

function broadcastDouyinDownloadProgress(msg: DouyinDownloadProgressIpc): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed() || win.webContents.isDestroyed()) continue
    win.webContents.send('douyin-download-progress', msg)
  }
}

interface Pending {
  guestId: number
  suggestedName: string
  /** 必须在 will-download 回调里同步 setSavePath；路径须在 downloadURL 之前由用户选定 */
  savePath: string
  finish: (r: DouyinDownloadPlayResult) => void
  startupTimeout: ReturnType<typeof setTimeout>
}

let pending: Pending | null = null
let willDownloadAttached = false

/** will-download 已接管后的 Chromium 下载项，用于用户取消 */
let activeDouyinDownloadItem: DownloadItem | null = null

export function cancelDouyinPartitionDownload(): void {
  if (activeDouyinDownloadItem) {
    try {
      activeDouyinDownloadItem.cancel()
    } catch {
      /* ignore */
    }
    return
  }
  if (pending) {
    clearTimeout(pending.startupTimeout)
    const finish = pending.finish
    pending = null
    broadcastDouyinDownloadProgress({ phase: 'done' })
    finish({ success: false, canceled: true })
  }
}

/** 全局限流：同时只允许一条抖音下载管线（内嵌 IPC 或屏外 IPC）；与 `pending` 互补（pending 仅在 will-download 挂起后） */
let douyinExclusivePipelineActive = false

export const DOUYIN_DOWNLOAD_EXCLUSIVE_BUSY_ERROR = '已有下载进行中，请等待结束后再试'

export function tryAcquireDouyinExclusivePipeline(): boolean {
  if (douyinExclusivePipelineActive) return false
  douyinExclusivePipelineActive = true
  return true
}

export function releaseDouyinExclusivePipeline(): void {
  douyinExclusivePipelineActive = false
}

function isSameDouyinGuestSession(guest: WebContents): boolean {
  const target = session.fromPartition(DOUYIN_SESSION_PARTITION)
  if (guest.session === target) return true
  const ga =
    typeof guest.session.getStoragePath === 'function' ? guest.session.getStoragePath() : undefined
  const ta = typeof target.getStoragePath === 'function' ? target.getStoragePath() : undefined
  return Boolean(ga && ta && ga === ta)
}

function attachWillDownloadOnce(): void {
  if (willDownloadAttached) return
  willDownloadAttached = true
  const ses = session.fromPartition(DOUYIN_SESSION_PARTITION)
  ses.on('will-download', (_event: Event, item: DownloadItem, wc: WebContents) => {
    if (!pending) return
    if (wc.id !== pending.guestId) return

    const p = pending
    pending = null
    clearTimeout(p.startupTimeout)
    activeDouyinDownloadItem = item

    const filePath = p.savePath
    const fileLabel = path.basename(filePath)

    let finalized = false
    let onUpdated: () => void

    const finalize = (r: DouyinDownloadPlayResult): void => {
      if (finalized) return
      finalized = true
      activeDouyinDownloadItem = null
      try {
        item.removeListener('updated', onUpdated)
      } catch {
        /* ignore */
      }
      broadcastDouyinDownloadProgress({ phase: 'done' })
      p.finish(r)
    }

    const fail = (msg: string): void => {
      try {
        item.cancel()
      } catch {
        /* ignore */
      }
      finalize({ success: false, error: msg })
    }

    try {
      item.setSavePath(filePath)
    } catch (e) {
      fail((e as Error).message)
      return
    }

    let resumeTries = 0
    const maxResumeTries = 15

    const broadcastProgress = (): void => {
      const received = item.getReceivedBytes()
      const total = item.getTotalBytes()
      const percent =
        total > 0 ? Math.min(100, Math.round((received * 100) / total)) : null
      broadcastDouyinDownloadProgress({
        phase: 'update',
        received,
        total,
        percent,
        fileLabel
      })
    }

    onUpdated = (_evt: Event, dlState: 'progressing' | 'interrupted'): void => {
      if (dlState === 'interrupted' && item.canResume() && resumeTries < maxResumeTries) {
        resumeTries++
        try {
          item.resume()
        } catch {
          /* ignore */
        }
      }
      broadcastProgress()
    }

    item.on('updated', onUpdated)
    broadcastProgress()

    item.once('done', (_e, state) => {
      if (state === 'completed') finalize({ success: true, path: filePath })
      else if (state === 'interrupted') {
        finalize({
          success: false,
          error:
            '下载被中断（多为点播链接过期或网络不稳定）。请在抖音内重新搜索/刷新后尽快再试下载；长时间停留后再点下载容易失败。'
        })
      } else if (state === 'cancelled') {
        finalize({ success: false, canceled: true })
      } else finalize({ success: false, error: `下载结束: ${state}` })
    })
  })
}

/**
 * 由屏外下载窗口的 WebContents 调用 downloadURL，走 Chromium 网络与下载子系统（主进程不做 HTTP 读流）。
 * Cookie、Referer 等与该窗口当前页一致；pageUrl 记入日志便于排查。
 *
 * 保存路径须在 downloadURL 之前选定，并在 will-download 内同步 setSavePath；若在回调里 await 弹窗后再
 * setSavePath，下载可能已在后台跑完，会出现进度 100% 却无文件、done 不触发、invoke 永不结束等问题。
 */
export function douyinDownloadPlayViaGuest(payload: {
  guestWebContentsId: number
  playUrl: string
  suggestedName: string
  pageUrl?: string
  /** 已选定的保存路径（多地址重试时传入，跳过另存为） */
  savePath?: string
}): Promise<DouyinDownloadPlayResult> {
  const { guestWebContentsId, playUrl, suggestedName, pageUrl, savePath: savePathOpt } = payload
  const trimmed = playUrl.trim()

  if (!trimmed.startsWith('https://')) {
    return Promise.resolve({ success: false, error: '仅支持 https 播放地址' })
  }

  const guest = webContents.fromId(guestWebContentsId)
  if (!guest || guest.isDestroyed()) {
    return Promise.resolve({ success: false, error: '无效的发起方页面' })
  }
  const guestType = guest.getType()
  const allowedGuest =
    guestType === 'window' && isDouyinOffscreenWorkerWebContents(guest)
  if (!allowedGuest) {
    return Promise.resolve({
      success: false,
      error: '仅允许抖音分区内的屏外下载窗口发起下载'
    })
  }
  if (!isSameDouyinGuestSession(guest)) {
    return Promise.resolve({ success: false, error: '页面会话与抖音分区不一致' })
  }

  if (pending) {
    return Promise.resolve({ success: false, error: DOUYIN_DOWNLOAD_EXCLUSIVE_BUSY_ERROR })
  }

  attachWillDownloadOnce()

  return (async (): Promise<DouyinDownloadPlayResult> => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    if (!win) {
      return { success: false, error: '没有活动窗口' }
    }

    const baseName = suggestedName.trim() || 'douyin_video.mp4'
    let filePath: string
    const preset = savePathOpt?.trim()
    if (preset) {
      filePath = preset
    } else {
      try {
        const dlg = await dialog.showSaveDialog(win, {
          title: '保存视频',
          defaultPath: path.join(app.getPath('downloads'), baseName),
          filters: [{ name: '视频', extensions: ['mp4', 'm4v', 'webm', 'mov'] }]
        })
        if (dlg.canceled || !dlg.filePath) {
          return { success: false, canceled: true }
        }
        filePath = dlg.filePath
      } catch (e) {
        return { success: false, error: (e as Error).message }
      }
    }

    try {
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
    } catch (e) {
      return { success: false, error: (e as Error).message }
    }

    if (pending) {
      return { success: false, error: DOUYIN_DOWNLOAD_EXCLUSIVE_BUSY_ERROR }
    }

    return await new Promise<DouyinDownloadPlayResult>((resolve) => {
      const finish = (r: DouyinDownloadPlayResult): void => {
        resolve(r)
      }

      const startupTimeout = setTimeout(() => {
        if (pending?.guestId === guest.id) {
          pending = null
          broadcastDouyinDownloadProgress({ phase: 'done' })
          finish({ success: false, error: '下载未启动（超时）' })
        }
      }, 90_000)

      pending = {
        guestId: guest.id,
        suggestedName: baseName,
        savePath: filePath,
        finish,
        startupTimeout
      }

      try {
        if (pageUrl) {
          console.log('[Douyin DL] pageUrl:', pageUrl, '| play:', trimmed.slice(0, 160))
        }
        guest.downloadURL(trimmed)
      } catch (e) {
        clearTimeout(startupTimeout)
        pending = null
        broadcastDouyinDownloadProgress({ phase: 'done' })
        finish({ success: false, error: (e as Error).message })
      }
    })
  })()
}
