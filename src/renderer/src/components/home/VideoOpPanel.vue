<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { NButton, NIcon, NSpin, NTooltip } from 'naive-ui'
import { DocumentTextOutline, SparklesOutline, FolderOpenOutline, TextOutline } from '@vicons/ionicons5'
import type { VideoItem } from '../../api/video'
import {
  getVideoRelatedExportsApi,
  getVideoRelatedSmartCutsApi,
  labelForExportVideoType,
  type ExportHistoryItem,
  type VideoRelatedSmartCutItem
} from '../../api/video'
import VideoOpCard from './VideoOpCard.vue'
import { extractVideoCover, type VideoCoverExtract } from '../../utils/extractVideoCover'
import { parseSubtitleToSegments } from '../../utils/subtitle'

const props = defineProps<{
  video: VideoItem
}>()

function formatDuration(seconds?: number): string {
  if (!seconds) return '-'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

const relatedExports = ref<ExportHistoryItem[]>([])
const relatedSmartCuts = ref<VideoRelatedSmartCutItem[]>([])
const loadingExports = ref(false)
const loadingSmartCuts = ref(false)

// 卡片内实时提取的封面（不含时长）
const realtimeMeta = ref<VideoCoverExtract | null>(null)
const loadingMeta = ref(false)

async function fetchRealtimeMeta() {
  const path = props.video?.path
  if (!path) return
  loadingMeta.value = true
  realtimeMeta.value = null
  try {
    realtimeMeta.value = await extractVideoCover(path)
  } catch {
    // 提取失败则使用后端数据
  } finally {
    loadingMeta.value = false
  }
}

// 展示用视频对象：封面可本地提取；时长只用后端
const displayVideo = computed(() => {
  const v = props.video
  if (!v) return v
  const m = realtimeMeta.value
  if (!m) return v
  return {
    ...v,
    cover: v.cover || (m.coverBase64 ? `data:image/jpeg;base64,${m.coverBase64}` : v.cover),
    duration: v.duration
  }
})

const displayDuration = computed(() => formatDuration(props.video?.duration))

function displayPath(path: string | undefined): string {
  if (!path) return '-'
  let s = path.replace(/^file:\/\/+/, '')
  if (s.match(/^\/[A-Za-z]:/)) s = s.slice(1)
  return s || path
}

const subtitleSegments = computed(() => parseSubtitleToSegments(props.video?.subtitle))

function formatSubtitleTime(fromS: number, toS: number): string {
  const fmt = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }
  return `${fmt(fromS)} - ${fmt(toS)}`
}

async function fetchRelated() {
  if (!props.video?.id) return
  loadingExports.value = true
  loadingSmartCuts.value = true
  await Promise.all([
    getVideoRelatedExportsApi(props.video.id),
    getVideoRelatedSmartCutsApi(props.video.id)
  ])
    .then(([exportRes, smartCutRes]) => {
      relatedExports.value = exportRes?.list ?? []
      relatedSmartCuts.value = smartCutRes?.list ?? []
    })
    .catch(() => {
      relatedExports.value = []
      relatedSmartCuts.value = []
    })
    .finally(() => {
      loadingExports.value = false
      loadingSmartCuts.value = false
    })
}

watch(
  () => [props.video?.id, props.video?.path] as const,
  ([id, path]) => {
    if (id) fetchRelated()
    if (path) fetchRealtimeMeta()
  },
  { immediate: true }
)

const cardRef = ref<InstanceType<typeof VideoOpCard> | null>(null)

function handlePlay() {
  // 预览由 VideoOpCard 内触发，不再从片头 seek；此处保留钩子供扩展
}

function handleSubtitleClick(seg: { fromS: number; toS: number }) {
  cardRef.value?.playAtTime?.(seg.fromS, seg.toS)
}

function openInFolder() {
  const p = props.video?.path
  if (p) window.api?.showItemInFolder(p)
}
</script>

<template>
  <div class="video-op-panel">
    <div class="video-op-layout">
      <!-- 左侧：视频 + 字幕 -->
      <div class="video-op-media">
      <VideoOpCard
        ref="cardRef"
        :video="video"
        :display-video="displayVideo"
        @play="handlePlay"
      />
        <div v-if="subtitleSegments.length" class="video-op-subtitle">
          <div class="subtitle-header">
            <n-icon size="14"><TextOutline /></n-icon>
            <span>字幕</span>
            <span v-if="subtitleSegments.length" class="subtitle-count">{{ subtitleSegments.length }} 条</span>
          </div>
          <div class="subtitle-list">
            <div
              v-for="(seg, idx) in subtitleSegments"
              :key="idx"
              class="subtitle-item subtitle-item-clickable"
              :title="`点击跳转并播放 ${formatSubtitleTime(seg.fromS, seg.toS)}`"
              @click="handleSubtitleClick(seg)"
            >
              <span class="subtitle-time">{{ formatSubtitleTime(seg.fromS, seg.toS) }}</span>
              <div class="subtitle-text">{{ seg.text }}</div>
            </div>
          </div>
        </div>
      </div>
      <!-- 右侧：信息 -->
      <div class="video-op-info">
          <div class="info-section info-meta">
            <div class="info-row info-name" :title="props.video?.name">
              <span class="info-label">名称</span>
              <span class="info-value">{{ props.video?.name ?? '-' }}</span>
            </div>
            <div class="info-row info-row-path">
              <span class="info-label">文件位置</span>
              <div class="path-row">
                <span class="info-value path-value" :title="props.video?.path">{{ displayPath(props.video?.path) }}</span>
                <n-tooltip v-if="props.video?.path" placement="top" trigger="hover">
                  <template #trigger>
                    <n-button
                      quaternary
                      size="tiny"
                      class="open-folder-btn"
                      @click="openInFolder"
                    >
                      <n-icon size="14"><FolderOpenOutline /></n-icon>
                    </n-button>
                  </template>
                  打开所在文件夹
                </n-tooltip>
              </div>
            </div>
            <div class="info-row info-row-duration">
              <span class="info-label">时长</span>
              <span class="info-value info-duration">{{ displayDuration }}</span>
            </div>
            <div class="info-row info-row-subtitle">
              <span class="info-label">
                <n-icon size="12"><TextOutline /></n-icon>
                字幕
              </span>
              <span class="info-value">{{ subtitleSegments.length ? `${subtitleSegments.length} 条` : '无字幕' }}</span>
            </div>
          </div>
          <div class="info-section info-related">
            <div class="info-row info-section-row">
              <span class="info-label">
                <n-icon size="12"><DocumentTextOutline /></n-icon>
                关联导出
              </span>
              <n-spin :show="loadingExports" size="small">
                <div v-if="!loadingExports" class="related-list">
                  <template v-if="relatedExports.length">
                    <div
                      v-for="ev in relatedExports"
                      :key="ev.id"
                      class="related-item"
                      :title="ev.output_path"
                    >
                      <span class="related-item-name">{{ ev.suggested_name }}</span>
                      <span class="related-item-kind">{{ labelForExportVideoType(ev.export_type) }}</span>
                    </div>
                  </template>
                  <span v-else class="related-empty">暂无</span>
                </div>
              </n-spin>
            </div>
            <div class="info-row info-section-row">
              <span class="info-label">
                <n-icon size="12"><SparklesOutline /></n-icon>
                智能剪辑
              </span>
              <n-spin :show="loadingSmartCuts" size="small">
                <div v-if="!loadingSmartCuts" class="related-list">
                  <template v-if="relatedSmartCuts.length">
                    <div
                      v-for="sc in relatedSmartCuts"
                      :key="sc.id"
                      class="related-item"
                      :title="sc.path"
                    >
                      {{ sc.name }}
                    </div>
                  </template>
                  <span v-else class="related-empty">暂无</span>
                </div>
              </n-spin>
            </div>
          </div>
        </div>
    </div>
  </div>
</template>

<style scoped>
.video-op-panel {
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: 10px;
}

.video-op-layout {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  min-width: 0;
  width: 100%;
}

.video-op-media {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  flex-shrink: 0;
}

.video-op-info {
  flex-shrink: 0;
  min-width: 0;
  width: 260px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-left: 12px;
  border-left: 1px solid rgba(255, 255, 255, 0.08);
}

.info-section {
  padding: 0;
  border: none;
  background: transparent;
}

.info-section + .info-section {
  padding-top: 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.info-section.info-meta {
  padding-top: 0;
}

.info-section.info-related {
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  padding-top: 14px;
}

.info-row {
  font-size: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-row + .info-row {
  margin-top: 10px;
}

.info-row:first-child {
  margin-top: 0;
}

.info-row.info-section-row {
  margin-top: 10px;
}

.info-row.info-section-row:first-child {
  margin-top: 0;
}

.info-row.info-section-row .info-label {
  margin-bottom: 2px;
}

.info-label {
  color: var(--ev-c-text-2, rgba(235, 235, 245, 0.6));
  font-size: 11px;
  display: flex;
  align-items: center;
  gap: 6px;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.info-value {
  color: var(--ev-c-text-1, rgba(255, 255, 245, 0.86));
  word-break: break-all;
  font-size: 13px;
}

.info-name .info-value {
  font-weight: 600;
  font-size: 14px;
}

.info-row-path .path-row {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}

.info-row-path .path-value {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  line-height: 1.45;
}

.path-value {
  max-height: 40px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
}

.open-folder-btn {
  flex-shrink: 0;
  transition: opacity 0.2s;
}

.open-folder-btn:hover {
  opacity: 0.9;
}

.info-duration {
  font-variant-numeric: tabular-nums;
  color: var(--ev-c-text-2, rgba(235, 235, 245, 0.6));
}

.related-list {
  max-height: 80px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.related-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--ev-c-text-2, rgba(235, 235, 245, 0.6));
  padding: 5px 8px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 4px;
  min-width: 0;
  transition: background 0.15s;
}

.related-item-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.related-item-kind {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--ev-c-text-3, rgba(235, 235, 245, 0.45));
  opacity: 0.9;
}

.related-item:hover {
  background: rgba(255, 255, 255, 0.08);
}

.related-empty {
  font-size: 12px;
  color: var(--ev-c-text-3, rgba(235, 235, 245, 0.38));
  padding: 4px 0;
}

/* 字幕 - 靠近视频 */
.video-op-subtitle {
  flex-shrink: 0;
  width: 200px;
  max-height: 320px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.subtitle-header {
  padding: 0 0 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--ev-c-text-2, rgba(235, 235, 245, 0.6));
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.subtitle-count {
  margin-left: auto;
  font-size: 11px;
  font-weight: 400;
  color: var(--ev-c-text-3, rgba(235, 235, 245, 0.38));
}

.subtitle-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0 0;
}

.subtitle-item {
  padding: 6px 0 8px;
  font-size: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  transition: background 0.15s;
  margin: 0 -4px;
  padding-left: 4px;
  padding-right: 4px;
  border-radius: 4px;
}

.subtitle-item:hover {
  background: rgba(255, 255, 255, 0.04);
}

.subtitle-item-clickable {
  cursor: pointer;
}

.subtitle-item-clickable:hover {
  background: rgba(255, 255, 255, 0.06);
}

.subtitle-item:last-child {
  border-bottom: none;
}

.subtitle-time {
  display: block;
  color: var(--ev-c-text-3, rgba(235, 235, 245, 0.38));
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  margin-bottom: 3px;
}

.subtitle-text {
  color: var(--ev-c-text-1, rgba(255, 255, 245, 0.9));
  font-weight: 400;
  line-height: 1.45;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
}

.subtitle-empty {
  padding: 24px 16px;
  font-size: 12px;
  color: var(--ev-c-text-3, rgba(235, 235, 245, 0.38));
  text-align: center;
}
</style>
