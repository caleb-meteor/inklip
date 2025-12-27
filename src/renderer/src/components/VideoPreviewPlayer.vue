```
<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from 'vue'
import { FilmOutline, SyncOutline } from '@vicons/ionicons5'
import { NIcon } from 'naive-ui'
import { getMediaUrl } from '../utils/media'
import GlobalFullscreenPlayer from './GlobalFullscreenPlayer.vue'
import { useGlobalVideoPreview } from '../composables/useGlobalVideoPreview'

const props = defineProps<{
  path?: string
  name?: string
  cover?: string
  duration?: number
  aspectRatio?: string
  status?: 'processing' | 'completed' | 'failed'
  disabled?: boolean
  failedText?: string
}>()

const showFullscreen = ref(false)
const videoContainerRef = ref<HTMLElement | null>(null)
const isHovered = ref(false)
let hoverTimer: ReturnType<typeof setTimeout> | null = null
let leaveTimer: ReturnType<typeof setTimeout> | null = null

// Use global video preview
const { isLoading, hasError, showPreview, hidePreview, isCurrentlyPreviewing } =
  useGlobalVideoPreview()

const coverUrl = computed(() => getMediaUrl(props.cover))

const formatDuration = (seconds?: number): string => {
  if (!seconds) return ''
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

const handleDblClick = (e: MouseEvent): void => {
  // Prevent double click if path is missing
  if (!props.path) {
    console.warn('[VideoPreview] Action blocked: path is empty')
    return
  }

  if (props.path && (props.status === 'completed' || !props.status)) {
    e.stopPropagation()
    showFullscreen.value = true
  }
}

// Handle hover with delay
const handleMouseEnter = (): void => {
  // Prevent hover preview if path is missing
  if (!props.path) return

  const timestamp = new Date().toISOString().split('T')[1]
  console.log(`[${timestamp}] [VideoPreview] Mouse enter:`, props.path)

  // Clear pending leave timer if exists (user came back within 5s)
  if (leaveTimer) {
    console.log(`[${timestamp}] [VideoPreview] Cancelled pending leave timer`)
    clearTimeout(leaveTimer)
    leaveTimer = null
  }

  isHovered.value = true

  // Clear any existing hover timer
  if (hoverTimer) {
    clearTimeout(hoverTimer)
    hoverTimer = null
  }

  // Optimization: If global player is already previewing THIS video, show immediately
  if (props.path && isCurrentlyPreviewing(props.path)) {
    console.log(`[${timestamp}] [VideoPreview] Already previewing this video, resume immediately`)
    // Ensure container reference is up to date in global player if needed
    if (videoContainerRef.value) {
      showPreview(props.path, videoContainerRef.value)
    }
    return
  }

  // Set a 1-second delay before showing preview for new videos
  console.log(`[${timestamp}] [VideoPreview] Starting 1s timer for new preview`)
  hoverTimer = setTimeout(() => {
    if (!props.path || !videoContainerRef.value) return

    // Don't retry if previous load failed for this video
    if (hasError.value && isCurrentlyPreviewing(props.path)) {
      console.log('[VideoPreview] Skipping preview - previous load failed for this video')
      return
    }

    const showTimestamp = new Date().toISOString().split('T')[1]
    console.log(
      `[${showTimestamp}] [VideoPreview] 1s elapsed, requesting global preview for:`,
      props.path
    )

    // Request global video preview
    showPreview(props.path, videoContainerRef.value!)
    hoverTimer = null
  }, 1000)
}

const handleMouseLeave = (): void => {
  const timestamp = new Date().toISOString().split('T')[1]
  console.log(`[${timestamp}] [VideoPreview] Mouse leave`)

  // Clear the start timer if user leaves before 1 second
  if (hoverTimer) {
    console.log(`[${timestamp}] [VideoPreview] Cancelled start timer (left too early)`)
    clearTimeout(hoverTimer)
    hoverTimer = null
    isHovered.value = false // Hide loading state immediately if we never engaged
    return
  }

  // If we utilize leaveTimer, we keep isHovered = true for 5s
  console.log(`[${timestamp}] [VideoPreview] Starting 5s leave timer`)
  if (leaveTimer) clearTimeout(leaveTimer)

  leaveTimer = setTimeout(() => {
    const leaveTimestamp = new Date().toISOString().split('T')[1]
    console.log(`[${leaveTimestamp}] [VideoPreview] 5s leave timer elapsed, hiding preview`)

    isHovered.value = false

    // Hide preview if this component is currently showing it
    if (props.path && isCurrentlyPreviewing(props.path)) {
      hidePreview()
    }
    leaveTimer = null
  }, 5000)
}

// Cleanup on component unmount
onBeforeUnmount(() => {
  if (hoverTimer) clearTimeout(hoverTimer)
  if (leaveTimer) clearTimeout(leaveTimer)

  // Hide preview immediately if unmounted
  if (props.path && isCurrentlyPreviewing(props.path)) {
    hidePreview()
  }
})
</script>

<template>
  <div
    class="video-preview-player"
    :style="{ aspectRatio: aspectRatio || '9/16' }"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
    @dblclick="handleDblClick"
  >
    <!-- Background Area: Always present to keep DOM stable -->
    <div class="thumbnail-area">
      <img v-if="coverUrl" :src="coverUrl" class="video-cover" />
      <div v-else class="icon-placeholder-bg">
        <n-icon size="48" color="#444">
          <FilmOutline />
        </n-icon>
      </div>

      <!-- Duration Badge -->
      <div v-if="duration" class="v-duration-badge">
        {{ formatDuration(duration) }}
      </div>
    </div>

    <!-- Video Preview Overlay: Container for global video element -->
    <div
      ref="videoContainerRef"
      class="video-preview-container"
      :class="{ active: isHovered && (status === 'completed' || !status) }"
      @mouseenter.stop
      @mouseleave.stop
    >
      <!-- Global video element will be inserted here dynamically -->
      <Transition name="fade">
        <div
          v-if="isHovered && (!path || !isCurrentlyPreviewing(path) || isLoading)"
          class="loading-indicator"
        >
          <n-icon class="n-icon-spin" size="18">
            <SyncOutline />
          </n-icon>
        </div>
        <div v-else-if="path && isCurrentlyPreviewing(path) && !isLoading" class="preview-tag">
          预览中
        </div>
      </Transition>
    </div>

    <!-- Status Masks: Top Layer -->
    <!-- Processing State Mask -->
    <div
      v-if="status === 'processing'"
      class="status-overlay processing"
      @click.stop
      @dblclick.stop
    >
      <div class="status-label">待处理...</div>
    </div>

    <!-- Failed State Mask -->
    <div v-if="status === 'failed'" class="status-overlay failed" @click.stop @dblclick.stop>
      <div class="status-label">{{ failedText || '视频未解析' }}</div>
    </div>

    <!-- Path Missing Mask -->
    <div v-if="!path" class="status-overlay missing" @click.stop @dblclick.stop>
      <div class="status-label">视频不存在</div>
    </div>

    <!-- Local Fullscreen Player -->
    <GlobalFullscreenPlayer
      v-if="showFullscreen"
      :visible="showFullscreen"
      :path="path || ''"
      :name="name || '视频播放'"
      @close="showFullscreen = false"
    />
  </div>
</template>

<style scoped>
.video-preview-player {
  width: 100%;
  background: #1a1a1a;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  cursor: pointer;
  border-radius: inherit;
}

.video-preview-player:hover {
  z-index: 10;
}

.video-preview-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 2;
  background: transparent;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;
}

.video-preview-container.active {
  opacity: 1;
  pointer-events: auto;
}

.v-inline-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.preview-tag {
  position: absolute;
  top: 6px;
  left: 6px;
  background: rgba(99, 226, 183, 0.8);
  color: #000;
  font-size: 10px;
  padding: 1px 4px;
  border-radius: 3px;
  font-weight: bold;
  pointer-events: none;
}

.loading-indicator {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0, 0, 0, 0.7);
  color: #63e2b7;
  font-size: 12px;
  padding: 6px 12px;
  border-radius: 4px;
  font-weight: 500;
  pointer-events: none;
  z-index: 3;
}

.thumbnail-area {
  width: 100%;
  height: 100%;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
}

.video-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.icon-placeholder-bg {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1f1f1f 0%, #111 100%);
}

.v-duration-badge {
  position: absolute;
  bottom: 8px;
  right: 8px;
  background: rgba(0, 0, 0, 0.8);
  color: #fff;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  z-index: 6;
}

.status-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  backdrop-filter: blur(2px);
}

.status-overlay.processing {
  background: rgba(0, 0, 0, 0.6);
}

.status-overlay.failed,
.status-overlay.missing {
  background: rgba(0, 0, 0, 0.75);
}

.status-label {
  padding: 6px 16px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 1px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  border: 1px solid transparent;
}

.processing .status-label {
  color: #63e2b7;
  background: rgba(99, 226, 183, 0.1);
  border-color: rgba(99, 226, 183, 0.4);
}

.failed .status-label,
.missing .status-label {
  color: #ff4d4f;
  background: rgba(255, 77, 79, 0.1);
  border-color: rgba(255, 77, 79, 0.4);
}

/* Local fade for hover transition */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
