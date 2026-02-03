<script setup lang="ts">
import { NIcon, NEllipsis } from 'naive-ui'
import { FolderOutline, PersonOutline, CubeOutline } from '@vicons/ionicons5'
import VideoPreviewPlayer from './VideoPreviewPlayer.vue'
import VideoStatusOverlay from './VideoStatusOverlay.vue'
import type { FileItem } from '../types/video'
import type { DictItem } from '../api/dict'
import type { VideoParseProgress } from '../stores/websocket'

interface Props {
  file: FileItem
  selected?: boolean
  group?: DictItem | null
  anchor?: DictItem | null
  product?: DictItem | null
  aspectRatio: string
  videoStatus: 'processing' | 'completed' | 'failed' | 'pending' | undefined
  videoProgress?: VideoParseProgress
  videoType?: 'material' | 'edited'
}

const props = withDefaults(defineProps<Props>(), {
  selected: false,
  videoType: 'material'
})

const emit = defineEmits<{
  select: [file: FileItem]
  open: [file: FileItem]
  contextMenu: [event: MouseEvent, file: FileItem]
}>()
</script>

<template>
  <div
    class="file-item"
    :class="{ selected: props.selected }"
    @click="emit('select', props.file)"
    @dblclick="emit('open', props.file)"
    @contextmenu="emit('contextMenu', $event, props.file)"
  >
    <div class="icon-wrapper">
      <div class="cover-wrapper">
        <VideoPreviewPlayer
          :path="props.file.path"
          :cover="props.file.cover"
          :duration="props.file.duration"
          :aspect-ratio="props.aspectRatio"
          :disabled="props.videoStatus !== 'completed'"
          :video-id="props.file.id"
          :video-type="props.videoType"
          @dblclick="emit('open', props.file)"
        />
        <VideoStatusOverlay
          :status="props.videoStatus"
          :parse-progress="props.videoProgress"
          :show-path-missing="!props.file.path"
          :video-status="props.file.status"
        />
        <div class="video-badges">
          <div v-if="props.group" class="video-badge video-badge-group">
            <n-icon size="12"><FolderOutline /></n-icon>
            <span>{{ props.group.name }}</span>
          </div>
          <div v-if="props.anchor" class="video-badge video-badge-anchor">
            <n-icon size="12"><PersonOutline /></n-icon>
            <span>{{ props.anchor.name }}</span>
          </div>
          <div v-if="props.product" class="video-badge video-badge-product">
            <n-icon size="12"><CubeOutline /></n-icon>
            <span>{{ props.product.name }}</span>
          </div>
        </div>
      </div>
    </div>
    <n-ellipsis style="max-width: 100px; margin-top: 8px">{{ props.file.name }}</n-ellipsis>
    <div class="file-meta">{{ props.file.size }}</div>
  </div>
</template>

<style scoped>
.file-item {
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

.file-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.file-item.selected {
  background: rgba(99, 226, 183, 0.15);
  border-color: rgba(99, 226, 183, 0.5);
}

.icon-wrapper {
  margin-bottom: 4px;
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 80px;
}

.cover-wrapper {
  width: 100%;
  border-radius: 4px;
  overflow: hidden;
  position: relative;
  background: #000;
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

.video-badge span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-meta {
  font-size: 0.8rem;
  color: #888;
}
</style>
