<script setup lang="ts">
import { inject, computed } from 'vue'
import { NIcon, NButton } from 'naive-ui'
import { PlayOutline, DownloadOutline, VideocamOutline } from '@vicons/ionicons5'

const qc = inject('quickClip') as any

/** 未在播放：展示占位 UI（连续播放或单条源预览时不显示） */
const showPreviewIdle = computed(
  () => !qc.isPreviewPlaying && !qc.playingSourceSegment
)

function startExport() {
  if (qc.selectedSegments.length === 0) return
  void qc.handleExportSegments()
}
</script>

<template>
  <div class="panel panel-preview">
    <div class="panel-header">
      <n-icon size="18"><PlayOutline /></n-icon>
      <span>预览</span>
    </div>
    <div class="panel-body preview-body">
      <div
        class="preview-video-wrap"
        :class="{
          'is-playing': qc.isPreviewPlaying || qc.playingSourceSegment,
          'is-idle': showPreviewIdle
        }"
      >
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
        <div v-show="showPreviewIdle" class="preview-idle-state" aria-hidden="true">
          <div class="preview-idle-icon-wrap">
            <n-icon :size="32" class="preview-idle-icon">
              <VideocamOutline />
            </n-icon>
          </div>
        </div>
        <div
          v-show="qc.isPreviewPlaying && !qc.playingSourceSegment"
          class="preview-overlay"
        />
      </div>
      <div class="preview-actions">
        <n-button
          class="preview-action-btn"
          :type="qc.isPreviewPlaying ? 'warning' : 'primary'"
          size="small"
          :disabled="qc.selectedSegments.length === 0"
          @click="qc.startPreview"
        >
          <template #icon>
            <n-icon size="14"><PlayOutline /></n-icon>
          </template>
          {{ qc.isPreviewPlaying ? '停止' : '播放' }}
        </n-button>
        <n-button
          class="preview-action-btn preview-action-export"
          size="small"
          :disabled="qc.selectedSegments.length === 0"
          :loading="qc.isExporting"
          @click="startExport"
        >
          <template #icon>
            <n-icon size="14"><DownloadOutline /></n-icon>
          </template>
          导出
        </n-button>
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

.panel-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  height: 100%;
}

.preview-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  min-height: 0;
}

.preview-video-wrap {
  flex-shrink: 0;
  width: 100%;
  aspect-ratio: 9 / 16;
  border-radius: 10px;
  overflow: hidden;
  background: #000;
  position: relative;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-sizing: border-box;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
}

.preview-video-wrap.is-idle {
  background:
    radial-gradient(ellipse 80% 50% at 50% 35%, rgba(79, 172, 254, 0.06) 0%, transparent 55%),
    linear-gradient(168deg, #141416 0%, #0b0b0d 48%, #0e0e12 100%);
}

.preview-video-wrap.is-playing {
  border-color: rgba(79, 172, 254, 0.25);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(79, 172, 254, 0.1);
}

.preview-video {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.preview-idle-state {
  position: absolute;
  inset: 0;
  z-index: 12;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 20px 14px;
  box-sizing: border-box;
  pointer-events: none;
}

.preview-idle-icon-wrap {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
}

.preview-idle-icon {
  color: rgba(79, 172, 254, 0.65);
}

.preview-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  background: transparent;
}

/* ===== 操作栏 ===== */
.preview-actions {
  flex-shrink: 0;
  display: flex;
  gap: 8px;
}

.preview-action-btn {
  flex: 1;
  border-radius: 8px;
}

.preview-action-export {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #e4e4e7;
}
.preview-action-export:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
}

</style>
