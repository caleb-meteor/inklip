<script setup lang="ts">
import { ref, computed } from 'vue'
import { NButton, NIcon } from 'naive-ui'
import { PlayCircleOutline, PauseCircleOutline } from '@vicons/ionicons5'
import UnifiedVideoPreview from '../UnifiedVideoPreview.vue'
import { normalizeVideo, type UnifiedVideoSource } from '../../utils/unifiedVideo'
import { useGlobalVideoPreview } from '../../composables/useGlobalVideoPreview'

const props = withDefaults(
  defineProps<{
    video: UnifiedVideoSource
    /** 展示用视频（如带实时封面的），不传则用 video */
    displayVideo?: UnifiedVideoSource | null
  }>(),
  { displayVideo: null }
)

const emit = defineEmits<{
  (e: 'play'): void
}>()

const previewRef = ref<InstanceType<typeof UnifiedVideoPreview> | null>(null)
const {
  previewIsPlaying,
  isCurrentlyPreviewing,
  pauseCurrentPreviewPlayback,
  resumeCurrentPreviewPlayback
} = useGlobalVideoPreview()

const videoForPreview = computed(() => props.displayVideo ?? props.video)
const videoPath = computed(() => normalizeVideo(videoForPreview.value, 'material').path || '')

/** 当前卡片对应视频正在全局预览中且处于播放状态 */
const isThisPreviewPlaying = computed(
  () => !!videoPath.value && isCurrentlyPreviewing(videoPath.value) && previewIsPlaying.value
)

/** 无封面占位时才有扫光/角标等装饰；有封面则只保留封面 + 播放按钮 */
const thumbnailPlaceholder = ref(true)

function onThumbnailPlaceholder(v: boolean) {
  thumbnailPlaceholder.value = v
}

const showIdleDecor = computed(() => {
  const path = videoPath.value
  if (!path) return true
  if (isCurrentlyPreviewing(path)) return false
  return thumbnailPlaceholder.value
})

function handleToggle() {
  const path = videoPath.value
  if (!path) return

  if (isCurrentlyPreviewing(path) && previewIsPlaying.value) {
    pauseCurrentPreviewPlayback()
    return
  }
  if (isCurrentlyPreviewing(path) && !previewIsPlaying.value) {
    resumeCurrentPreviewPlayback()
    emit('play')
    return
  }
  // 不传 startTime：不强制从片头 0 秒开始
  previewRef.value?.playAtTime?.()
  emit('play')
}

defineExpose({
  playAtTime: (startTime?: number, endTime?: number) =>
    previewRef.value?.playAtTime?.(startTime, endTime)
})
</script>

<template>
  <div class="video-op-card-wrap">
    <div class="video-op-card" :class="{ 'video-op-card--placeholder': showIdleDecor }">
      <UnifiedVideoPreview
        ref="previewRef"
        :video="videoForPreview"
        video-type="material"
        aspect-ratio="9/16"
        :show-overlay="true"
        :hide-pending-processing="true"
        :allow-play-when-pending="true"
        @thumbnail-placeholder="onThumbnailPlaceholder"
      />
      <div v-if="showIdleDecor" class="card-idle-layer" aria-hidden="true">
        <div class="card-idle-shimmer" />
        <div class="card-idle-corners">
          <span class="card-idle-corner card-idle-corner--tl" />
          <span class="card-idle-corner card-idle-corner--tr" />
          <span class="card-idle-corner card-idle-corner--bl" />
          <span class="card-idle-corner card-idle-corner--br" />
        </div>
      </div>
    </div>
    <n-button type="primary" size="medium" class="play-btn" @click.stop="handleToggle">
      <n-icon size="18" class="play-btn-icon">
        <PauseCircleOutline v-if="isThisPreviewPlaying" />
        <PlayCircleOutline v-else />
      </n-icon>
      {{ isThisPreviewPlaying ? '暂停' : '点击播放' }}
    </n-button>
  </div>
</template>

<style scoped>
.video-op-card-wrap {
  flex-shrink: 0;
  width: 160px;
}

.video-op-card {
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  background: var(--ev-c-black-mute, #282828);
  aspect-ratio: 9/16;
}

.video-op-card--placeholder {
  background: linear-gradient(145deg, #242428 0%, #18181c 48%, #121214 100%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    inset 0 -1px 0 rgba(0, 0, 0, 0.35);
}

/* 无封面占位：渐变 + 中央弱光，避免纯灰底 + 单图标 */
.video-op-card--placeholder :deep(.icon-placeholder-bg) {
  background:
    radial-gradient(ellipse 85% 65% at 50% 38%, rgba(99, 226, 183, 0.14) 0%, transparent 58%),
    radial-gradient(ellipse 70% 50% at 80% 85%, rgba(120, 100, 200, 0.08) 0%, transparent 45%),
    linear-gradient(155deg, #2a2633 0%, #1a1822 42%, #101018 100%);
}

.video-op-card--placeholder :deep(.icon-placeholder-bg .n-icon) {
  color: rgba(200, 190, 225, 0.42) !important;
  filter: drop-shadow(0 0 18px rgba(99, 226, 183, 0.22));
}

.card-idle-layer {
  position: absolute;
  inset: 0;
  z-index: 4;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.card-idle-shimmer {
  position: absolute;
  inset: -40% -60%;
  background: linear-gradient(
    115deg,
    transparent 35%,
    rgba(255, 255, 255, 0.04) 48%,
    rgba(255, 255, 255, 0.07) 50%,
    rgba(255, 255, 255, 0.04) 52%,
    transparent 65%
  );
  /* 避开底部时长角标区域 */
  mask-image: linear-gradient(to bottom, black 0%, black 58%, transparent 88%);
  animation: card-idle-shimmer-move 5.5s ease-in-out infinite;
}

@keyframes card-idle-shimmer-move {
  0%,
  100% {
    transform: translate(-8%, 0) rotate(0deg);
    opacity: 0.35;
  }
  50% {
    transform: translate(8%, 4%) rotate(0deg);
    opacity: 0.65;
  }
}

.card-idle-corners {
  position: absolute;
  inset: 7px;
  pointer-events: none;
}

.card-idle-corner {
  position: absolute;
  width: 16px;
  height: 16px;
  border-color: rgba(255, 255, 255, 0.14);
  opacity: 0.85;
}

.card-idle-corner--tl {
  top: 0;
  left: 0;
  border-top: 1px solid;
  border-left: 1px solid;
  border-radius: 3px 0 0 0;
}

.card-idle-corner--tr {
  top: 0;
  right: 0;
  border-top: 1px solid;
  border-right: 1px solid;
  border-radius: 0 3px 0 0;
}

.card-idle-corner--bl {
  bottom: 0;
  left: 0;
  border-bottom: 1px solid;
  border-left: 1px solid;
  border-radius: 0 0 0 3px;
}

.card-idle-corner--br {
  bottom: 0;
  right: 0;
  border-bottom: 1px solid;
  border-right: 1px solid;
  border-radius: 0 0 3px 0;
}

.play-btn {
  margin-top: 10px;
  width: 100%;
  height: 36px;
  font-weight: 500;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.play-btn-icon {
  flex-shrink: 0;
}
</style>
