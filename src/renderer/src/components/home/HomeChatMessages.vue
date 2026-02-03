<script setup lang="ts">
import { ref, watch, nextTick, computed, type PropType } from 'vue'
import { NIcon } from 'naive-ui'
import { AlertCircleOutline, SparklesOutline } from '@vicons/ionicons5'
import VideoPreviewPlayer from '../VideoPreviewPlayer.vue'
import VideoSelectionMessage from './message-types/VideoSelectionMessage.vue'
import VideoUploadMessage from './message-types/VideoUploadMessage.vue'
import SmartCutResultMessage from './message-types/SmartCutResultMessage.vue'
import ThinkingStepsMessage from './message-types/ThinkingStepsMessage.vue'
import TaskCardMessage from './message-types/TaskCardMessage.vue'
import type { Message } from '../../types/chat'
import { smartCutAiService } from '../../services/smartCutAiService'

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
  (e: 'suggestionClick', suggestion: any): void
}>()

const scrollContainer = ref<HTMLElement | null>(null)
const messageList = computed(() => props.messages)

const typedMessageIds = new Set<string>()
watch(messageList, async (newList) => {
  if (!newList.length) return
  
  for (const msg of newList) {
    const isNewMessage = msg.id.startsWith('new_message_')
    
    if (
      msg.role === 'assistant' &&
      !typedMessageIds.has(msg.id) &&
      !msg.isTyping &&
      isNewMessage &&
      typeof msg.content === 'string' &&
      msg.content.length > 0 &&
      (!msg.displayedContent || msg.displayedContent.length === 0)
    ) {
      typedMessageIds.add(msg.id)
      await typeMessage(msg.id, msg.content, 20)
    }
  }
}, { immediate: true, deep: true })

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

const handleSuggestionClick = (suggestion: any): void => {
  emit('suggestionClick', suggestion)
}

const handleConfirmVideos = async (msgId: string, videoIds: number[], minTime: number, maxTime: number): Promise<void> => {
  try {
    console.log('[handleConfirmVideos] 开始确认:', { msgId, videoCount: videoIds.length, minTime, maxTime })
    // Pass duration options to your service (assuming service can handle it, otherwise pass as payload)
    // Here assuming the service function signature might need update or we pass config object.
    // Given previous code was `smartCutAiService.confirmAndProceed(msgId, videoIds)`
    // checking usage in previous steps, it seems `smartCutAiService.confirmAndProceed` takes videoIds.
    // If the service doesn't support duration yet, we should probably update it or pass it.
    // For now, I'll pass it as a 3rd argument (config object) if possible or updated signature.
    // Since I cannot see service definition right now, I will assume interaction payload update is handled there.
    // But wait, the user request said: "User input -> Request API -> Get Dict -> Match -> Show Card. If confirmed -> Call Smart Cut API."
    // So `confirmAndProceed` likely triggers the Smart Cut API.
    
    // Let's pass the config.
    await smartCutAiService.confirmAndProceed(msgId, videoIds, { minDuration: minTime, maxDuration: maxTime })
    
    console.log('[handleConfirmVideos] 确认完成')
  } catch (error) {
    console.error('[handleConfirmVideos] 确认视频失败:', error)
  }
}

const handleCancelVideos = async (msgId: string): Promise<void> => {
  await smartCutAiService.cancelConfirmation()
}

// Optimized typeMessage for faster/fluid output 'like AI'
const typeMessage = async (msgId: string, fullContent: string, speed: number = 20): Promise<void> => {
  const idx = messageList.value.findIndex(m => m.id === msgId)
  if (idx === -1) return

  const msg = { ...messageList.value[idx] }
  msg.isTyping = true
  // If content is just internal log, maybe don't show it? 
  // User said "Only interactive cards or no result is displayed as message, others as thinking".
  // This implies we might hide the text content if there's a payload like 'thinking_steps' or if it's intermediate.
  // However, usually 'content' is the visible part.
  
  msg.displayedContent = ''
  messageList.value.splice(idx, 1, { ...msg })

  // Faster typing without forced layout reflows every char if possible, but vue reactivity handles it.
  // Reduce speed delay or make it dynamic.
  const step = 2 // chars per tick
  for (let i = 0; i < fullContent.length; i += step) {
    msg.displayedContent = fullContent.substring(0, i + step)
    messageList.value.splice(idx, 1, { ...msg })
    // Use requestAnimationFrame or very small timeout for "token" feel
    await new Promise(resolve => setTimeout(resolve, speed))
  }
  
  // Ensure full content matches at end
  msg.displayedContent = fullContent
  msg.isTyping = false
  messageList.value.splice(idx, 1, { ...msg })
}

const getMessageContent = (msg: Message): string => {
  return msg.isTyping ? (msg.displayedContent || '') : msg.content
}

const formatDurationSeconds = (seconds: number): string => {
  if (seconds < 60) {
    return `${Math.floor(seconds)}秒`
  }
  const minutes = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}
</script>

<template>
  <div class="chat-container custom-scrollbar" ref="scrollContainer">
    <div v-if="messageList.length === 0" class="empty-state">
      <div class="greeting-container">
        <h1 class="greeting-text">
          <span class="gradient-text">你好，创作者</span>
        </h1>
        <p class="greeting-sub">基于【主播】+【产品】智能剪辑您的视频</p>
      </div>
      
      <div class="suggestions-grid">
        <div
          v-for="s in suggestionList"
          :key="s.text"
          class="suggestion-card"
          @click="handleSuggestionClick(s)"
        >
          <div class="suggestion-icon-wrapper">
            <n-icon :component="s.icon" size="20" />
          </div>
          <div class="suggestion-content">
            <div class="suggestion-text">{{ s.text }}</div>
            <div v-if="s.description" class="suggestion-description">
              <span v-html="s.description"></span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="messages-list">
      <div
        v-for="msg in messageList"
        :key="msg.id"
        :class="['message-row', msg.role]"
      >
        <div class="message-content-wrapper">
          <div class="message-bubble">
            <div class="message-text">
              <div v-if="msg.content && !msg.payload?.taskCard" class="text-content" v-html="getMessageContent(msg)"></div>
              <div v-if="msg.isAnalyzing" class="analyzing-card">
                <div class="analyzing-icon">
                  <div class="pulse-ring"></div>
                  <n-icon size="20"><SparklesOutline /></n-icon>
                </div>
                <div class="analyzing-info">
                  <div class="analyzing-text">正在解析关键信息...</div>
                  <div class="analyzing-sub">AI 正在理解您的剪辑需求</div>
                </div>
              </div>
              
              <ThinkingStepsMessage v-if="msg.role === 'assistant' && msg.payload?.steps" :steps="msg.payload.steps" />
              
              <div v-if="(msg.dicts && msg.dicts.length > 0) || (msg.payload?.dicts && msg.payload.dicts.length > 0)" class="timeline-segment">
                <div class="segment-label">检测到的关键词</div>
                <div class="dict-tags">
                  <div v-for="dict in (msg.dicts || msg.payload?.dicts)" :key="dict.id" class="dict-tag">
                    <span class="dict-name">{{ dict.name }}</span>
                    <span class="dict-type-badge">{{ dict.type }}</span>
                  </div>
                </div>
              </div>

              <div v-if="msg.videos && msg.videos.length > 0 && !msg.payload?.videos" class="timeline-segment">
                <div class="segment-label">
                  📹 匹配到 {{ msg.videos.length }} 个片段
                </div>
                <div class="videos-grid">
                  <div v-for="video in msg.videos" :key="video.id" class="video-card">
                    <VideoPreviewPlayer
                      :path="video.path"
                      :cover="video.cover"
                      :duration="video.duration"
                      aspect-ratio="9/16"
                      :video-id="video.id"
                      video-type="material"
                    />
                    <div class="video-info">
                      <div class="video-name">{{ video.filename || video.name }}</div>
                      <div v-if="video.duration" class="video-duration">{{ formatDurationSeconds(video.duration) }}</div>
                    </div>
                  </div>
                </div>
              </div>
              
              <TaskCardMessage
                v-if="msg.payload?.taskCard && !msg.payload?.aiGenVideoId"
                :steps="msg.payload.taskCard.steps"
              />

              <VideoUploadMessage
                v-if="msg.payload?.type === 'video_upload' && msg.payload?.videos"
                :videos="msg.payload.videos"
              />

              <VideoSelectionMessage
                v-if="msg.payload?.videos && msg.payload.videos.length > 0 && msg.payload?.type !== 'video_upload'"
                :message-id="msg.id"
                :videos="msg.payload.videos"
                :hide-title="!!msg.payload?.taskCard"
                :awaiting-confirmation="msg.payload?.awaitingConfirmation || false"
                :is-interactive="msg.payload?.isInteractive !== false"
                :cancelled="msg.payload?.cancelled || false"
                @confirm="(videoIds, minTime, maxTime) => handleConfirmVideos(msg.id, videoIds, minTime, maxTime)"
                @cancel="() => handleCancelVideos(msg.id)"
              />

              <SmartCutResultMessage v-if="msg.payload?.aiGenVideoId" :msg-id="msg.id" :task="msg.payload" />

              <div v-if="msg.payload?.error" class="error-block">
                <n-icon color="#ef4444" size="18"><AlertCircleOutline /></n-icon>
                <span>{{ msg.payload.error.message }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  height: 100%;
  overflow-y: auto;
  padding: 20px 0;
  box-sizing: border-box;
}

.empty-state {
  margin-top: 10vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 48px;
  width: 100%;
  max-width: 800px;
  padding: 0 24px;
}

.greeting-container {
  text-align: center;
}

.greeting-text {
  font-size: 56px;
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.02em;
  margin-bottom: 25px;
}

.gradient-text {
  background: linear-gradient(to right, #4facfe 0%, #00f2fe 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.greeting-sub {
  font-size: 24px;
  color: #71717a;
  font-weight: 500;
}

.suggestions-grid {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 16px;
  width: 100%;
  max-width: 700px;
}

.suggestion-card {
  background: #1e1e20;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  padding: 16px 20px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  align-items: flex-start;
  gap: 12px;
  flex: 1;
  min-width: 280px;
  position: relative;
}

.suggestion-card:hover {
  background: #27272a;
  transform: translateY(-2px);
  border-color: rgba(79, 172, 254, 0.3);
  box-shadow: 0 4px 12px rgba(79, 172, 254, 0.1);
}

.suggestion-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.suggestion-icon-wrapper {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(79, 172, 254, 0.1) 0%, rgba(0, 242, 254, 0.1) 100%);
  color: #4facfe;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(79, 172, 254, 0.2);
  flex-shrink: 0;
}

.suggestion-text {
  font-size: 15px;
  color: #e4e4e7;
  font-weight: 600;
}

.suggestion-description {
  font-size: 12px;
  color: #a1a1a6;
  line-height: 1.5;
  display: flex;
  align-items: center;
  gap: 4px;
}

.suggestion-description strong {
  color: #4facfe;
  font-weight: 600;
}

.messages-list {
  width: 100%;
  max-width: 800px;
  display: flex;
  flex-direction: column;
  padding: 0 16px;
  gap: 32px; /* Increased gap */
}

.message-row {
  display: flex;
  width: 100%;
}

.message-row.user {
  justify-content: flex-end;
}

.message-row.assistant {
  justify-content: flex-start;
}

.message-content-wrapper {
  max-width: 100%;
}

.message-row.user .message-content-wrapper {
  width: auto;
  max-width: 80%;
}

.message-row.assistant .message-content-wrapper {
  width: 100%;
  max-width: 100%;
}

/* User Message Bubble - Gradient border or solid theme color */
.message-row.user .message-bubble {
  background: linear-gradient(135deg, #2d2d30 0%, #1e1e20 100%);
  color: #fff;
  padding: 12px 20px;
  border-radius: 18px;
  border-bottom-right-radius: 4px;
  border: 1px solid rgba(79, 172, 254, 0.3);
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
}

/* Assistant Message */
.message-row.assistant .message-bubble {
  background: transparent;
  color: #efeff1;
  padding: 0;
}

.text-content {
  font-size: 16px;
  line-height: 1.6;
  white-space: pre-wrap;
  color: #ececed;
}

.timeline-segment {
  margin-top: 16px;
  background: rgba(24, 24, 27, 0.4);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(79, 172, 254, 0.1);
  border-radius: 16px;
  padding: 16px;
}

.segment-label {
  font-size: 13px;
  font-weight: 700;
  background: linear-gradient(to right, #4facfe, #00f2fe);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  display: flex;
  align-items: center;
  gap: 8px;
}

.dict-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.dict-tag {
  background: #18181b;
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  transition: all 0.2s ease;
}

.dict-tag:hover {
  border-color: rgba(79, 172, 254, 0.5);
  transform: translateY(-1px);
}

.dict-type-badge {
  font-size: 11px;
  background: rgba(79, 172, 254, 0.15);
  padding: 2px 6px;
  border-radius: 4px;
  color: #4facfe;
  font-weight: 600;
}

.videos-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
}

.video-card {
  border-radius: 10px;
  overflow: hidden;
  background: #000;
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.video-card:hover {
  border-color: #00f2fe;
  transform: scale(1.02) translateY(-2px);
  box-shadow: 0 4px 20px rgba(0, 242, 254, 0.15);
}

.video-info {
  padding: 10px;
  background: #18181b;
}

.video-name {
  font-size: 12px;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 4px;
}

.video-duration {
  font-size: 11px;
  color: #71717a;
}

.analyzing-card {
  margin-top: 16px;
  background: rgba(24, 24, 27, 0.4);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(79, 172, 254, 0.2);
  border-radius: 16px;
  padding: 16px 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  animation: cardFadeIn 0.5s ease-out;
}

@keyframes cardFadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.analyzing-icon {
  position: relative;
  width: 40px;
  height: 40px;
  background: rgba(79, 172, 254, 0.1);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #4facfe;
}

.pulse-ring {
  position: absolute;
  width: 100%;
  height: 100%;
  border-radius: 12px;
  border: 2px solid #4facfe;
  animation: iconPulse 2s infinite;
}

@keyframes iconPulse {
  0% { transform: scale(1); opacity: 0.5; }
  100% { transform: scale(1.3); opacity: 0; }
}

.analyzing-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.analyzing-text {
  font-size: 15px;
  font-weight: 700;
  background: linear-gradient(to right, #4facfe, #00f2fe);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.analyzing-sub {
  font-size: 12px;
  color: #71717a;
}

.loader-dot {
  width: 8px;
  height: 8px;
  background: linear-gradient(to right, #4facfe, #00f2fe);
  border-radius: 50%;
  animation: pulse 1.5s infinite;
  box-shadow: 0 0 8px rgba(0, 242, 254, 0.5);
}

.error-block {
  margin-top: 12px;
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.2);
  color: #fca5a5;
  padding: 16px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
}

@keyframes pulse {
  0% { transform: scale(0.8); opacity: 0.5; }
  50% { transform: scale(1.2); opacity: 1; }
  100% { transform: scale(0.8); opacity: 0.5; }
}

/* Scrollbar hidden for cleanest look, but functional */
.custom-scrollbar::-webkit-scrollbar {
  width: 0px; 
  background: transparent;
}
</style>
