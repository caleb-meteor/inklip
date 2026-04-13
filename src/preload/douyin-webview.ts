import { contextBridge, ipcRenderer } from 'electron'

/** 仅抖音内嵌 webview guest：把当前 feed 视频 id 推给宿主（无定时轮询） */
contextBridge.exposeInMainWorld(
  '__inklipNotifyDouyinFeedVid',
  (vid: string | null) => {
    ipcRenderer.sendToHost('inklip-douyin-feed-vid', vid == null || vid === '' ? '' : String(vid))
  }
)
