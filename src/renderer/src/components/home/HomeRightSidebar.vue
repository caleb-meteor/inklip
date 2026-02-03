<script setup lang="ts">
import { NIcon } from 'naive-ui'
import { ChatbubbleOutline, AddOutline } from '@vicons/ionicons5'
import type { AiChatTopic } from '../../api/aiChat'

defineProps<{
  aiChats: AiChatTopic[]
}>()

const emit = defineEmits<{
  (e: 'select-chat', chat: AiChatTopic): void
  (e: 'new-chat'): void
}>()

const handleSelectChat = (chat: AiChatTopic): void => {
  emit('select-chat', chat)
}

const handleNewChat = (): void => {
  emit('new-chat')
}
</script>

<template>
  <div class="right-sidebar">
    <div class="sidebar-header">
      <div class="new-chat-btn" @click="handleNewChat">
        <n-icon size="20"><AddOutline /></n-icon>
        <span>新剪辑任务</span>
      </div>
    </div>

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

.section-title {
  font-size: 11px;
  font-weight: 600;
  color: #71717a;
  margin-bottom: 12px;
  padding: 0 4px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
  flex: 1;
  padding-right: 4px;
}

/* Custom minimal scrollbar */
.history-list::-webkit-scrollbar {
  width: 4px;
  display: block;
}

.history-list::-webkit-scrollbar-track {
  background: transparent;
}

.history-list::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 2px;
  transition: background 0.2s ease;
}

.history-list:hover::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
}

.history-list::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
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
</style>
