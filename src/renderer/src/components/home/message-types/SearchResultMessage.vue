<script setup lang="ts">
import { type PropType, ref } from 'vue'
import { NIcon, NCollapse, NCollapseItem, NButton } from 'naive-ui'
import { VideocamOutline, DownloadOutline } from '@vicons/ionicons5'
import { useMessage } from 'naive-ui'
import UnifiedVideoPreview from '../../UnifiedVideoPreview.vue'
import type { VideoSearchResultItem } from '../../../api/video'
import type { SearchSegment } from '../../../api/video'
import { exportSegmentApi } from '../../../api/video'

defineProps({
  results: {
    type: Array as PropType<VideoSearchResultItem[]>,
    required: true
  },
  keywords: {
    type: Array as PropType<string[]>,
    default: () => []
  }
})

const emit = defineEmits<{
  (e: 'play-video', video: any): void
}>()

const message = useMessage()
const videoPlayers = ref<Record<number, any>>({})
const exportingKey = ref<string | null>(null)

const formatTime = (s: number) => {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

const isVideoDeleted = (v: any) => !v?.path && !v?.fileUrl

const segmentKey = (videoId: number, segIndex: number) => `${videoId}-${segIndex}`

const handleSegmentClick = (video: any, startTime: number, endTime: number) => {
  if (isVideoDeleted(video)) return
  const player = videoPlayers.value[video?.id]
  if (player) player.playAtTime(startTime, endTime)
}

const handlePlayVideo = (video: any) => {
  if (!isVideoDeleted(video)) emit('play-video', { video, videoType: 'material' })
}

const handleExportSegment = async (video: any, seg: SearchSegment, segIndex: number) => {
  if (isVideoDeleted(video) || !video?.id) {
    message.warning('该视频已删除，无法导出')
    return
  }
  const key = segmentKey(video.id, segIndex)
  if (exportingKey.value) return
  exportingKey.value = key
  const loadingMsg = message.loading('正在导出片段...', { duration: 0 })
  try {
    const result = await exportSegmentApi(video.id, seg.start_s, seg.end_s)
    const saveResult = await window.api.downloadVideo(result.path, result.suggested_name)
    if (saveResult.success) {
      message.success(`已保存至: ${saveResult.path}`)
    } else if (saveResult.canceled) {
      message.info('已取消保存')
    } else {
      message.error(saveResult.error || '导出失败')
    }
  } catch (e) {
    message.error('导出片段失败，请稍后重试')
  } finally {
    loadingMsg.destroy()
    exportingKey.value = null
  }
}
</script>

<template>
  <div class="search-results-container">
    <div v-for="(item, idx) in results" :key="item.video?.id ?? idx" class="result-card-wrapper">
      <n-collapse :default-expanded-names="idx === 0 ? ['1'] : []" arrow-placement="right">
        <n-collapse-item :name="'1'" class="search-result-collapse">
          <template #header>
            <div class="collapse-header">
              <n-icon :component="VideocamOutline" class="header-video-icon" />
              <span class="header-video-name" :title="item.video?.name">{{
                item.video?.name
              }}</span>
            </div>
          </template>

          <div class="video-row">
            <div class="video-preview-wrap">
              <UnifiedVideoPreview
                :ref="
                  (el) => {
                    if (item.video?.id) videoPlayers[item.video.id] = el
                  }
                "
                :video="item.video"
                video-type="material"
                aspect-ratio="9/16"
                class="video-player"
                @dblclick="handlePlayVideo(item.video)"
              />
              <div class="video-info-below">
                <div class="video-header">
                  <n-icon :component="VideocamOutline" class="title-icon" />
                  <div class="video-name" :title="item.video?.name">{{ item.video?.name }}</div>
                </div>
              </div>
            </div>
            <div class="video-meta">
              <div v-if="item.segments?.length" class="segments">
                <div
                  v-for="(seg, si) in item.segments"
                  :key="si"
                  class="segment-chip"
                  :class="{ 'is-deleted': isVideoDeleted(item.video) }"
                  :title="seg.text"
                  @click="handleSegmentClick(item.video, seg.start_s, seg.end_s)"
                >
                  <div class="segment-content">
                    <div class="segment-text">{{ seg.text }}</div>
                    <div class="segment-time">
                      {{ formatTime(seg.start_s) }} - {{ formatTime(seg.end_s) }}
                    </div>
                  </div>
                  <n-button
                    v-if="!isVideoDeleted(item.video)"
                    quaternary
                    size="tiny"
                    type="primary"
                    class="segment-export-btn"
                    :loading="exportingKey === segmentKey(item.video?.id, si)"
                    @click.stop="handleExportSegment(item.video, seg, si)"
                  >
                    <template #icon>
                      <n-icon :component="DownloadOutline" />
                    </template>
                    导出片段
                  </n-button>
                </div>
              </div>
            </div>
          </div>
        </n-collapse-item>
      </n-collapse>
    </div>
  </div>
</template>

<style scoped>
.search-results-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  max-width: 680px;
  margin-top: 10px;
}

.result-card-wrapper {
  background: rgba(24, 24, 28, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.search-result-collapse :deep(.n-collapse-item__header) {
  padding: 12px 16px !important;
}

.collapse-header {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: calc(100% - 24px);
}

.header-video-icon {
  font-size: 18px;
  color: #4facfe;
  flex-shrink: 0;
}

.header-video-name {
  font-size: 14px;
  font-weight: 600;
  color: #f5f5f7;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-result-collapse :deep(.n-collapse-item__content-inner) {
  padding: 0 16px 16px 16px !important;
}

.video-row {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  padding-top: 10px;
}

.video-preview-wrap {
  position: relative;
  flex-shrink: 0;
  width: 130px; /* 进一步缩小视频宽度 */
}

.video-player {
  width: 100%;
  height: auto;
  display: block;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.video-info-below {
  margin-top: 10px;
  display: none;
}

.video-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.segments {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 231px; /* 130 * 16/9 约等于 231px，保持与视频高度一致 */
  overflow-y: auto;
  padding-right: 4px;
}

/* 自定义滚动条样式，使其更隐形 */
.segments::-webkit-scrollbar {
  display: none;
}

.segments::-webkit-scrollbar-track {
  background: transparent;
}

.segments::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 10px;
}

.segments::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.15);
}

.segment-chip {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
  background: rgba(255, 255, 255, 0.03);
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.04);
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.segment-content {
  flex: 1;
  min-width: 0;
  display: flex;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
}

.segment-export-btn {
  flex-shrink: 0;
}

.segment-chip:hover:not(.is-deleted) {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(26, 115, 232, 0.3);
  cursor: pointer;
}

.segment-chip.is-deleted {
  cursor: default;
  opacity: 0.6;
}

.segment-time {
  color: #4facfe;
  font-family: monospace;
  font-size: 11px;
  font-weight: 500;
  flex-shrink: 0;
  background: rgba(79, 172, 254, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
}

.segment-text {
  flex: 1;
  color: rgba(255, 255, 255, 0.65);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
</style>
