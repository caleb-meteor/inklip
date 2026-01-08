<script setup lang="ts">
import { NEllipsis, NButton, NIcon } from 'naive-ui'
import { TrashOutline } from '@vicons/ionicons5'
import VideoPreviewPlayer from './VideoPreviewPlayer.vue'
import VideoStatusOverlay from './VideoStatusOverlay.vue'

interface HistoryItem {
  id: number
  name: string
  status: 'processing' | 'completed' | 'failed'
  subtitle?: string | any // Can be array or string
  path?: string
  cover?: string
  duration?: number
  width?: number
  height?: number
  size?: string
  createTime: string
  imageError?: boolean
}

const props = defineProps<{
  item: HistoryItem
  isPlaying?: boolean
}>()

const emit = defineEmits<{
  (e: 'play', item: HistoryItem): void
  (e: 'export', item: HistoryItem): void
  (e: 'delete', item: HistoryItem): void
}>()

const getStatusText = (status: string): string => {
  switch (status) {
    case 'completed':
      return '已完成'
    case 'processing':
      return '待处理'
    case 'failed':
      return '生成失败'
    default:
      return '未知'
  }
}

const handleTogglePlay = (): void => {
  if (props.item.status === 'completed') {
    emit('play', props.item)
  }
}
</script>

<template>
  <div class="history-card-v" @click="handleTogglePlay">
    <!-- Top: 9:16 Icon Placeholder or Video Player -->
    <div class="card-top-thumbnail">
      <VideoPreviewPlayer
        :path="item.path"
        :cover="item.cover"
        :duration="item.duration"
        aspect-ratio="9/16"
        :disabled="item.status !== 'completed'"
        :subtitle-data="item.subtitle"
        @dblclick="handleTogglePlay"
      />
      <VideoStatusOverlay
        :status="item.status"
        failed-text="生成失败"
        :show-path-missing="!item.path"
      />
    </div>

    <!-- Bottom: Info Content -->
    <div class="card-bottom-content">
      <n-ellipsis class="v-item-name">{{ item.name }}</n-ellipsis>
      <div class="v-item-meta">
        <div class="meta-row status-row">
          <span class="label">状态</span>
          <span :class="['status-value', item.status]">
            {{ getStatusText(item.status) }}
          </span>
        </div>
        <div class="meta-row">
          <span class="label">大小</span>
          <span class="value">{{ item.size || '--' }}</span>
        </div>
        <div class="meta-row">
          <span class="label">日期</span>
          <span class="value">{{ item.createTime }}</span>
        </div>
      </div>
      <div class="v-item-actions">
        <div v-if="item.status === 'processing'" class="action-row">
          <n-button
            secondary
            disabled
            size="medium"
            style="width: 100%"
          >
            待处理...
          </n-button>
        </div>
        <div v-else class="action-row">
          <n-button
            v-if="item.status === 'completed'"
            secondary
            size="medium"
            style="flex: 1"
            @click.stop="emit('export', item)"
          >
            另存为
          </n-button>
          <n-button
            v-if="item.status === 'failed'"
            secondary
            disabled
            size="medium"
            style="flex: 1"
          >
            生成失败
          </n-button>
          <n-button
            type="error"
            size="medium"
            quaternary
            @click.stop="emit('delete', item)"
            style="min-width: 40px"
          >
            <template #icon>
              <n-icon><TrashOutline /></n-icon>
            </template>
          </n-button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.history-card-v {
  display: flex;
  flex-direction: column;
  background: #242424;
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid #333;
  transition: all 0.3s ease;
  width: 100%;
  position: relative;
  cursor: pointer;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.history-card-v:hover {
  border-color: #63e2b7;
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.card-top-thumbnail {
  width: 100%;
  aspect-ratio: 9 / 16;
  background: #1a1a1a;
  overflow: hidden;
  position: relative;
}

.card-bottom-content {
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.v-item-name {
  font-size: 14px;
  font-weight: 600;
  color: #fff;
}

.v-item-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.meta-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
}

.meta-row .label {
  color: #666;
}

.meta-row .value {
  color: #aaa;
}

.status-value {
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-value::before {
  content: '';
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.status-value.completed {
  color: #63e2b7;
}

.status-value.processing {
  color: #70c0e8;
}

.status-value.failed {
  color: #ff4d4f;
}

.v-item-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 2px;
}

.action-row {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
}
</style>
