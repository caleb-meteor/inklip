<script setup lang="ts">
import { NButton, NIcon } from 'naive-ui'
import { CloseOutline } from '@vicons/ionicons5'
import VideoPlayer from '../VideoPlayer.vue'
import type { VideoItem, SmartCutItem } from '../../api/video'

interface Props {
  video: VideoItem | SmartCutItem | null
}

defineProps<Props>()

const emit = defineEmits<{
  close: []
}>()
</script>

<template>
  <div v-if="video" class="video-player-container">
    <div class="player-header">
      <h2 class="video-title">{{ video.name }}</h2>
      <n-button quaternary circle class="close-btn" @click="emit('close')">
        <n-icon size="24"><CloseOutline /></n-icon>
      </n-button>
    </div>
    <div class="player-content">
      <VideoPlayer
        :path="video.path"
        :video-id="video.id"
        :subtitle-data="video.subtitle"
        autoplay
      />
    </div>
  </div>
</template>

<style scoped>
.video-player-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px;
  box-sizing: border-box;
}

.player-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.video-title {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
  color: #e4e4e7;
}

.player-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  position: relative;
  background: black;
  border-radius: 8px;
}
</style>
