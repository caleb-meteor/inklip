<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from 'vue'
import { FilmOutline, SyncOutline } from '@vicons/ionicons5'
import { NIcon } from 'naive-ui'
import { getMediaUrl } from '../utils/media'
import GlobalFullscreenPlayer from './GlobalFullscreenPlayer.vue'
import { useGlobalVideoPreview } from '../composables/useGlobalVideoPreview'

const props = defineProps<{
  path?: string
  cover?: string
  duration?: number
  aspectRatio?: string
  disabled?: boolean
  videoId?: number // Optional video ID for subtitle matching
  subtitleData?: any // Optional subtitle data (array) passed directly
}>()

const emit = defineEmits<{
  (e: 'dblclick'): void
}>()

const showFullscreen = ref(false)
const videoContainerRef = ref<HTMLElement | null>(null)
const isHovered = ref(false)
let hoverTimer: ReturnType<typeof setTimeout> | null = null
let leaveTimer: ReturnType<typeof setTimeout> | null = null

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
  if (!props.path || props.disabled) {
    return
  }
  e.stopPropagation()
  showFullscreen.value = true
  emit('dblclick')
}

const handleMouseEnter = (): void => {
  if (!props.path || props.disabled) return

  if (leaveTimer) {
    clearTimeout(leaveTimer)
    leaveTimer = null
  }

  isHovered.value = true

  if (hoverTimer) {
    clearTimeout(hoverTimer)
    hoverTimer = null
  }

  if (props.path && isCurrentlyPreviewing(props.path)) {
    if (videoContainerRef.value) {
      showPreview(props.path, videoContainerRef.value)
    }
    return
  }

  hoverTimer = setTimeout(() => {
    if (!props.path || !videoContainerRef.value) return

    if (hasError.value && isCurrentlyPreviewing(props.path)) {
      return
    }

    showPreview(props.path, videoContainerRef.value!)
    hoverTimer = null
  }, 1000)
}

const handleMouseLeave = (): void => {
  if (hoverTimer) {
    clearTimeout(hoverTimer)
    hoverTimer = null
    isHovered.value = false
    return
  }

  if (leaveTimer) clearTimeout(leaveTimer)

  leaveTimer = setTimeout(() => {
    isHovered.value = false
    if (props.path && isCurrentlyPreviewing(props.path)) {
      hidePreview()
    }
    leaveTimer = null
  }, 5000)
}

onBeforeUnmount(() => {
  if (hoverTimer) clearTimeout(hoverTimer)
  if (leaveTimer) clearTimeout(leaveTimer)
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
    <!-- Background Area: Cover Image -->
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

    <!-- Video Preview Overlay -->
    <div
      ref="videoContainerRef"
      class="video-preview-container"
      :class="{ active: isHovered && path && !disabled }"
      @mouseenter.stop
      @mouseleave.stop
    >
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

    <!-- Fullscreen Player -->
    <GlobalFullscreenPlayer
      v-if="showFullscreen"
      :visible="showFullscreen"
      :path="path || ''"
      :name="'视频播放'"
      :video-id="videoId"
      :subtitle-data="subtitleData"
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

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
