/**
 * 当前页对应的抖音视频标识。`videoId` 与接口里的 `aweme_id` 一致，
 * 用于在网络监控解析结果中查找 `play_addr`，供「下载」按钮使用。
 */
export interface DouyinVideoInfo {
  /** 与监控解析条目 `awemeId` 对齐，用于匹配可下载播放地址 */
  videoId: string
  /**
   * 从地址栏解析到 id 时一般为 `https://www.douyin.com/video/{id}`；
   * 仅从 DOM 读到 id 时为当前 webview 真实 URL（不改成视频页链接）。
   */
  pageUrl: string
  /** 从 URL 解析时附带：当时 webview 完整地址（含查询参数） */
  sourceUrl?: string
}

/**
 * 从当前 webview 地址提取视频 id（与 aweme_id 同义），供下载流程与网络解析结果关联。
 */
export function parseDouyinVideoFromUrl(raw: string): DouyinVideoInfo | null {
  if (!raw || typeof raw !== 'string') return null
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase()
  if (!host.endsWith('douyin.com')) return null

  const path = url.pathname

  const videoPath = path.match(/\/video\/(\d+)/)
  if (videoPath) {
    const id = videoPath[1]
    return { videoId: id, pageUrl: `https://www.douyin.com/video/${id}` }
  }

  const sharePath = path.match(/\/share\/video\/(\d+)/)
  if (sharePath) {
    const id = sharePath[1]
    return { videoId: id, pageUrl: `https://www.douyin.com/video/${id}` }
  }

  const aweme = url.searchParams.get('aweme_id') || url.searchParams.get('item_ids')
  if (aweme && /^\d+$/.test(aweme)) {
    return { videoId: aweme, pageUrl: `https://www.douyin.com/video/${aweme}` }
  }

  const modalId = url.searchParams.get('modal_id')
  if (modalId && /^\d+$/.test(modalId)) {
    return { videoId: modalId, pageUrl: `https://www.douyin.com/video/${modalId}` }
  }

  return null
}

/**
 * 在此类地址启用竖滑 feed 的 DOM 监听（MutationObserver + ipc）：
 * - 推荐：`https://www.douyin.com/?recommend=1`
 * - 朋友：`https://www.douyin.com/friend`（及 `/friend/...` 子路径）
 * 其它抖音页只靠 URL 解析视频 id，不挂 DOM 桥。
 */
export function isDouyinFeedDomWatchUrl(raw: string): boolean {
  if (!raw || typeof raw !== 'string') return false
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (!url.hostname.toLowerCase().endsWith('douyin.com')) return false
  const path = url.pathname.replace(/\/+$/, '') || '/'
  if (path === '/friend' || path.startsWith('/friend/')) return true
  if (path === '/' && url.searchParams.get('recommend') === '1') return true
  return false
}

/**
 * 在 guest 内安装：用 MutationObserver 监听 `data-e2e` / `data-e2e-vid` 变化，
 * 推荐页滑动换视频时 URL 不变也能更新 `window.__inklipActiveFeedVid`。
 * 并暴露 `window.__inklipReadFeedActiveVid()` 供宿主 executeJavaScript 读取。
 * 若存在 preload 注入的 `__inklipNotifyDouyinFeedVid`，则在 DOM 变化后防抖通知宿主（无轮询）。
 * 宿主应在 webview URL 变化时先执行 `DOUYIN_FEED_DOM_BRIDGE_UNINSTALL_SCRIPT`，再在推荐/朋友页执行本脚本，避免推荐↔朋友残留旧 Observer。
 */
export const DOUYIN_FEED_DOM_BRIDGE_SCRIPT = `(function(){
  try {
    function computeFeedActiveVid() {
      try {
        var root = document.querySelector('[data-e2e="feed-active-video"]');
        if (!root) return null;
        var vid = root.getAttribute('data-e2e-vid');
        if (vid && /^\\d+$/.test(String(vid).trim())) return String(vid).trim();
        var nodes = root.querySelectorAll('[data-e2e-vid]');
        for (var i = 0; i < nodes.length; i++) {
          var v = nodes[i].getAttribute('data-e2e-vid');
          if (v && /^\\d+$/.test(String(v).trim())) return String(v).trim();
        }
        return null;
      } catch (e) {
        return null;
      }
    }
    if (window.__inklipFeedNotifyDebounceT) {
      clearTimeout(window.__inklipFeedNotifyDebounceT);
      window.__inklipFeedNotifyDebounceT = null;
    }
    if (window.__inklipFeedDomObs && typeof window.__inklipFeedDomObs.disconnect === 'function') {
      window.__inklipFeedDomObs.disconnect();
    }
    window.__inklipFeedDomObs = null;
    window.__inklipFeedDomBridgeV1 = true;
    window.__inklipReadFeedActiveVid = computeFeedActiveVid;
    function scheduleHostNotify() {
      if (window.__inklipFeedNotifyDebounceT) clearTimeout(window.__inklipFeedNotifyDebounceT);
      window.__inklipFeedNotifyDebounceT = setTimeout(function() {
        window.__inklipFeedNotifyDebounceT = null;
        try {
          var v = window.__inklipActiveFeedVid;
          var out = (typeof v === 'string' && /^\\d+$/.test(v)) ? v : null;
          if (typeof window.__inklipNotifyDouyinFeedVid === 'function') {
            window.__inklipNotifyDouyinFeedVid(out);
          }
        } catch (err) {}
      }, 120);
    }
    function sync() {
      window.__inklipActiveFeedVid = computeFeedActiveVid();
      scheduleHostNotify();
    }
    sync();
    var obs = new MutationObserver(function() { sync(); });
    window.__inklipFeedDomObs = obs;
    var el = document.documentElement;
    if (el) {
      obs.observe(el, { subtree: true, attributes: true, childList: true, attributeFilter: ['data-e2e-vid', 'data-e2e'] });
    }
  } catch (e) {}
})()`

/** 离开推荐页时断开 Observer，避免其它路由仍跑 DOM 逻辑 */
export const DOUYIN_FEED_DOM_BRIDGE_UNINSTALL_SCRIPT = `(function(){
  try {
    if (window.__inklipFeedNotifyDebounceT) {
      clearTimeout(window.__inklipFeedNotifyDebounceT);
      window.__inklipFeedNotifyDebounceT = null;
    }
    if (window.__inklipFeedDomObs && typeof window.__inklipFeedDomObs.disconnect === 'function') {
      window.__inklipFeedDomObs.disconnect();
    }
    window.__inklipFeedDomObs = null;
    window.__inklipFeedDomBridgeV1 = false;
    window.__inklipReadFeedActiveVid = undefined;
    window.__inklipActiveFeedVid = undefined;
  } catch (e) {}
})()`

/**
 * 优先走桥接里同步的读函数，否则现场扫 DOM（桥尚未注入时的回退）。
 */
export const DOUYIN_RESOLVE_FEED_VIDEO_ID_SCRIPT = `(function(){
  try {
    if (typeof window.__inklipReadFeedActiveVid === 'function') {
      var x = window.__inklipReadFeedActiveVid();
      if (typeof x === 'string' && /^\\d+$/.test(x)) return x;
    }
  } catch (e) {}
  try {
    var root = document.querySelector('[data-e2e="feed-active-video"]');
    if (!root) return null;
    var vid = root.getAttribute('data-e2e-vid');
    if (vid && /^\\d+$/.test(String(vid).trim())) return String(vid).trim();
    var nodes = root.querySelectorAll('[data-e2e-vid]');
    for (var i = 0; i < nodes.length; i++) {
      var v = nodes[i].getAttribute('data-e2e-vid');
      if (v && /^\\d+$/.test(String(v).trim())) return String(v).trim();
    }
    return null;
  } catch (e) {
    return null;
  }
})()`
