<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { NButton, NText, NSpin } from 'naive-ui'
import { useMessage } from 'naive-ui'
import { isDevRenderer } from '../utils/isDevRenderer'
import {
  DOUYIN_FEED_DOM_BRIDGE_SCRIPT,
  DOUYIN_FEED_DOM_BRIDGE_UNINSTALL_SCRIPT,
  DOUYIN_RESOLVE_FEED_VIDEO_ID_SCRIPT,
  isDouyinFeedDomWatchUrl,
  parseDouyinVideoFromUrl,
  type DouyinVideoInfo
} from '../utils/douyinUrl'

const message = useMessage()

/** 与 DOM 监听条件一致，默认进推荐流 */
const DOUYIN_HOME = 'https://www.douyin.com/?recommend=1'

const embeddedUserAgent = window.api.getBrowserLikeUserAgent()

const BROWSER_SPOOF_SCRIPT = `(function(){
  try {
    Object.defineProperty(navigator, 'webdriver', { get: function () { return undefined }, configurable: true });
  } catch (e) {}
  if (!window.chrome) {
    window.chrome = { runtime: {}, loadTimes: function () {}, csi: function () {}, app: { isInstalled: false } };
  }
})();`

const webviewRef = ref<Electron.WebviewTag | null>(null)
/** 当前视频的 aweme_id（来自 URL 或 DOM），用于下载浮层与屏外拉流 */
const parsedVideo = ref<DouyinVideoInfo | null>(null)

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—'
  if (n < 1024) return `${Math.round(n)} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

interface DouyinDownloadProgressUi {
  percent: number | null
  indeterminate: boolean
  hint: string
  fileLabel?: string
}

const douyinDownloadProgressUi = ref<DouyinDownloadProgressUi | null>(null)

/** 下载过程文字日志（不展示播放地址，仅步骤与进度） */
const douyinDownloadFlowLog = ref<string[]>([])

function pushDouyinFlowLog(line: string): void {
  const t = new Date().toLocaleTimeString()
  douyinDownloadFlowLog.value = [...douyinDownloadFlowLog.value, `[${t}] ${line}`]
}

/** 与主进程进度事件同步：同一条「进度」行原地更新，避免刷屏 */
function setDouyinFlowProgressLine(text: string): void {
  const lines = [...douyinDownloadFlowLog.value]
  const prefix = '进度：'
  if (lines.length > 0 && lines[lines.length - 1].startsWith(prefix)) {
    lines[lines.length - 1] = `${prefix}${text}`
  } else {
    lines.push(`${prefix}${text}`)
  }
  douyinDownloadFlowLog.value = lines
}

const webviewInlineStyle = computed(() => ({
  top: '0',
  bottom: '0'
}))

const downloadingAwemeId = ref<string | null>(null)

/** 从点击下载到整段流程结束（含保存对话框），防止并发重复进入 */
const douyinDownloadPipelineLock = ref(false)

const isDouyinDownloadBusy = computed(
  () => douyinDownloadPipelineLock.value || downloadingAwemeId.value !== null
)

/** 已选保存路径并进入主进程下载阶段时可取消（另存为对话框期间请直接关对话框） */
const showDouyinCancelDownload = computed(() => downloadingAwemeId.value !== null)

const isFloatDownloading = computed(
  () =>
    parsedVideo.value != null &&
    downloadingAwemeId.value != null &&
    downloadingAwemeId.value === parsedVideo.value.videoId
)

const showDouyinDebugPanel = isDevRenderer

const douyinProgressCircleStyle = computed(() => {
  const percent = douyinDownloadProgressUi.value?.percent
  const normalized = percent == null ? 12 : Math.max(0, Math.min(100, percent))
  return {
    '--douyin-progress': `${normalized}%`
  }
})

/** debug 面板允许拖动，生产模式固定为单圆形入口 */
const floatDrag = ref({ x: 0, y: 0 })
let floatDragPointer: { clientX: number; clientY: number; x: number; y: number } | null = null

function onDouyinFloatDragMove(e: MouseEvent): void {
  if (!floatDragPointer) return
  floatDrag.value = {
    x: floatDragPointer.x + e.clientX - floatDragPointer.clientX,
    y: floatDragPointer.y + e.clientY - floatDragPointer.clientY
  }
}

function onDouyinFloatDragEnd(): void {
  floatDragPointer = null
  window.removeEventListener('mousemove', onDouyinFloatDragMove)
  window.removeEventListener('mouseup', onDouyinFloatDragEnd)
}

function onDouyinFloatDragStart(e: MouseEvent): void {
  if (e.button !== 0) return
  floatDragPointer = {
    clientX: e.clientX,
    clientY: e.clientY,
    x: floatDrag.value.x,
    y: floatDrag.value.y
  }
  window.addEventListener('mousemove', onDouyinFloatDragMove)
  window.addEventListener('mouseup', onDouyinFloatDragEnd)
}

watch(
  () => parsedVideo.value?.videoId ?? null,
  (id, prev) => {
    if (id !== prev) floatDrag.value = { x: 0, y: 0 }
  }
)

function applyDouyinDownloadProgressPayload(
  payload:
    | {
        phase: 'update'
        received: number
        total: number
        percent: number | null
        fileLabel: string
      }
    | { phase: 'done' }
): void {
  if (payload.phase === 'done') {
    douyinDownloadProgressUi.value = null
    setDouyinFlowProgressLine('传输阶段已结束')
    /** downloadingAwemeId 由屏外下载流程的 finally 清理 */
    return
  }
  const indeterminate = payload.total <= 0
  const hint = indeterminate
    ? `已下载 ${formatBytes(payload.received)}（总大小未知）`
    : `${formatBytes(payload.received)} / ${formatBytes(payload.total)}${
        payload.percent != null ? `（${payload.percent}%）` : ''
      }`
  douyinDownloadProgressUi.value = {
    percent: payload.percent,
    indeterminate,
    hint,
    fileLabel: payload.fileLabel
  }
  setDouyinFlowProgressLine(hint)
}

/** 有视频 ID 即可下载：一律经主进程屏外 BrowserWindow 拉 detail 并 downloadURL（主内嵌 webview 不跳转） */
async function downloadCurrentVideo(): Promise<void> {
  const id = parsedVideo.value?.videoId
  if (!id) {
    message.warning('未识别当前视频 id')
    return
  }
  if (isDouyinDownloadBusy.value) {
    message.warning('已有下载进行中，请等待结束后再试')
    return
  }

  douyinDownloadPipelineLock.value = true
  try {
    douyinDownloadFlowLog.value = []
    pushDouyinFlowLog(`开始下载流程，视频 ID：${id}`)

    const name = `douyin_${id}.mp4`
    const pick = await window.api.showExportSaveDialog(name)
    if (pick.canceled || !pick.filePath) {
      pushDouyinFlowLog('已取消：未选择保存路径')
      return
    }
    const savePath = pick.filePath
    pushDouyinFlowLog(`已选择保存路径：${savePath}`)

    downloadingAwemeId.value = id
    pushDouyinFlowLog('使用屏外窗口模式：创建独立窗口加载详情页并请求 aweme/detail（内嵌浏览页保持不动）')
    pushDouyinFlowLog('已调用主进程：解析播放地址并由该窗口发起下载（若文件较大请耐心等待）')
    douyinDownloadProgressUi.value = {
      percent: null,
      indeterminate: true,
      hint: '屏外窗口拉取详情与播放地址…',
      fileLabel: name
    }
    try {
      const r = await window.api.downloadDouyinOffscreen({
        awemeId: id,
        suggestedName: name,
        savePath
      })
      douyinDownloadProgressUi.value = null
      if (r && 'canceled' in r && r.canceled) {
        pushDouyinFlowLog('下载已取消')
        return
      }
      if (r.success) {
        pushDouyinFlowLog('下载成功，文件已写入所选路径')
        message.success('已保存到所选位置')
        return
      }
      pushDouyinFlowLog(`失败：${r.error ?? '未知错误'}`)
      message.error(r.error != null ? `无法下载：${r.error}` : '无法下载')
    } catch (e) {
      douyinDownloadProgressUi.value = null
      const msg = e instanceof Error ? e.message : '下载失败'
      pushDouyinFlowLog(`异常：${msg}`)
      message.error(msg)
    } finally {
      downloadingAwemeId.value = null
    }
  } finally {
    douyinDownloadPipelineLock.value = false
  }
}

async function cancelCurrentDouyinDownload(): Promise<void> {
  try {
    await window.api.cancelDouyinDownload()
  } catch {
    /* ignore */
  }
  pushDouyinFlowLog('已请求取消下载')
  douyinDownloadProgressUi.value = null
}

let removeDouyinDownloadProgressListener: (() => void) | undefined

/** 上一次与 guest DOM 桥对齐的 URL */
let lastDouyinGuestApplyUrl: string | undefined

/** 串行执行 apply，避免快速切换时多次异步乱序完成导致桥接装错页 */
let douyinBridgeApplyTail: Promise<void> = Promise.resolve()

function getDouyinGuestUrlOrEmpty(w: Electron.WebviewTag): string {
  try {
    return w.getURL()
  } catch {
    return ''
  }
}

/** UA 伪装；URL 变化时先卸载桥；当前为推荐 `/?recommend=1` 或朋友 `/friend` 时再安装监听 */
async function applyGuestSpoofAndBridgeImpl(w: Electron.WebviewTag): Promise<void> {
  if (webviewRef.value !== w) return

  await w.executeJavaScript(BROWSER_SPOOF_SCRIPT, true).catch(() => {})
  if (webviewRef.value !== w) return

  const MAX_URL_DRIFT = 8
  for (let iter = 0; iter < MAX_URL_DRIFT; iter++) {
    let url = getDouyinGuestUrlOrEmpty(w)
    if (!url) return
    if (webviewRef.value !== w) return

    if (url !== lastDouyinGuestApplyUrl) {
      await w.executeJavaScript(DOUYIN_FEED_DOM_BRIDGE_UNINSTALL_SCRIPT, true).catch(() => {})
      if (webviewRef.value !== w) return
    }

    url = getDouyinGuestUrlOrEmpty(w)
    if (!url) return
    lastDouyinGuestApplyUrl = url

    if (isDouyinFeedDomWatchUrl(url)) {
      await w.executeJavaScript(DOUYIN_FEED_DOM_BRIDGE_SCRIPT, true).catch(() => {})
      if (webviewRef.value !== w) return
    }

    const urlAfter = getDouyinGuestUrlOrEmpty(w)
    if (!urlAfter || urlAfter === url) return
  }
}

function scheduleApplyGuestSpoofAndBridge(w: Electron.WebviewTag): void {
  douyinBridgeApplyTail = douyinBridgeApplyTail
    .then(() => applyGuestSpoofAndBridgeImpl(w))
    .then(() => {
      void syncCaptureFromWebview()
    })
    .catch(() => {
      void syncCaptureFromWebview()
    })
}

/** 抖音 webview：带专用 preload，guest 内 DOM 变化时 ipc 推送当前 feed 视频 id */
const douyinWebviewWebPreferences = computed(() => {
  const base = 'nativeWindowOpen=yes, javascript=yes, contextIsolation=yes, sandbox=no'
  try {
    const p = window.api.getDouyinWebviewPreloadPath()
    if (p) return `${base}, preload=${p}`
  } catch {
    /* dev 异常时仍可浏览，仅失去推送 */
  }
  return base
})

function onWebviewIpcMessage(event: Event): void {
  const ev = event as unknown as { channel: string; args: unknown[] }
  if (ev.channel !== 'inklip-douyin-feed-vid') return
  const w = webviewRef.value
  if (!w) return
  let url = ''
  try {
    url = w.getURL()
  } catch {
    return
  }
  if (parseDouyinVideoFromUrl(url)) return
  if (!isDouyinHostPageUrl(url)) return
  if (!isDouyinFeedDomWatchUrl(url)) return
  const raw = ev.args[0]
  const vid = typeof raw === 'string' && raw !== '' && /^\d+$/.test(raw) ? raw : null
  if (vid != null) {
    const cur = parsedVideo.value
    if (cur?.videoId === vid && cur.pageUrl === url) return
    parsedVideo.value = { videoId: vid, pageUrl: url }
  }
}

function isDouyinHostPageUrl(raw: string): boolean {
  try {
    return new URL(raw).hostname.toLowerCase().endsWith('douyin.com')
  } catch {
    return false
  }
}

let syncParsedVideoGeneration = 0

async function syncCaptureFromWebview(): Promise<void> {
  const w = webviewRef.value
  if (!w) return
  const gen = ++syncParsedVideoGeneration
  let url = ''
  try {
    url = w.getURL()
  } catch {
    return
  }

  const fromUrl = parseDouyinVideoFromUrl(url)
  if (fromUrl) {
    if (gen !== syncParsedVideoGeneration) return
    parsedVideo.value = { ...fromUrl, sourceUrl: url }
    return
  }

  if (!isDouyinHostPageUrl(url)) {
    if (gen !== syncParsedVideoGeneration) return
    parsedVideo.value = null
    return
  }

  if (!isDouyinFeedDomWatchUrl(url)) {
    if (gen !== syncParsedVideoGeneration) return
    parsedVideo.value = null
    return
  }

  try {
    const vid = await w.executeJavaScript(DOUYIN_RESOLVE_FEED_VIDEO_ID_SCRIPT, true)
    if (gen !== syncParsedVideoGeneration) return
    if (typeof vid === 'string' && /^\d+$/.test(vid)) {
      parsedVideo.value = {
        videoId: vid,
        pageUrl: url
      }
      return
    }
  } catch {
    /* guest 未就绪或非网页上下文 */
  }
  if (gen !== syncParsedVideoGeneration) return
  parsedVideo.value = null
}

function onDomReady(): void {
  const w = webviewRef.value
  if (!w) return
  scheduleApplyGuestSpoofAndBridge(w)
}

function onDidNavigate(): void {
  const w = webviewRef.value
  if (!w) return
  scheduleApplyGuestSpoofAndBridge(w)
}

function onDidNavigateInPage(): void {
  const w = webviewRef.value
  if (!w) return
  scheduleApplyGuestSpoofAndBridge(w)
}

let lastDidStopLoadingSyncAt = 0
const DID_STOP_LOADING_SYNC_MIN_MS = 900

function onDidStopLoading(): void {
  const now = Date.now()
  if (now - lastDidStopLoadingSyncAt < DID_STOP_LOADING_SYNC_MIN_MS) return
  lastDidStopLoadingSyncAt = now
  void syncCaptureFromWebview()
}

function onNewWindow(e: Electron.Event & { url?: string }): void {
  e.preventDefault()
  const url = typeof e.url === 'string' ? e.url : ''
  if (url.startsWith('http://') || url.startsWith('https://')) {
    void window.api.openBrowserLikeWindow(url)
  }
}

onMounted(() => {
  removeDouyinDownloadProgressListener = window.api.onDouyinDownloadProgress((payload) => {
    applyDouyinDownloadProgressPayload(payload)
  })
  void nextTick(() => {
    const w = webviewRef.value
    if (!w) return
    w.addEventListener('dom-ready', onDomReady)
    w.addEventListener('did-navigate', onDidNavigate)
    w.addEventListener('did-navigate-in-page', onDidNavigateInPage)
    w.addEventListener('did-stop-loading', onDidStopLoading)
    w.addEventListener('new-window', onNewWindow)
    w.addEventListener('ipc-message', onWebviewIpcMessage)
  })
})

onBeforeUnmount(() => {
  onDouyinFloatDragEnd()
  removeDouyinDownloadProgressListener?.()
  removeDouyinDownloadProgressListener = undefined
  lastDouyinGuestApplyUrl = undefined
  douyinBridgeApplyTail = Promise.resolve()
  const w = webviewRef.value
  if (!w) return
  void w.executeJavaScript(DOUYIN_FEED_DOM_BRIDGE_UNINSTALL_SCRIPT, true).catch(() => {})
  w.removeEventListener('dom-ready', onDomReady)
  w.removeEventListener('did-navigate', onDidNavigate)
  w.removeEventListener('did-navigate-in-page', onDidNavigateInPage)
  w.removeEventListener('did-stop-loading', onDidStopLoading)
  w.removeEventListener('new-window', onNewWindow)
  w.removeEventListener('ipc-message', onWebviewIpcMessage)
})
</script>

<template>
  <div class="douyin-page">
    <div v-if="parsedVideo" class="douyin-detail-float">
      <div
        class="douyin-detail-float-inner"
        :class="{ 'douyin-detail-float-inner-prod': !showDouyinDebugPanel }"
        :style="showDouyinDebugPanel ? { transform: `translate(${floatDrag.x}px, ${floatDrag.y}px)` } : undefined"
      >
        <template v-if="showDouyinDebugPanel">
          <div
            class="douyin-float-handle"
            title="拖动"
            @mousedown.prevent="onDouyinFloatDragStart"
          />
          <n-text depth="2" class="douyin-float-title">视频下载</n-text>
          <n-text v-if="parsedVideo" depth="3" class="douyin-float-id-line">
            视频 ID：{{ parsedVideo.videoId }}
          </n-text>
          <div class="douyin-float-download-actions">
            <n-button
              size="small"
              type="primary"
              class="douyin-float-download-btn"
              :disabled="isDouyinDownloadBusy"
              @click="downloadCurrentVideo"
            >
              下载
            </n-button>
            <n-button
              v-if="showDouyinCancelDownload"
              size="small"
              quaternary
              class="douyin-float-cancel-btn"
              @click="cancelCurrentDouyinDownload"
            >
              取消下载
            </n-button>
          </div>
          <template v-if="isFloatDownloading && douyinDownloadProgressUi">
            <n-spin size="medium" class="douyin-float-spin" />
          </template>
          <div v-if="douyinDownloadFlowLog.length > 0" class="douyin-float-flow-shell">
            <n-text depth="3" class="douyin-float-flow-label">流程记录</n-text>
            <div class="douyin-float-flow-log">
              <div
                v-for="(ln, li) in douyinDownloadFlowLog"
                :key="li"
                class="douyin-float-flow-line"
              >
                {{ ln }}
              </div>
            </div>
          </div>
        </template>

        <template v-else>
          <div v-if="!isFloatDownloading" class="douyin-float-prod-actions">
            <n-button
              circle
              type="primary"
              class="douyin-float-prod-btn"
              :disabled="isDouyinDownloadBusy"
              title="下载视频"
              @click="downloadCurrentVideo"
            >
              <svg viewBox="0 0 24 24" class="douyin-float-prod-icon" aria-hidden="true">
                <path
                  d="M12 4v10m0 0l-4-4m4 4l4-4M5 19h14"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.9"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </n-button>
          </div>

          <div
            v-else-if="isFloatDownloading && douyinDownloadProgressUi"
            class="douyin-float-prod-progress-ring"
            :class="{ 'douyin-float-prod-progress-ring-indeterminate': douyinDownloadProgressUi.indeterminate }"
            :style="douyinProgressCircleStyle"
            :title="douyinDownloadProgressUi.hint"
          >
            <n-button
              v-if="showDouyinCancelDownload"
              circle
              quaternary
              class="douyin-float-prod-progress-cancel"
              title="取消下载"
              @click="cancelCurrentDouyinDownload"
            >
              <svg viewBox="0 0 24 24" class="douyin-float-prod-icon" aria-hidden="true">
                <path
                  d="M9 9h6v6H9z"
                  fill="currentColor"
                />
              </svg>
            </n-button>
          </div>
        </template>
      </div>
    </div>

    <webview
      ref="webviewRef"
      class="douyin-webview"
      :style="webviewInlineStyle"
      :src="DOUYIN_HOME"
      :useragent="embeddedUserAgent"
      partition="persist:inklip_douyin"
      allowpopups
      :webpreferences="douyinWebviewWebPreferences"
    />
  </div>
</template>

<style scoped>
.douyin-page {
  position: relative;
  flex: 1;
  min-height: 0;
  background: #0f0f0f;
}

.douyin-detail-float {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-right: 12px;
  pointer-events: none;
}

.douyin-detail-float-inner {
  min-width: 240px;
  max-width: min(380px, 92vw);
  width: max-content;
  pointer-events: auto;
  padding: 8px 10px 12px;
  background: rgba(24, 24, 27, 0.94);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.4);
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  touch-action: none;
}

.douyin-detail-float-inner-prod {
  min-width: auto;
  max-width: 72px;
  width: auto;
  padding: 8px;
  border-radius: 999px;
  gap: 0;
}

.douyin-float-handle {
  align-self: stretch;
  height: 12px;
  margin: -2px -4px 2px;
  border-radius: 6px;
  cursor: grab;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.07);
}

.douyin-float-handle:active {
  cursor: grabbing;
}

.douyin-float-spin {
  min-height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.douyin-float-title {
  font-size: 12px;
  font-weight: 600;
  text-align: center;
  align-self: center;
}

.douyin-float-id-line {
  font-size: 11px;
  text-align: center;
  line-height: 1.4;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  word-break: break-all;
  max-width: min(300px, 88vw);
}

.douyin-float-download-actions {
  align-self: center;
  margin-top: 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: center;
}

.douyin-float-download-btn {
  align-self: center;
}

.douyin-float-cancel-btn {
  align-self: center;
}

.douyin-float-prod-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.douyin-float-prod-btn {
  width: 52px;
  height: 52px;
}

.douyin-float-prod-icon {
  width: 18px;
  height: 18px;
  display: block;
}

.douyin-float-prod-progress-ring {
  position: relative;
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background:
    conic-gradient(#18a058 var(--douyin-progress), rgba(255, 255, 255, 0.14) 0),
    rgba(255, 255, 255, 0.06);
}

.douyin-float-prod-progress-ring::before {
  content: '';
  position: absolute;
  inset: 5px;
  border-radius: 50%;
  background: rgba(24, 24, 27, 0.94);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
}

.douyin-float-prod-progress-ring-indeterminate {
  animation: douyin-progress-rotate 1s linear infinite;
}

.douyin-float-prod-progress-cancel {
  position: relative;
  z-index: 1;
  width: 38px;
  height: 38px;
  background: rgba(255, 255, 255, 0.08);
}

@keyframes douyin-progress-rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.douyin-float-flow-shell {
  align-self: stretch;
  margin-top: 10px;
  max-width: min(340px, 92vw);
}

.douyin-float-flow-label {
  display: block;
  font-size: 10px;
  margin-bottom: 4px;
  opacity: 0.85;
}

.douyin-float-flow-log {
  max-height: min(36vh, 240px);
  overflow-y: auto;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.douyin-float-flow-line {
  font-size: 10px;
  line-height: 1.45;
  color: #d4d4d8;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  word-break: break-word;
}

.douyin-webview {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  border: none;
}
</style>
