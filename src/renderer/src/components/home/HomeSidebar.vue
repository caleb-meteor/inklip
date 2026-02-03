<script setup lang="ts">
import { NIcon } from 'naive-ui'
import {
  VideocamOutline,
  CutOutline,
  SettingsOutline,
  AddOutline,
  ChatbubbleOutline
} from '@vicons/ionicons5'
import type { AiChatTopic } from '../../api/aiChat'

defineProps<{
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
      <div class="new-chat-btn" @click="handleNewChat">
        <n-icon size="20"><AddOutline /></n-icon>
        <span>新剪辑任务</span>
      </div>
    </div>
    
    <div class="sidebar-content">
      <div class="sidebar-section">
        <div class="section-title">工作台</div>
        <div class="nav-item" @click="handleNavigate('/video-manager')">
          <n-icon size="18"><VideocamOutline /></n-icon>
          <span>素材库</span>
        </div>
        <div class="nav-item" @click="handleNavigate('/smart-editor')">
          <n-icon size="18"><CutOutline /></n-icon>
          <span>剪辑轨道</span>
        </div>
      </div>

      <div class="sidebar-section scrollable">
        <div class="section-title">最近记录</div>
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
    </div>

    <div class="sidebar-footer">
      <div class="nav-item" @click="handleNavigate('/settings')">
        <n-icon size="18"><SettingsOutline /></n-icon>
        <span>设置</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px;
  box-sizing: border-box;
  color: #e5e5e5;
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
}

.sidebar-header {
  margin-bottom: 24px;
}

.new-chat-btn {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #27272a;
  color: #fff;
  padding: 12px 16px;
  border-radius: 9999px; /* Pill shape */
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  font-weight: 500;
  font-size: 14px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
}

.new-chat-btn:hover {
  background: #3f3f46;
  transform: translateY(-1px);
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
}

.new-chat-btn:active {
  transform: translateY(0);
}

.sidebar-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 24px;
  overflow: hidden;
}

.sidebar-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sidebar-section.scrollable {
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

.section-title {
  font-size: 11px;
  font-weight: 600;
  color: #71717a;
  margin-bottom: 8px;
  padding: 0 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  color: #a1a1aa;
  font-size: 14px;
  user-select: none;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
  padding-right: 4px; /* Space for scrollbar */
}

/* Custom minimal scrollbar for history list - Hidden by default, show on hover/scroll */
.history-list::-webkit-scrollbar {
  width: 4px; /* Keep width to prevent layout shift */
  display: block;
}

.history-list::-webkit-scrollbar-track {
  background: transparent;
}

.history-list::-webkit-scrollbar-thumb {
  background: transparent; /* Hidden by default */
  border-radius: 2px;
  transition: background 0.2s ease;
}

.history-list:hover::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1); /* Show for interaction */
}

.history-list::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3); /* Brighter when grabbing */
}

.history-item {
  height: 36px;
}

.history-title {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.history-empty {
  padding: 20px;
  text-align: center;
  color: #52525b;
  font-size: 13px;
  font-style: italic;
}

.sidebar-footer {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}
</style>
