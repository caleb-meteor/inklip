<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { NIcon, NTooltip, NEllipsis, NProgress } from 'naive-ui'
import {
  ChatbubbleOutline,
  AddOutline,
  ListOutline,
  ChevronForward,
  TrashOutline
} from '@vicons/ionicons5'
import type { AiChatTopic } from '../../api/aiChat'
import { getSmartCutsApi, deleteSmartCutApi, getSmartCutApi, type SmartCutItem } from '../../api/video'
import UnifiedVideoPreview from '../UnifiedVideoPreview.vue'
import { useRealtimeStore } from '../../stores/realtime'
import { aiChatStore } from '../../services/aiChatStore'

const props = defineProps<{
  aiChats: AiChatTopic[]
  isLoadingAiChats?: boolean
  collapsed?: boolean
  currentAnchor?: { id: number; name: string } | null
}>()

const emit = defineEmits<{
  (e: 'select-chat', chat: AiChatTopic): void
  (e: 'new-chat'): void
  (e: 'toggle'): void
  (e: 'play-video', video: SmartCutItem): void
}>()

const activeTab = ref<'recent' | 'history'>('recent')
const clipHistory = ref<SmartCutItem[]>([])
const loadingHistory = ref(false)
const historyPage = ref(1)
const historyHasMore = ref(true)

const handleSelectChat = (chat: AiChatTopic): void => {
  emit('select-chat', chat)
}

const handleNewChat = (): void => {
  emit('new-chat')
}

const handleDeleteChat = async (e: Event, chat: AiChatTopic) => {
  e.stopPropagation()
  await aiChatStore.deleteAiChat(chat.id)
}

const handleDeleteClip = async (item: SmartCutItem) => {
  await deleteSmartCutApi(item.id)
  clipHistory.value = clipHistory.value.filter((i) => i.id !== item.id)
}

const fetchHistory = async () => {
  if (loadingHistory.value || !historyHasMore.value) return
  loadingHistory.value = true
  const doFetch = async () => {
    const anchorId = props.currentAnchor?.id
    const res = await getSmartCutsApi(historyPage.value, 20, anchorId)
    if (historyPage.value === 1) clipHistory.value = res.list
    else clipHistory.value.push(...res.list)
    historyHasMore.value = clipHistory.value.length < res.total
    if (historyHasMore.value) historyPage.value++
  }
  await doFetch().finally(() => {
    loadingHistory.value = false
  })
}

/** 重新拉取剪辑历史（用于休眠/长时间未操作后恢复） */
const refreshClipHistory = (): void => {
  historyPage.value = 1
  historyHasMore.value = true
  if (activeTab.value === 'history') fetchHistory()
}

defineExpose({ refreshClipHistory })

// 当有智能剪辑状态更新（SSE smart_cut）时，若当前在「剪辑历史」页签，尝试增量刷新对应条目
const rtStore = useRealtimeStore()
watch(
  () => rtStore.smartCutUpdated,
  async () => {
    if (activeTab.value !== 'history' || clipHistory.value.length === 0) return

    // 从 realtime store 或 aiChatStore 中获取最近的 smartCutTask，提取 aiGenVideoId
    const currentMessages = aiChatStore.getMessages().value
    const lastMsg = currentMessages[currentMessages.length - 1]
    const payload: any = lastMsg?.payload
    const aiGenVideoId =
      payload?.smartCutTask?.aiGenVideoId || payload?.aiGenVideoId || payload?.id

    if (!aiGenVideoId) return

    try {
      const latest = await getSmartCutApi(aiGenVideoId)
      const idx = clipHistory.value.findIndex((item) => item.id === latest.id)
      if (idx >= 0) {
        // 更新已有条目（状态/封面/时长等）
        clipHistory.value[idx] = {
          ...clipHistory.value[idx],
          status: latest.status,
          cover: latest.cover ?? clipHistory.value[idx].cover,
          duration: latest.duration ?? clipHistory.value[idx].duration,
          path: latest.path ?? clipHistory.value[idx].path,
          name: latest.name ?? clipHistory.value[idx].name
        }
      } else {
        // 若当前页中暂时还没有这条记录，但属于当前主播，则插入到最前面
        const anchorId = props.currentAnchor?.id
        if (!anchorId || latest.anchor_id === anchorId) {
          clipHistory.value = [latest as SmartCutItem, ...clipHistory.value]
        }
      }
    } catch (e) {
      // 拉取单条剪辑状态失败时忽略，不影响其他逻辑
      console.warn('[HomeRightSidebar] Failed to sync smart cut history item', e)
    }
  }
)

watch(activeTab, (val) => {
  if (val === 'history') {
    historyPage.value = 1
    historyHasMore.value = true
    fetchHistory()
  }
})

watch(
  () => props.currentAnchor,
  () => {
    if (activeTab.value === 'history') {
      historyPage.value = 1
      historyHasMore.value = true
      fetchHistory()
    }
    // 切换主播时不清空剪辑历史，仅在实际请求成功时替换，失败时保留旧数据
  }
)

const formatTime = (timeStr: string) => {
  if (!timeStr) return ''
  const date = new Date(timeStr)
  return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`
}

const getStatusText = (status: number) => {
  // Backend Constants:
  // 0: Pending, 1: Completed, 2: Processing, 3: AIError, 4: VideoError, 5: AICutting
  switch (status) {
    case 0:
      return '等待中'
    case 1:
      return '已完成'
    case 2:
      return '处理中'
    case 3:
      return 'AI失败'
    case 4:
      return '生成失败'
    case 5:
      return '剪辑中'
    default:
      return '未知'
  }
}

const handleClipClick = (item: SmartCutItem) => {
  if (item.status === 1 && item.path) {
    emit('play-video', item)
  }
}

const { usageInfo, isVipAvailable } = storeToRefs(rtStore)

const hasMoreAiChats = aiChatStore.getHasMoreAiChats()

const currentUsage = computed(() => {
  return usageInfo.value
})

const usagePercentage = computed(() => {
  if (!currentUsage.value || currentUsage.value.dailyLimit <= 0) return 0
  const used = currentUsage.value.dailyLimit - currentUsage.value.remainingSeconds
  return Math.min(100, Math.max(0, (used / currentUsage.value.dailyLimit) * 100))
})

const isExpired = computed(() => {
  const expiredAt = currentUsage.value?.expiredAt
  if (!expiredAt) return false
  
  const now = new Date()
  const exp = new Date(expiredAt)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const expDate = new Date(exp.getFullYear(), exp.getMonth(), exp.getDate()).getTime()
  
  return today > expDate
})

const formatDuration = (seconds?: number) => {
  if (seconds === undefined || seconds === null) return '--'
  return Math.floor(seconds / 60) + '分钟'
}

const formatDate = (dateStr?: string) => {
  if (!dateStr) return '--'
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return dateStr
  const year = date.getFullYear()
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  return `${year}-${month}-${day}`
}

const onHistoryScroll = (ev: Event) => {
  const el = ev.target as HTMLElement
  if (!el || activeTab.value !== 'history' || !historyHasMore.value || loadingHistory.value) return
  const { scrollTop, scrollHeight, clientHeight } = el
  const threshold = 20 // 减小阈值，确保在接近底部时触发
  if (scrollHeight - scrollTop - clientHeight <= threshold) {
    fetchHistory()
  }
}

const onRecentScroll = (ev: Event) => {
  const el = ev.target as HTMLElement
  if (!el || activeTab.value !== 'recent') return
  if (!hasMoreAiChats.value || props.isLoadingAiChats) return

  const { scrollTop, scrollHeight, clientHeight } = el
  const threshold = 20
  if (scrollHeight - scrollTop - clientHeight <= threshold) {
    aiChatStore.loadMoreAiChats()
  }
}
</script>

<template>
  <div class="right-sidebar" :class="{ 'is-collapsed': collapsed }">
    <div class="sidebar-header" :class="{ 'header-collapsed': collapsed }">
      <div v-if="!collapsed" class="new-chat-btn" @click="handleNewChat">
        <n-icon size="20"><AddOutline /></n-icon>
        <span>新聊天</span>
      </div>

      <div
        class="toggle-btn"
        :title="collapsed ? '展开侧边栏' : '收起侧边栏'"
        @click="emit('toggle')"
      >
        <n-icon size="20">
          <ListOutline v-if="collapsed" />
          <ChevronForward v-else />
        </n-icon>
      </div>

      <div v-if="collapsed" class="collapsed-new-chat-btn" title="新聊天" @click="handleNewChat">
        <n-icon size="20"><AddOutline /></n-icon>
      </div>
    </div>

    <div v-if="!collapsed" class="sidebar-content">
      <div class="custom-tabs">
        <div
          class="tab-item"
          :class="{ active: activeTab === 'recent' }"
          @click="activeTab = 'recent'"
        >
          最近记录
        </div>
        <div
          class="tab-item"
          :class="{ active: activeTab === 'history' }"
          @click="activeTab = 'history'"
        >
          剪辑历史
        </div>
      </div>

      <div v-if="activeTab === 'recent'" class="tab-content" @scroll="onRecentScroll">
        <div v-if="!aiChats || !aiChats.length" class="history-empty">暂无记录</div>
        <div v-else class="history-list">
          <div
            v-for="chat in aiChats"
            :key="chat.id"
            class="nav-item history-item"
            @click="handleSelectChat(chat)"
          >
            <n-icon size="16"><ChatbubbleOutline /></n-icon>
            <span class="history-title">{{ chat.topic || '未命名项目' }}</span>
            <span v-if="(chat.unread_count ?? 0) > 0" class="unread-badge">{{
              chat.unread_count! > 99 ? '99+' : chat.unread_count
            }}</span>
            <div class="item-actions">
              <n-tooltip trigger="hover" placement="top">
                <template #trigger>
                  <div class="action-btn delete-btn" @click="(e) => handleDeleteChat(e, chat)">
                    <n-icon size="14"><TrashOutline /></n-icon>
                  </div>
                </template>
                删除记录
              </n-tooltip>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="tab-content" @scroll="onHistoryScroll">
        <div v-if="clipHistory.length === 0" class="history-empty">
          <div class="empty-text">当前主播下暂无剪辑历史</div>
          <div v-if="currentAnchor" class="empty-subtext">({{ currentAnchor.name }})</div>
        </div>
        <div v-else class="history-list">
          <div
            v-for="item in clipHistory"
            :key="item.id"
            class="clip-item"
            :class="{ clickable: item.status === 1 && (item.path || item.fileUrl) }"
            @dblclick="handleClipClick(item)"
          >
            <div class="clip-thumb">
              <UnifiedVideoPreview
                :video="item"
                video-type="edited"
                aspect-ratio="9/16"
                :disabled="item.status !== 1"
                @dblclick="handleClipClick(item)"
              />
            </div>
            <div class="clip-info">
              <div class="clip-name" :title="item.name">
                <n-ellipsis :line-clamp="3">{{ item.name }}</n-ellipsis>
              </div>
              <div class="clip-meta">
                <span>{{ formatTime(item.created_at) }}</span>
                <span :class="['status-tag', 'status-' + item.status]">{{
                  getStatusText(item.status)
                }}</span>
              </div>
            </div>
            <div class="clip-actions">
              <n-tooltip trigger="hover" placement="top">
                <template #trigger>
                  <div class="action-btn delete-btn" @click.stop="handleDeleteClip(item)">
                    <n-icon size="14"><TrashOutline /></n-icon>
                  </div>
                </template>
                删除剪辑
              </n-tooltip>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="sidebar-footer" :class="{ 'footer-collapsed': collapsed }">
      <div v-if="!collapsed" class="usage-card" :class="{ 'usage-card-disabled': !isVipAvailable }">
        <div class="usage-progress-container">
          <div class="usage-row">
            <span class="usage-label">今日额度</span>
            <span v-if="isVipAvailable" class="usage-value">
              {{
                currentUsage?.dailyLimit === 0
                  ? '无限制'
                  : `剩余 ${formatDuration(currentUsage?.remainingSeconds)}`
              }}
            </span>
            <span v-else class="usage-value">不可用</span>
          </div>
          <n-progress
            type="line"
            :percentage="usagePercentage"
            :show-indicator="false"
            processing
            color="#f87171"
            rail-color="#34d399"
            :height="6"
            style="margin: 4px 0 8px 0; transform: scaleX(-1);"
          />
        </div>
        <div v-if="currentUsage?.expiredAt" class="usage-row">
          <span class="usage-label">到期时间</span>
          <span class="usage-value" :class="{ 'expired-text': isExpired }">
            {{ formatDate(currentUsage?.expiredAt) }}{{ isExpired ? ' (已过期)' : '' }}
          </span>
        </div>
      </div>
      <div v-else class="collapsed-usage-wrapper">
        <n-tooltip placement="left" trigger="hover">
          <template #trigger>
            <div class="collapsed-usage-item">
              <n-progress
                type="circle"
                :percentage="usagePercentage"
                :show-indicator="false"
                :stroke-width="16"
                :width="18"
                color="#f87171"
                rail-color="#34d399"
              />
            </div>
          </template>
          <div class="usage-tooltip">
            <div class="tooltip-title">今日额度</div>
            <div class="tooltip-value">
              {{
                isVipAvailable ? `剩余 ${formatDuration(currentUsage?.remainingSeconds)}` : '不可用'
              }}
            </div>
            <div v-if="currentUsage?.expiredAt" class="tooltip-date">
              到期时间: {{ formatDate(currentUsage?.expiredAt) }}
            </div>
          </div>
        </n-tooltip>
      </div>
    </div>
  </div>
</template>

<style scoped>
.right-sidebar {
  height: 100%;
  padding: 16px 12px;
  box-sizing: border-box;
  color: #e5e5e5;
  display: flex;
  flex-direction: column;
  background: #09090b;
  overflow: hidden;
}

.right-sidebar.is-collapsed {
  padding: 16px 0;
  align-items: center;
  width: 100% !important;
  min-width: 0 !important;
  max-width: 100% !important;
  overflow-x: hidden;
}

.sidebar-header {
  margin-bottom: 16px;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  gap: 8px;
}

.header-collapsed {
  margin-bottom: 0;
  flex-direction: column;
  align-items: center;
  width: 100%;
  padding-top: 4px;
  gap: 16px;
  justify-content: flex-start;
}

.sidebar-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  gap: 12px;
}

.custom-tabs {
  display: flex;
  padding: 3px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 6px;
  gap: 2px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.tab-item {
  flex: 1;
  text-align: center;
  font-size: 12px;
  color: #71717a;
  padding: 4px 0;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;
}

.tab-item:hover {
  color: #a1a1aa;
  background: rgba(255, 255, 255, 0.02);
}

.tab-item.active {
  background: rgba(255, 255, 255, 0.1);
  color: #e4e4e7;
  font-weight: 500;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

.tab-item.active::after {
  display: none;
}

.tab-content {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  padding-right: 4px;
}

.tab-content::-webkit-scrollbar {
  display: none;
}

/* Reusing existing styles but nested */
.history-empty {
  color: #52525b;
  font-size: 13px;
  text-align: center;
  padding-top: 60px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
}

.empty-subtext {
  font-size: 12px;
  opacity: 0.5;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.load-more-tip {
  text-align: center;
  color: #71717a;
  font-size: 12px;
  padding: 12px 0;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  color: #a1a1aa;
  border: 1px solid transparent;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.04);
  color: #e4e4e7;
  border-color: rgba(255, 255, 255, 0.05);
}

.history-title {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.unread-badge {
  flex-shrink: 0;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  font-size: 11px;
  line-height: 18px;
  text-align: center;
  color: #fff;
  background: var(--primary-color, #18a058);
  border-radius: 9px;
  margin-left: 6px;
}

.item-actions {
  display: flex;
  opacity: 0;
  transition: opacity 0.2s;
  pointer-events: none;
}

.history-item:hover .item-actions {
  opacity: 1;
  pointer-events: auto;
}

.action-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  color: #71717a;
}

.action-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.delete-btn:hover {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
}

/* Clip Item Styles */
.clip-item {
  display: flex; /* Flex row layout */
  position: relative;
  gap: 10px;
  padding: 10px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.02);
  margin-bottom: 6px;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid rgba(255, 255, 255, 0.03);
  overflow: hidden;
}

.clip-actions {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(90deg, transparent, rgba(0, 0, 0, 0.9) 10%, rgba(0, 0, 0, 1) 100%);
  transform: translateX(100%);
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 5;
}

.clip-item:hover .clip-actions {
  transform: translateX(0);
}

.clip-thumb {
  width: 54px;
  height: 96px; /* 9:16 approx */
  flex-shrink: 0;
  border-radius: 4px;
  overflow: hidden;
  background: #000;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
}

.clip-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 1px 0;
  min-width: 0;
}

.clip-name {
  font-size: 12px;
  color: #e4e4e7;
  margin-bottom: 2px;
  line-height: 1.4;
  font-weight: 500;
}

.clip-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 10px;
  color: #71717a;
  margin-top: auto;
}

.status-tag {
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 500;
  line-height: 1;
}

.status-1 {
  color: #34d399;
  background: rgba(16, 185, 129, 0.15);
  border: 1px solid rgba(16, 185, 129, 0.1);
}
.status-5,
.status-2 {
  color: #60a5fa;
  background: rgba(59, 130, 246, 0.15);
  border: 1px solid rgba(59, 130, 246, 0.1);
}
.status-3,
.status-4 {
  color: #f87171;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.1);
}
.status-0 {
  color: #facc15;
  background: rgba(234, 179, 8, 0.15);
  border: 1px solid rgba(234, 179, 8, 0.1);
}

.clip-item:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.08);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}
/* ... */
.new-chat-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #fff;
  color: #000;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  flex: 1;
  justify-content: center;
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.1),
    0 1px 3px rgba(0, 0, 0, 0.1);
}

.new-chat-btn:hover {
  background: #f4f4f5;
  transform: translateY(-1px);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.2),
    0 3px 6px rgba(0, 0, 0, 0.15);
}

.new-chat-btn:active {
  transform: translateY(0);
}

.collapsed-new-chat-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  color: #000;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
}

.collapsed-new-chat-btn:hover {
  background: #f4f4f5;
  transform: scale(1.05);
}

.toggle-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #71717a;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.2s;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid transparent;
}

.toggle-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  border-color: rgba(255, 255, 255, 0.05);
}

.loading-state {
  padding: 16px;
}

.sidebar-footer {
  margin-top: auto;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  background: rgba(0, 0, 0, 0.2);
  flex-shrink: 0;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  overflow: hidden;
}

.footer-collapsed {
  background: transparent;
  border-top: none;
  width: 100%;
  display: flex;
  justify-content: center;
}

.collapsed-usage-wrapper {
  padding: 12px 0;
  display: flex;
  justify-content: center;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  overflow: hidden;
}

.usage-card {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.usage-card-disabled .usage-value {
  color: rgba(255, 255, 255, 0.3);
}

.usage-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
}

.usage-label {
  color: rgba(255, 255, 255, 0.6);
}

.usage-value {
  color: #fff;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.usage-value.highlight {
  color: #63e2b7;
}

.usage-progress-container {
  display: flex;
  flex-direction: column;
}

.collapsed-usage-item {
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  transition: all 0.2s;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
}

.collapsed-usage-item:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.1);
  transform: scale(1.05);
}

.usage-tooltip {
  padding: 8px;
  min-width: 120px;
}

.tooltip-title {
  font-size: 12px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 4px;
}

.tooltip-value {
  font-size: 13px;
  color: #fff;
  margin-bottom: 4px;
}

.tooltip-date {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
}

.expired-text {
  color: #f87171 !important;
}
</style>
