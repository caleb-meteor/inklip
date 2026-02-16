<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted } from 'vue'
import { getMediaUrl } from '../utils/media'
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
  path: string
  videoId?: number
  subtitleData?: any
  videoType?: 'material' | 'edited'
  autoplay?: boolean
  muted?: boolean
}>()

const videoRef = ref<HTMLVideoElement | null>(null)
const isPlaying = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const subtitles = ref<SubtitleItem[]>([])
const currentSubtitleIndex = ref<number>(-1)
const subtitlePanelRef = ref<HTMLElement | null>(null)

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
  updateCurrentSubtitle()
}

const onLoadedMetadata = (): void => {
  if (!videoRef.value) return
  duration.value = videoRef.value.duration
}

const updateCurrentSubtitle = (): void => {
  if (subtitles.value.length === 0) {
    currentSubtitleIndex.value = -1
    return
  }

  const currentTimeMs = currentTime.value * 1000

  // Find the subtitle that matches the current time
  const index = subtitles.value.findIndex(
    (sub) => currentTimeMs >= sub.offsets.from && currentTimeMs <= sub.offsets.to
  )

  if (index !== currentSubtitleIndex.value) {
    currentSubtitleIndex.value = index
    // Scroll to current subtitle
    scrollToSubtitle(index)
  }
}

const scrollToSubtitle = (index: number) => {
  if (index >= 0 && subtitlePanelRef.value) {
    const subtitleElement = subtitlePanelRef.value.querySelector(
      `[data-subtitle-index="${index}"]`
    )
    if (subtitleElement) {
      subtitleElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }
}

const seekToSubtitle = (index: number): void => {
  if (!videoRef.value || index < 0 || index >= subtitles.value.length) return

  const subtitle = subtitles.value[index]
  const targetTime = subtitle.offsets.from / 1000
  videoRef.value.currentTime = targetTime
  videoRef.value.play()
  
  currentSubtitleIndex.value = index
  scrollToSubtitle(index)
}

const processSubtitleData = (subtitleData: any): SubtitleItem[] => {
  if (!subtitleData) return []

  // Check if it's already an array (JSON parsed)
  let subtitleArray: any[] = []
  
  if (Array.isArray(subtitleData)) {
    subtitleArray = subtitleData
  } else if (subtitleData?.transcription && Array.isArray(subtitleData.transcription)) {
    subtitleArray = subtitleData.transcription
  } else if (typeof subtitleData === 'string') {
    // Try to parse if it's a string
    try {
        const parsed = JSON.parse(subtitleData)
        if (Array.isArray(parsed)) {
            subtitleArray = parsed
        } else if (parsed?.transcription && Array.isArray(parsed.transcription)) {
            subtitleArray = parsed.transcription
        }
    } catch (e) {
        // Not a JSON string
        console.warn('Subtitle is a string but not JSON', e)
        return []
    }
  }

  if (subtitleArray.length === 0) return []

  return subtitleArray
    .filter((item: any) => {
      return (
        item &&
        typeof item === 'object' &&
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
      timestamps: item.timestamps
    }))
}

const loadSubtitles = async (): Promise<void> => {
  subtitles.value = []
  
  // 1. Direct props
  if (props.subtitleData) {
    const processed = processSubtitleData(props.subtitleData)
    if (processed.length > 0) {
      subtitles.value = processed
      return
    }
  }

  // 2. Fetch if missing
  try {
    let videoSubtitle: any = null

    if (props.videoType === 'edited' && props.videoId) {
      const smartCut = await getSmartCutApi(props.videoId)
      if (smartCut && smartCut.subtitle) {
        videoSubtitle = smartCut.subtitle
      }
    } else {
      // Default to material check
      // Only fetch if we really need to (e.g. subtitleData prop was empty)
      // If we have videoId, let's fetch to be safe in case props.subtitleData was stale or empty string
      if (props.videoId) {
         const videos = await getVideosApi([props.videoId])
         if (videos && videos.length > 0 && videos[0].subtitle) {
            videoSubtitle = videos[0].subtitle
         }
      }
    }

    if (videoSubtitle) {
      subtitles.value = processSubtitleData(videoSubtitle)
    }
  } catch (error) {
    console.error('[VideoPlayer] Failed to load subtitles:', error)
  }
}

const formatSubtitleTime = (subtitle: SubtitleItem): string => {
  const formatTimePart = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  if (subtitle.timestamps) {
     // Use timestamp strings if available
     // Simplified for display
     const from = subtitle.timestamps.from.split(',')[0]
     return from
  }
  
  return formatTimePart(subtitle.offsets.from / 1000)
}

watch(() => props.videoId, loadSubtitles, { immediate: true })
watch(() => props.subtitleData, loadSubtitles)
watch(() => props.path, () => {
    // Reset if path changes
    currentTime.value = 0
})

</script>

<template>
  <div class="video-player-container">
    <div class="content-area">
      <!-- Video Area -->
      <div class="video-box">
        <video
          ref="videoRef"
          :src="getMediaUrl(path)"
          :autoplay="autoplay"
          controls
          controlsList="nodownload"
          :muted="muted"
          class="main-video"
          @play="isPlaying = true"
          @pause="isPlaying = false"
          @timeupdate="onTimeUpdate"
          @loadedmetadata="onLoadedMetadata"
        ></video>
      </div>

      <!-- Subtitle Panel -->
      <div ref="subtitlePanelRef" class="subtitle-panel">
        <div class="subtitle-header">
          <span class="subtitle-title">字幕</span>
          <span class="subtitle-count">
            <span v-if="subtitles.length > 0">{{ subtitles.length }} 条</span>
            <span v-else>无字幕</span>
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
</template>

<style scoped>
.video-player-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #000;
  overflow: hidden;
}

.content-area {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 0;
  overflow: hidden;
  height: 100%;
  justify-content: center;
  align-items: center;
}

.video-box {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  background: #000;
  overflow: hidden;
  min-width: 300px;
  max-width: 800px;
  height: 100%;
}

.main-video {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: 100%;
  object-fit: contain;
}

.subtitle-panel {
  width: 380px;
  min-width: 300px;
  max-width: 50%;
  height: 100%;
  min-height: 0;
  background: #1a1a1a;
  border-left: 1px solid #333;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex-shrink: 0;
}

.subtitle-header {
  padding: 12px 16px;
  border-bottom: 1px solid #333;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #262626;
  flex-shrink: 0;
}

.subtitle-title {
  color: #fff;
  font-size: 14px;
  font-weight: 500;
}

.subtitle-count {
  color: #888;
  font-size: 11px;
}

.subtitle-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px 0;
}

.subtitle-list::-webkit-scrollbar {
  display: none;
}

.subtitle-list-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #666;
  font-size: 13px;
}

.subtitle-item {
  padding: 10px 16px;
  margin: 2px 0;
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
  color: #666;
  font-size: 10px;
  margin-bottom: 4px;
  font-family: monospace;
}

.subtitle-item.active .subtitle-time {
  color: #63e2b7;
}

.subtitle-text {
  color: #ccc;
  font-size: 13px;
  line-height: 1.5;
  word-wrap: break-word;
}

.subtitle-item.active .subtitle-text {
  color: #fff;
}
</style>