<script setup lang="ts">
import { type PropType, computed } from 'vue'
import { NIcon, NSpin } from 'naive-ui'
import { CheckmarkCircleOutline, AlertCircleOutline } from '@vicons/ionicons5'
import VideoPreviewPlayer from '../../VideoPreviewPlayer.vue'
import { useWebsocketStore } from '../../../stores/websocket'

defineProps({
  videos: {
    type: Array as PropType<any[]>,
    required: true
  }
})

const wsStore = useWebsocketStore()

const getVideoStatus = (videoId: number) => {
  return computed(() => wsStore.getVideoProgress(videoId))
}
</script>

<template>
  <div class="video-upload-card">
    <div class="card-header">
      <div class="status-icon">
        <n-icon size="20" color="#63e2b7">
          <CheckmarkCircleOutline />
        </n-icon>
      </div>
      <div class="header-text">
        <div class="title">已导入 {{ videos.length }} 个视频</div>
        <div class="subtitle">视频已添加至素材库，可随时使用</div>
      </div>
    </div>

    <div class="videos-grid">
      <div v-for="video in videos" :key="video.id" class="video-item">
        <div class="video-preview">
          <VideoPreviewPlayer
            :path="video.path"
            :cover="video.cover"
            :duration="video.duration"
            aspect-ratio="9/16"
            :video-id="video.id || 0"
            video-type="material"
            class="video-player"
          />
          
          <div v-if="getVideoStatus(video.id).value && getVideoStatus(video.id).value?.status !== 'completed'" class="processing-overlay">
            <div class="processing-content">
              <n-spin size="small" v-if="getVideoStatus(video.id).value?.status !== 'failed'" />
              <n-icon v-else size="20" color="#ef4444"><AlertCircleOutline /></n-icon>
              
              <span class="processing-text">
                {{ getVideoStatus(video.id).value?.status === 'failed' ? '处理失败' : 
                   getVideoStatus(video.id).value?.status === 'transcribing' ? '转录中...' : '处理中...' }}
              </span>
            </div>
          </div>
        </div>
        <div class="video-info">
          <div class="video-name" :title="video.name">{{ video.name }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.video-upload-card {
  background: #18181c;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 16px;
  width: 100%;
  max-width: 600px;
  margin-top: 8px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.status-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: rgba(99, 226, 183, 0.1);
  border-radius: 50%;
}

.header-text .title {
  font-size: 15px;
  font-weight: 500;
  color: #e0e0e0;
  line-height: 1.2;
}

.header-text .subtitle {
  font-size: 12px;
  color: #888;
  margin-top: 2px;
}

.videos-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
}

.video-item {
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.video-preview {
  position: relative;
  aspect-ratio: 9/16;
  background: #000;
}

.video-player {
  width: 100%;
  height: 100%;
}

.duration-badge {
  position: absolute;
  bottom: 4px;
  right: 4px;
  background: rgba(0, 0, 0, 0.7);
  padding: 1px 4px;
  border-radius: 4px;
  font-size: 10px;
  color: #fff;
  z-index: 2;
  pointer-events: none;
}

.video-info {
  padding: 8px;
}

.processing-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  backdrop-filter: blur(2px);
}

.processing-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.processing-text {
  font-size: 10px;
  color: #fff;
}

.video-name {
  font-size: 12px;
  color: #ddd;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
