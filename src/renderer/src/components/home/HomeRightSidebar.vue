<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { NIcon, NTooltip, NProgress } from 'naive-ui'
import {
  ChatbubbleOutline,
  AddOutline,
  ListOutline,
  ChevronForward,
  TrashOutline
} from '@vicons/ionicons5'
import type { AiChatTopic } from '../../api/aiChat'
import { useRealtimeStore } from '../../stores/realtime'
import { aiChatStore } from '../../services/aiChatStore'

const props = defineProps<{
  aiChats: AiChatTopic[]
  isLoadingAiChats?: boolean
  collapsed?: boolean
  currentWorkspace?: { id: number; name: string } | null
}>()

const emit = defineEmits<{
  (e: 'select-chat', chat: AiChatTopic): void
  (e: 'new-chat'): void
  (e: 'toggle'): void
}>()

const rtStore = useRealtimeStore()

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

const formatChatTime = (dateStr?: string, groupLabel?: string) => {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return ''
  
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  
  if (groupLabel === '今天' || groupLabel === '昨天') {
    return `${hours}:${minutes}`
  }
  return `${month}-${day}`
}

const groupedAiChats = computed(() => {
  const groups = [
    { label: '今天', chats: [] as AiChatTopic[] },
    { label: '昨天', chats: [] as AiChatTopic[] },
    { label: '一周', chats: [] as AiChatTopic[] },
    { label: '更早', chats: [] as AiChatTopic[] }
  ]

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterdayStart = todayStart - 24 * 60 * 60 * 1000
  const sevenDaysAgoStart = todayStart - 7 * 24 * 60 * 60 * 1000

  props.aiChats.forEach((chat) => {
    // 优先使用更新时间，如果没有则用创建时间
    const timeStr = chat.updated_at || chat.created_at
    const chatTime = timeStr ? new Date(timeStr).getTime() : 0

    if (chatTime >= todayStart) {
      groups[0].chats.push(chat)
    } else if (chatTime >= yesterdayStart) {
      groups[1].chats.push(chat)
    } else if (chatTime >= sevenDaysAgoStart) {
      groups[2].chats.push(chat)
    } else {
      groups[3].chats.push(chat)
    }
  })

  return groups.filter((g) => g.chats.length > 0)
})

const onRecentScroll = (ev: Event) => {
  const el = ev.target as HTMLElement
  if (!el) return
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
      <div class="recent-section-label">最近记录</div>
      <div class="tab-content" @scroll="onRecentScroll">
        <div v-if="!aiChats || !aiChats.length" class="history-empty">暂无记录</div>
        <div v-else class="history-list">
          <template v-for="group in groupedAiChats" :key="group.label">
            <div class="history-group-title">{{ group.label }}</div>
            <div
              v-for="chat in group.chats"
              :key="chat.id"
              class="nav-item history-item"
              @click="handleSelectChat(chat)"
            >
              <n-icon size="16"><ChatbubbleOutline /></n-icon>
              <div class="history-content-wrapper">
                <span class="history-title">{{ chat.topic || '未命名项目' }}</span>
                <span class="history-time">{{ formatChatTime(chat.updated_at || chat.created_at, group.label) }}</span>
              </div>
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
          </template>
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
            style="margin: 4px 0 8px 0; transform: scaleX(-1)"
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
  gap: 10px;
}

.recent-section-label {
  font-size: 12px;
  font-weight: 600;
  color: #a1a1aa;
  padding: 0 4px;
  flex-shrink: 0;
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

.history-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.history-group-title {
  font-size: 11px;
  color: #71717a;
  font-weight: 500;
  margin: 12px 10px 4px;
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

.history-content-wrapper {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  gap: 1px;
}

.history-time {
  font-size: 10px;
  color: #71717a;
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
