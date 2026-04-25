<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch, nextTick, shallowRef, provide } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { NLayout, NLayoutSider, NLayoutContent, NIcon, NPopover, NButton, NSpin, NEmpty, NTooltip, NBadge } from 'naive-ui'
import { FolderOpenOutline, ChevronDownOutline, TrashOutline, ImagesOutline, MenuOutline, ChevronBackOutline, TimeOutline, CloseOutline, ArrowUpCircleOutline } from '@vicons/ionicons5'
import appIcon from '../../../../resources/icon.png'
import type { WorkspaceItem } from '../api/workspace'
import {
  getExportHistoryApi,
  deleteExportHistoryApi,
  labelForExportVideoType,
  type ExportHistoryItem,
  type ExportVideoType
} from '../api/video'
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
import { quickClipBridgeKey, type QuickClipBridge } from '../utils/quickClipBridge'

const router = useRouter()
const route = useRoute()
const rtStore = useRealtimeStore()
const activeExportJob = computed(() => rtStore.activeExportJob)
const isExportingGlobal = computed(() => rtStore.isExporting)
const isSvip = computed(() => rtStore.usageInfo.userType === 'svip')
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
const chatInputRef = ref<InstanceType<typeof ChatInput> | null>(null)
const quickClipRef = ref<InstanceType<typeof QuickClip> | null>(null)
const quickClipBridge = shallowRef<QuickClipBridge | null>(null)

watch(
  quickClipRef,
  (inst) => {
    if (!inst) {
      quickClipBridge.value = null
      return
    }
    quickClipBridge.value = {
      appendSegmentsToSelected: (segs) => inst.appendSegmentsToSelected(segs),
      exportSegmentsDirect: (segs, wid, name, exportType) =>
        inst.exportSegmentsDirect(segs, wid, name, exportType)
    }
  },
  { immediate: true }
)

provide(quickClipBridgeKey, quickClipBridge)

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

/** 长时间未操作/休眠恢复后：重新拉取工作区/视频、当前对话消息（不再默认拉取 topic 列表） */
const refreshPageData = (): void => {
  homeSidebarRef.value?.loadAll?.()
  const chatId = aiChatStore.getCurrentAiChatId().value
  if (chatId != null) aiChatStore.loadAiChatMessages(chatId)
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

  // 当前在 AI 页时加载右侧「最近记录」（侧栏 v-if 在 /quick-clip 下不挂载，切换 tab 后需主动拉取）
  await nextTick()
  if (route.path === '/home') {
    await aiChatStore.loadAiChats()
  }
})

/** 从字幕剪辑切回 AI 时右侧栏重新挂载，需拉取 topic 列表 */
watch(
  () => route.path,
  async (path) => {
    if (path !== '/home') return
    await aiChatStore.loadAiChats()
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

const isMaterialCenterRoute = computed(
  () =>
    route.path === '/material-center' || route.path === '/cloud-media' || route.path === '/douyin'
)

// ===== 全局顶部栏：工作空间切换 =====
const showWorkspacePopover = ref(false)
const headerWorkspaces = computed<WorkspaceItem[]>(() => homeSidebarRef.value?.workspaces ?? [])
const headerSelectedWorkspaceId = computed<number | null>(
  () => homeSidebarRef.value?.selectedWorkspaceId ?? null
)
const headerWorkspaceSelecting = computed<boolean>(
  () => homeSidebarRef.value?.workspaceSelecting ?? false
)
const headerWorkspaceLabel = computed(
  () => homeSidebarRef.value?.currentWorkspaceLabel || currentSelectedWorkspace.value?.name || '选择空间'
)
const handleSelectWorkspace = (ws: WorkspaceItem): void => {
  homeSidebarRef.value?.onSelectWorkspace?.(ws)
  showWorkspacePopover.value = false
}
const handleSelectWorkspaceDir = async (): Promise<void> => {
  showWorkspacePopover.value = false
  await homeSidebarRef.value?.onSelectWorkspaceDir?.()
}
const handleDeleteWorkspace = async (ws: WorkspaceItem): Promise<void> => {
  await homeSidebarRef.value?.onDeleteWorkspace?.(ws)
}

// ===== 全局顶部栏：导出历史面板 =====
const showExportHistoryPanel = ref(false)
const exportHistoryList = ref<ExportHistoryItem[]>([])
const loadingExportHistory = ref(false)
const exportHistoryTab = ref<ExportVideoType>('subtitle_clip')
const exportHistoryBadge = computed(() => (isExportingGlobal.value ? 1 : 0))

const exportJobMatchesTab = computed(() => {
  const job = activeExportJob.value
  if (!job) return false
  const t = (job.exportType || 'subtitle_clip') as ExportVideoType
  return t === exportHistoryTab.value
})

const EXPORT_HISTORY_TABS: { value: ExportVideoType; label: string }[] = [
  { value: 'subtitle_clip', label: '字幕剪辑' },
  { value: 'ai', label: 'AI 剪辑' },
  { value: 'douyin', label: '抖音素材' }
]

function exportTypeOfItem(item: ExportHistoryItem): ExportVideoType {
  const t = item.export_type
  if (t === 'ai' || t === 'douyin') return t
  return 'subtitle_clip'
}

const filteredExportHistoryList = computed(() =>
  exportHistoryList.value.filter((item) => exportTypeOfItem(item) === exportHistoryTab.value)
)

const exportHistoryEmptyDesc = computed(() => {
  if (exportHistoryList.value.length === 0) return '暂无导出记录'
  return '该分类暂无导出记录'
})

async function loadExportHistory() {
  const wid = currentSelectedWorkspace.value?.id
  if (!wid) {
    exportHistoryList.value = []
    return
  }
  loadingExportHistory.value = true
  try {
    const res = await getExportHistoryApi({ workspace_id: wid })
    exportHistoryList.value = res.list || []
  } catch {
    exportHistoryList.value = []
  } finally {
    loadingExportHistory.value = false
  }
}

function toggleExportHistoryPanel() {
  showExportHistoryPanel.value = !showExportHistoryPanel.value
  if (showExportHistoryPanel.value) loadExportHistory()
}

watch(isExportingGlobal, (v, oldV) => {
  if (oldV === true && v === false && showExportHistoryPanel.value) {
    void loadExportHistory()
  }
})

async function deleteExportHistoryItem(id: number) {
  await deleteExportHistoryApi(id)
  await loadExportHistory()
}

function openExportFolder(item: ExportHistoryItem) {
  if (item.output_missing || !item.output_path?.trim()) return
  void window.api?.showItemInFolder(item.output_path)
}

function applyExportHistorySubtitles(exportVideoId: number) {
  quickClipRef.value?.loadExportHistorySubtitles?.(exportVideoId)
  showExportHistoryPanel.value = false
}

function formatExportDate(s: string) {
  if (!s) return ''
  const d = new Date(s)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const navigateTo = (path: string): void => {
  const pathName = path.split('?')[0]
  if (pathName === '/quick-clip' || pathName === '/home') {
    try {
      localStorage.setItem(LAST_VIEW_MODE_KEY, pathName === '/quick-clip' ? 'quick-clip' : 'home')
    } catch {}
  }
  // /material-center 不写入 lastViewMode，避免下次启动误进素材中心页
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
      <div class="global-topbar">
        <div class="global-topbar-left">
          <button
            class="topbar-collapse-btn"
            type="button"
            :title="leftSidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'"
            @click="leftSidebarCollapsed = !leftSidebarCollapsed"
          >
            <n-icon size="16">
              <MenuOutline v-if="leftSidebarCollapsed" />
              <ChevronBackOutline v-else />
            </n-icon>
          </button>

          <n-popover
            trigger="click"
            placement="bottom-start"
            :show="showWorkspacePopover"
            :width="360"
            :show-arrow="false"
            content-class="topbar-workspace-popover-box"
            :content-style="{ padding: 0 }"
            @update:show="showWorkspacePopover = $event"
          >
            <template #trigger>
              <button
                class="topbar-workspace-btn"
                :class="{ selecting: headerWorkspaceSelecting }"
                type="button"
              >
                <n-icon size="14"><FolderOpenOutline /></n-icon>
                <span class="topbar-workspace-label">{{ headerWorkspaceLabel }}</span>
                <n-icon size="11"><ChevronDownOutline /></n-icon>
              </button>
            </template>
            <div class="topbar-ws-popover">
              <div
                v-for="ws in headerWorkspaces"
                :key="ws.id"
                class="topbar-ws-item"
                :class="{ 'is-active': headerSelectedWorkspaceId === ws.id }"
                @click="handleSelectWorkspace(ws)"
              >
                <div class="topbar-ws-item__main">
                  <div class="topbar-ws-item__name">{{ ws.name }}</div>
                  <div v-if="ws.path" class="topbar-ws-item__path" :title="ws.path">{{ ws.path }}</div>
                </div>
                <div
                  class="topbar-ws-item__delete"
                  title="删除工作空间"
                  @click.stop="handleDeleteWorkspace(ws)"
                >
                  <n-icon size="14"><TrashOutline /></n-icon>
                </div>
              </div>
              <div class="topbar-ws-item topbar-ws-item--action" @click="handleSelectWorkspaceDir">
                选择目录…
              </div>
            </div>
          </n-popover>
        </div>

        <div class="global-topbar-center" title="影氪">
          <img :src="appIcon" alt="影氪" class="topbar-brand-logo" />
          <span class="topbar-brand-name">影氪</span>
        </div>

        <div class="global-topbar-right-group">
          <n-badge :value="exportHistoryBadge" :max="9" :show-zero="false" :offset="[-6, 6]">
            <button
              class="topbar-action-btn"
              :class="{ active: showExportHistoryPanel }"
              type="button"
              @click="toggleExportHistoryPanel"
            >
              <n-icon size="14"><TimeOutline /></n-icon>
              <span>导出历史</span>
            </button>
          </n-badge>
          <button
            v-if="isSvip"
            class="topbar-action-btn"
            :class="{ active: isMaterialCenterRoute }"
            type="button"
            @click="navigateTo('/material-center')"
          >
            <n-icon size="14"><ImagesOutline /></n-icon>
            <span>抖音素材</span>
          </button>
        </div>
      </div>

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
            <DouyinBrowse
              v-show="isMaterialCenterRoute"
              :workspace-id="currentSelectedWorkspace?.id ?? null"
            />
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
            :ai-chats="aiChats"
            :is-loading-ai-chats="isLoadingAiChats"
            :collapsed="rightSidebarCollapsed"
            :current-workspace="currentSelectedWorkspace"
            @select-chat="handleSelectChat"
            @new-chat="handleNewChat"
            @toggle="rightSidebarCollapsed = !rightSidebarCollapsed"
          />
        </n-layout-sider>
      </n-layout>

      <!-- 导出历史浮动面板 -->
      <Transition name="eh-slide">
        <div v-if="showExportHistoryPanel" class="export-history-overlay">
          <div class="eh-panel">
            <div class="eh-panel-header">
              <span class="eh-panel-title">
                <n-icon size="15"><TimeOutline /></n-icon>
                导出历史
              </span>
              <n-button quaternary size="tiny" @click="showExportHistoryPanel = false">
                <n-icon size="14"><CloseOutline /></n-icon>
              </n-button>
            </div>
            <div class="eh-panel-body">
              <div class="eh-tab-row">
                <button
                  v-for="tab in EXPORT_HISTORY_TABS"
                  :key="tab.value"
                  type="button"
                  class="eh-tab"
                  :class="{ 'eh-tab--active': exportHistoryTab === tab.value }"
                  @click="exportHistoryTab = tab.value"
                >
                  {{ tab.label }}
                </button>
              </div>
              <n-spin :show="loadingExportHistory" size="small">
                <div v-if="!loadingExportHistory && filteredExportHistoryList.length === 0" class="eh-empty">
                  <n-empty :description="exportHistoryEmptyDesc" size="small" />
                </div>
                <div v-else-if="!loadingExportHistory" class="eh-list">
                  <div
                    v-if="exportJobMatchesTab"
                    class="eh-item eh-item--exporting"
                  >
                    <div class="eh-item-content">
                      <span class="eh-item-name" :title="activeExportJob?.suggestedName || '正在导出…'">
                        {{ activeExportJob?.suggestedName || '正在导出…' }}
                      </span>
                      <span class="eh-item-meta">
                        <span
                          class="eh-type-tag"
                          :class="
                            activeExportJob?.exportType === 'ai'
                              ? 'eh-type-tag--ai'
                              : activeExportJob?.exportType === 'douyin'
                                ? 'eh-type-tag--douyin'
                                : 'eh-type-tag--subtitle'
                          "
                        >{{ labelForExportVideoType(activeExportJob?.exportType) }}</span>
                        <span class="eh-meta-sep">·</span>
                        <span class="eh-export-pct">{{ Math.round(activeExportJob?.progress ?? 0) }}%</span>
                      </span>
                      <div class="eh-export-progress">
                        <n-progress
                          type="line"
                          :percentage="Math.round(activeExportJob?.progress ?? 0)"
                          :height="10"
                          :border-radius="6"
                          indicator-placement="inside"
                          processing
                        />
                      </div>
                    </div>
                    <div class="eh-item-actions">
                      <n-tooltip placement="top" trigger="hover">
                        <template #trigger>
                          <n-button quaternary size="tiny" disabled>
                            <n-icon size="14"><FolderOpenOutline /></n-icon>
                          </n-button>
                        </template>
                        导出中…
                      </n-tooltip>
                      <n-tooltip placement="top" trigger="hover">
                        <template #trigger>
                          <n-button quaternary size="tiny" type="error" disabled>
                            <n-icon size="14"><TrashOutline /></n-icon>
                          </n-button>
                        </template>
                        导出中不可删除
                      </n-tooltip>
                    </div>
                  </div>
                  <div
                    v-for="item in filteredExportHistoryList"
                    :key="item.id"
                    class="eh-item"
                  >
                    <div class="eh-item-content">
                      <span class="eh-item-name" :title="item.suggested_name">{{ item.suggested_name }}</span>
                      <span class="eh-item-meta">
                        <span
                          class="eh-type-tag"
                          :class="
                            item.export_type === 'ai'
                              ? 'eh-type-tag--ai'
                              : item.export_type === 'douyin'
                                ? 'eh-type-tag--douyin'
                                : 'eh-type-tag--subtitle'
                          "
                        >{{ labelForExportVideoType(item.export_type) }}</span>
                        <span class="eh-meta-sep">·</span>
                        {{ formatExportDate(item.created_at) }}
                        <template v-if="item.output_path && item.output_missing">
                          · <span class="eh-item-deleted">已删除</span>
                        </template>
                      </span>
                    </div>
                    <div class="eh-item-actions">
                      <n-tooltip v-if="item.output_path" placement="top" trigger="hover">
                        <template #trigger>
                          <n-button
                            quaternary size="tiny"
                            :disabled="!!item.output_missing"
                            @click.stop="openExportFolder(item)"
                          >
                            <n-icon size="14"><FolderOpenOutline /></n-icon>
                          </n-button>
                        </template>
                        {{ item.output_missing ? '文件已删除' : '打开所在文件夹' }}
                      </n-tooltip>
                      <n-tooltip
                        v-if="route.path === '/quick-clip' && item.export_type !== 'douyin'"
                        placement="top"
                        trigger="hover"
                      >
                        <template #trigger>
                          <n-button quaternary size="tiny" type="primary" @click.stop="applyExportHistorySubtitles(item.id)">
                            <n-icon size="14"><ArrowUpCircleOutline /></n-icon>
                          </n-button>
                        </template>
                        引用此记录中的字幕
                      </n-tooltip>
                      <n-tooltip placement="top" trigger="hover">
                        <template #trigger>
                          <n-button quaternary size="tiny" type="error" @click.stop="deleteExportHistoryItem(item.id)">
                            <n-icon size="14"><TrashOutline /></n-icon>
                          </n-button>
                        </template>
                        删除该导出记录
                      </n-tooltip>
                    </div>
                  </div>
                </div>
              </n-spin>
            </div>
          </div>
        </div>
      </Transition>
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
  position: relative;
}

/* ===== 全局顶部栏 ===== */
.global-topbar {
  flex-shrink: 0;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  background: #09090b;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  -webkit-app-region: drag;
  user-select: none;
}

.global-topbar-left {
  display: flex;
  align-items: center;
  gap: 6px;
  -webkit-app-region: no-drag;
}

.topbar-collapse-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: #a1a1aa;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
}
.topbar-collapse-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #e4e4e7;
}

.topbar-workspace-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.03);
  color: #e4e4e7;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
  max-width: 200px;
}
.topbar-workspace-btn:hover {
  background: rgba(255, 255, 255, 0.07);
  border-color: rgba(255, 255, 255, 0.12);
}
.topbar-workspace-btn.selecting {
  opacity: 0.6;
  pointer-events: none;
}

.topbar-workspace-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

.global-topbar-center {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 6px;
  pointer-events: none;
}
.topbar-brand-logo {
  width: 20px;
  height: 20px;
  border-radius: 4px;
}
.topbar-brand-name {
  font-size: 13px;
  font-weight: 600;
  color: #d4d4d8;
  letter-spacing: 0.5px;
}

.global-topbar-right-group {
  display: flex;
  align-items: center;
  gap: 6px;
  -webkit-app-region: no-drag;
}

.topbar-action-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 6px;
  background: transparent;
  color: #a1a1aa;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}
.topbar-action-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #e4e4e7;
}
.topbar-action-btn.active {
  background: rgba(99, 102, 241, 0.12);
  border-color: rgba(99, 102, 241, 0.25);
  color: #818cf8;
}

/* ===== 导出历史浮动面板 ===== */
.export-history-overlay {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 360px;
  max-width: 100%;
  z-index: 200;
  display: flex;
  flex-direction: column;
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.55);
}

.eh-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #111113;
  border-left: 1px solid rgba(255, 255, 255, 0.18);
  outline: 1px solid rgba(0, 0, 0, 0.35);
  overflow: hidden;
}

.eh-panel-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 600;
  color: #e4e4e7;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.25);
}
.eh-panel-title {
  display: flex;
  align-items: center;
  gap: 6px;
}

.eh-tab-row {
  display: flex;
  gap: 4px;
  padding: 0 0 10px;
  flex-shrink: 0;
}
.eh-tab {
  flex: 1;
  min-width: 0;
  padding: 6px 4px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  color: #a1a1aa;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}
.eh-tab:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #e4e4e7;
}
.eh-tab--active {
  background: rgba(99, 102, 241, 0.15);
  border-color: rgba(99, 102, 241, 0.35);
  color: #a5b4fc;
}

.eh-panel-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px;
}
.eh-panel-body::-webkit-scrollbar {
  width: 4px;
}
.eh-panel-body::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 2px;
}

.eh-empty {
  padding: 32px 16px;
  text-align: center;
}

.eh-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.eh-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  transition: background 0.15s, border-color 0.15s;
}

.eh-item--exporting {
  position: sticky;
  top: 0;
  z-index: 3;
  border-color: rgba(79, 172, 254, 0.45);
  background: rgba(79, 172, 254, 0.14);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(6px);
}
.eh-export-progress {
  margin-top: 10px;
}
.eh-export-pct {
  font-size: 12px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.88);
}
.eh-item:hover {
  background: rgba(255, 255, 255, 0.07);
  border-color: rgba(255, 255, 255, 0.12);
}

.eh-item-content {
  flex: 1;
  min-width: 0;
}
.eh-item-name {
  display: block;
  font-size: 12px;
  color: #f5f5f7;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.eh-item-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.45);
  margin-top: 4px;
}
.eh-meta-sep {
  opacity: 0.55;
}
.eh-type-tag {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.eh-type-tag--subtitle {
  color: #6ee7b7;
  background: rgba(16, 185, 129, 0.2);
  border: 1px solid rgba(52, 211, 153, 0.35);
}
.eh-type-tag--ai {
  color: #93c5fd;
  background: rgba(59, 130, 246, 0.22);
  border: 1px solid rgba(96, 165, 250, 0.4);
}
.eh-type-tag--douyin {
  color: #fbbf24;
  background: rgba(245, 158, 11, 0.2);
  border: 1px solid rgba(251, 191, 36, 0.45);
}
.eh-item-deleted {
  color: #f87171;
  font-weight: 500;
}

.eh-item-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.15s;
}
.eh-item:hover .eh-item-actions {
  opacity: 1;
}

/* Transition */
.eh-slide-enter-active,
.eh-slide-leave-active {
  transition: transform 0.25s ease, opacity 0.25s ease;
}
.eh-slide-enter-from,
.eh-slide-leave-to {
  transform: translateX(100%);
  opacity: 0;
}
.eh-slide-enter-to,
.eh-slide-leave-from {
  transform: translateX(0);
  opacity: 1;
}

/* 工作空间切换 Popover */
.topbar-ws-popover {
  padding: 6px;
  max-height: 280px;
  overflow-y: auto;
  background: #1c1c1e;
  border-radius: 8px;
}
.topbar-ws-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  border-radius: 6px;
  transition: background 0.15s;
  margin-bottom: 2px;
}
.topbar-ws-item__main {
  flex: 1;
  min-width: 0;
}
.topbar-ws-item:last-child {
  margin-bottom: 0;
}
.topbar-ws-item:hover {
  background: rgba(255, 255, 255, 0.05);
}
.topbar-ws-item.is-active {
  background: rgba(99, 102, 241, 0.12);
}
.topbar-ws-item__name {
  font-size: 13px;
  font-weight: 500;
  color: #e4e4e7;
  margin-bottom: 3px;
  line-height: 1.2;
}
.topbar-ws-item__path {
  font-size: 11px;
  color: #a1a1aa;
  line-height: 1.35;
  word-break: break-all;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
}
.topbar-ws-item__delete {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  color: #a1a1aa;
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
}
.topbar-ws-item__delete:hover {
  color: #f87171;
  background: rgba(248, 113, 113, 0.1);
}
.topbar-ws-item--action {
  color: #818cf8;
  font-size: 12px;
}
.topbar-ws-item--action .topbar-ws-item__main,
.topbar-ws-item--action .topbar-ws-item__delete {
  display: none;
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

<style>
.n-popover:has(.topbar-workspace-popover-box) {
  background: #1c1c1e !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  border-radius: 12px !important;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4) !important;
  padding: 0 !important;
  overflow: hidden;
}
.n-popover:has(.topbar-workspace-popover-box) .n-popover__content,
.topbar-workspace-popover-box {
  padding: 0 !important;
  background: transparent !important;
  border: none !important;
}
</style>
