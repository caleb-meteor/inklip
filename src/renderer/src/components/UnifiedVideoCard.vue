<script setup lang="ts">
import { computed } from 'vue'
import { NIcon, NEllipsis } from 'naive-ui'
import { FolderOutline, PersonOutline, CubeOutline } from '@vicons/ionicons5'
import UnifiedVideoPreview from './UnifiedVideoPreview.vue'
import { normalizeVideo, type UnifiedVideoSource } from '../utils/unifiedVideo'
import type { DictItem } from '../api/dict'
import type { VideoParseProgress } from '../stores/realtime'

const props = withDefaults(
  defineProps<{
    video: UnifiedVideoSource
    videoType?: 'material' | 'edited'
    selected?: boolean
    aspectRatio?: string
    showBadges?: boolean
    group?: DictItem | null
    anchor?: DictItem | null
    product?: DictItem | null
    parseProgress?: VideoParseProgress | null
  }>(),
  {
    videoType: 'material',
    selected: false,
    aspectRatio: '9/16',
    showBadges: false
  }
)

const emit = defineEmits<{
  (e: 'select', video: UnifiedVideoSource): void
  (e: 'open', video: UnifiedVideoSource): void
  (e: 'contextMenu', event: MouseEvent, video: UnifiedVideoSource): void
}>()

const isDeleted = computed(() => !normalizeVideo(props.video, props.videoType).path)

const handleClick = () => {
  if (!isDeleted.value) emit('select', props.video)
}

const handleDblClick = () => {
  if (!isDeleted.value) emit('open', props.video)
}

const handleContextMenu = (e: MouseEvent) => {
  if (!isDeleted.value) emit('contextMenu', e, props.video)
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
      <div v-if="showBadges && (group || anchor || product)" class="video-badges">
        <div v-if="group" class="video-badge video-badge-group">
          <n-icon size="12"><FolderOutline /></n-icon>
          <span>{{ group.name }}</span>
        </div>
        <div v-if="anchor" class="video-badge video-badge-anchor">
          <n-icon size="12"><PersonOutline /></n-icon>
          <span>{{ anchor.name }}</span>
        </div>
        <div v-if="product" class="video-badge video-badge-product">
          <n-icon size="12"><CubeOutline /></n-icon>
          <span>{{ product.name }}</span>
        </div>
      </div>
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

.video-badges {
  position: absolute;
  top: 6px;
  right: 6px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  z-index: 10;
  pointer-events: none;
}

.video-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  border-radius: 4px;
  font-size: 11px;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.video-badge-group {
  color: #63e2b7;
}

.video-badge-anchor {
  color: #5dade2;
}

.video-badge-product {
  color: #f39c12;
}

.video-badge .n-icon {
  font-size: 12px;
  flex-shrink: 0;
}
</style>
