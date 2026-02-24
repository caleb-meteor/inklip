<script setup lang="ts">
import { computed, ref } from 'vue'
import VideoPreviewPlayer from './VideoPreviewPlayer.vue'
import VideoStatusOverlay from './VideoStatusOverlay.vue'
import {
  normalizeVideo,
  type UnifiedVideoSource,
  type NormalizedVideo,
  type VideoDisplayStatus
} from '../utils/unifiedVideo'
import type { VideoParseProgress } from '../stores/realtime'
import { useRealtimeStore } from '../stores/realtime'

const props = withDefaults(
  defineProps<{
    video: UnifiedVideoSource
    videoType?: 'material' | 'edited'
    aspectRatio?: string
    disabled?: boolean
    showOverlay?: boolean
    parseProgress?: VideoParseProgress | null
  }>(),
  {
    videoType: 'material',
    aspectRatio: '9/16',
    disabled: false,
    showOverlay: true
  }
)

const emit = defineEmits<{
  (e: 'dblclick'): void
}>()

const rtStore = useRealtimeStore()

const normalized = computed<NormalizedVideo>(() => normalizeVideo(props.video, props.videoType))

const videoId = computed(() => normalized.value.id)
const parseProgress = computed(() => {
  if (props.parseProgress) return props.parseProgress
  if (normalized.value.videoType === 'material' && videoId.value) {
    return rtStore.getVideoProgress(videoId.value)
  }
  return undefined
})

const overlayStatus = computed<VideoDisplayStatus | undefined>(() =>
  props.showOverlay ? normalized.value.displayStatus : undefined
)

const isDeleted = computed(() => !normalized.value.path)

// 仅在成功完成状态下显示「已删除」，处理中/等待/失败时不显示
const showPathMissing = computed(() => {
  if (normalized.value.path) return false
  return overlayStatus.value === 'completed'
})

const playerRef = ref<InstanceType<typeof VideoPreviewPlayer> | null>(null)

defineExpose({
  playAtTime: (startTime: number, endTime?: number) =>
    playerRef.value?.playAtTime?.(startTime, endTime)
})
</script>

<template>
  <div class="unified-video-preview">
    <VideoPreviewPlayer
      ref="playerRef"
      :path="normalized.path"
      :cover="normalized.cover"
      :duration="isDeleted ? 0 : normalized.duration"
      :aspect-ratio="aspectRatio"
      :disabled="disabled || isDeleted || normalized.displayStatus !== 'completed'"
      :video-id="videoId"
      :video-type="normalized.videoType"
      :subtitle-data="normalized.subtitle"
      :show-deleted-overlay="showPathMissing"
      @dblclick="emit('dblclick')"
    />
    <VideoStatusOverlay
      v-if="showOverlay"
      :status="overlayStatus"
      :parse-progress="parseProgress"
      :show-path-missing="showPathMissing"
      :video-status="(props.video as any)?.status"
    />
  </div>
</template>

<style scoped>
.unified-video-preview {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: inherit;
}
</style>
