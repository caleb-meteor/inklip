<script setup lang="ts">
interface Props {
  status?: 'processing' | 'completed' | 'failed' | 'pending'
  parseProgress?: {
    percentage: number
    status?: 'parsing' | 'transcribing' | 'completed' | 'failed'
    error?: string
  }
  failedText?: string
  showPathMissing?: boolean
  videoStatus?: number // 视频状态码：0=PENDING, 1=EXTRACTING_COVER, 2=EXTRACTING_AUDIO, 3=TRANSCRIBING, 4=COMPLETED, 5=FAILED
}

const props = withDefaults(defineProps<Props>(), {
  failedText: '视频未解析',
  showPathMissing: false
})

// 根据视频状态码获取状态文本
const getProcessingText = (): string => {
  if (props.videoStatus !== undefined) {
    switch (props.videoStatus) {
      case 1: // EXTRACTING_COVER
        return '正在解析封面...'
      case 2: // EXTRACTING_AUDIO
        return '提取音频中...'
      case 3: // TRANSCRIBING
        // 状态3时，统一显示"解析视频中"
        return '解析视频中...'
      default:
        return '处理中...'
    }
  }
  // 兼容旧逻辑
  return props.parseProgress?.status === 'parsing' ? '分析视频中...' : '处理中...'
}
</script>

<template>
  <!-- Pending State Overlay -->
  <div v-if="status === 'pending'" class="status-overlay pending" @click.stop @dblclick.stop>
    <div class="status-content">
      <div class="status-label">等待处理...</div>
    </div>
  </div>

  <!-- Processing State Overlay -->
  <div v-if="status === 'processing'" class="status-overlay processing" @click.stop @dblclick.stop>
    <div class="status-content">
      <div class="status-label">
        {{ getProcessingText() }}
      </div>
      <div
        v-if="
          parseProgress &&
          parseProgress.percentage !== undefined &&
          parseProgress.percentage >= 0 &&
          (videoStatus === 3 ||
            (parseProgress.status && ['transcribing', 'parsing'].includes(parseProgress.status)))
        "
        class="progress-bar-container"
      >
        <div class="progress-bar">
          <div
            class="progress-fill"
            :style="{ width: `${Math.min(100, Math.max(0, parseProgress.percentage))}%` }"
          ></div>
        </div>
        <div class="progress-text">{{ parseProgress.percentage }}%</div>
      </div>
    </div>
  </div>

  <!-- Failed State Overlay -->
  <div v-if="status === 'failed'" class="status-overlay failed" @click.stop @dblclick.stop>
    <div class="status-label">{{ failedText }}</div>
  </div>

  <!-- Path Missing Overlay -->
  <div v-if="showPathMissing" class="status-overlay missing" @click.stop @dblclick.stop>
    <div class="status-label">视频已被删除</div>
  </div>
</template>

<style scoped>
.status-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  backdrop-filter: blur(2px);
}

.status-overlay.pending {
  background: rgba(0, 0, 0, 0.5);
}

.status-overlay.processing {
  background: rgba(0, 0, 0, 0.6);
}

.status-overlay.failed,
.status-overlay.missing {
  background: rgba(0, 0, 0, 0.75);
}

.status-label {
  padding: 4px 12px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 1px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  border: 1px solid transparent;
}

.pending .status-label {
  color: #a0a0a0;
  background: rgba(160, 160, 160, 0.1);
  border-color: rgba(160, 160, 160, 0.4);
}

.processing .status-label {
  color: #63e2b7;
  background: rgba(99, 226, 183, 0.1);
  border-color: rgba(99, 226, 183, 0.4);
}

.status-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.progress-bar-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: 80%;
  max-width: 140px;
}

.progress-bar {
  width: 100%;
  height: 6px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #63e2b7, #4ecca3);
  border-radius: 3px;
  transition: width 0.3s ease;
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  0% {
    opacity: 0.8;
  }
  50% {
    opacity: 1;
  }
  100% {
    opacity: 0.8;
  }
}

.progress-text {
  font-size: 11px;
  color: #63e2b7;
  font-weight: 600;
}

.failed .status-label,
.missing .status-label {
  color: #ff4d4f;
  background: rgba(255, 77, 79, 0.1);
  border-color: rgba(255, 77, 79, 0.4);
}
</style>
