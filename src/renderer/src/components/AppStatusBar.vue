<script setup lang="ts">
import { computed } from 'vue'
import { NIcon } from 'naive-ui'
import { SettingsOutline } from '@vicons/ionicons5'
import { useRealtimeStore } from '../stores/realtime'

interface Props {
  appVersion?: string
}

withDefaults(defineProps<Props>(), {
  appVersion: '1.0.0'
})

const emit = defineEmits<{
  'navigate-to-settings': []
}>()

const wsStore = useRealtimeStore()
const currentYear = computed(() => new Date().getFullYear())
</script>

<template>
  <div class="app-status-bar">
    <div class="status-item clickable" @click="emit('navigate-to-settings')">
      <n-icon size="16"><SettingsOutline /></n-icon>
      <span>设置</span>
    </div>

    <div class="status-spacer"></div>

    <div class="brand-item">
      <span>© {{ currentYear }} 影氪</span>
      <span class="version-badge">v{{ appVersion }}</span>
    </div>

    <div class="status-spacer"></div>

    <div class="status-badge" :class="{ 'is-active': wsStore.connected }">
      <div class="status-indicator"></div>
      <span class="status-text">{{ wsStore.connected ? '服务正常' : '服务离线' }}</span>
    </div>
  </div>
</template>

<style scoped>
.app-status-bar {
  height: 48px;
  background: #09090b;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  align-items: center;
  padding: 0 24px;
  gap: 16px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.45);
  user-select: none;
  z-index: 1000;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s ease;
  font-weight: 500;
}

.status-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  transition: all 0.3s ease;
}

.status-badge.is-active {
  background: rgba(16, 185, 129, 0.1);
  border-color: rgba(16, 185, 129, 0.2);
}

.status-indicator {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: #ef4444;
  position: relative;
  transition: background-color 0.3s ease;
}

.status-badge.is-active .status-indicator {
  background-color: #10b981;
  box-shadow: 0 0 10px rgba(16, 185, 129, 0.5);
}

.status-badge.is-active .status-indicator::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 100%;
  height: 100%;
  background-color: #10b981;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  animation: status-ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
}

@keyframes status-ping {
  75%,
  100% {
    transform: translate(-50%, -50%) scale(3);
    opacity: 0;
  }
}

.status-text {
  font-size: 12px;
  font-weight: 500;
  color: #ef4444;
  transition: color 0.3s ease;
}

.status-badge.is-active .status-text {
  color: #10b981;
}

.status-item.clickable {
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  margin-left: -8px; /* Offset padding visually */
}

.status-item.clickable:hover {
  color: rgba(255, 255, 255, 0.9);
  background: rgba(255, 255, 255, 0.04);
}

.brand-item {
  display: flex;
  align-items: center;
  gap: 8px;
  color: rgba(255, 255, 255, 0.3);
  font-size: 12px;
}

.status-spacer {
  flex: 1;
}

.version-badge {
  color: rgba(255, 255, 255, 0.25);
  font-family: 'SF Mono', 'Menlo', monospace;
  font-size: 11px;
  background: rgba(255, 255, 255, 0.03);
  padding: 2px 6px;
  border-radius: 4px;
  letter-spacing: -0.5px;
}
</style>
