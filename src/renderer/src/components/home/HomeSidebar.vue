<script setup lang="ts">
import { NButton, NIcon } from 'naive-ui'
import { Videocam, Cut, Settings, AddOutline, ChevronForward } from '@vicons/ionicons5'
import type { AiChatTopic } from '../../api/aiChat'

const props = defineProps<{
  aiChats: AiChatTopic[]
}>()

const emit = defineEmits<{
  (e: 'navigate', path: string): void
  (e: 'new-chat'): void
  (e: 'select-chat', chat: AiChatTopic): void
}>()

const handleNavigate = (path: string): void => {
  emit('navigate', path)
}

const handleNewChat = (): void => {
  emit('new-chat')
}

const handleSelectChat = (chat: AiChatTopic): void => {
  emit('select-chat', chat)
}
</script>

<template>
  <div class="chat-sidebar">
    <div class="sidebar-header">
      <n-button type="primary" dashed block class="new-chat-btn" @click="handleNewChat">
        <template #icon>
          <n-icon><AddOutline /></n-icon>
        </template>
        开始新剪辑
      </n-button>
    </div>
    <div class="sidebar-content">
      <div class="sidebar-group sidebar-group-fixed">
        <div class="group-title">快捷入口</div>
        <div class="nav-item" @click="handleNavigate('/video-manager')">
          <n-icon><Videocam /></n-icon>
          <span>视频管理</span>
          <n-icon class="arrow"><ChevronForward /></n-icon>
        </div>
        <div class="nav-item" @click="handleNavigate('/smart-editor')">
          <n-icon><Cut /></n-icon>
          <span>智能剪辑</span>
          <n-icon class="arrow"><ChevronForward /></n-icon>
        </div>
      </div>
      <div class="sidebar-group sidebar-group-scrollable">
        <div class="group-title">最近任务</div>
        <div v-if="!aiChats.length" class="history-empty">暂无相关历史</div>
        <div v-else class="history-list">
          <div
            v-for="chat in aiChats"
            :key="chat.id"
            class="nav-item history-item"
            @click="handleSelectChat(chat)"
          >
            <div class="history-meta">
              <div class="history-title">{{ chat.topic || '未命名对话' }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="sidebar-footer">
      <div class="nav-item" @click="handleNavigate('/settings')">
        <n-icon><Settings /></n-icon>
        <span>系统设置</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
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
  overflow: hidden;
  min-height: 0;
}

.sidebar-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sidebar-group-fixed {
  flex-shrink: 0;
}

.sidebar-group-scrollable {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sidebar-group-scrollable .group-title {
  flex-shrink: 0;
}

.sidebar-group-scrollable .history-list,
.sidebar-group-scrollable .history-empty {
  flex: 1;
  overflow-y: auto;
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
</style>
