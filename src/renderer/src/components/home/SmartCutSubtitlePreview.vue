<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount, inject } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NIcon, useMessage } from 'naive-ui'
import {
  PlayOutline,
  PauseOutline,
  DownloadOutline,
  CreateOutline,
  VideocamOutline
} from '@vicons/ionicons5'
import { getVideosApi, type VideoItem } from '../../api/video'
import { getMediaUrl } from '../../utils/media'
import { quickClipBridgeKey } from '../../utils/quickClipBridge'
import type { SegmentWithVideo } from '../../views/quick-clip/types'

export type SmartCutSubtitleEntry = {
  video_id?: number
  text?: string
  offsets?: { from?: number; to?: number }
}

const props = defineProps<{
  subtitle: SmartCutSubtitleEntry[] | null | undefined
  /** 智能剪辑任务所属工作区，导出时传给后端（与字幕剪辑导出一致） */
  workspaceId?: number | null
}>()

const bridge = inject(quickClipBridgeKey, null)
const router = useRouter()
const message = useMessage()
const exporting = ref(false)

const bridgeReady = computed(() => bridge != null && bridge.value != null)

type Segment = {
  videoId: number
  videoPath: string
  text: string
  fromS: number
  toS: number
}

const videoRef = ref<HTMLVideoElement | null>(null)
const videosById = ref<Map<number, VideoItem>>(new Map())
const lastLoadedMaterialPath = ref('')
const activeIndex = ref(-1)
const isChainPlaying = ref(false)
/** 用户是否已触发过预览（避免暂停后仍盖一层占位） */
const previewEngaged = ref(false)
const videoPlaying = ref(false)
let chainIndex = -1
let timeUpdateCleanup: (() => void) | null = null

function clearTimeListener() {
  if (timeUpdateCleanup) {
    timeUpdateCleanup()
    timeUpdateCleanup = null
  }
}

const segments = computed((): Segment[] => {
  const sub = props.subtitle
  if (!Array.isArray(sub) || sub.length === 0) return []
  const out: Segment[] = []
  for (const row of sub) {
    const vid = row.video_id
    if (vid == null || vid <= 0) continue
    const v = videosById.value.get(vid)
    if (!v?.path) continue
    const from = row.offsets?.from ?? 0
    const to = row.offsets?.to ?? 0
    out.push({
      videoId: vid,
      videoPath: v.path,
      text: String(row.text ?? ''),
      fromS: from / 1000,
      toS: to / 1000
    })
  }
  return out
})

async function loadVideos(): Promise<void> {
  const sub = props.subtitle
  if (!Array.isArray(sub) || sub.length === 0) {
    videosById.value = new Map()
    return
  }
  const ids = [...new Set(sub.map((s) => s.video_id).filter((x): x is number => x != null && x > 0))]
  if (ids.length === 0) {
    videosById.value = new Map()
    return
  }
  try {
    const list = await getVideosApi({ ids })
    const m = new Map<number, VideoItem>()
    for (const v of list) m.set(v.id, v)
    videosById.value = m
  } catch {
    videosById.value = new Map()
  }
}

watch(
  () => props.subtitle,
  () => {
    previewEngaged.value = false
    void loadVideos()
  },
  { immediate: true, deep: true }
)

/** 有片段且尚未开始预览时：装饰空闲态；已开始过则保留画面（含暂停） */
const showPreviewIdleDecor = computed(
  () =>
    segments.value.length > 0 &&
    !videoPlaying.value &&
    !isChainPlaying.value &&
    !previewEngaged.value
)

const showPreviewEmpty = computed(() => segments.value.length === 0)

function onVideoPlay() {
  videoPlaying.value = true
}

function onVideoPause() {
  videoPlaying.value = false
}

function formatSegTime(fromS: number, toS: number): string {
  const fmt = (t: number) => {
    const m = Math.floor(t / 60)
    const s = Math.floor(t % 60)
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }
  return `${fmt(fromS)} – ${fmt(toS)}`
}

function playNextInChain(): void {
  chainIndex++
  if (chainIndex >= segments.value.length) {
    isChainPlaying.value = false
    chainIndex = -1
    activeIndex.value = -1
    clearTimeListener()
    return
  }
  playSegmentAt(chainIndex, true)
}

function playSegmentAt(index: number, fromChain: boolean): void {
  clearTimeListener()
  const seg = segments.value[index]
  const video = videoRef.value
  if (!seg || !video) return

  if (!fromChain) {
    isChainPlaying.value = false
    chainIndex = -1
  }

  previewEngaged.value = true
  activeIndex.value = index
  const url = getMediaUrl(seg.videoPath)

  const doPlay = (): void => {
    video.currentTime = seg.fromS
    video.muted = false
    void video.play().catch(() => {
      if (fromChain) {
        isChainPlaying.value = false
        chainIndex = -1
      }
    })
  }

  const onTimeUpdate = (): void => {
    if (video.currentTime >= seg.toS) {
      video.pause()
      clearTimeListener()
      if (fromChain && isChainPlaying.value) {
        playNextInChain()
      }
    }
  }

  video.addEventListener('timeupdate', onTimeUpdate)
  timeUpdateCleanup = () => {
    video.removeEventListener('timeupdate', onTimeUpdate)
  }

  if (lastLoadedMaterialPath.value !== seg.videoPath) {
    lastLoadedMaterialPath.value = seg.videoPath
    video.src = url
    video.load()
    const onCanPlay = (): void => {
      video.removeEventListener('canplay', onCanPlay)
      doPlay()
    }
    video.addEventListener('canplay', onCanPlay)
  } else {
    doPlay()
  }
}

function onRowClick(index: number): void {
  if (isChainPlaying.value) {
    isChainPlaying.value = false
    chainIndex = -1
    videoRef.value?.pause()
    clearTimeListener()
  }
  playSegmentAt(index, false)
}

function toggleChainPreview(): void {
  if (segments.value.length === 0) return
  if (isChainPlaying.value) {
    isChainPlaying.value = false
    chainIndex = -1
    videoRef.value?.pause()
    clearTimeListener()
    activeIndex.value = -1
    return
  }
  previewEngaged.value = true
  isChainPlaying.value = true
  chainIndex = -1
  playNextInChain()
}

function buildSegmentsForQuickClip(): SegmentWithVideo[] {
  return segments.value.map((seg, i) => {
    const v = videosById.value.get(seg.videoId)!
    // 与 useQuickClip.getVideoSegments 一致：播放器 src 需经 getMediaUrl（Electron media:// 等）
    const videoPath = v.path ? getMediaUrl(v.path) : ''
    return {
      text: seg.text,
      fromMs: Math.round(seg.fromS * 1000),
      toMs: Math.round(seg.toS * 1000),
      fromS: seg.fromS,
      toS: seg.toS,
      videoId: seg.videoId,
      videoName: v.name,
      videoPath,
      segmentIndex: i
    }
  })
}

async function onExport(): Promise<void> {
  const api = bridge?.value
  if (!api) {
    message.warning('字幕剪辑未就绪，请稍后再试')
    return
  }
  if (segments.value.length === 0) return
  const list = buildSegmentsForQuickClip()
  exporting.value = true
  try {
    await api.exportSegmentsDirect(
      list,
      props.workspaceId ?? null,
      `智能剪辑导出_${Date.now()}.mp4`,
      'ai'
    )
  } finally {
    exporting.value = false
  }
}

function onSendToQuickClip(): void {
  const api = bridge?.value
  if (!api) {
    message.warning('字幕剪辑未就绪，请稍后再试')
    return
  }
  if (segments.value.length === 0) return
  api.appendSegmentsToSelected(buildSegmentsForQuickClip())
  message.success('已添加到「已选字幕」，正在打开字幕剪辑')
  void router.push('/quick-clip')
}

onBeforeUnmount(() => {
  isChainPlaying.value = false
  chainIndex = -1
  clearTimeListener()
  videoRef.value?.pause()
})
</script>

<template>
  <div class="smartcut-preview">
    <div class="preview-media">
      <div
        class="preview-video-wrap"
        :class="{ 'preview-video-wrap--idle-decor': showPreviewIdleDecor, 'preview-video-wrap--empty': showPreviewEmpty }"
      >
        <video
          ref="videoRef"
          class="preview-video"
          controls
          playsinline
          preload="metadata"
          @play="onVideoPlay"
          @pause="onVideoPause"
        />
        <div v-show="showPreviewIdleDecor" class="preview-video-idle" aria-hidden="true">
          <div class="preview-idle-shimmer" />
          <div class="preview-idle-corners">
            <span class="preview-idle-corner preview-idle-corner--tl" />
            <span class="preview-idle-corner preview-idle-corner--tr" />
            <span class="preview-idle-corner preview-idle-corner--bl" />
            <span class="preview-idle-corner preview-idle-corner--br" />
          </div>
          <div class="preview-idle-center">
            <div class="preview-idle-icon-ring">
              <n-icon :size="28" class="preview-idle-icon"><VideocamOutline /></n-icon>
            </div>
            <span class="preview-idle-title">方案预览</span>
            <span class="preview-idle-hint">点击右侧片段或顶部「播放」</span>
          </div>
        </div>
        <div v-show="showPreviewEmpty" class="preview-video-empty" aria-hidden="true">
          <n-icon :size="26" class="preview-empty-icon"><VideocamOutline /></n-icon>
          <span class="preview-empty-text">暂无可用片段</span>
        </div>
      </div>
    </div>
    <div class="preview-subtitles">
      <div class="subtitle-header">
        <div class="subtitle-header-title">
          <span>推荐片段字幕</span>
          <span v-if="segments.length" class="count">{{ segments.length }} 条</span>
        </div>
        <div v-if="segments.length" class="subtitle-header-actions">
          <n-button
            size="tiny"
            quaternary
            type="primary"
            :disabled="segments.length === 0"
            @click="toggleChainPreview"
          >
            <template #icon>
              <n-icon>
                <PauseOutline v-if="isChainPlaying" />
                <PlayOutline v-else />
              </n-icon>
            </template>
            {{ isChainPlaying ? '停止' : '播放' }}
          </n-button>
          <n-button
            size="tiny"
            quaternary
            :disabled="!bridgeReady"
            :loading="exporting"
            @click="onExport"
          >
            <template #icon>
              <n-icon><DownloadOutline /></n-icon>
            </template>
            导出
          </n-button>
          <n-button size="tiny" quaternary type="info" :disabled="!bridgeReady" @click="onSendToQuickClip">
            <template #icon>
              <n-icon><CreateOutline /></n-icon>
            </template>
            手动编辑
          </n-button>
        </div>
      </div>
      <div v-if="segments.length" class="subtitle-list">
        <div
          v-for="(seg, idx) in segments"
          :key="`${seg.videoId}-${idx}-${seg.fromS}`"
          class="subtitle-row"
          :class="{ active: idx === activeIndex }"
          :title="`播放 ${formatSegTime(seg.fromS, seg.toS)}`"
          @click="onRowClick(idx)"
        >
          <span class="time">{{ formatSegTime(seg.fromS, seg.toS) }}</span>
          <span class="text">{{ seg.text }}</span>
        </div>
      </div>
      <div v-else class="empty">暂无可用预览（素材可能已删除或字幕格式异常）</div>
    </div>
  </div>
</template>

<style scoped>
/* 与 260px 宽 9:16 竖屏视频同高 */
.smartcut-preview {
  --sc-preview-h: calc(260px * 16 / 9);
  display: flex;
  justify-content: flex-start;
  align-items: flex-start;
  gap: 16px;
  width: 100%;
  min-height: 200px;
}

.preview-media {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

/* 竖屏 9:16 区域：固定宽高，与右侧字幕列等高 */
.preview-video-wrap {
  position: relative;
  width: 260px;
  max-width: 100%;
  height: var(--sc-preview-h);
  flex-shrink: 0;
  background: #000;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.preview-video-wrap--idle-decor {
  background: linear-gradient(150deg, #1c1b22 0%, #121118 45%, #0a0a0e 100%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.05),
    inset 0 -1px 0 rgba(0, 0, 0, 0.35);
}

.preview-video-wrap--empty {
  background: linear-gradient(160deg, #1a1920 0%, #101016 100%);
}

.preview-video {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: contain;
}

.preview-video-idle {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.preview-idle-shimmer {
  position: absolute;
  inset: -35% -55%;
  background: linear-gradient(
    118deg,
    transparent 36%,
    rgba(79, 172, 254, 0.05) 48%,
    rgba(79, 172, 254, 0.1) 50%,
    rgba(79, 172, 254, 0.05) 52%,
    transparent 64%
  );
  mask-image: linear-gradient(to bottom, black 0%, black 55%, transparent 88%);
  animation: sc-preview-shimmer 5.5s ease-in-out infinite;
}

@keyframes sc-preview-shimmer {
  0%,
  100% {
    transform: translate(-6%, 0);
    opacity: 0.4;
  }
  50% {
    transform: translate(6%, 3%);
    opacity: 0.7;
  }
}

.preview-idle-corners {
  position: absolute;
  inset: 8px;
  pointer-events: none;
}

.preview-idle-corner {
  position: absolute;
  width: 14px;
  height: 14px;
  border-color: rgba(79, 172, 254, 0.22);
  opacity: 0.9;
}

.preview-idle-corner--tl {
  top: 0;
  left: 0;
  border-top: 1px solid;
  border-left: 1px solid;
  border-radius: 2px 0 0 0;
}

.preview-idle-corner--tr {
  top: 0;
  right: 0;
  border-top: 1px solid;
  border-right: 1px solid;
  border-radius: 0 2px 0 0;
}

.preview-idle-corner--bl {
  bottom: 0;
  left: 0;
  border-bottom: 1px solid;
  border-left: 1px solid;
  border-radius: 0 0 0 2px;
}

.preview-idle-corner--br {
  bottom: 0;
  right: 0;
  border-bottom: 1px solid;
  border-right: 1px solid;
  border-radius: 0 0 2px 0;
}

.preview-idle-center {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
  text-align: center;
}

.preview-idle-icon-ring {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle at 50% 35%, rgba(79, 172, 254, 0.18) 0%, transparent 65%),
    rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(79, 172, 254, 0.2);
  box-shadow: 0 0 24px rgba(79, 172, 254, 0.12);
}

.preview-idle-icon {
  color: rgba(147, 197, 253, 0.85) !important;
}

.preview-idle-title {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: rgba(226, 232, 240, 0.88);
}

.preview-idle-hint {
  font-size: 11px;
  line-height: 1.4;
  color: rgba(148, 163, 184, 0.85);
  max-width: 200px;
}

.preview-video-empty {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px;
  text-align: center;
  background: linear-gradient(to top, rgba(10, 10, 14, 0.55) 0%, transparent 45%);
}

.preview-empty-icon {
  color: rgba(100, 116, 139, 0.65) !important;
}

.preview-empty-text {
  font-size: 12px;
  color: rgba(148, 163, 184, 0.9);
  line-height: 1.45;
}

.preview-subtitles {
  width: 280px;
  height: var(--sc-preview-h);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  overflow: hidden;
}

.subtitle-header {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  padding: 10px 12px;
  font-size: 13px;
  font-weight: 600;
  color: #e2e8f0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.subtitle-header-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.subtitle-header-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}

.count {
  font-size: 11px;
  color: #94a3b8;
  font-weight: 500;
}

.subtitle-list {
  flex: 1;
  overflow: auto;
  padding: 6px;
}

.subtitle-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  margin-bottom: 4px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.subtitle-row:hover {
  background: rgba(79, 172, 254, 0.08);
}

.subtitle-row.active {
  background: rgba(79, 172, 254, 0.15);
  border: 1px solid rgba(79, 172, 254, 0.25);
}

.time {
  font-size: 11px;
  color: #64748b;
  font-variant-numeric: tabular-nums;
}

.text {
  font-size: 13px;
  color: #e2e8f0;
  line-height: 1.45;
}

.empty {
  padding: 16px 12px;
  font-size: 12px;
  color: #64748b;
  line-height: 1.5;
}

@media (max-width: 720px) {
  .smartcut-preview {
    flex-direction: column;
    align-items: flex-start;
  }
  .preview-subtitles {
    width: 100%;
    max-width: 100%;
    height: var(--sc-preview-h);
  }
}
</style>
