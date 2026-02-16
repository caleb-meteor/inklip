<script setup lang="ts">
import { ref, onMounted, computed, unref } from 'vue'
import { useRouter } from 'vue-router'
import { NLayout, NLayoutSider, NLayoutContent } from 'naive-ui'
import { FlashOutline, SparklesOutline, FilmOutline } from '@vicons/ionicons5'
import HomeSidebar from '../components/home/HomeSidebar.vue'
import HomeRightSidebar from '../components/home/HomeRightSidebar.vue'
import HomeChatMessages from '../components/home/HomeChatMessages.vue'
import HomeVideoPlayer from '../components/home/HomeVideoPlayer.vue'
import ChatInput from '../components/ChatInput.vue'
import VideoUploadChatModal from '../components/home/VideoUploadChatModal.vue'
import AppStatusBar from '../components/AppStatusBar.vue'
import { smartCutAiService, type AiChatTopic } from '../services/smartCutAiService'
import { aiChatStore } from '../services/aiChatStore'
import { addAiChatMessageApi } from '../api/aiChat'
import { recognizeIntentApi, type IntentType } from '../api/intent'

/** 意图：1=搜索 2=剪辑，其余为未支持 */
const INTENT_SEARCH = 1
const INTENT_CLIP = 2

const UNSUPPORTED_INTENT_TIP = `当前仅支持「搜索」和「剪辑」：

• **搜索**：用「找、搜、查、内容」等描述想找的视频内容
• **剪辑**：用「剪、片段」等描述要剪的内容

请重新描述您的需求。`
import { useWebSocketSync } from '../composables/useWebSocketSync'
import { useVideoUpload } from '../composables/useVideoUpload'
import type { VideoItem, SmartCutItem } from '../api/video'
import { searchVideosApi } from '../api/video'

const router = useRouter()
const appVersion = ref<string>('1.0.0')
const showUploadModal = ref(false)
const leftSidebarCollapsed = ref(false)
const rightSidebarCollapsed = ref(true)

// 使用 composables
useWebSocketSync()
const { handleUploadSuccess } = useVideoUpload()

// 获取共享的 AI 对话存储
const messages = computed(() => aiChatStore.getMessages().value)
const aiChats = computed(() => aiChatStore.getAiChats().value)
const isLoadingAiChats = computed(() => aiChatStore.getIsLoadingAiChats().value)

// 检查是否有任务正在进行中
const isTaskRunning = computed(() => {
  return aiChatStore.getIsCurrentChatProcessing().value
})

const currentPlayingVideo = ref<VideoItem | SmartCutItem | null>(null)
const currentSelectedAnchor = ref<any>(null)

const handlePlayVideo = (video: VideoItem | SmartCutItem) => {
  currentPlayingVideo.value = video
}

const handleClosePlayer = () => {
  currentPlayingVideo.value = null
}

onMounted(() => {
  aiChatStore.loadAiChats()
  // 首次加载时清空消息，准备新对话
  aiChatStore.newChat()
  
  // 获取应用版本号
  if (window.api?.getAppVersion) {
    window.api.getAppVersion().then((version: string) => {
      appVersion.value = version
    }).catch((err: any) => {
      console.warn('Failed to get app version:', err)
    })
  }
})

const navigateTo = (path: string): void => {
  router.push(path)
}

const suggestions = [
  { 
    text: '🎬 开始AI智能剪辑',
    description: '上传视频 → 选择<strong>【主播】</strong>和<strong>【产品】</strong> → 自动生成精彩片段',
    icon: SparklesOutline,
    action: 'upload'
  },
  { 
    text: '📤 导入本地视频素材',
    description: '支持批量导入，为剪辑做准备',
    icon: FilmOutline,
    isUpload: true
  },
  { 
    text: '💡 查看示例',
    description: '基于<strong>【主播】</strong>和<strong>【产品】</strong>自动匹配相关内容',
    icon: FlashOutline,
    action: 'example'
  }
]

const examplePrompts = [
  '李佳琪推荐的口红',
  '薇娅介绍的连衣裙',
  '辛巴讲解的iPhone手机'
]

const handleSend = async (val: string): Promise<void> => {
  const trimmed = val.trim()
  if (!trimmed) return

  // 用户输入后先调用 jieba 意图识别
  let intentPayload: { intent: number; intent_label: string; keywords: string[]; keyword_weights?: { word: string; weight: number }[] } | undefined
  try {
    const intentResult = await recognizeIntentApi(trimmed)
    intentPayload = {
      intent: intentResult.intent,
      intent_label: intentResult.intent_label,
      keywords: intentResult.keywords,
      keyword_weights: intentResult.keyword_weights
    }
  } catch (e) {
    console.warn('意图识别请求失败:', e)
  }

  // 识别到剪辑意图后，直接进入智能剪辑流程（会创建对话、添加用户消息并执行剪辑）
  const intent = intentPayload?.intent as IntentType | undefined
  if (intent === INTENT_CLIP) {
    await smartCutAiService.startSmartCut(trimmed)
    return
  }

  // 如果没有当前对话，才创建新对话
  let currentAiChatId = aiChatStore.getCurrentAiChatId().value
  if (!currentAiChatId) {
    const topic = trimmed.length > 30 ? trimmed.slice(0, 30) + '…' : trimmed
    await aiChatStore.createAiChat(topic || '新对话')
    currentAiChatId = aiChatStore.getCurrentAiChatId().value
  }

  const userMsgId = `new_message_${Date.now()}`
  aiChatStore.addMessage({
    id: userMsgId,
    role: 'user',
    content: trimmed,
    timestamp: new Date(),
    payload: intentPayload
  })
  if (currentAiChatId) {
    try {
      await addAiChatMessageApi({
        ai_chat_id: currentAiChatId,
        role: 'user',
        content: trimmed,
        payload: intentPayload
      })
    } catch (e) {
      console.error('保存用户消息失败:', e)
    }
  }

  // 识别到搜索意图后，进行全文搜索并展示结果（视频 + 匹配字幕时间）
  if (intent === INTENT_SEARCH) {
    try {
      const searchRes = await searchVideosApi(trimmed, 5)
      const summary = searchRes.results.length > 0
        ? `共找到 ${searchRes.results.length} 个相关视频`
        : '未找到匹配的视频，可换个描述词试试'
      const assistantMsgId = `assistant_${Date.now()}`
      aiChatStore.addMessage({
        id: assistantMsgId,
        role: 'assistant',
        content: summary,
        timestamp: new Date(),
        payload: {
          type: 'search_result',
          results: searchRes.results,
          keywords: searchRes.keywords
        }
      })
      if (currentAiChatId) {
        addAiChatMessageApi({
          ai_chat_id: currentAiChatId,
          role: 'assistant',
          content: summary,
          payload: {
            type: 'search_result',
            results: searchRes.results,
            keywords: searchRes.keywords
          }
        }).catch(e => console.error('保存搜索结果消息失败:', e))
      }
    } catch (e) {
      console.error('全文搜索失败:', e)
      const errMsgId = `assistant_${Date.now()}`
      aiChatStore.addMessage({
        id: errMsgId,
        role: 'assistant',
        content: '搜索失败，请稍后重试',
        timestamp: new Date()
      })
      if (currentAiChatId) {
        addAiChatMessageApi({
          ai_chat_id: currentAiChatId,
          role: 'assistant',
          content: '搜索失败，请稍后重试'
        }).catch(er => console.error('保存消息失败:', er))
      }
    }
    return
  }

  // 非搜索/剪辑意图时，提示用户当前仅支持搜索与剪辑
  const isSupported = intent === INTENT_SEARCH || intent === INTENT_CLIP
  if (intentPayload != null && !isSupported) {
    const assistantMsgId = `assistant_${Date.now()}`
    aiChatStore.addMessage({
      id: assistantMsgId,
      role: 'assistant',
      content: UNSUPPORTED_INTENT_TIP,
      timestamp: new Date()
    })
    if (currentAiChatId) {
      addAiChatMessageApi({
        ai_chat_id: currentAiChatId,
        role: 'assistant',
        content: UNSUPPORTED_INTENT_TIP
      }).catch(e => console.error('保存助手提示失败:', e))
    }
  }
}

const handleSuggestionClick = (suggestion: any): void => {
  if (suggestion.isUpload) {
    handleOpenUploadModal()
  } else if (suggestion.action === 'upload') {
    handleOpenUploadModal()
  } else if (suggestion.action === 'example') {
    // 随机选择一个示例提示词
    const randomPrompt = examplePrompts[Math.floor(Math.random() * examplePrompts.length)]
    handleSend(randomPrompt)
  } else {
    handleSend(suggestion.text || suggestion)
  }
}

const handleSelectChat = async (chat: AiChatTopic): Promise<void> => {
  currentPlayingVideo.value = null
  await aiChatStore.selectChat(chat)
}

const handleNewChat = (): void => {
  currentPlayingVideo.value = null
  aiChatStore.newChat()
}

const handleOpenUploadModal = (): void => {
  showUploadModal.value = true
}
</script>

<template>
  <div class="app-container">
    <div class="main-layout-wrapper">
      <n-layout has-sider class="home-layout">
        <n-layout-sider 
          width="240" 
          collapse-mode="width" 
          :collapsed-width="48"
          :collapsed="leftSidebarCollapsed"
          bordered
          class="home-sider"
        >
          <HomeSidebar
            :collapsed="leftSidebarCollapsed"
            @navigate="navigateTo"
            @toggle-left-collapse="leftSidebarCollapsed = !leftSidebarCollapsed"
            @play-video="handlePlayVideo"
            @update:selected-anchor="currentSelectedAnchor = $event"
          />
        </n-layout-sider>

        <n-layout-content class="home-content">
          <div v-if="!currentPlayingVideo" class="chat-layout">
            <div class="messages-container">
              <HomeChatMessages
                :messages="messages"
                :suggestions="suggestions"
                @suggestionClick="handleSuggestionClick"
              />
            </div>
            
            <div class="input-area-wrapper">
              <div class="input-area-container">
                <ChatInput 
                  :disabled="isTaskRunning" 
                  @send="handleSend" 
                  @open-upload-modal="handleOpenUploadModal"
                />
              </div>
            </div>
          </div>

          <HomeVideoPlayer
            v-else
            :video="currentPlayingVideo"
            @close="handleClosePlayer"
            @open-chat="handleNewChat"
          />
          
          <VideoUploadChatModal
            v-model:show="showUploadModal"
            @success="handleUploadSuccess"
          />
        </n-layout-content>
        
        <n-layout-sider 
          width="280" 
          collapse-mode="width" 
          :collapsed-width="48"
          :collapsed="rightSidebarCollapsed"
          class="home-right-sider"
          bordered
        >
          <HomeRightSidebar
            :ai-chats="aiChats"
            :is-loading-ai-chats="isLoadingAiChats"
            :collapsed="rightSidebarCollapsed"
            :current-anchor="currentSelectedAnchor"
            @select-chat="handleSelectChat"
            @new-chat="handleNewChat"
            @toggle="rightSidebarCollapsed = !rightSidebarCollapsed"
            @play-video="handlePlayVideo"
          />
        </n-layout-sider>
      </n-layout>
    </div>
    
    <AppStatusBar 
      :app-version="appVersion" 
      @navigate-to-settings="navigateTo('/settings')"
    />
  </div>
</template>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background: #09090b;
}

.main-layout-wrapper {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.home-layout {
  height: 100%;
  background: #0f0f0f;
}

.home-sider {
  background: #09090b; /* Very dark, almost black */
  border-right: 1px solid rgba(255, 255, 255, 0.05);
}

.home-right-sider {
  background: #09090b;
  border-left: 1px solid rgba(255, 255, 255, 0.05);
}

/* 右侧栏：禁止 sider 自身滚动，让内部 .tab-content 滚动，这样滚动翻页才能触发 */
.home-right-sider :deep(.n-layout-sider-scroll-container) {
  height: 100%;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.home-content {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.chat-layout {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #0f0f0f;
  background: radial-gradient(circle at 50% 10%, #1a1a1a 0%, #0f0f0f 60%);
  height: 100%;
  position: relative;
  overflow: hidden;
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding-bottom: 140px; /* Make space for fixed input */
  min-height: 0;
  -ms-overflow-style: none; /* IE and Edge */
  scrollbar-width: none; /* Firefox */
}

/* 优化消息容器的滚动条 */
.messages-container::-webkit-scrollbar {
  display: none;
}

.input-area-wrapper {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  width: 100%;
  padding-bottom: 24px;
  background: linear-gradient(to top, #0f0f0f 80%, transparent 100%); /* Fade out background */
  z-index: 100;
  display: flex;
  justify-content: center;
}

.input-area-container {
  width: 100%;
  padding: 0 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* 全局滚动条样式（用于其他区域） */
:deep(*::-webkit-scrollbar) {
  width: 6px;
  height: 6px;
}

:deep(*::-webkit-scrollbar-track) {
  background: transparent;
}

:deep(*::-webkit-scrollbar-thumb) {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 3px;
}

:deep(*::-webkit-scrollbar-thumb:hover) {
  background: rgba(255, 255, 255, 0.15);
}

/* Hide sider scrollbar */
:deep(.n-layout-sider .n-scrollbar-rail) {
  display: none;
}
</style>
