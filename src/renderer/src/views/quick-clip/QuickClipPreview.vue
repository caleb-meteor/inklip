<script setup lang="ts">
import { ref, inject } from 'vue'
import { NIcon, NButton, NModal, NInput } from 'naive-ui'
import { PlayOutline, DownloadOutline } from '@vicons/ionicons5'

const qc = inject('quickClip') as any

const showExportNameModal = ref(false)
/** 仅文件名（不含 .mp4），导出时自动追加 .mp4 */
const exportFileName = ref('')

function openExportModal() {
  if (qc.selectedSegments.length === 0) return
  exportFileName.value = `inklip_merged_${Date.now()}`
  showExportNameModal.value = true
}

function confirmExport() {
  const name = exportFileName.value.trim()
  showExportNameModal.value = false
  if (name) qc.handleExportSegments(name + '.mp4')
}

</script>

<template>
  <div class="panel panel-preview">
    <div class="panel-header">
      <n-icon size="18"><PlayOutline /></n-icon>
      <span>视频播放区</span>
    </div>
    <div class="panel-body preview-body">
      <div class="preview-video-wrap" :class="{ 'is-playing': qc.isPreviewPlaying || qc.playingSourceSegment }">
        <video
          v-show="!qc.playingSourceSegment"
          :ref="(el) => { if (el) qc.previewVideoRef = el }"
          class="preview-video"
          @timeupdate="qc.onPreviewTimeUpdate"
          @ended="qc.playNextSegment"
        />
        <video
          v-show="qc.playingSourceSegment"
          :ref="(el) => { if (el) qc.sourceSegmentVideoRef = el }"
          class="preview-video"
          controls
          preload="auto"
        />
        <div v-show="!qc.playingSourceSegment" class="preview-overlay"></div>
      </div>
      <n-button
        type="primary"
        block
        :disabled="qc.selectedSegments.length === 0"
        @click="qc.startPreview"
      >
        <template #icon>
          <n-icon><PlayOutline /></n-icon>
        </template>
        {{ qc.isPreviewPlaying ? '停止播放' : '按选择顺序播放' }}
      </n-button>
      <n-button
        type="info"
        block
        :disabled="qc.selectedSegments.length === 0"
        :loading="qc.isExporting"
        @click="openExportModal"
      >
        <template #icon>
          <n-icon><DownloadOutline /></n-icon>
        </template>
        导出所选片段
      </n-button>
    </div>

    <n-modal
      :show="showExportNameModal"
      title="导出视频"
      preset="dialog"
      positive-text="导出"
      negative-text="取消"
      :loading="qc.isExporting"
      @positive-click="confirmExport"
      @update:show="(v: boolean) => { showExportNameModal = v }"
    >
      <div class="export-name-form">
        <div class="export-name-input-wrap">
          <n-input
            v-model:value="exportFileName"
            placeholder="输入导出文件名（无需加 .mp4）"
            maxlength="200"
            show-count
            @keydown.enter.prevent="confirmExport"
          />
          <span class="export-name-suffix">.mp4</span>
        </div>
      </div>
    </n-modal>
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
.panel-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  height: 100%;
}
.preview-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
}
.preview-video-wrap {
  flex: 1;
  min-height: 120px;
  border-radius: 8px;
  overflow: hidden;
  background: #000;
  position: relative;
}
.preview-video {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.preview-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 10;
  background: transparent;
  display: block;
}
.export-name-form {
  padding: 8px 0;
  min-width: 320px;
}
.export-name-input-wrap {
  display: flex;
  align-items: stretch;
  border: 1px solid var(--n-border);
  border-radius: 6px;
  overflow: hidden;
  background: var(--n-color);
}
.export-name-input-wrap .n-input {
  flex: 1;
  --n-border-radius: 0;
}
.export-name-input-wrap .n-input :deep(.n-input__border),
.export-name-input-wrap .n-input :deep(.n-input__state-border) {
  border: none;
}
.export-name-suffix {
  display: flex;
  align-items: center;
  padding: 0 12px;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.5);
  background: rgba(255, 255, 255, 0.04);
  user-select: none;
}
</style>
