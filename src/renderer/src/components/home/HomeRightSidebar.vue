<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { NIcon, NTooltip, NTabs, NTabPane, NSkeleton, NEllipsis } from 'naive-ui'
import { ChatbubbleOutline, AddOutline, ListOutline, ChevronForward, FilmOutline, VideocamOutline } from '@vicons/ionicons5'
import type { AiChatTopic } from '../../api/aiChat'
import { getSmartCutsApi, type SmartCutItem } from '../../api/video'
import VideoPreviewPlayer from '../VideoPreviewPlayer.vue'

const props = defineProps<{
  aiChats: AiChatTopic[]
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

const fetchHistory = async () => {
    if (loadingHistory.value) return
    loadingHistory.value = true
    try {
        const anchorId = props.currentAnchor?.id
        const res = await getSmartCutsApi(historyPage.value, 20, anchorId)
        if (historyPage.value === 1) {
            clipHistory.value = res.list
        } else {
            clipHistory.value.push(...res.list)
        }
        historyHasMore.value = clipHistory.value.length < res.total
    } catch (e) {
        console.error('Failed to fetch clip history', e)
    } finally {
        loadingHistory.value = false
    }
}

watch(activeTab, (val) => {
    if (val === 'history' && clipHistory.value.length === 0) {
        historyPage.value = 1
        fetchHistory()
    }
})

watch(() => props.currentAnchor, () => {
    if (activeTab.value === 'history') {
        historyPage.value = 1
        fetchHistory()
    } else {
        // Clear logic so next time we switch to history it refreshes? 
        // Or just let it be. Let's clear to force refresh when tab switched.
        clipHistory.value = [] 
    }
})

const formatTime = (timeStr: string) => {
    if (!timeStr) return ''
    const date = new Date(timeStr)
    return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`
}

const getStatusText = (status: number) => {
    // Backend Constants:
    // 0: Pending, 1: Completed, 2: Processing, 3: AIError, 4: VideoError, 5: AICutting
    switch(status) {
        case 0: return '等待中'
        case 1: return '已完成'
        case 2: return '处理中'
        case 3: return 'AI失败'
        case 4: return '生成失败'
        case 5: return '剪辑中'
        default: return '未知'
    }
}

const handleClipClick = (item: SmartCutItem) => {
    if (item.status === 1 && item.path) {
        emit('play-video', item)
    }
}
</script>

<template>
  <div class="right-sidebar" :class="{ 'is-collapsed': collapsed }">
    <div class="sidebar-header" :class="{ 'header-collapsed': collapsed }">
      <div v-if="!collapsed" class="new-chat-btn" @click="handleNewChat">
        <n-icon size="20"><AddOutline /></n-icon>
        <span>新剪辑任务</span>
      </div>

      <div 
        class="toggle-btn" 
        @click="emit('toggle')"
        :title="collapsed ? '展开侧边栏' : '收起侧边栏'"  
      >
        <n-icon size="20">
          <ListOutline v-if="collapsed" />
          <ChevronForward v-else />
        </n-icon>
      </div>
      
      <div v-if="collapsed" class="collapsed-new-chat-btn" @click="handleNewChat" title="新剪辑任务">
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

        <div v-if="activeTab === 'recent'" class="tab-content">
            <div v-if="!aiChats.length" class="history-empty">暂无记录</div>
            <div v-else class="history-list">
            <div
                v-for="chat in aiChats"
                :key="chat.id"
                class="nav-item history-item"
                @click="handleSelectChat(chat)"
            >
                <n-icon size="16"><ChatbubbleOutline /></n-icon>
                <span class="history-title">{{ chat.topic || '未命名项目' }}</span>
            </div>
            </div>
        </div>

        <div v-else class="tab-content">
             <div v-if="loadingHistory && clipHistory.length === 0" class="loading-state">
                <n-skeleton text :repeat="3" />
             </div>
             <div v-else-if="clipHistory.length === 0" class="history-empty">
                 <div class="empty-text">当前主播下暂无剪辑历史</div>
                 <div class="empty-subtext" v-if="currentAnchor">({{ currentAnchor.name }})</div>
             </div>
             <div v-else class="history-list">
                 <div 
                    v-for="item in clipHistory" 
                    :key="item.id" 
                    class="clip-item"
                    :class="{ 'clickable': item.status === 1 }"
                    @click="handleClipClick(item)"
                 >  
                    <div class="clip-thumb">
                      <VideoPreviewPlayer
                        :path="item.path"
                        :cover="item.cover"
                        :duration="item.duration"
                        aspect-ratio="9/16"
                        :disabled="item.status !== 1"
                        :subtitle-data="item.subtitle"
                      />
                    </div>
                    <div class="clip-info">
                        <div class="clip-name" :title="item.name">
                          <n-ellipsis :line-clamp="2">{{ item.name }}</n-ellipsis>
                        </div>
                        <div class="clip-meta">
                            <span>{{ formatTime(item.created_at) }}</span>
                            <span :class="['status-tag', 'status-' + item.status]">{{ getStatusText(item.status) }}</span>
                        </div>
                    </div>
                 </div>
             </div>
        </div>
    </div>
  </div>
</template>

<style scoped>
.right-sidebar {
  height: 100%;
  padding: 16px;
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
}

.sidebar-header {
  margin-bottom: 16px;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.header-collapsed {
  margin-bottom: 0;
  flex-direction: column;
  align-items: center;
  width: 100%;
  padding-top: 4px;
  gap: 20px;
  justify-content: flex-start;
}

.sidebar-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
}

.custom-tabs {
    display: flex;
    gap: 16px;
    margin-bottom: 16px;
    border-bottom: 1px solid rgba(255,255,255,0.08);
    padding-bottom: 8px;
}

.tab-item {
    font-size: 13px;
    color: #71717a;
    cursor: pointer;
    transition: all 0.2s;
    font-weight: 500;
    padding: 4px 0;
    position: relative;
}

.tab-item:hover {
    color: #a1a1aa;
}

.tab-item.active {
    color: #fff;
}

.tab-item.active::after {
    content: '';
    position: absolute;
    bottom: -9px;
    left: 0;
    width: 100%;
    height: 2px;
    background: #fff;
    border-radius: 1px;
}

.tab-content {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
}

/* Reusing existing styles but nested */
.history-empty {
    color: #52525b;
    font-size: 13px;
    text-align: center;
    padding-top: 40px;
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.empty-subtext {
    font-size: 11px;
    opacity: 0.7;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  color: #a1a1aa;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.history-title {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Clip Item Styles */
.clip-item {
    display: flex; /* Flex row layout */
    gap: 10px;
    padding: 10px 10px;
    border-radius: 6px;
    background: rgba(255,255,255,0.03);
    margin-bottom: 8px;
    cursor: pointer;
    transition: all 0.2s;
    border: 1px solid transparent;
}

.clip-thumb {
  width: 50px;
  height: 88px; /* 9:16 approx for 50px width */
  flex-shrink: 0;
  border-radius: 4px;
  overflow: hidden;
  background: #000;
  border: 1px solid rgba(255,255,255,0.1);
}

.clip-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 2px 0;
  min-width: 0;
}

.clip-name {
    font-size: 13px;
    color: #e4e4e7;
    margin-bottom: 4px;
    line-height: 1.4;
}

.clip-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11px;
    color: #71717a;
    margin-top: auto;
}

.status-tag {
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 10px;
    background: rgba(255,255,255,0.1);
}

.status-1 { color: #10b981; background: rgba(16, 185, 129, 0.1); }
.status-5, .status-2 { color: #3b82f6; background: rgba(59, 130, 246, 0.1); } /* Cutting/Processing */
.status-3, .status-4 { color: #ef4444; background: rgba(239, 68, 68, 0.1); }
.status-0 { color: #eab308; background: rgba(234, 179, 8, 0.1); }

.clip-item:hover {
    background: rgba(255,255,255,0.06);
    border-color: rgba(255,255,255,0.05);
}

.clip-item.clickable {
    cursor: pointer;
}

.clip-item:not(.clickable) {
    cursor: default;
    opacity: 0.8;
}

.new-chat-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: #fff;
  color: #000;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.new-chat-btn:hover {
  background: #e5e5e5;
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
}

.collapsed-new-chat-btn:hover {
  background: #e5e5e5;
}

.toggle-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #71717a;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s;
}

.toggle-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.loading-state {
    padding: 16px;
}
</style>
