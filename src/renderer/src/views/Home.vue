<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { NButton, NText, NIcon } from 'naive-ui'
import { useRouter } from 'vue-router'
import {
  Videocam,
  Cut,
  Settings,
  FlashOutline,
  SparklesOutline,
  FilmOutline,
  CheckmarkCircleOutline,
  EllipsisHorizontalOutline,
  AlertCircleOutline,
  AddOutline,
  ChevronForward
} from '@vicons/ionicons5'
import { getVideosApi, smartCutApi, getSmartCutsApi } from '../api/video'
import { createAiChatApi, getAiChatListApi, addAiChatMessageApi, getAiChatMessagesApi, type AiChatTopic, type AiChatMessage } from '../api/aiChat'
import ChatInput from '../components/ChatInput.vue'

const router = useRouter()

const hasApiKey = ref(!!localStorage.getItem('apiKey'))
const scrollContainer = ref<HTMLElement | null>(null)

const checkApiKey = (): void => {
  hasApiKey.value = !!localStorage.getItem('apiKey')
}

// 监听自定义事件，以便在 Settings 页面更新 apiKey 时也能响应
const handleApiKeyChanged = (): void => {
  checkApiKey()
}

onMounted(() => {
  checkApiKey()
  window.addEventListener('apiKeyChanged', handleApiKeyChanged)
  loadAiChats()
})

onUnmounted(() => {
  window.removeEventListener('apiKeyChanged', handleApiKeyChanged)
})

const navigateTo = (path: string): void => {
  router.push(path)
}

const suggestions = [
  { text: '如何开始剪辑视频？', icon: SparklesOutline },
  { text: '帮我整理本地素材', icon: FilmOutline },
  { text: '有什么快捷键？', icon: FlashOutline }
]

// Chat UI State
interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  steps?: any[]
  timestamp: Date
}

const messages = ref<Message[]>([])
const isProcessingChat = ref(false)
const aiChats = ref<AiChatTopic[]>([])
const currentAiChatId = ref<number | null>(null)
const chatSteps = ref([
  { label: '正在分析主播与产品', state: 'wait' },
  { label: '正在挑选符合条件的视频', state: 'wait' },
  { label: '正在分析视频', state: 'wait' },
  { label: '视频已分析，正在剪辑视频', state: 'wait' },
  { label: '视频', state: 'wait' }
])

const scrollToBottom = async (): Promise<void> => {
  await nextTick()
  if (scrollContainer.value) {
    scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight
  }
}

watch(
  messages,
  () => {
    scrollToBottom()
  },
  { deep: true }
)

const loadAiChats = async (): Promise<void> => {
  try {
    aiChats.value = await getAiChatListApi(20)
  } catch (error) {
    console.error('加载 AI 对话失败:', error)
  }
}

const loadAiChatMessages = async (aiChatId: number): Promise<void> => {
  try {
    const list: AiChatMessage[] = await getAiChatMessagesApi(aiChatId)
    const normalized: Message[] = []
    list.forEach(item => {
      if (item.user_input) {
        normalized.push({
          id: `${item.id}-u`,
          role: 'user',
          content: item.user_input,
          timestamp: new Date(item.created_at)
        })
      }
      if (item.system_output) {
        normalized.push({
          id: `${item.id}-s`,
          role: 'assistant',
          content: item.system_output,
          timestamp: new Date(item.created_at)
        })
      }
    })
    messages.value = normalized
  } catch (error) {
    console.error('加载对话详情失败:', error)
  }
}

const startAiFlow = async (prompt: string): Promise<void> => {
  if (isProcessingChat.value) return

  messages.value = []
  isProcessingChat.value = true
  chatSteps.value.forEach(s => s.state = 'wait')

  try {
    const sanitizedPrompt = prompt.trim()
    const aiTopic = await createAiChatApi(sanitizedPrompt || '新建对话')
    aiChats.value = [aiTopic, ...aiChats.value]
    currentAiChatId.value = aiTopic.id

    messages.value.push({
      id: Date.now().toString(),
      role: 'user',
      content: sanitizedPrompt,
      timestamp: new Date()
    })

    // Add assistant placeholder with steps
    const assistantMsgId = (Date.now() + 1).toString()
    messages.value.push({
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      steps: chatSteps.value,
      timestamp: new Date()
    })
    
    // Step 1: 分析主播与产品
    chatSteps.value[0].state = 'process'
    await new Promise((resolve) => setTimeout(resolve, 1500))
    chatSteps.value[0].state = 'finish'

    // Step 2: 挑选符合条件的视频
    chatSteps.value[1].state = 'process'
    const videos = await getVideosApi()
    await new Promise((resolve) => setTimeout(resolve, 1500))
    chatSteps.value[1].state = 'finish'

    // Step 3: 调用智能剪辑接口
    chatSteps.value[2].state = 'process'
    const targetVideoIds = []
    if (targetVideoIds.length === 0) {
      throw new Error('未找到符合条件的视频')
    }
    
    const res = await smartCutApi(targetVideoIds, sanitizedPrompt, 30, 60)
    const taskId = res.task_id
    const systemOutput = `智能剪辑任务已创建，任务ID: ${taskId}`

    // Step 4: 循环查询状态 (正在分析视频)
    let completed = false
    let attempts = 0
    while (!completed && attempts < 20) {
      const history = await getSmartCutsApi(1, 10)
      const task = history.list.find((t) => t.id === taskId)
      if (task && task.status === 1) {
        completed = true
      } else if (task && (task.status === 3 || task.status === 4)) {
        throw new Error('视频处理失败')
      }
      await new Promise((resolve) => setTimeout(resolve, 3000))
      attempts++
    }
    
    chatSteps.value[2].state = 'finish'

    // Step 5: 视频已分析，正在剪辑视频
    chatSteps.value[3].state = 'process'
    await new Promise(resolve => setTimeout(resolve, 2000))
    chatSteps.value[3].state = 'finish'

    // Step 6: 剪辑完成后
    chatSteps.value[4].state = 'finish'

    // Persist conversation
    if (currentAiChatId.value) {
      await addAiChatMessageApi({
        ai_chat_id: currentAiChatId.value,
        user_input: sanitizedPrompt || '新建对话',
        system_output: systemOutput
      })
    }

    // Fill assistant message content locally
    const assistantMsg = messages.value.find(m => m.role === 'assistant' && !m.content)
    if (assistantMsg) assistantMsg.content = systemOutput
    await loadAiChatMessages(currentAiChatId.value!)

  } catch (error) {
    console.error('AI Flow failed:', error)
    const errStep = chatSteps.value.find(s => s.state === 'process')
    if (errStep) errStep.state = 'error'

    if (currentAiChatId.value) {
      await addAiChatMessageApi({
        ai_chat_id: currentAiChatId.value,
        user_input: prompt.trim() || '新建对话',
        system_output: `流程失败: ${error instanceof Error ? error.message : String(error)}`
      }).catch(err => console.error('记录对话失败:', err))
      await loadAiChatMessages(currentAiChatId.value)
    }
  } finally {
    isProcessingChat.value = false
  }
}

const handleSend = (val: string): void => {
  if (!val.trim()) return
  startAiFlow(val)
}

const handleSuggestionClick = (suggestion: string): void => {
  handleSend(suggestion)
}

const handleSelectChat = async (chat: AiChatTopic): Promise<void> => {
  currentAiChatId.value = chat.id
  isProcessingChat.value = false
  chatSteps.value.forEach(s => s.state = 'wait')
  await loadAiChatMessages(chat.id)
}

const handleNewChat = (): void => {
  currentAiChatId.value = null
  isProcessingChat.value = false
  messages.value = []
  chatSteps.value.forEach(s => s.state = 'wait')
}
</script>

<template>
  <div class="home-container">
    <div class="main-layout">
      <!-- Sidebar -->
      <div class="chat-sidebar">
        <div class="sidebar-header">
          <n-button type="primary" dashed block class="new-chat-btn" @click="handleNewChat">
            <template #icon><n-icon><AddOutline /></n-icon></template>
            开始新剪辑
          </n-button>
        </div>
        <div class="sidebar-content">
          <div class="sidebar-group">
            <div class="group-title">快捷入口</div>
            <div class="nav-item" @click="navigateTo('/video-manager')">
              <n-icon><Videocam /></n-icon>
              <span>视频管理</span>
              <n-icon class="arrow"><ChevronForward /></n-icon>
            </div>
            <div class="nav-item" @click="navigateTo('/smart-editor')">
              <n-icon><Cut /></n-icon>
              <span>智能剪辑</span>
              <n-icon class="arrow"><ChevronForward /></n-icon>
            </div>
          </div>
          <div class="sidebar-group">
            <div class="group-title">最近任务</div>
            <div v-if="!aiChats.length" class="history-empty">暂无相关历史</div>
            <div v-else class="history-list">
                <div v-for="chat in aiChats" :key="chat.id" class="nav-item history-item" @click="handleSelectChat(chat)">
                <div class="history-meta">
                  <div class="history-title">{{ chat.topic || '未命名对话' }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="sidebar-footer">
          <div class="nav-item" @click="navigateTo('/settings')">
            <n-icon><Settings /></n-icon>
            <span>系统设置</span>
          </div>
        </div>
      </div>

      <!-- Main Chat Area -->
      <div class="chat-main">
        <div class="chat-messages" ref="scrollContainer">
          <template v-if="messages.length === 0">
            <div class="empty-hero">
              <h1 class="welcome-text">影氪 <n-text type="primary">墨寒</n-text></h1>
              <p class="subtitle">今天想创作点什么？</p>
              
              <div class="suggestions-grid">
                <div v-for="s in suggestions" :key="s.text" class="suggestion-card" @click="handleSuggestionClick(s.text)">
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
            <div v-for="msg in messages" :key="msg.id" :class="['message-bubble', msg.role]">
              <div class="avatar">
                <n-icon v-if="msg.role === 'assistant'"><SparklesOutline /></n-icon>
                <div v-else class="user-avatar">墨</div>
              </div>
              <div class="message-content">
                <div v-if="msg.content" class="text-content">{{ msg.content }}</div>
              </div>
            </div>
          </template>
        </div>

        <!-- Float Status in Bottom Right -->
        <div v-if="isProcessingChat" class="fixed-status-container">
          <div class="ai-workflow-status">
            <div
              v-for="(step, index) in chatSteps"
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
        </div>

        <!-- Chat Input Area -->
        <div class="bottom-input-container">
          <div class="input-wrapper">
            <ChatInput @send="handleSend" />
            <div class="input-disclaimer">AI 生成内容可能存在偏差，请确认后使用。</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Main Layout Structure */
.main-layout {
  display: flex;
  height: 100vh;
  width: 100%;
  overflow: hidden;
}

/* Sidebar Styling */
.chat-sidebar {
  width: 260px;
  background: #121212;
  border-right: 1px solid rgba(255, 255, 255, 0.05);
  display: flex;
  flex-direction: column;
  padding: 16px;
  gap: 20px;
}

.new-chat-btn {
  height: 44px;
  border-radius: 12px;
  font-weight: 600;
}

.sidebar-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 24px;
  overflow-y: auto;
}

.sidebar-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.group-title {
  font-size: 12px;
  font-weight: 700;
  color: #444;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 0 8px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
  color: #888;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.05);
  color: #fff;
}

.nav-item .arrow {
  margin-left: auto;
  opacity: 0;
  font-size: 14px;
}

.nav-item:hover .arrow {
  opacity: 0.5;
}

.history-empty {
  font-size: 13px;
  color: #444;
  text-align: center;
  padding: 20px 0;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.history-item {
  align-items: flex-start;
}

.history-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.history-title {
  font-weight: 600;
  color: #ddd;
}

/* Main Chat Area Styling */
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

/* Message Bubble Styles */
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

/* Floating Status Styles */
.fixed-status-container {
  position: fixed;
  bottom: 120px;
  right: 40px;
  z-index: 100;
  width: 280px;
  animation: slideUp 0.5s cubic-bezier(0.165, 0.84, 0.44, 1);
}

.ai-workflow-status {
  background: rgba(28, 28, 28, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  backdrop-filter: blur(25px);
  -webkit-backdrop-filter: blur(25px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
}

.workflow-step {
  display: flex;
  align-items: center;
  gap: 12px;
  opacity: 0.3;
}

.workflow-step.process { opacity: 1; color: #3b82f6; }
.workflow-step.finish { opacity: 1; color: #63e2b7; }

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

@keyframes pulse {
  0% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.2); opacity: 0.5; }
  100% { transform: scale(1); opacity: 1; }
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(40px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
