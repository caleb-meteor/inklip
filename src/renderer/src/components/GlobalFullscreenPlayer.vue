<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { CloseOutline, Play, Pause, VolumeHighOutline, VolumeMuteOutline } from '@vicons/ionicons5'
import { getMediaUrl } from '../utils/media'
import { NIcon, NPopselect, NModal } from 'naive-ui'

const props = defineProps<{
  visible: boolean
  path: string
  name: string
}>()

const emit = defineEmits(['close'])

const videoRef = ref<HTMLVideoElement | null>(null)
const isPlaying = ref(false)
const isMuted = ref(false)
const progress = ref(0)
const duration = ref(0)
const currentTime = ref(0)
const playbackSpeed = ref(1.0)
const isDragging = ref(false)

const speedOptions = [
  { label: '0.5x', value: 0.5 },
  { label: '1.0x', value: 1.0 },
  { label: '1.25x', value: 1.25 },
  { label: '1.5x', value: 1.5 },
  { label: '2.0x', value: 2.0 }
]

const togglePlay = (): void => {
  if (!videoRef.value) return
  if (videoRef.value.paused) {
    videoRef.value.play()
  } else {
    videoRef.value.pause()
  }
}

const toggleMute = (): void => {
  if (!videoRef.value) return
  isMuted.value = !isMuted.value
  videoRef.value.muted = isMuted.value
}

const onTimeUpdate = (): void => {
  if (!videoRef.value) return
  currentTime.value = videoRef.value.currentTime
  // Only update progress circle if not dragging
  if (!isDragging.value) {
    progress.value = (videoRef.value.currentTime / videoRef.value.duration) * 100
  }
}

const onLoadedMetadata = (): void => {
  if (!videoRef.value) return
  duration.value = videoRef.value.duration
}

const onSeek = (e: Event): void => {
  const val = Number((e.target as HTMLInputElement).value)
  progress.value = val // Update progress visually immediately

  if (!videoRef.value) return
  const time = (val / 100) * videoRef.value.duration
  if (!isNaN(time)) {
    videoRef.value.currentTime = time
  }
}

const onSeekStart = (): void => {
  isDragging.value = true
}

const onSeekEnd = (): void => {
  isDragging.value = false
}

const handleSpeedChange = (value: number): void => {
  playbackSpeed.value = value
  if (videoRef.value) {
    videoRef.value.playbackRate = value
  }
}

const formatTime = (seconds: number): string => {
  if (!seconds || isNaN(seconds)) return '00:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
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
          @mousedown.stop
          @click.stop
        ></video>
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
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
}

.main-video {
  max-width: 100%;
  max-height: 100%;
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
