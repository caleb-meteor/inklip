<script setup lang="ts">
import { ref, onMounted, computed, unref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { NLayout, NLayoutSider, NLayoutContent, NIcon, NButton } from 'naive-ui'
import { FlashOutline, SparklesOutline, FilmOutline, SettingsOutline, ServerOutline, ListOutline, CloseOutline } from '@vicons/ionicons5'
import HomeSidebar from '../components/home/HomeSidebar.vue'
import HomeRightSidebar from '../components/home/HomeRightSidebar.vue'
import HomeChatMessages from '../components/home/HomeChatMessages.vue'
import ChatInput from '../components/ChatInput.vue'
import VideoUploadChatModal from '../components/home/VideoUploadChatModal.vue'
import VideoPlayer from '../components/VideoPlayer.vue'
import { smartCutAiService, type AiChatTopic } from '../services/smartCutAiService'
import { aiChatStore } from '../services/aiChatStore'
import { useWebsocketStore } from '../stores/websocket'
import { getSmartCutApi, getVideosApi, type VideoItem, type SmartCutItem } from '../api/video'
import { updateAiChatMessageApi, addAiChatMessageApi } from '../api/aiChat'

const router = useRouter()
const wsStore = useWebsocketStore()
const currentYear = computed(() => new Date().getFullYear())
const showUploadModal = ref(false)
const leftSidebarCollapsed = ref(false)
const rightSidebarCollapsed = ref(true)

// 获取共享的 AI 对话存储
const messages = computed(() => unref(aiChatStore.getMessages()))
const aiChats = computed(() => unref(aiChatStore.getAiChats()))

// 检查是否有任务正在进行中
const isTaskRunning = computed(() => {
  const state = smartCutAiService.getState()
  return unref(state.isProcessing) || unref(state.isAwaitingConfirmation)
})

const currentPlayingVideo = ref<VideoItem | null>(null)
const currentSelectedAnchor = ref<any>(null)

const handlePlayVideo = (video: VideoItem) => {
  currentPlayingVideo.value = video
}

const handlePlaySmartCut = (item: SmartCutItem) => {
  // Convert SmartCutItem to VideoItem format for player
  currentPlayingVideo.value = {
    ...item,
    id: item.id,
    name: item.name,
    path: item.path,
    cover: item.cover || '',
    duration: item.duration || 0,
    subtitle: item.subtitle,
    // Fill required VideoItem fields with defaults if missing
    size: item.size || 0,
    audio: '',
    silent: '',
    task_id: 0,
    sha256: '',
    status: item.status,
    created_at: item.created_at,
    updated_at: item.updated_at
  } as VideoItem
}

const handleClosePlayer = () => {
  currentPlayingVideo.value = null
}

onMounted(() => {
  aiChatStore.loadAiChats()
  // 首次加载时清空消息，准备新对话
  aiChatStore.newChat()
})

// 监听 WebSocket 的 videoUploaded 消息
watch(() => wsStore.videoUploaded, async (newValue) => {
  if (!newValue) return
  
  // 查找需要更新的视频上传消息
  const currentMessages = unref(messages)
  const videoUploadMessages = currentMessages.filter(msg => 
    msg.payload?.type === 'video_upload' && 
    msg.payload?.videos && 
    msg.payload.videos.length > 0
  )
  
  if (videoUploadMessages.length === 0) return
  
  try {
    // 收集所有需要查询的视频 ID
    const allVideoIds = new Set<number>()
    videoUploadMessages.forEach(msg => {
      msg.payload.videos.forEach(v => allVideoIds.add(v.id))
    })
    
    if (allVideoIds.size === 0) return

    // 批量查询最新状态
    const latestVideos = await getVideosApi(Array.from(allVideoIds))
    const videoMap = new Map(latestVideos.map(v => [v.id, v]))
    
    for (const msg of videoUploadMessages) {
      let hasUpdates = false
      const updatedVideos = msg.payload.videos.map(v => {
        const latestInfo = videoMap.get(v.id)
        if (latestInfo) {
          // 检查关键信息是否有变化（如封面、时长）
          if (latestInfo.cover !== v.cover || latestInfo.duration !== v.duration) {
            hasUpdates = true
            return {
              ...v,
              cover: latestInfo.cover,
              duration: latestInfo.duration,
              status: latestInfo.status
            }
          }
        }
        return v
      })
      
      if (hasUpdates) {
        const updatedPayload = { ...msg.payload, videos: updatedVideos }
        
        // 更新内存
        aiChatStore.updateMessage(msg.id, { payload: updatedPayload })
        
        // 更新数据库
        try {
          // 如果是临时ID，可能还没入库，这里尝试转换
          const msgIdNum = Number(msg.id)
          if (!isNaN(msgIdNum)) {
            await updateAiChatMessageApi(msgIdNum, { payload: updatedPayload })
          }
        } catch (error) {
          console.error('[WebSocket] Failed to update video upload message in DB:', error)
        }
        
        console.log(`[WebSocket] Updated video info for message ${msg.id}`)
      }
    }
  } catch (error) {
    console.error('[WebSocket] Failed to process video update:', error)
  }
})

// 监听 WebSocket 的 smart_cut 消息更新
watch(() => wsStore.smartCutUpdated, async (newValue) => {
  if (!newValue) return

  // 遍历当前聊天的所有消息，找到包含 aiGenVideoId 的消息
  const currentMessages = unref(messages)
  for (const msg of currentMessages) {
    if (msg.payload?.smartCutTask?.aiGenVideoId) {
      const aiGenVideoId = msg.payload.smartCutTask.aiGenVideoId
      
      try {
        // 调用 API 获取最新状态
        const latestData = await getSmartCutApi(aiGenVideoId)
        
        // 更新消息的 payload
        const updatedPayload = {
          ...msg.payload,
          smartCutTask: {
            ...msg.payload.smartCutTask,
            status: latestData.status,
            // 可以根据需要添加更多字段
            fileUrl: latestData.file_url,
            duration: latestData.duration
          }
        }
        
        // 更新内存中的消息
        aiChatStore.updateMessage(msg.id, { payload: updatedPayload })
        
        // 更新数据库中的消息
        try {
          await updateAiChatMessageApi(Number(msg.id), {
            payload: updatedPayload
          })
        } catch (error) {
          console.error('[WebSocket] Failed to update message in database:', error)
        }
        
        console.log(`[WebSocket] Updated AI gen video ${aiGenVideoId} status to ${latestData.status}`)
      } catch (error) {
        console.error(`[WebSocket] Failed to update AI gen video ${aiGenVideoId}:`, error)
      }
    }
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

const handleSend = (val: string): void => {
  if (!val.trim()) return
  smartCutAiService.startSmartCut(val, {
    minDuration: 30,
    maxDuration: 60,
    maxRetries: 20,
    retryInterval: 3000
  })
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
  await aiChatStore.selectChat(chat)
}

const handleNewChat = (): void => {
  aiChatStore.newChat()
}

const handleOpenUploadModal = (): void => {
  showUploadModal.value = true
}

const handleUploadSuccess = async (uploadedVideos: any[], metadata?: { anchor?: string, product?: string }): Promise<void> => {
  if (!uploadedVideos || uploadedVideos.length === 0) return

  try {
    // 1. 确保有会话，如果没有则创建
    let chatId = aiChatStore.getCurrentAiChatId().value
    if (!chatId) {
      let topic = `导入 ${uploadedVideos.length} 个视频`
      // 如果有元数据，构造更具体的主题
      if (metadata?.anchor && metadata?.product) {
        topic = `导入「${metadata.anchor}」的「${metadata.product}」${uploadedVideos.length}个视频`
      }
      
      const newChat = await aiChatStore.createAiChat(topic)
      chatId = newChat.id
    }

    // 2. 添加用户消息
    let userContent = `导入了 ${uploadedVideos.length} 个本地视频`
    if (metadata?.anchor && metadata?.product) {
      userContent = `导入了「${metadata.anchor}」的「${metadata.product}」共 ${uploadedVideos.length} 个本地视频`
    }
    
    // 保存到数据库
    const userMsg = await addAiChatMessageApi({
      ai_chat_id: chatId,
      role: 'user',
      content: userContent
    })
    
    // 添加到本地显示 (使用真实ID)
    aiChatStore.addMessage({
      id: userMsg.id.toString(),
      role: 'user',
      content: userContent,
      timestamp: new Date()
    })

    // 3. 添加助手消息（带视频卡片）
    // 过滤出有效的视频信息用于展示
    const displayVideos = uploadedVideos.map(v => ({
      id: v.id,
      name: v.name || v.filename,
      path: v.path,
      cover: v.cover,
      duration: v.duration,
      status: v.status // 确保保存状态
    }))

    const assistantContent = '视频导入成功，已添加到素材库。'
    const payload = {
      type: 'video_upload',
      videos: displayVideos,
      isInteractive: false, // 纯展示模式
      awaitingConfirmation: false
    }

    // 保存到数据库
    const assistantMsg = await addAiChatMessageApi({
      ai_chat_id: chatId,
      role: 'assistant',
      content: assistantContent,
      payload
    })

    // 添加到本地显示 (使用真实ID)
    aiChatStore.addMessage({
      id: assistantMsg.id.toString(),
      role: 'assistant',
      content: assistantContent,
      timestamp: new Date(),
      payload
    })

    // 滚动到底部
    // HomeChatMessages组件会监听messages变化自动滚动

  } catch (error) {
    console.error('Failed to update chat with uploaded videos', error)
  }
}
</script>

<template>
  <div class="app-container">
    <div class="main-layout-wrapper">
      <n-layout has-sider class="home-layout">
        <n-layout-sider 
          width="320" 
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
          <template v-if="!currentPlayingVideo">
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
          </template>

          <div v-else class="video-player-container">
            <div class="player-header">
              <h2 class="video-title">{{ currentPlayingVideo.name }}</h2>
              <n-button quaternary circle @click="handleClosePlayer" class="close-btn">
                <n-icon size="24"><CloseOutline /></n-icon>
              </n-button>
            </div>
            <div class="player-content">
              <VideoPlayer 
                :path="currentPlayingVideo.path" 
                :video-id="currentPlayingVideo.id"
                :subtitle-data="currentPlayingVideo.subtitle"
                autoplay
              />
            </div>
          </div>
          
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
          />
        </n-layout-sider>
      </n-layout>
    </div>
    
    <div class="app-status-bar">
      <div class="status-item clickable" @click="navigateTo('/settings')">
        <n-icon size="14"><SettingsOutline /></n-icon>
        <span>设置</span>
      </div>
      
      <div class="status-spacer"></div>
      
      <div class="status-item">
        <span>© {{ currentYear }} 影氪</span>
      </div>
      
      <div class="status-spacer"></div>
      
      <div class="status-item" :class="{ 'status-online': wsStore.connected, 'status-offline': !wsStore.connected }">
        <n-icon size="14"><ServerOutline /></n-icon>
        <span>{{ wsStore.connected ? '服务正常' : '服务离线' }}</span>
      </div>
    </div>
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

.app-status-bar {
  height: 36px;
  background: #09090b;
  border-top: 1px solid rgba(255, 255, 255, 0.08); /* Stronger border for separation */
  display: flex;
  align-items: center;
  padding: 0 16px;
  gap: 16px;
  font-size: 11px;
  color: #71717a;
  user-select: none;
  z-index: 1000; /* Ensure it stays on top */
}

.status-item {
  display: flex;
  align-items: center;
  gap: 6px;
  transition: color 0.3s ease;
}

.status-item.status-online {
  color: #10b981; /* Green-500 */
}

.status-item.status-offline {
  color: #ef4444; /* Red-500 */
}

.status-item.clickable {
  cursor: pointer;
  color: #71717a; /* Reset color for non-status items, or use specific class */
}

.status-item.clickable:hover {
  color: #e5e5e5;
}

.status-spacer {
  flex: 1;
}

.home-layout {
  height: 100%; /* Fill parent */
  background: #0f0f0f; /* Fallback */
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
  display: flex;
  flex-direction: column;
  background: #0f0f0f;
  background: radial-gradient(circle at 50% 10%, #1a1a1a 0%, #0f0f0f 60%);
  height: 100%;
  position: relative;
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding-bottom: 140px; /* Make space for fixed input */
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

.footer-copyright {
  font-size: 11px;
  color: #444;
  text-align: center;
  margin-top: 12px;
}

/* Custom Scrollbars */
:deep(*::-webkit-scrollbar) {
  width: 6px;
  height: 6px;
}

:deep(*::-webkit-scrollbar-track) {
  background: transparent;
}

:deep(*::-webkit-scrollbar-thumb) {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}

:deep(*::-webkit-scrollbar-thumb:hover) {
  background: rgba(255, 255, 255, 0.2);
}

/* Hide sider scrollbar */
:deep(.n-layout-sider .n-scrollbar-rail) {
  display: none;
}

.video-player-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px;
  box-sizing: border-box;
}

.player-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.video-title {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
  color: #e4e4e7;
}

.player-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  position: relative;
  background: black;
  border-radius: 8px;
}
</style>
