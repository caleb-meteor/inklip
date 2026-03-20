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
const { previewIsPlaying, isCurrentlyPreviewing, pauseCurrentPreviewPlayback, resumeCurrentPreviewPlayback } =
  useGlobalVideoPreview()

const videoForPreview = computed(() => props.displayVideo ?? props.video)
const videoPath = computed(() => normalizeVideo(videoForPreview.value, 'material').path || '')

/** 当前卡片对应视频正在全局预览中且处于播放状态 */
const isThisPreviewPlaying = computed(
  () => !!videoPath.value && isCurrentlyPreviewing(videoPath.value) && previewIsPlaying.value
)

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
    <div class="video-op-card">
      <UnifiedVideoPreview
        ref="previewRef"
        :video="videoForPreview"
        video-type="material"
        aspect-ratio="9/16"
        :show-overlay="true"
        :hide-pending-processing="true"
        :allow-play-when-pending="true"
      />
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
