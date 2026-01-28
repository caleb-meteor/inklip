<script setup lang="ts">
import { ref, watch, nextTick, computed, type PropType } from 'vue'
import { NIcon, NText } from 'naive-ui'
import { SparklesOutline, CheckmarkCircleOutline, EllipsisHorizontalOutline, AlertCircleOutline } from '@vicons/ionicons5'
import type { Message } from '../../types/chat'

const props = defineProps({
  messages: {
    type: Array as PropType<Message[]>,
    default: () => []
  },
  suggestions: {
    type: Array as PropType<Array<{ text: string; icon: any }>>,
    default: () => []
  }
})

const emit = defineEmits<{
  (e: 'suggestionClick', text: string): void
}>()

const scrollContainer = ref<HTMLElement | null>(null)
const messageList = computed(() => props.messages)
const suggestionList = computed(() => props.suggestions)

const scrollToBottom = async (): Promise<void> => {
  await nextTick()
  if (scrollContainer.value) {
    scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight
  }
}

watch(messageList, () => {
  scrollToBottom()
}, { deep: true })

const handleSuggestionClick = (text: string): void => {
  emit('suggestionClick', text)
}
</script>

<template>
  <div class="chat-main">
    <div class="chat-messages" ref="scrollContainer">
      <template v-if="messageList.length === 0">
        <div class="empty-hero">
          <h1 class="welcome-text">影氪 <n-text type="primary">墨寒</n-text></h1>
          <p class="subtitle">今天想创作点什么？</p>

          <div class="suggestions-grid">
            <div
              v-for="s in suggestionList"
              :key="s.text"
              class="suggestion-card"
              @click="handleSuggestionClick(s.text)"
            >
              <div class="suggestion-icon">
                <n-icon :component="s.icon" size="20" />
              </div>
              <div class="suggestion-content">
                <div class="suggestion-title">{{ s.text }}</div>
                <div class="suggestion-desc">点击立即开始</div>
              </div>
            </div>
          </div>
        </div>
      </template>

      <template v-else>
        <div v-for="msg in messageList" :key="msg.id" :class="['message-bubble', msg.role]">
          <div class="avatar">
            <n-icon v-if="msg.role === 'assistant'"><SparklesOutline /></n-icon>
            <div v-else class="user-avatar">墨</div>
          </div>
          <div class="message-content">
            <div v-if="msg.content" class="text-content">{{ msg.content }}</div>
            <div v-if="msg.isAnalyzing" class="analyzing-spinner">🤔 分析中...</div>
            <div v-if="msg.dicts && msg.dicts.length > 0" class="dicts-container">
              <div class="dicts-title">找到的词典：</div>
              <div class="dicts-list">
                <div v-for="dict in msg.dicts" :key="dict.id" class="dict-item">
                  <span class="dict-name">{{ dict.name }}</span>
                  <span class="dict-type">{{ dict.type }}</span>
                </div>
              </div>
            </div>
            <div v-if="msg.role === 'assistant' && msg.payload?.steps" class="workflow-container">
              <div
                v-for="(step, index) in msg.payload.steps"
                :key="index"
                class="workflow-step"
                :class="step.state"
              >
                <div class="step-icon">
                  <n-icon v-if="step.state === 'finish'" color="#63e2b7">
                    <CheckmarkCircleOutline />
                  </n-icon>
                  <n-icon v-else-if="step.state === 'process'" class="spinning">
                    <EllipsisHorizontalOutline />
                  </n-icon>
                  <n-icon v-else-if="step.state === 'error'" color="#e88080">
                    <AlertCircleOutline />
                  </n-icon>
                  <div v-else class="step-dot"></div>
                </div>
                <span class="step-label">{{ step.label }}</span>
              </div>
            </div>
            <div v-if="msg.payload?.dicts && msg.payload.dicts.length > 0" class="dicts-container">
              <div class="dicts-title">找到的词典（{{ msg.payload.dicts.length }}）：</div>
              <div class="dicts-list">
                <div v-for="dict in msg.payload.dicts" :key="dict.id" class="dict-item">
                  <span class="dict-name">{{ dict.name }}</span>
                  <span class="dict-type">{{ dict.type }}</span>
                </div>
              </div>
            </div>
            <div v-if="msg.payload?.videos && msg.payload.videos.length > 0" class="videos-container">
              <div class="videos-title">选中的视频（{{ msg.payload.videos.length }}）：</div>
              <div class="videos-grid">
                <div v-for="video in msg.payload.videos" :key="video.id" class="video-card">
                  <div class="video-thumbnail">
                    <div class="video-duration">{{ video.duration }}s</div>
                  </div>
                  <div class="video-info">
                    <div class="video-name">{{ video.filename }}</div>
                  </div>
                </div>
              </div>
            </div>
            <div v-if="msg.payload?.smartCutTask" class="smartcut-result">
              <div class="result-title">剪辑任务已创建</div>
              <div class="result-details">
                <div class="result-item">
                  <span class="label">任务 ID：</span>
                  <span class="value">{{ msg.payload.smartCutTask.taskId }}</span>
                </div>
                <div class="result-item">
                  <span class="label">视频数：</span>
                  <span class="value">{{ msg.payload.smartCutTask.videoCount }}</span>
                </div>
                <div class="result-item">
                  <span class="label">时长范围：</span>
                  <span class="value">
                    {{ msg.payload.smartCutTask.durationMin }}s - {{ msg.payload.smartCutTask.durationMax }}s
                  </span>
                </div>
                <div class="result-item">
                  <span class="label">状态：</span>
                  <span class="value">{{ msg.payload.smartCutTask.status === 1 ? '处理中' : '完成' }}</span>
                </div>
              </div>
            </div>
            <div v-if="msg.payload?.error" class="error-message">
              <n-icon color="#e88080"><AlertCircleOutline /></n-icon>
              <span>{{ msg.payload.error.message }}</span>
            </div>
          </div>
        </div>
      </template>
    </div>
    <slot name="footer" />
  </div>
</template>

<style scoped>
.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #1a1a1a;
  position: relative;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 40px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  scrollbar-width: thin;
}

.empty-hero {
  max-width: 800px;
  width: 90%;
  text-align: center;
  padding-top: 100px;
  display: flex;
  flex-direction: column;
  gap: 40px;
}

.welcome-text {
  font-size: 4rem;
  font-weight: 900;
  background: linear-gradient(to right, #fff, #3b82f6);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  margin: 0;
}

.subtitle {
  font-size: 1.5rem;
  color: #666;
  margin: 0;
}

.suggestions-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-top: 20px;
}

.suggestion-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  padding: 20px;
  border-radius: 16px;
  cursor: pointer;
  text-align: left;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.suggestion-card:hover {
  background: rgba(59, 130, 246, 0.1);
  border-color: rgba(59, 130, 246, 0.4);
  transform: translateY(-5px);
}

.suggestion-icon {
  margin-bottom: 12px;
  color: #3b82f6;
}

.suggestion-title {
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 4px;
}

.suggestion-desc {
  font-size: 12px;
  color: #444;
}

.message-bubble {
  max-width: 800px;
  width: 90%;
  display: flex;
  gap: 20px;
  padding: 24px 0;
  border-top: 1px solid rgba(255, 255, 255, 0.03);
}

.message-bubble.assistant {
  background: rgba(255, 255, 255, 0.01);
}

.avatar {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: rgba(59, 130, 246, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #3b82f6;
  flex-shrink: 0;
}

.user-avatar {
  background: #333;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: inherit;
}

.message-content {
  flex: 1;
  font-size: 16px;
  line-height: 1.6;
  color: #efeff5;
}

.analyzing-spinner {
  margin-top: 12px;
  padding: 12px;
  background: rgba(59, 130, 246, 0.1);
  border-left: 3px solid #3b82f6;
  border-radius: 4px;
  font-size: 14px;
  color: #3b82f6;
  font-weight: 600;
  animation: pulse 1.5s infinite;
}

.dicts-container {
  margin-top: 16px;
  padding: 12px;
  background: rgba(99, 226, 183, 0.08);
  border-left: 3px solid #63e2b7;
  border-radius: 4px;
}

.dicts-title {
  font-size: 13px;
  font-weight: 700;
  color: #63e2b7;
  margin-bottom: 8px;
}

.dicts-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dict-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 8px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
  font-size: 13px;
}

.dict-name {
  color: #e0e0e0;
  font-weight: 600;
}

.dict-type {
  color: #888;
  font-size: 12px;
}

.workflow-container {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.workflow-step {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  opacity: 0.5;
}

.workflow-step.process {
  opacity: 1;
  color: #3b82f6;
}

.workflow-step.finish {
  opacity: 1;
  color: #63e2b7;
}

.workflow-step.error {
  opacity: 1;
  color: #e88080;
}

.bottom-input-container {
  padding: 20px 0 40px;
  display: flex;
  justify-content: center;
  background: linear-gradient(to top, #1a1a1a 70%, transparent);
}

.input-wrapper {
  max-width: 800px;
  width: 90%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.input-disclaimer {
  font-size: 11px;
  color: #444;
  text-align: center;
}

.spinning {
  animation: pulse 2s infinite ease-in-out;
}

.videos-container {
  margin-top: 16px;
  padding: 12px;
  background: rgba(59, 130, 246, 0.08);
  border-left: 3px solid #3b82f6;
  border-radius: 4px;
}

.videos-title {
  font-size: 13px;
  font-weight: 700;
  color: #3b82f6;
  margin-bottom: 12px;
}

.videos-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px;
}

.video-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  cursor: pointer;
  transition: transform 0.2s ease;
}

.video-card:hover {
  transform: scale(1.05);
}

.video-thumbnail {
  position: relative;
  width: 100%;
  padding-bottom: 56.25%;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
  overflow: hidden;
}

.video-duration {
  position: absolute;
  bottom: 4px;
  right: 4px;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  padding: 2px 6px;
  border-radius: 2px;
  font-size: 12px;
}

.video-info {
  font-size: 12px;
  color: #ddd;
  word-break: break-all;
}

.video-name {
  font-weight: 600;
}

.smartcut-result {
  margin-top: 16px;
  padding: 16px;
  background: rgba(99, 226, 183, 0.08);
  border-left: 3px solid #63e2b7;
  border-radius: 4px;
}

.result-title {
  font-size: 14px;
  font-weight: 700;
  color: #63e2b7;
  margin-bottom: 12px;
}

.result-details {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.result-item {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
}

.result-item .label {
  color: #888;
}

.result-item .value {
  color: #ddd;
  font-weight: 600;
}

.error-message {
  margin-top: 16px;
  padding: 12px;
  background: rgba(232, 128, 128, 0.08);
  border-left: 3px solid #e88080;
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #e88080;
}

@keyframes pulse {
  0% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.2);
    opacity: 0.5;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}
</style>
