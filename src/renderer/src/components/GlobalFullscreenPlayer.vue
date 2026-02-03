<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { CloseOutline } from '@vicons/ionicons5'
import { getMediaUrl } from '../utils/media'
import { NIcon, NModal } from 'naive-ui'
import { getVideosApi, getSmartCutApi, type VideoItem } from '../api/video'

interface SubtitleItem {
  text: string
  offsets: {
    from: number // milliseconds
    to: number // milliseconds
  }
  timestamps?: {
    from: string // e.g., "00:00:00,100"
    to: string // e.g., "00:00:03,100"
  }
}

const props = defineProps<{
  visible: boolean
  path: string
  name: string
  videoId?: number // Optional video ID for direct matching
  subtitleData?: any // Optional subtitle data (array) passed directly
  videoType?: 'material' | 'edited' // Distinction between source materials and AI generated videos
}>()

const emit = defineEmits(['close'])

const videoRef = ref<HTMLVideoElement | null>(null)
const isPlaying = ref(false)
const isMuted = ref(false)
const progress = ref(0)
const duration = ref(0)
const currentTime = ref(0)
const isDragging = ref(false)
const subtitles = ref<SubtitleItem[]>([])
const currentSubtitleIndex = ref<number>(-1)

const togglePlay = (): void => {
  if (!videoRef.value) return
  if (videoRef.value.paused) {
    videoRef.value.play()
  } else {
    videoRef.value.pause()
  }
}

const onTimeUpdate = (): void => {
  if (!videoRef.value) return
  currentTime.value = videoRef.value.currentTime
  // Only update progress circle if not dragging
  if (!isDragging.value) {
    progress.value = (videoRef.value.currentTime / videoRef.value.duration) * 100
  }

  // Update current subtitle based on playback time
  updateCurrentSubtitle()
}

const updateCurrentSubtitle = (): void => {
  if (subtitles.value.length === 0) {
    currentSubtitleIndex.value = -1
    return
  }

  const currentTimeMs = currentTime.value * 1000 // Convert to milliseconds

  // Find the subtitle that matches the current time
  const index = subtitles.value.findIndex(
    (sub) => currentTimeMs >= sub.offsets.from && currentTimeMs <= sub.offsets.to
  )

  if (index !== currentSubtitleIndex.value) {
    currentSubtitleIndex.value = index
    // Scroll to current subtitle in the panel
    if (index >= 0 && subtitlePanelRef.value) {
      const subtitleElement = subtitlePanelRef.value.querySelector(
        `[data-subtitle-index="${index}"]`
      )
      if (subtitleElement) {
        subtitleElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  }
}

const subtitlePanelRef = ref<HTMLElement | null>(null)

// Process subtitle data into SubtitleItem array
// Note: Subtitles are only loaded from API responses (JSON format), not from files
const processSubtitleData = (subtitleData: any): SubtitleItem[] => {
  if (!subtitleData) return []

  // Handle array format from API: [{"text": "...", "offsets": {"from": 0, "to": 1000}}, ...]
  const subtitleArray = Array.isArray(subtitleData)
    ? subtitleData
    : subtitleData?.transcription && Array.isArray(subtitleData.transcription)
      ? subtitleData.transcription
      : []

  if (subtitleArray.length === 0) return []

  // Process subtitle items
  return subtitleArray
    .filter((item: any) => {
      return (
        item &&
        typeof item === 'object' &&
        typeof item.text === 'string' &&
        item.offsets &&
        typeof item.offsets.from === 'number' &&
        typeof item.offsets.to === 'number'
      )
    })
    .map((item: any) => ({
      text: item.text || '',
      offsets: {
        from: item.offsets.from,
        to: item.offsets.to
      },
      timestamps: item.timestamps || undefined
    }))
}

// Load subtitles from API response (JSON data only, no file support)
const loadSubtitles = async (): Promise<void> => {
  if (!props.visible) {
    subtitles.value = []
    return
  }

  // If subtitle data is passed directly (from props), use it
  if (props.subtitleData) {
    const processed = processSubtitleData(props.subtitleData)
    if (processed.length > 0) {
      subtitles.value = processed
      return
    }
  }

  try {
    let videoSubtitle: any = null

    if (props.videoType === 'edited' && props.videoId) {
      // Handle AI Generated / Edited Videos (剪辑视频)
      console.log('[GlobalFullscreenPlayer] Fetching latest smart cut data for subtitles:', props.videoId)
      const smartCut = await getSmartCutApi(props.videoId)
      if (smartCut && smartCut.subtitle) {
        videoSubtitle = smartCut.subtitle
      }
    } else {
      // Handle Source Materials (素材视频) - fallback or explicit 'material' type
      console.log('[GlobalFullscreenPlayer] Fetching latest material video data for subtitles')
      const videos = await getVideosApi()
      let video: VideoItem | undefined = undefined

      // Find video by ID (preferred) or path
      if (props.videoId) {
        video = videos.find((v) => v.id === props.videoId)
      } else if (props.path) {
        const normalizePath = (p: string): string => {
          if (!p) return ''
          return p
            .replace(/^media:\/\//, '')
            .replace(/^file:\/\//, '')
            .replace(/\\/g, '/')
            .toLowerCase()
        }
        const targetPath = normalizePath(props.path)
        video = videos.find((v) => {
          const videoPath = normalizePath(v.path)
          return (
            videoPath === targetPath ||
            videoPath.includes(targetPath) ||
            targetPath.includes(videoPath)
          )
        })
      }

      if (video && video.subtitle) {
        videoSubtitle = video.subtitle
      }
    }

    if (!videoSubtitle) {
      subtitles.value = []
      return
    }

    // Process subtitle from API response (JSON data)
    subtitles.value = processSubtitleData(videoSubtitle)
  } catch (error) {
    console.error('[GlobalFullscreenPlayer] Failed to load subtitles:', error)
    subtitles.value = []
  }
}

// Watch for visibility changes to load subtitles
watch(
  () => props.visible,
  (newVal) => {
    if (newVal) {
      setTimeout(() => {
        loadSubtitles()
      }, 100)
    } else {
      subtitles.value = []
      currentSubtitleIndex.value = -1
    }
  }
)

// Watch for subtitleData changes
watch(
  () => props.subtitleData,
  () => {
    if (props.visible) {
      loadSubtitles()
    }
  }
)

// Also load on mount if already visible
onMounted(() => {
  if (props.visible) {
    setTimeout(() => {
      loadSubtitles()
    }, 100)
  }
})

const seekToSubtitle = (index: number): void => {
  if (!videoRef.value || index < 0 || index >= subtitles.value.length) return

  const subtitle = subtitles.value[index]
  const targetTime = subtitle.offsets.from / 1000 // Convert to seconds
  videoRef.value.currentTime = targetTime

  // Update current subtitle index immediately
  currentSubtitleIndex.value = index

  // Scroll to the subtitle
  if (subtitlePanelRef.value) {
    const subtitleElement = subtitlePanelRef.value.querySelector(`[data-subtitle-index="${index}"]`)
    if (subtitleElement) {
      subtitleElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }
}

const onLoadedMetadata = (): void => {
  if (!videoRef.value) return
  duration.value = videoRef.value.duration
}

const formatTime = (seconds: number): string => {
  if (!seconds || isNaN(seconds)) return '00:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

const formatSubtitleTime = (subtitle: SubtitleItem): string => {
  // If timestamps exist, use them (format: "00:00:00,100")
  if (subtitle.timestamps) {
    const fromTime = subtitle.timestamps.from.replace(',', '.').split(':')
    const toTime = subtitle.timestamps.to.replace(',', '.').split(':')

    // Convert to MM:SS format (skip hours if 00)
    const formatTimestamp = (timeParts: string[]): string => {
      if (timeParts.length >= 3) {
        const hours = parseInt(timeParts[0]) || 0
        const minutes = parseInt(timeParts[1]) || 0
        const seconds = parseFloat(timeParts[2]) || 0
        const sec = Math.floor(seconds)

        if (hours > 0) {
          return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
        } else {
          return `${minutes.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
        }
      }
      return timeParts.join(':')
    }

    return `${formatTimestamp(fromTime)} - ${formatTimestamp(toTime)}`
  }

  // Otherwise, calculate from offsets
  return `${formatTime(subtitle.offsets.from / 1000)} - ${formatTime(subtitle.offsets.to / 1000)}`
}

const handleClose = (): void => {
  emit('close')
}

const handleKeydown = (e: KeyboardEvent): void => {
  if (!props.visible) return
  if (e.code === 'Space') {
    e.preventDefault()
    togglePlay()
  } else if (e.code === 'Escape') {
    handleClose()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <n-modal
    :show="visible"
    :mask-closable="true"
    class="player-modal"
    :style="{ width: '100vw', height: '100vh', background: '#000' }"
    @update:show="handleClose"
  >
    <div class="player-container">
      <!-- Header -->
      <div class="player-header">
        <span class="video-title">{{ name }}</span>
        <div class="close-btn" @click="handleClose">
          <n-icon size="28" color="#fff">
            <CloseOutline />
          </n-icon>
        </div>
      </div>

      <!-- Main Content Area: Video + Subtitles -->
      <div class="content-area">
        <!-- Video Area -->
        <div class="video-box">
          <video
            ref="videoRef"
            :src="getMediaUrl(path)"
            autoplay
            controls
            controlsList="nodownload"
            :muted="isMuted"
            class="main-video"
            @play="isPlaying = true"
            @pause="isPlaying = false"
            @timeupdate="onTimeUpdate"
            @loadedmetadata="onLoadedMetadata"
            @mousedown.stop
            @click.stop
          ></video>
        </div>

        <!-- Subtitle Panel -->
        <div ref="subtitlePanelRef" class="subtitle-panel">
          <div class="subtitle-header">
            <span class="subtitle-title">字幕</span>
            <span class="subtitle-count">
              <span v-if="subtitles.length > 0">{{ subtitles.length }} 条</span>
              <span v-else>加载中...</span>
            </span>
          </div>
          <div v-if="subtitles.length > 0" class="subtitle-list">
            <div
              v-for="(subtitle, index) in subtitles"
              :key="index"
              :data-subtitle-index="index"
              class="subtitle-item"
              :class="{ active: index === currentSubtitleIndex }"
              @click="seekToSubtitle(index)"
            >
              <div class="subtitle-time">
                {{ formatSubtitleTime(subtitle) }}
              </div>
              <div class="subtitle-text">{{ subtitle.text }}</div>
            </div>
          </div>
          <div v-else class="subtitle-list subtitle-list-empty">
            <div class="subtitle-empty-text">暂无字幕数据</div>
          </div>
        </div>
      </div>
    </div>
  </n-modal>
</template>

<style scoped>
.player-modal {
  padding: 0 !important;
  margin: 0 !important;
  max-width: none !important;
}

.player-container {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  position: relative;
  background: #000;
  overflow: hidden;
}

.content-area {
  flex: 1;
  display: flex;
  gap: 0;
  overflow: hidden;
}

.player-header {
  height: 60px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 30px;
}

.video-title {
  color: #fff;
  font-size: 18px;
  font-weight: 500;
  opacity: 0.8;
}

.close-btn {
  cursor: pointer;
  padding: 8px;
  border-radius: 50%;
  transition: background 0.2s;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.video-box {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
  overflow: hidden;
  min-width: 0; /* Allow flexbox to shrink */
}

.main-video {
  max-width: 100%;
  max-height: 100%;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.subtitle-panel {
  width: 400px;
  min-width: 400px;
  background: #1a1a1a;
  border-left: 1px solid #333;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex-shrink: 0;
  z-index: 10;
  position: relative;
}

.subtitle-list-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
}

.subtitle-empty-text {
  color: #888;
  font-size: 14px;
  text-align: center;
}

.subtitle-header {
  padding: 16px 20px;
  border-bottom: 1px solid #333;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #262626;
}

.subtitle-title {
  color: #fff;
  font-size: 16px;
  font-weight: 500;
}

.subtitle-count {
  color: #888;
  font-size: 12px;
}

.subtitle-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px 0;
}

.subtitle-list::-webkit-scrollbar {
  width: 6px;
}

.subtitle-list::-webkit-scrollbar-track {
  background: #1a1a1a;
}

.subtitle-list::-webkit-scrollbar-thumb {
  background: #444;
  border-radius: 3px;
}

.subtitle-list::-webkit-scrollbar-thumb:hover {
  background: #555;
}

.subtitle-item {
  padding: 12px 20px;
  margin: 4px 0;
  border-left: 3px solid transparent;
  transition: all 0.2s;
  cursor: pointer;
}

.subtitle-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.subtitle-item.active {
  background: rgba(99, 226, 183, 0.15);
  border-left-color: #63e2b7;
}

.subtitle-time {
  color: #888;
  font-size: 11px;
  margin-bottom: 6px;
  font-family: monospace;
}

.subtitle-item.active .subtitle-time {
  color: #63e2b7;
}

.subtitle-text {
  color: #ccc;
  font-size: 14px;
  line-height: 1.6;
  word-wrap: break-word;
}

.subtitle-item.active .subtitle-text {
  color: #fff;
  font-weight: 500;
}

.player-controls {
  padding: 20px 30px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.progress-wrapper {
  width: 100%;
}

.progress-slider {
  width: 100%;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
  outline: none;
  cursor: pointer;
}

.progress-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  background: #63e2b7;
  border-radius: 50%;
  box-shadow: 0 0 10px rgba(99, 226, 183, 0.5);
}

.controls-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 20px;
}

.action-btn {
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.1s;
}

.action-btn:active {
  transform: scale(0.9);
}

.time-info {
  color: #aaa;
  font-family: monospace;
  font-size: 14px;
}

.speed-selector {
  margin-right: 10px;
}

.speed-btn {
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  padding: 4px 12px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  transition: all 0.2s;
  min-width: 60px;
  text-align: center;
}

.speed-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  color: #63e2b7;
}

/* Transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
