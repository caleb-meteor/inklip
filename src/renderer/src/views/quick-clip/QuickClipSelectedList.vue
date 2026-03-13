<script setup lang="ts">
import { NIcon, NScrollbar, NButton } from 'naive-ui'
import { ListOutline, RemoveOutline } from '@vicons/ionicons5'
import { inject } from 'vue'

const qc = inject('quickClip') as any
</script>

<template>
  <div class="panel panel-selected">
    <div class="panel-header" style="justify-content: space-between;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <n-icon size="18"><ListOutline /></n-icon>
        <span>选择的字幕</span>
      </div>
      <n-button
        v-show="qc.selectedSegmentIndexes.size > 0 && !qc.isPreviewPlaying"
        size="tiny"
        type="error"
        @click="qc.removeSelectedSegments"
      >
        删除选中 ({{ qc.selectedSegmentIndexes.size }})
      </n-button>
    </div>
    <div class="subtitle-panel-body">
      <n-scrollbar>
        <div v-if="qc.selectedSegments.length === 0" class="panel-empty">从左侧字幕点击添加</div>
        <div
          v-else
          class="selected-list"
          @dragenter.prevent
          @dragover.prevent="!qc.isPreviewPlaying && qc.onListDragOver()"
          @drop="!qc.isPreviewPlaying && qc.onListDrop()"
        >
          <template v-for="row in qc.displayRowsForSelected" :key="row.type === 'placeholder' ? `ph-${row.insertIndex}` : `sel-${row.index}-${row.seg.videoId}-${row.seg.segmentIndex}`">
            <!-- 虚拟占位条：拖拽时在插入位置显示，把下面的项挤下去 -->
            <div
              v-if="row.type === 'placeholder'"
              class="selected-row selected-row-placeholder"
              @dragover.prevent.stop="!qc.isPreviewPlaying && qc.onDragOverPlaceholder(row.insertIndex)"
              @drop.prevent.stop="!qc.isPreviewPlaying && qc.onDropAtInsertIndex(row.insertIndex)"
            >
              <span class="placeholder-hint">放置到此处</span>
            </div>
            <!-- 字幕行 -->
            <div
              v-else
              class="selected-row"
              :class="{
                'is-selected': qc.selectedSegmentIndexes.has(row.index),
                'is-dragging': qc.draggedIndexes.includes(row.index)
              }"
              :draggable="!qc.isPreviewPlaying"
              @click="!qc.isPreviewPlaying && qc.toggleSegmentSelection(row.index, $event)"
              @dragstart="!qc.isPreviewPlaying && qc.onDragStart($event, row.index)"
              @dragenter.prevent
              @dragover.prevent.stop="!qc.isPreviewPlaying && qc.onDragOver($event, row.index)"
              @drop.stop="!qc.isPreviewPlaying && qc.onDrop($event, row.index)"
              @dragend="qc.onDragEnd"
            >
              <div class="selected-content">
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                  <span class="selected-time">{{ qc.formatTime(row.seg.fromS) }} - {{ qc.formatTime(row.seg.toS) }}</span>
                  <span class="selected-video">{{ row.seg.videoName }}</span>
                </div>
                <span class="selected-text" :title="row.seg.text">{{ row.seg.text }}</span>
              </div>
              <n-button quaternary size="tiny" type="error" v-show="!qc.isPreviewPlaying" @click.stop="qc.removeSegment(row.index)">
                <n-icon><RemoveOutline /></n-icon>
              </n-button>
            </div>
          </template>
        </div>
      </n-scrollbar>
    </div>
  </div>
</template>

<style scoped>
.panel {
  background: rgba(24, 24, 28, 0.95);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}
.panel-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  font-weight: 600;
  font-size: 13px;
  color: #f5f5f7;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.subtitle-panel-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.panel-empty {
  padding: 24px;
  text-align: center;
  color: rgba(255, 255, 255, 0.45);
  font-size: 13px;
}
.selected-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
  flex: 1;
}
.selected-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 6px;
  background: rgba(79, 172, 254, 0.08);
  border: 1px solid rgba(79, 172, 254, 0.2);
  cursor: grab;
  transition: background 0.15s ease, border-color 0.15s ease;
  user-select: none;
}
.selected-row.is-selected {
  background: rgba(79, 172, 254, 0.2);
  border-color: rgba(79, 172, 254, 0.5);
}
.selected-row:active {
  cursor: grabbing;
}
.selected-row.is-dragging {
  opacity: 0.6;
  background: rgba(79, 172, 254, 0.15);
  transform: scale(0.98);
  will-change: transform;
  transition: none;
}
.selected-row.is-dragover-top,
.selected-row.is-dragover-bottom {
  transition: none;
}
.selected-row.is-dragover-top {
  border-top: 2px solid #4facfe;
  background: rgba(79, 172, 254, 0.12);
}
.selected-row.is-dragover-bottom {
  border-bottom: 2px solid #4facfe;
  background: rgba(79, 172, 254, 0.12);
}
.selected-row-placeholder {
  min-height: 36px;
  border: 2px dashed rgba(79, 172, 254, 0.5);
  background: rgba(79, 172, 254, 0.06);
  cursor: default;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
}
.selected-row-placeholder .placeholder-hint {
  font-size: 12px;
  color: rgba(79, 172, 254, 0.7);
}
.selected-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.selected-time {
  font-size: 11px;
  color: #4facfe;
  font-family: monospace;
}
.selected-text {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.9);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.selected-video {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.45);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: right;
}
</style>
