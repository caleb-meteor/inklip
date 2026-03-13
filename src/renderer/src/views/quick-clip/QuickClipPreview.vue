<script setup lang="ts">
import { NIcon, NButton } from 'naive-ui'
import { PlayOutline, DownloadOutline } from '@vicons/ionicons5'
import { inject } from 'vue'

const qc = inject('quickClip') as any
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
        @click="qc.handleExportSegments"
      >
        <template #icon>
          <n-icon><DownloadOutline /></n-icon>
        </template>
        导出所选片段
      </n-button>
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
</style>
