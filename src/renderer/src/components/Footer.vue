<script setup lang="ts">
import { NBadge, NText } from 'naive-ui'
import { useWebsocketStore } from '../stores/websocket'

const wsStore = useWebsocketStore()
</script>

<template>
  <div class="footer-status-bar">
    <div class="ws-status-indicator">
      <n-badge dot :type="wsStore.connected ? 'success' : 'error'" processing />
      <n-text depth="3" class="status-text">
        服务状态: {{ wsStore.connected ? '在线' : '离线' }}
      </n-text>
    </div>
  </div>
</template>

<style scoped>
.footer-status-bar {
  position: fixed;
  bottom: 0;
  right: 0;
  width: 100%;
  pointer-events: none;
  padding: 12px;
  z-index: 9999;
  display: flex;
  justify-content: flex-end;
}

.ws-status-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(10px);
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  width: fit-content;
  pointer-events: auto;
}

.status-text {
  font-size: 11px;
  font-family: monospace;
  letter-spacing: 0.5px;
}
</style>
