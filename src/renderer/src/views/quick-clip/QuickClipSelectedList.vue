<script setup lang="ts">
import { NIcon, NScrollbar, NButton, NSpin, NEmpty, NTooltip } from 'naive-ui'
import { ListOutline, RemoveOutline, TimeOutline, CloseOutline, PlayOutline, ArrowUpCircleOutline, FolderOpenOutline, TrashOutline } from '@vicons/ionicons5'
import { inject } from 'vue'

const qc = inject('quickClip') as any

const emit = defineEmits<{
  (e: 'apply-export', exportVideoId: number): void
}>()

function formatDate(s: string) {
  if (!s) return ''
  const d = new Date(s)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function openExportFolder(filePath: string) {
  window.api?.showItemInFolder(filePath)
}
</script>

<template>
  <div class="panel panel-selected">
    <div class="panel-header" style="justify-content: space-between;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <n-icon size="18"><ListOutline /></n-icon>
        <span>已选字幕</span>
        <span v-if="qc.selectedSegments.length > 0" class="total-duration">总时长 {{ qc.formatTime(qc.selectedTotalDurationSeconds) }}</span>
      </div>
      <div style="display: flex; align-items: center; gap: 6px;">
        <n-button
          v-show="qc.selectedSegmentIndexes.size > 0 && !qc.isPreviewPlaying"
          size="tiny"
          type="error"
          @click="qc.removeSelectedSegments"
        >
          删除 ({{ qc.selectedSegmentIndexes.size }})
        </n-button>
        <n-button
          size="tiny"
          type="default"
          :disabled="!qc.selectedWorkspaceId"
          :loading="qc.loadingExportHistory"
          @click="qc.loadExportHistory"
        >
          <template #icon>
            <n-icon size="14"><TimeOutline /></n-icon>
          </template>
        </n-button>
      </div>
    </div>
    <div class="panel-body-split">
      <!-- 上：已选字幕列表 -->
      <div class="panel-section panel-section-top">
        <n-scrollbar>
          <div
            v-if="qc.selectedSegments.length === 0"
            class="panel-empty"
            @dragover.prevent
            @drop.prevent="!qc.isPreviewPlaying && qc.onListDrop($event)"
          >从左侧字幕点击或拖拽添加</div>
          <div
            v-else
            class="selected-list"
            @dragenter.prevent
            @dragover.prevent="!qc.isPreviewPlaying && qc.onListDragOver($event)"
            @drop.prevent="!qc.isPreviewPlaying && qc.onListDrop($event)"
          >
            <template v-for="row in qc.displayRowsForSelected" :key="row.type === 'placeholder' ? `ph-${row.insertIndex}` : `sel-${row.index}-${qc.getSegmentKey(row.seg)}`">
              <div
                v-if="row.type === 'placeholder'"
                class="selected-row selected-row-placeholder"
                @dragover.prevent.stop="!qc.isPreviewPlaying && qc.onDragOverPlaceholder(row.insertIndex, $event)"
                @drop.prevent.stop="!qc.isPreviewPlaying && qc.onDropAtInsertIndex(row.insertIndex, $event)"
              >
                <span class="placeholder-hint">放置到此处</span>
              </div>
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
                @drop.prevent.stop="!qc.isPreviewPlaying && qc.onDrop($event, row.index)"
                @dragend="qc.onDragEnd"
              >
                <div class="selected-content">
                  <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                    <span class="selected-time">{{ qc.formatTime(row.seg.fromS) }} - {{ qc.formatTime(row.seg.toS) }}</span>
                    <span class="selected-video">{{ row.seg.videoName }}</span>
                  </div>
                  <span class="selected-text" :title="row.seg.text">{{ row.seg.text }}</span>
                </div>
                <n-button quaternary size="tiny" type="info" title="播放" @click.stop="qc.playSourceSegment(row.seg)">
                  <n-icon><PlayOutline /></n-icon>
                </n-button>
                <n-button quaternary size="tiny" type="error" v-show="!qc.isPreviewPlaying" @click.stop="qc.removeSegment(row.index)">
                  <n-icon><RemoveOutline /></n-icon>
                </n-button>
              </div>
            </template>
          </div>
        </n-scrollbar>
      </div>
      <!-- 下：导出历史（点击「查看导出历史」后显示） -->
      <div v-show="qc.showExportHistoryModal" class="panel-section panel-section-bottom">
        <div class="export-history-header">
          <span class="export-history-title">导出历史</span>
          <n-button quaternary size="tiny" @click="qc.showExportHistoryModal = false">
            <n-icon size="14"><CloseOutline /></n-icon>
            关闭
          </n-button>
        </div>
        <n-scrollbar class="export-history-scroll">
          <n-spin :show="qc.loadingExportHistory">
            <div v-if="qc.exportHistoryList.length === 0 && !qc.loadingExportHistory" class="export-history-empty">
              <n-empty description="暂无导出记录" size="small" />
            </div>
            <div v-else class="export-history-list">
              <div
                v-for="item in qc.exportHistoryList"
                :key="item.id"
                class="export-history-item"
              >
                <div class="export-history-item-content">
                  <span class="export-history-name" :title="item.suggested_name">{{ item.suggested_name }}</span>
                  <span class="export-history-meta">{{ item.segment_count }} 段 · {{ formatDate(item.created_at) }}</span>
                </div>
                <div class="export-history-actions">
                  <n-tooltip v-if="item.output_path" placement="top" trigger="hover">
                    <template #trigger>
                      <n-button
                        class="export-history-btn"
                        quaternary
                        size="tiny"
                        @click.stop="openExportFolder(item.output_path)"
                      >
                        <n-icon size="14"><FolderOpenOutline /></n-icon>
                      </n-button>
                    </template>
                    打开所在文件夹
                  </n-tooltip>
                  <n-tooltip placement="top" trigger="hover">
                    <template #trigger>
                      <n-button class="export-history-btn" quaternary size="tiny" type="primary" @click.stop="emit('apply-export', item.id)">
                        <n-icon size="14"><ArrowUpCircleOutline /></n-icon>
                      </n-button>
                    </template>
                    引用此记录中的字幕
                  </n-tooltip>
                <n-tooltip placement="top" trigger="hover">
                  <template #trigger>
                    <n-button
                      class="export-history-btn"
                      quaternary
                      size="tiny"
                      type="error"
                      @click.stop="qc.deleteExportHistory(item.id)"
                    >
                      <n-icon size="14"><TrashOutline /></n-icon>
                    </n-button>
                  </template>
                  删除该导出记录
                </n-tooltip>
                </div>
              </div>
            </div>
          </n-spin>
        </n-scrollbar>
      </div>
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
.total-duration {
  font-size: 12px;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.5);
}
.panel-body-split {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.panel-section {
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.panel-section-top {
  flex: 1;
}
.panel-section-bottom {
  flex-shrink: 0;
  max-height: 45%;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  flex-direction: column;
}
.export-history-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.7);
  background: rgba(0, 0, 0, 0.15);
}
.export-history-title {
  display: flex;
  align-items: center;
  gap: 6px;
}
.export-history-scroll {
  flex: 1;
  min-height: 0;
}
.export-history-empty {
  padding: 16px;
  text-align: center;
}
.export-history-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
}
.export-history-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  transition: background 0.2s;
}
.export-history-item:hover {
  background: rgba(255, 255, 255, 0.08);
}
.export-history-item-content {
  flex: 1;
  min-width: 0;
}
.export-history-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}
.export-history-actions .export-history-btn {
  min-width: 0;
  padding: 2px 4px;
  height: 24px;
  opacity: 0.7;
  transition: opacity 0.2s ease;
}
.export-history-actions .export-history-btn .n-icon {
  font-size: 14px;
}
.export-history-item:hover .export-history-actions .export-history-btn {
  opacity: 1;
}
.export-history-name {
  display: block;
  font-size: 12px;
  color: #f5f5f7;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.export-history-meta {
  display: block;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 2px;
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
