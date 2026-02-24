<script setup lang="ts">
import { ref, type PropType } from 'vue'
import UnifiedVideoPreview from '../../UnifiedVideoPreview.vue'

const props = defineProps({
  messageId: {
    type: String,
    required: true
  },
  videos: {
    type: Array as PropType<any[]>,
    required: true
  },
  awaitingConfirmation: {
    type: Boolean,
    default: false
  },
  isInteractive: {
    type: Boolean,
    default: true
  },
  cancelled: {
    type: Boolean,
    default: false
  },
  hideTitle: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits<{
  (e: 'confirm', videoIds: number[], minTime: number, maxTime: number): void
  (e: 'cancel'): void
}>()

// 剪辑时长控制
const minTime = ref(80)
const maxTime = ref(100)

// 视频选择状态
const selectedVideos = ref<Set<number>>(new Set())

/** 视频是否已删除（路径缺失） */
const isVideoDeleted = (v: any) => !v?.path && !v?.fileUrl

/**
 * 切换视频选中状态
 */
const toggleVideoSelection = (videoId: number, duration: number): void => {
  const selected = selectedVideos.value.has(videoId)

  if (selected) {
    selectedVideos.value.delete(videoId)
  } else {
    if (selectedVideos.value.size >= 3) {
      return
    }

    // 检查总时长
    const totalDuration = getSelectedDuration()
    if (totalDuration + duration > 30 * 60) {
      return
    }

    selectedVideos.value.add(videoId)
  }
}

/**
 * 计算已选择的总时长（秒）
 */
const getSelectedDuration = (): number => {
  return Array.from(selectedVideos.value).reduce((sum, id) => {
    const video = props.videos.find((v: any) => v.id === id)
    if (!video || isVideoDeleted(video)) return sum
    return sum + (video.duration || 0)
  }, 0)
}

/**
 * 格式化时长为分钟
 */
const formatDurationMinutes = (seconds: number): string => {
  const minutes = Math.ceil(seconds / 60)
  return `${minutes}分钟`
}

/**
 * 确认选择
 */
const handleConfirm = (): void => {
  emit('confirm', Array.from(selectedVideos.value), minTime.value, maxTime.value)
}

/**
 * 取消选择
 */
const handleCancel = (): void => {
  emit('cancel')
}
</script>

<template>
  <div class="videos-container">
    <div v-if="!hideTitle" class="videos-title">
      📹 找到 {{ videos.length }} 个符合条件的视频
      <span v-if="awaitingConfirmation && isInteractive" class="selection-stats">
        （已选 {{ selectedVideos.size }} / 3 个，{{ formatDurationMinutes(getSelectedDuration()) }}
        / 30分钟）
      </span>
      <span v-if="cancelled" class="cancelled-badge">已取消</span>
    </div>
    <div v-else-if="awaitingConfirmation && isInteractive" class="selection-indicator-bar">
      <span class="selection-stats-inline">
        已选 {{ selectedVideos.size }} / 3 个，{{ formatDurationMinutes(getSelectedDuration()) }} /
        30分钟
      </span>
    </div>
    <div class="videos-list-compact">
      <div
        v-for="video in videos"
        :key="video.id"
        class="compact-video-card"
        :class="{
          selected: selectedVideos.has(video.id),
          disabled: !isInteractive || isVideoDeleted(video),
          'is-deleted': isVideoDeleted(video)
        }"
        @click="
          isInteractive &&
          awaitingConfirmation &&
          !isVideoDeleted(video) &&
          toggleVideoSelection(video.id, video.duration)
        "
      >
        <div v-if="awaitingConfirmation && isInteractive" class="video-selection-badge">
          <div class="checkbox" :class="{ checked: selectedVideos.has(video.id) }">
            <span v-if="selectedVideos.has(video.id)">✓</span>
          </div>
        </div>
        <UnifiedVideoPreview :video="video" video-type="material" aspect-ratio="9/16" />
        <div class="compact-card-info">
          <div class="compact-name">{{ video.filename || video.name }}</div>
        </div>
      </div>
    </div>
    <div v-if="awaitingConfirmation && isInteractive" class="duration-settings">
      <span class="settings-label">✂️ 剪辑时长(秒):</span>
      <div class="duration-inputs">
        <input v-model.number="minTime" type="number" min="10" max="600" class="duration-input" />
        <span class="separator">-</span>
        <input v-model.number="maxTime" type="number" min="10" max="600" class="duration-input" />
      </div>
    </div>
    <div v-if="awaitingConfirmation && isInteractive" class="confirmation-buttons">
      <button class="btn-confirm" :disabled="selectedVideos.size === 0" @click="handleConfirm">
        ✅ 确认并继续（已选 {{ selectedVideos.size }} 个）
      </button>
      <button class="btn-cancel" @click="handleCancel">❌ 取消</button>
    </div>
  </div>
</template>

<style scoped>
.videos-container {
  margin-top: 16px;
  padding: 16px;
  background: rgba(24, 24, 27, 0.4);
  backdrop-filter: blur(10px);
  border-radius: 16px;
  border: 1px solid rgba(79, 172, 254, 0.15);
}

.videos-title {
  font-size: 14px;
  font-weight: 700;
  background: linear-gradient(to right, #4facfe, #00f2fe);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.selection-stats {
  font-size: 12px;
  font-weight: 500;
  color: #71717a;
  -webkit-text-fill-color: #71717a; /* Override title gradient if nested */
}

.cancelled-badge {
  display: inline-block;
  padding: 2px 8px;
  background: rgba(239, 68, 68, 0.1);
  color: #fca5a5;
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  -webkit-text-fill-color: #fca5a5;
}

.videos-list-compact {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 12px;
}

.compact-video-card {
  position: relative;
  cursor: pointer;
  border-radius: 8px;
  overflow: hidden;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border: 1px solid transparent;
  background: #000;
}

.compact-video-card:hover:not(.disabled) {
  transform: translateY(-4px);
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.4);
}

.compact-video-card.selected {
  border-color: #00f2fe;
  box-shadow: 0 0 15px rgba(0, 242, 254, 0.3);
}

.compact-video-card.disabled {
  cursor: not-allowed;
}

.compact-video-card.is-deleted {
  cursor: default;
}

.compact-video-card.is-deleted:hover {
  transform: none;
  box-shadow: none;
}

.video-selection-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 10;
}

.checkbox {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  border: 2px solid rgba(255, 255, 255, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: #fff;
  transition: all 0.2s ease;
}

.checkbox.checked {
  background: linear-gradient(135deg, #4facfe, #00f2fe);
  border-color: transparent;
  box-shadow: 0 0 10px rgba(0, 242, 254, 0.5);
}

.compact-card-info {
  padding: 8px 6px;
  background: #18181b;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.compact-name {
  font-size: 10px;
  font-weight: 600;
  color: #efeff1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.compact-duration {
  font-size: 9px;
  color: #71717a;
  font-weight: 500;
}

.duration-settings {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 24px;
  margin-bottom: 12px;
  background: rgba(0, 0, 0, 0.3);
  padding: 12px 20px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.settings-label {
  font-size: 13px;
  color: #a1a1aa;
  font-weight: 600;
  letter-spacing: 0.05em;
}

.duration-inputs {
  display: flex;
  align-items: center;
  gap: 10px;
}

.duration-input {
  width: 64px;
  background: #27272a;
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #fff;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 13px;
  text-align: center;
  transition: all 0.2s ease;
}

.duration-input:focus {
  outline: none;
  border-color: #4facfe;
  background: #323235;
  box-shadow: 0 0 8px rgba(79, 172, 254, 0.2);
}

.separator {
  color: #52525b;
  font-weight: bold;
}

.confirmation-buttons {
  margin-top: 16px;
  display: flex;
  gap: 12px;
  justify-content: center;
}

.btn-confirm,
.btn-cancel {
  padding: 10px 24px;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.btn-confirm {
  background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
  color: #000;
  box-shadow: 0 4px 15px rgba(79, 172, 254, 0.3);
}

.btn-confirm:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(79, 172, 254, 0.5);
  filter: brightness(1.1);
}

.btn-confirm:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.btn-cancel {
  background: rgba(239, 68, 68, 0.1);
  color: #fca5a5;
  border: 1px solid rgba(239, 68, 68, 0.2);
}

.btn-cancel:hover {
  background: rgba(239, 68, 68, 0.2);
  transform: translateY(-1px);
}

.btn-cancel:active {
  transform: scale(0.98);
}
</style>
