<script setup lang="ts">
import { NButton, NIcon } from 'naive-ui'
import { CloseOutline } from '@vicons/ionicons5'
import VideoPlayer from '../VideoPlayer.vue'
import type { HomePlayPayload } from '../../api/video'

interface Props {
  /** 首页播放载荷：含 video 与 videoType，用于无字幕时按类型拉取字幕 */
  payload: HomePlayPayload | null
}

defineProps<Props>()

const emit = defineEmits<{
  close: []
}>()
</script>

<template>
  <div v-if="payload" class="video-player-container">
    <div class="player-content">
      <VideoPlayer
        :path="payload.video.path"
        :video-id="payload.video.id"
        :subtitle-data="payload.video.subtitle"
        :video-type="payload.videoType"
        autoplay
      />
      <div class="player-topbar">
        <span class="video-title" :title="payload.video.name">{{ payload.video.name }}</span>
        <n-button quaternary circle size="small" class="close-btn" @click="emit('close')">
          <n-icon size="18"><CloseOutline /></n-icon>
        </n-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.video-player-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.player-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  position: relative;
  background: #000;
}

.player-topbar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.65) 0%, transparent 100%);
  pointer-events: none;
}

.video-title {
  font-size: 13px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.9);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex: 1;
}

.close-btn {
  pointer-events: auto;
  color: rgba(255, 255, 255, 0.85);
  flex-shrink: 0;
}
.close-btn:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.15);
}
</style>
