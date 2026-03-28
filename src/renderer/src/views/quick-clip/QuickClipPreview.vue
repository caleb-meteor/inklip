<script setup lang="ts">
import { inject, computed } from 'vue'
import { NIcon, NButton, NModal, NProgress } from 'naive-ui'
import { PlayOutline, DownloadOutline, VideocamOutline } from '@vicons/ionicons5'

const qc = inject('quickClip') as any

/** 未在播放：展示占位 UI（连续播放或单条源预览时不显示） */
const showPreviewIdle = computed(
  () => !qc.isPreviewPlaying && !qc.playingSourceSegment
)

const idleTitle = computed(() =>
  qc.selectedSegments.length === 0 ? '暂无预览内容' : '准备预览'
)

const idleDesc = computed(() =>
  qc.selectedSegments.length === 0
    ? '从左侧将字幕拖入或加入「已选」后，即可在此播放与导出'
    : '点击下方「按选择顺序播放」预览所选片段，或在已选列表中单击单条播放'
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
      <span>视频播放区</span>
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
            <n-icon :size="36" class="preview-idle-icon">
              <VideocamOutline />
            </n-icon>
          </div>
          <p class="preview-idle-title">{{ idleTitle }}</p>
          <p class="preview-idle-desc">{{ idleDesc }}</p>
        </div>
        <div
          v-show="qc.isPreviewPlaying && !qc.playingSourceSegment"
          class="preview-overlay"
        />
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
  border: 1px solid rgba(255, 255, 255, 0.06);
  box-sizing: border-box;
}

.preview-video-wrap.is-idle {
  background:
    radial-gradient(ellipse 85% 55% at 50% 36%, rgba(99, 226, 183, 0.07) 0%, transparent 52%),
    linear-gradient(168deg, #141416 0%, #0b0b0d 48%, #0e0e12 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.045);
}

.preview-video-wrap.is-playing {
  border-color: rgba(255, 255, 255, 0.1);
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
  width: 68px;
  height: 68px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.035);
  border: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
}

.preview-idle-icon {
  color: rgba(99, 226, 183, 0.72);
  opacity: 0.95;
}

.preview-idle-title {
  margin: 0 0 6px;
  font-size: 14px;
  font-weight: 600;
  color: rgba(245, 245, 247, 0.94);
  letter-spacing: 0.02em;
}

.preview-idle-desc {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: rgba(154, 154, 166, 0.95);
  max-width: 228px;
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
