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
import { analyzeIntentStreamApi, addAiChatMessageApi, type AnalyzeIntentResult } from '../api/aiChat'
import { useWebSocketSync } from '../composables/useWebSocketSync'
import { useVideoUpload } from '../composables/useVideoUpload'
import type { VideoItem, SmartCutItem } from '../api/video'

const router = useRouter()
const appVersion = ref<string>('1.0.0')
const showUploadModal = ref(false)
const leftSidebarCollapsed = ref(false)
const rightSidebarCollapsed = ref(true)

// 使用 composables
useWebSocketSync()
const { handleUploadSuccess } = useVideoUpload()

// 获取共享的 AI 对话存储
const messages = computed(() => unref(aiChatStore.getMessages()))
const aiChats = computed(() => unref(aiChatStore.getAiChats()))

// 检查是否有任务正在进行中
const isTaskRunning = computed(() => {
  const state = smartCutAiService.getState()
  return unref(state.isProcessing) || unref(state.isAwaitingConfirmation)
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

  aiChatStore.newChat()
  const topic = trimmed.length > 30 ? trimmed.slice(0, 30) + '…' : trimmed
  await aiChatStore.createAiChat(topic || '新对话')
  const currentAiChatId = aiChatStore.getCurrentAiChatId().value

  const userMsgId = `new_message_${Date.now()}`
  aiChatStore.addMessage({
    id: userMsgId,
    role: 'user',
    content: trimmed,
    timestamp: new Date()
  })
  if (currentAiChatId) {
    try {
      await addAiChatMessageApi({
        ai_chat_id: currentAiChatId,
        role: 'user',
        content: trimmed
      })
    } catch (e) {
      console.error('保存用户消息失败:', e)
    }
  }

  const streamingMsgId = `assistant_stream_${Date.now()}`
  aiChatStore.addMessage({
    id: streamingMsgId,
    role: 'assistant',
    content: '正在分析您的意思…',
    timestamp: new Date()
  })

  let streamContent = ''

  try {
    await analyzeIntentStreamApi(trimmed, {
      onDelta(content: string) {
        streamContent += content
        // 流式阶段仅显示加载态，不展示原始 JSON
        aiChatStore.updateMessage(streamingMsgId, { content: '正在分析您的意思…' })
      },
      onResult(result: AnalyzeIntentResult) {
        if (result.intent === 'cut_video') {
          smartCutAiService.startSmartCut(trimmed, {
            minDuration: 30,
            maxDuration: 60,
            maxRetries: 20,
            retryInterval: 3000
          })
          return
        }

        // 只显示 reasoning（AI 用对话口吻对用户说的话）
        const mainReply = (result.reasoning && result.reasoning.trim()) ? result.reasoning.trim() : '请说明您是想「搜索视频」还是「剪辑视频」，例如：剪某主播某产品的视频。'
        const tip = result.intent === 'search_video' && result.search_content ? '\n\n→ 可以在侧栏或搜索入口进行视频搜索。' : ''
        const finalContent = mainReply + tip
        aiChatStore.updateMessage(streamingMsgId, { content: finalContent })
        if (currentAiChatId) {
          addAiChatMessageApi({
            ai_chat_id: currentAiChatId,
            role: 'assistant',
            content: finalContent
          }).catch(e => console.error('保存助手消息失败:', e))
        }
      },
      onError(err: Error) {
        aiChatStore.updateMessage(streamingMsgId, {
          content: `解析失败：${err.message}，请稍后重试。`
        })
      }
    })
  } catch (err) {
    console.error('意图分析或发送失败:', err)
    aiChatStore.updateMessage(streamingMsgId, {
      content: '网络或服务异常，请稍后重试。'
    })
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
