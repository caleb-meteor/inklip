<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { NLayout, NLayoutSider, NLayoutContent } from 'naive-ui'
import HomeSidebar from '../components/home/HomeSidebar.vue'
import HomeRightSidebar from '../components/home/HomeRightSidebar.vue'
import HomeChatMessages from '../components/home/HomeChatMessages.vue'
import HomeVideoPlayer from '../components/home/HomeVideoPlayer.vue'
import QuickClip from './QuickClip.vue'
import DouyinBrowse from './DouyinBrowse.vue'
import ChatInput from '../components/ChatInput.vue'
import AppStatusBar from '../components/AppStatusBar.vue'
import { smartCutAiService, type AiChatTopic } from '../services/smartCutAiService'
import { aiChatStore } from '../services/aiChatStore'
import { addAiChatMessageApi } from '../api/aiChat'
import { recognizeIntentApi, type IntentType } from '../api/intent'

/** 意图：1=搜索 2=剪辑，其余为未支持 */
const INTENT_SEARCH = 1
const INTENT_CLIP = 2

const UNSUPPORTED_INTENT_TIP = `我可能还没有完全理解你的意思，可以再详细说明一下吗？`

/** 未选工作区时仅在对话区提示，不抛错 */
const WORKSPACE_REQUIRED_TIP =
  '请先在左侧选择一个工作区，再开始对话或搜索、剪辑。选择工作区后，该工作区下的视频会参与 AI 搜索与智能剪辑。'
import { useRealtimeSync } from '../composables/useRealtimeSync'
import { useRealtimeStore } from '../stores/realtime'
import type { HomePlayPayload } from '../api/video'
import { searchVideosApi } from '../api/video'
import { videoForMessagePayload } from '../utils/videoPayload'

const router = useRouter()
const route = useRoute()
const rtStore = useRealtimeStore()
const appVersion = ref<string>('0.0.1')
const leftSidebarCollapsed = ref(false)
const rightSidebarCollapsed = ref(true)

// 使用 composables
useRealtimeSync()

// 获取共享的 AI 对话存储
const messages = computed(() => aiChatStore.getMessages().value)
const aiChats = computed(() => aiChatStore.getAiChats().value)
const isLoadingAiChats = computed(() => aiChatStore.getIsLoadingAiChats().value)

// 检查是否有任务正在进行中
const isTaskRunning = computed(() => {
  return aiChatStore.getHasProcessingTask().value
})

const currentPlayingVideo = ref<HomePlayPayload | null>(null)
const currentSelectedWorkspace = ref<{ id: number; name: string } | null>(null)

const homeSidebarRef = ref<InstanceType<typeof HomeSidebar> | null>(null)
const homeRightSidebarRef = ref<InstanceType<typeof HomeRightSidebar> | null>(null)
const chatInputRef = ref<InstanceType<typeof ChatInput> | null>(null)
const quickClipRef = ref<InstanceType<typeof QuickClip> | null>(null)
let stopReconnectWatch: (() => void) | undefined

const handlePlayVideo = (payload: HomePlayPayload) => {
  currentPlayingVideo.value = payload
}

const handleClosePlayer = () => {
  currentPlayingVideo.value = null
}

/** 左侧视频区有改动时通知，将列表同步给 QuickClip 避免重复请求 */
const onVideosUpdated = (list: import('../api/video').VideoItem[]): void => {
  quickClipRef.value?.setVideosFromParent?.(list)
}

/** 长时间未操作/休眠恢复后：重新拉取工作区/视频、当前对话消息、剪辑历史（不再默认拉取 topic 列表） */
const refreshPageData = (): void => {
  homeSidebarRef.value?.loadAll?.()
  const chatId = aiChatStore.getCurrentAiChatId().value
  if (chatId != null) aiChatStore.loadAiChatMessages(chatId)
  homeRightSidebarRef.value?.refreshClipHistory?.()
}

const onVisibilityChange = (): void => {
  if (document.visibilityState === 'visible') refreshPageData()
}

/** 根据路由 query.chatId 定位到对应聊天（通知点击跳转用）；需已选工作区才能拉取列表 */
const selectChatFromRoute = async (): Promise<void> => {
  if (route.path !== '/home') return
  const chatIdStr = route.query.chatId
  if (!chatIdStr) return
  const chatId = Number(chatIdStr)
  if (!Number.isInteger(chatId)) return
  const wid = currentSelectedWorkspace.value?.id
  if (wid == null || wid <= 0) return
  await aiChatStore.loadAiChats()
  const chat =
    aiChatStore.getAiChats().value.find((c) => c.id === chatId) ?? ({ id: chatId } as AiChatTopic)
  await aiChatStore.selectChat(chat)
  router.replace({ path: '/home' })
}

onMounted(async () => {
  // 不再默认拉取 topic 列表；仅当路由带 chatId 时在 selectChatFromRoute 内拉取
  await selectChatFromRoute()

  // 恢复上次的视图模式（字幕剪辑 / AI），仅当当前在 /home 且无 chatId 时
  if (route.path === '/home' && !route.query.chatId) {
    try {
      const last = localStorage.getItem(LAST_VIEW_MODE_KEY)
      if (last === 'quick-clip') router.replace('/quick-clip')
    } catch {}
  }

  aiChatStore.setOnNewChatCallback(() => {
    chatInputRef.value?.focus?.()
  })

  document.addEventListener('visibilitychange', onVisibilityChange)
  // SSE 断线重连后同步一次数据，避免休眠期间数据丢失
  stopReconnectWatch = watch(
    () => rtStore.connected,
    (connected, wasConnected) => {
      if (wasConnected === false && connected === true) refreshPageData()
    }
  )

  // 通知带 chatId 跳转：须等工作区就绪后再拉列表并选中会话
  watch(
    () => [route.query.chatId, currentSelectedWorkspace.value?.id ?? null, route.path] as const,
    () => {
      void selectChatFromRoute()
    }
  )

  // 获取应用版本号
  if (window.api?.getAppVersion) {
    window.api.getAppVersion().then((version: string) => {
      appVersion.value = version
    })
  }

  // 当前在 AI 页时加载右侧「最近记录」与预拉剪辑历史（侧栏 v-if 在 /quick-clip 下不挂载，切换 tab 后需主动拉取）
  await nextTick()
  if (route.path === '/home') {
    await aiChatStore.loadAiChats()
    await nextTick()
    homeRightSidebarRef.value?.refreshClipHistory?.()
  }
})

/** 从字幕剪辑切回 AI 时右侧栏重新挂载，需拉取 topic 列表与剪辑历史 */
watch(
  () => route.path,
  async (path) => {
    if (path !== '/home') return
    await aiChatStore.loadAiChats()
    await nextTick()
    homeRightSidebarRef.value?.refreshClipHistory?.()
  }
)

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange)
  aiChatStore.setOnNewChatCallback(null)
  if (stopReconnectWatch) stopReconnectWatch()
})

/** AI 对话列表按当前工作区过滤；切换工作区后重拉 topic */
watch(
  currentSelectedWorkspace,
  (ws) => {
    aiChatStore.setWorkspaceScope(ws?.id ?? null)
    if (route.path === '/home') {
      void aiChatStore.loadAiChats()
    }
  },
  { immediate: true }
)

const LAST_VIEW_MODE_KEY = 'home.lastViewMode'

const navigateTo = (path: string): void => {
  const pathName = path.split('?')[0]
  if (pathName === '/quick-clip' || pathName === '/home') {
    try {
      localStorage.setItem(LAST_VIEW_MODE_KEY, pathName === '/quick-clip' ? 'quick-clip' : 'home')
    } catch {}
  }
  // /douyin 不写入 lastViewMode，避免下次启动误进抖音页
  router.push(path)
}

const handleSend = async (val: string): Promise<void> => {
  const trimmed = val.trim()
  if (!trimmed) return

  // 用户输入后先调用 jieba 意图识别
  let intentPayload:
    | {
        intent: number
        intent_label: string
        keywords: string[]
        keyword_weights?: { word: string; weight: number }[]
      }
    | undefined
  const intentResult = await recognizeIntentApi(trimmed)
  intentPayload = {
    intent: intentResult.intent,
    intent_label: intentResult.intent_label,
    keywords: intentResult.keywords,
    keyword_weights: intentResult.keyword_weights
  }

  // 识别到剪辑意图后，直接进入智能剪辑流程（会创建对话、添加用户消息并执行剪辑；传入 recognize 结果作关键词兜底）
  const intent = intentPayload?.intent as IntentType | undefined
  if (intent === INTENT_CLIP) {
    await smartCutAiService.startSmartCut(
      trimmed,
      { workspaceId: currentSelectedWorkspace.value?.id ?? null },
      {
        keywords: intentPayload.keywords,
        keyword_weights: intentPayload.keyword_weights
      }
    )
    return
  }

  // 如果没有当前对话，才创建新对话（未选工作区时在对话中提示，不请求后端）
  let currentAiChatId = aiChatStore.getCurrentAiChatId().value
  if (!currentAiChatId) {
    const topic = trimmed.length > 30 ? trimmed.slice(0, 30) + '…' : trimmed
    const created = await aiChatStore.createAiChat(topic || '新对话')
    if (!created) {
      const userMsgId = `new_message_${Date.now()}`
      aiChatStore.addMessage({
        id: userMsgId,
        role: 'user',
        content: trimmed,
        timestamp: new Date(),
        payload: intentPayload ?? undefined
      })
      aiChatStore.addMessage({
        id: `assistant_${Date.now()}`,
        role: 'assistant',
        content: WORKSPACE_REQUIRED_TIP,
        timestamp: new Date()
      })
      return
    }
    currentAiChatId = created.id
  }

  const userMsgId = `new_message_${Date.now()}`
  aiChatStore.addMessage({
    id: userMsgId,
    role: 'user',
    content: trimmed,
    timestamp: new Date(),
    payload: intentPayload ?? undefined
  })
  if (currentAiChatId) {
    await addAiChatMessageApi({
      ai_chat_id: currentAiChatId,
      role: 'user',
      content: trimmed,
      payload: intentPayload ?? undefined
    })
  }

  if (intent === INTENT_SEARCH) {
    const workspaceId = currentSelectedWorkspace.value?.id ?? undefined
    const searchRes = await searchVideosApi(trimmed, 5, workspaceId)
    const summary =
      searchRes.results.length > 0
        ? `共找到 ${searchRes.results.length} 个相关视频`
        : '未找到匹配的视频，可换个描述词试试'
    const assistantMsgId = `assistant_${Date.now()}`
    const compactResults = searchRes.results.map((item) => ({
      ...item,
      // 消息里不保存整段字幕，播放时按 videoId 再按需拉取
      video: videoForMessagePayload(item.video)
    }))
    const searchPayload = {
      type: 'search_result',
      results: compactResults,
      keywords: searchRes.keywords
    }
    aiChatStore.addMessage({
      id: assistantMsgId,
      role: 'assistant',
      content: summary,
      timestamp: new Date(),
      payload: searchPayload
    })
    if (currentAiChatId) {
      await addAiChatMessageApi({
        ai_chat_id: currentAiChatId,
        role: 'assistant',
        content: summary,
        payload: searchPayload
      })
    }
    return
  }

  // 非搜索/剪辑意图时，提示用户当前仅支持搜索与剪辑（intent 为 0 或 undefined）
  const isSupported =
    intentPayload?.intent === INTENT_SEARCH || intentPayload?.intent === INTENT_CLIP
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
      })
    }
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
            ref="homeSidebarRef"
            :collapsed="leftSidebarCollapsed"
            @navigate="navigateTo"
            @toggle-left-collapse="leftSidebarCollapsed = !leftSidebarCollapsed"
            @play-video="handlePlayVideo"
            @update:selected-workspace="currentSelectedWorkspace = $event"
            @click-video="quickClipRef?.scrollToVideoSubtitles?.($event)"
            @videos-updated="onVideosUpdated"
          />
        </n-layout-sider>

        <n-layout-content class="home-content">
          <HomeVideoPlayer
            v-show="currentPlayingVideo"
            :payload="currentPlayingVideo"
            @close="handleClosePlayer"
            @open-chat="handleNewChat"
          />
          <div v-show="!currentPlayingVideo" class="home-content-main">
            <QuickClip
              v-show="route.path === '/quick-clip'"
              ref="quickClipRef"
              :current-workspace="currentSelectedWorkspace"
              @navigate="navigateTo"
            />
            <DouyinBrowse v-show="route.path === '/douyin'" />
            <div v-show="route.path === '/home'" class="chat-layout">
              <div class="messages-container">
                <HomeChatMessages :messages="messages" @play-video="handlePlayVideo" />
              </div>

              <div class="input-area-wrapper">
                <div class="input-area-container">
                  <ChatInput ref="chatInputRef" :disabled="isTaskRunning" @send="handleSend" />
                </div>
              </div>
            </div>
          </div>

        </n-layout-content>

        <n-layout-sider
          v-if="route.path === '/home'"
          width="280"
          collapse-mode="width"
          :collapsed-width="48"
          :collapsed="rightSidebarCollapsed"
          class="home-right-sider"
          bordered
        >
          <HomeRightSidebar
            ref="homeRightSidebarRef"
            :ai-chats="aiChats"
            :is-loading-ai-chats="isLoadingAiChats"
            :collapsed="rightSidebarCollapsed"
            :current-workspace="currentSelectedWorkspace"
            @select-chat="handleSelectChat"
            @new-chat="handleNewChat"
            @toggle="rightSidebarCollapsed = !rightSidebarCollapsed"
            @play-video="handlePlayVideo"
          />
        </n-layout-sider>
      </n-layout>
    </div>

    <AppStatusBar :app-version="appVersion" @navigate-to-settings="navigateTo('/settings')" />
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

.home-content-main {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
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
