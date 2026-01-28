<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { FlashOutline, SparklesOutline, FilmOutline } from '@vicons/ionicons5'
import HomeSidebar from '../components/home/HomeSidebar.vue'
import HomeChatMessages from '../components/home/HomeChatMessages.vue'
import ChatInput from '../components/ChatInput.vue'
import { getVideosApi, smartCutApi, getSmartCutsApi } from '../api/video'
import { createAiChatApi, getAiChatListApi, addAiChatMessageApi, getAiChatMessagesApi, type AiChatTopic, type AiChatMessage } from '../api/aiChat'
import { getDictsFromSentenceApi, type DictItem } from '../api/dict'
import type { Message } from '../types/chat'

const router = useRouter()
const currentYear = computed(() => new Date().getFullYear())

onMounted(() => {
  loadAiChats()
})

const navigateTo = (path: string): void => {
  router.push(path)
}

const suggestions = [
  { text: '如何开始剪辑视频？', icon: SparklesOutline },
  { text: '帮我整理本地素材', icon: FilmOutline },
  { text: '有什么快捷键？', icon: FlashOutline }
]

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
    messages.value = list.map(item => ({
      id: item.id.toString(),
      role: item.role,
      content: item.content,
      payload: item.payload ? (typeof item.payload === 'string' ? JSON.parse(item.payload) : item.payload) : undefined,
      timestamp: new Date(item.created_at)
    }))
  } catch (error) {
    console.error('加载对话详情失败:', error)
  }
}

const filterVideosByDicts = (videos: any[], dicts: DictItem[]): any[] => {
  const dictNames = dicts.map(d => d.name)
  return videos.filter(video =>
    dictNames.some(name =>
      video.title?.includes(name) || video.description?.includes(name)
    )
  )
}

const startAiFlow = async (prompt: string): Promise<void> => {
  if (isProcessingChat.value) return

  messages.value = []
  isProcessingChat.value = true
  chatSteps.value.forEach(s => { s.state = 'wait' })

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

    const analyzingMsgId = (Date.now() + 1).toString()
    messages.value.push({
      id: analyzingMsgId,
      role: 'assistant',
      content: '正在分析...',
      isAnalyzing: true,
      timestamp: new Date()
    })
    await new Promise(resolve => setTimeout(resolve, 1000))

    chatSteps.value[0].state = 'process'
    const matchedDicts = await getDictsFromSentenceApi(sanitizedPrompt)

    const analyzingMsg = messages.value.find(m => m.id === analyzingMsgId)
    if (analyzingMsg) {
      analyzingMsg.isAnalyzing = false
      analyzingMsg.content = matchedDicts.length > 0
        ? `解析成功，找到${matchedDicts.length}个相关词典：${matchedDicts.map(d => d.name).join('、')}`
        : '未找到相关词典'
      analyzingMsg.dicts = matchedDicts
    }
    chatSteps.value[0].state = 'finish'

    const assistantMsgId = (Date.now() + 2).toString()
    messages.value.push({
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      steps: chatSteps.value.slice(1),
      timestamp: new Date()
    })

    chatSteps.value[1].state = 'process'
    await new Promise(resolve => setTimeout(resolve, 1500))
    chatSteps.value[1].state = 'finish'

    chatSteps.value[2].state = 'process'
    const videos = await getVideosApi()
    const filteredVideos = filterVideosByDicts(videos, matchedDicts)
    await new Promise(resolve => setTimeout(resolve, 1500))
    chatSteps.value[2].state = 'finish'

    chatSteps.value[3].state = 'process'
    const targetVideoIds = filteredVideos.map(v => v.id)
    if (targetVideoIds.length === 0) {
      throw new Error('未找到符合条件的视频')
    }

    const res = await smartCutApi(targetVideoIds, sanitizedPrompt, 30, 60)
    const taskId = res.task_id
    const systemOutput = `\n字典解析: ${matchedDicts.length > 0 ? matchedDicts.map(d => d.name).join('、') : '未找到相关词典'}\n智能剪辑任务已创建，任务ID: ${taskId}`

    let completed = false
    let attempts = 0
    while (!completed && attempts < 20) {
      const history = await getSmartCutsApi(1, 10)
      const task = history.list.find(t => t.id === taskId)
      if (task && task.status === 1) {
        completed = true
      } else if (task && (task.status === 3 || task.status === 4)) {
        throw new Error('视频处理失败')
      }
      await new Promise(resolve => setTimeout(resolve, 3000))
      attempts++
    }

    chatSteps.value[3].state = 'finish'
    chatSteps.value[4].state = 'process'
    await new Promise(resolve => setTimeout(resolve, 2000))
    chatSteps.value[4].state = 'finish'

    if (currentAiChatId.value) {
      await addAiChatMessageApi({
        ai_chat_id: currentAiChatId.value,
        role: 'assistant',
        content: systemOutput
      })
    }

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
        role: 'assistant',
        content: `流程失败: ${error instanceof Error ? error.message : String(error)}`
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
  chatSteps.value.forEach(s => { s.state = 'wait' })
  await loadAiChatMessages(chat.id)
}

const handleNewChat = (): void => {
  currentAiChatId.value = null
  isProcessingChat.value = false
  messages.value = []
  chatSteps.value.forEach(s => { s.state = 'wait' })
}
</script>

<template>
  <div class="home-container">
    <div class="main-layout">
      <HomeSidebar
        :ai-chats="aiChats"
        @navigate="navigateTo"
        @new-chat="handleNewChat"
        @select-chat="handleSelectChat"
      />

      <HomeChatMessages
        :messages="messages"
        :suggestions="suggestions"
        @suggestionClick="handleSuggestionClick"
      >
        <template #footer>
          <div class="bottom-input-container">
            <div class="input-wrapper">
              <ChatInput @send="handleSend" />
              <div class="input-disclaimer">© {{ currentYear }} 影氪. All rights reserved.</div>
            </div>
          </div>
        </template>
      </HomeChatMessages>
    </div>
  </div>
</template>

<style scoped>
.home-container {
  background: #0f0f0f;
  color: #fff;
  min-height: 100vh;
}

.main-layout {
  display: flex;
  height: 100vh;
  width: 100%;
  overflow: hidden;
}

.bottom-input-container {
  padding: 16px 0 16px;
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

/* 自定义滚动条样式 */
:deep(*::-webkit-scrollbar) {
  width: 8px;
  height: 8px;
}

:deep(*::-webkit-scrollbar-track) {
  background: rgba(255, 255, 255, 0.02);
  border-radius: 4px;
}

:deep(*::-webkit-scrollbar-thumb) {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  transition: background 0.2s ease;
}

:deep(*::-webkit-scrollbar-thumb:hover) {
  background: rgba(255, 255, 255, 0.2);
}

/* Firefox 滚动条样式 */
:deep(*) {
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.1) rgba(255, 255, 255, 0.02);
}
</style>
