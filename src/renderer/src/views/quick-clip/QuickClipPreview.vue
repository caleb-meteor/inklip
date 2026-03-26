<script setup lang="ts">
import { inject } from 'vue'
import { NIcon, NButton, NModal, NProgress } from 'naive-ui'
import { PlayOutline, DownloadOutline } from '@vicons/ionicons5'

const qc = inject('quickClip') as any

function startExport() {
  if (qc.selectedSegments.length === 0) return
  void qc.handleExportSegments()
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
        @click="startExport"
      >
        <template #icon>
          <n-icon><DownloadOutline /></n-icon>
        </template>
        导出所选片段
      </n-button>
      <div class="preview-spacer"></div>
    </div>

    <n-modal
      :show="qc.isExporting"
      preset="dialog"
      title="正在导出视频"
      :closable="false"
      :mask-closable="false"
      :auto-focus="false"
      style="width: 420px; border-radius: 12px;"
    >
      <div class="export-progress-body">
        <p class="export-progress-desc">正在导出，请稍候…</p>
        <n-progress
          type="line"
          :percentage="Math.round(qc.exportProgress)"
          :height="10"
          :border-radius="5"
          indicator-placement="inside"
          processing
        />
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
  min-height: 0;
}
.preview-video-wrap {
  flex-shrink: 0;
  width: 100%;
  aspect-ratio: 9 / 16;
  border-radius: 8px;
  overflow: hidden;
  background: #000;
  position: relative;
}
.preview-body .n-button {
  flex-shrink: 0;
}
.preview-spacer {
  flex: 1;
  min-height: 0;
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
.export-progress-body {
  padding: 8px 0 4px;
}
.export-progress-desc {
  margin: 0 0 16px;
  font-size: 13px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.72);
}
</style>
