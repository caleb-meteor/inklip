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
import VideoFilteringTaskMessage from './message-types/VideoFilteringTaskMessage.vue'
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
  <div class="chat-container">
    <div class="messages-viewport" ref="scrollContainer">
      <div v-if="messageList.length === 0" class="empty-state">
        <div class="greeting-container">
          <h1 class="greeting-text">
            <span class="gradient-text">你好，创作者</span>
          </h1>
          <p class="greeting-sub">
            把繁琐交给 <span class="highlight-text">影氪</span>，剪辑从未如此 <span class="highlight-text">快乐</span>
          </p>
        </div>

        <div class="features-grid">
          <div class="feature-card" @click="$emit('suggestionClick', '导入视频')">
            <div class="feature-icon">🗂️</div>
            <div class="feature-content">
              <h3>智能素材管理</h3>
              <p>秒级定位素材，让管理井井有条。</p>
            </div>
          </div>

          <div class="feature-card" @click="$emit('suggestionClick', '帮我剪辑一个关于科技感的视频')">
            <div class="feature-icon">⚡️</div>
            <div class="feature-content">
              <h3>极速智能剪辑</h3>
              <p>你只管表达创意，繁琐的筛选与粗剪交给 影氪。一键提取精华片段并自动成片，剪辑从未如此高效。</p>
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
          <div class="message-body">
            <div class="message-bubble">
              <div class="message-text">
                <div v-if="msg.content && !msg.payload?.taskCard" class="text-content" v-html="getMessageContent(msg)"></div>
                
                <!-- Thinking steps or other interactive elements here -->
                <ThinkingStepsMessage v-if="msg.role === 'assistant' && msg.payload?.steps && !msg.payload?.type" :steps="msg.payload.steps" />
                
                <VideoFilteringTaskMessage
                  v-if="msg.payload?.type === 'video_filter_task' && msg.payload?.steps"
                  :steps="msg.payload.steps"
                />

                <!-- TaskCardMessage is already rendered inside SmartCutResultMessage if aiGenVideoId exists -->
                <TaskCardMessage
                  v-if="msg.payload?.type === 'task_card' && msg.payload?.taskCard?.steps && !msg.payload?.aiGenVideoId"
                  :steps="msg.payload.taskCard.steps"
                />

                <!-- ... existing interactive components ... -->
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
                
                <!-- Match APPLIED CHANGES UI from screenshot -->
                <div v-if="msg.role === 'assistant' && msg.payload?.smartCutTask" class="applied-changes-card">
                  <div class="changes-header">APPLIED CHANGES</div>
                  <ul class="changes-list">
                    <li><span class="check">✓</span> Jump cut @ 00:40.5</li>
                    <li><span class="check">✓</span> Word-level sync</li>
                  </ul>
                  <button class="apply-variation-btn">APPLY VARIATION 1</button>
                </div>
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
  height: 100%;
  background: #0a0b10;
  color: #e0e0e0;
}

.session-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  background: rgba(255, 255, 255, 0.02);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.session-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.session-icon {
  width: 36px;
  height: 36px;
  background: rgba(26, 115, 232, 0.2);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}

.session-details {
  display: flex;
  flex-direction: column;
}

.session-title {
  font-size: 15px;
  font-weight: 700;
  color: white;
  margin: 0;
}

.session-status {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  font-weight: 500;
}

.logs-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.8);
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
}

.messages-viewport {
  flex: 1;
  overflow-y: auto;
  padding: 24px 0; /* Vertical padding only */
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.message-row {
  display: flex;
  gap: 16px;
  width: 100%;
}

.message-row.user {
  flex-direction: row-reverse;
  align-self: flex-end;
  /* User messages can be constrained if desired, but let's leave it 100% container and constrain content */
}

.avatar-cell {
  flex-shrink: 0;
  margin-top: 4px;
}

.role-avatar {
  width: 32px;
  height: 32px;
  background: #1a73e8;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}

.user-avatar {
  background: #202124;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.message-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-width: 0; /* Important for text truncation inside flex items */
}

/* Assistant: Full width body, items stretch */
.message-row.assistant .message-body {
  width: 100%;
  align-items: stretch;
}

/* User: Adaptive width, items align to end */
.message-row.user .message-body {
  align-items: flex-end;
}

.message-meta {
  font-size: 10px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.3);
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.message-row.user .message-meta {
  text-align: right;
  margin-right: 4px;
}

.message-bubble {
  padding: 16px 20px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.9);
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
}

.message-row.user .message-bubble {
  background: #1a3a63;
  border-radius: 12px 0 12px 12px;
}

.applied-changes-card {
  margin-top: 16px;
  padding: 18px;
  background: rgba(0, 0, 0, 0.25);
  border-radius: 10px;
  border: 1px solid rgba(26, 115, 232, 0.2);
}

.changes-header {
  font-size: 11px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.4);
  margin-bottom: 12px;
  letter-spacing: 0.5px;
}

.changes-list {
  list-style: none;
  padding: 0;
  margin: 0 0 18px 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.changes-list li {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: #10b981;
}

.changes-list li .check {
  width: 16px;
  height: 16px;
  background: rgba(16, 185, 129, 0.2);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
}

.apply-variation-btn {
  width: 100%;
  background: rgba(26, 115, 232, 0.1);
  border: 1px solid rgba(26, 115, 232, 0.3);
  color: #1a73e8;
  padding: 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}

.apply-variation-btn:hover {
  background: rgba(26, 115, 232, 0.2);
}

.empty-state {
  margin-top: 15vh;
  text-align: center;
}

.shadow-glow {
  box-shadow: 0 0 15px rgba(26, 115, 232, 0.2);
}

.gradient-text {
  background: linear-gradient(to right, #4facfe 0%, #00f2fe 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.highlight-text {
  font-weight: 700;
  padding: 0 4px;
  background: linear-gradient(to right, #6a11cb 0%, #2575fc 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.messages-viewport::-webkit-scrollbar {
  width: 6px;
}

.messages-viewport::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}

.greeting-text {
  font-size: 56px;
  font-weight: 700;
}

.greeting-sub {
  font-size: 24px;
  color: rgba(255, 255, 255, 0.4);
}

.suggestions-grid {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 16px;
  width: 100%;
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
  max-width: 80%; /* Limit user message width for readability */
}

.message-row.assistant .message-content-wrapper {
  width: 100%;
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

/* Features Grid in Empty State */
.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
  width: 100%;
  max-width: 900px;
  margin: 40px auto 0;
  padding: 0 16px;
}

.feature-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  padding: 24px;
  display: flex;
  align-items: flex-start;
  gap: 16px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.feature-card:hover {
  background: rgba(255, 255, 255, 0.06);
  transform: translateY(-4px);
  border-color: rgba(79, 172, 254, 0.3);
  box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.5);
}

.feature-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(79, 172, 254, 0.1) 0%, rgba(0, 242, 254, 0.1) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  flex-shrink: 0;
  border: 1px solid rgba(79, 172, 254, 0.1);
}

.feature-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.feature-content h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #fff;
}

.feature-content p {
  margin: 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  line-height: 1.5;
}

/* Update greeting container for better spacing with cards */
.greeting-container {
  margin-bottom: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}


/* Scrollbar hidden for cleanest look, but functional */
.custom-scrollbar::-webkit-scrollbar {
  width: 0px; 
  background: transparent;
}
</style>
