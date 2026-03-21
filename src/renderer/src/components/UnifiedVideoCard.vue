<script setup lang="ts">
import { computed } from 'vue'
import { NEllipsis } from 'naive-ui'
import UnifiedVideoPreview from './UnifiedVideoPreview.vue'
import { normalizeVideo, type UnifiedVideoSource } from '../utils/unifiedVideo'
import type { VideoParseProgress } from '../stores/realtime'

const props = withDefaults(
  defineProps<{
    video: UnifiedVideoSource
    videoType?: 'material' | 'edited'
    selected?: boolean
    aspectRatio?: string
    parseProgress?: VideoParseProgress | null
  }>(),
  {
    videoType: 'material',
    selected: false,
    aspectRatio: '9/16'
  }
)

const emit = defineEmits<{
  (e: 'select', video: UnifiedVideoSource): void
  (e: 'open', video: UnifiedVideoSource): void
  (e: 'contextMenu', event: MouseEvent, video: UnifiedVideoSource): void
}>()

const normalized = computed(() => normalizeVideo(props.video, props.videoType))
const hasPath = computed(() => !!normalized.value.path)
// 仅在成功完成状态下视为已删除（用于样式和 overlay）
const isDeleted = computed(() => !hasPath.value && normalized.value.displayStatus === 'completed')

const handleClick = () => {
  if (hasPath.value) emit('select', props.video)
}

const handleDblClick = () => {
  if (hasPath.value) emit('open', props.video)
}

const handleContextMenu = (e: MouseEvent) => {
  if (hasPath.value) emit('contextMenu', e, props.video)
}
</script>

<template>
  <div
    class="unified-video-card"
    :class="{ selected: props.selected, 'is-deleted': isDeleted }"
    @click="handleClick"
    @dblclick="handleDblClick"
    @contextmenu="handleContextMenu"
  >
    <div class="card-preview">
      <UnifiedVideoPreview
        :video="props.video"
        :video-type="props.videoType"
        :aspect-ratio="props.aspectRatio"
        :parse-progress="props.parseProgress"
        @dblclick="handleDblClick"
      />
    </div>
    <n-ellipsis class="card-name" style="max-width: 100%">
      {{ (video as any).name ?? (video as any).filename ?? '' }}
    </n-ellipsis>
  </div>
</template>

<style scoped>
.unified-video-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  padding: 10px;
  border-radius: 6px;
  border: 1px solid transparent;
  width: 100%;
  max-width: 225px;
}

.unified-video-card:hover {
  background: rgba(255, 255, 255, 0.05);
}

.unified-video-card.selected {
  background: rgba(99, 226, 183, 0.15);
  border-color: rgba(99, 226, 183, 0.5);
}

.unified-video-card.is-deleted {
  cursor: default;
}

.unified-video-card.is-deleted:hover {
  background: transparent;
}

.card-preview {
  width: 100%;
  border-radius: 4px;
  overflow: hidden;
  position: relative;
  background: #000;
  aspect-ratio: 9/16;
}

.card-name {
  margin-top: 8px;
  font-size: 13px;
  color: #e4e4e7;
}
</style>
