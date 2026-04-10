<script setup lang="ts">
import {
  NConfigProvider,
  NMessageProvider,
  NDialogProvider,
  darkTheme,
  type GlobalThemeOverrides
} from 'naive-ui'
import { RouterView, useRouter } from 'vue-router'
import { onMounted, onUnmounted } from 'vue'
import { useRealtimeStore } from './stores/realtime'
import { setBaseUrl } from './utils/request'
import BannedUserModal from './components/BannedUserModal.vue'
import VersionUpdateModal from './components/VersionUpdateModal.vue'
import VipExpiredModal from './components/VipExpiredModal.vue'
import { deviceUnavailable, runDeviceCheck } from './composables/useDeviceGate'

const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#3b82f6',
    primaryColorHover: '#60a5fa',
    primaryColorPressed: '#2563eb',
    fontFamily:
      '"Inter", "Noto Sans SC", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    fontFamilyMono: 'Menlo, Monaco, Consolas, "Courier New", monospace'
  },
  Tree: {
    nodeColorActive: '#007AFF',
    nodeBorderRadius: '6px',
    nodeHeight: '28px',
    nodeWrapperPadding: '4px 12px',
    fontSize: '15px'
  }
}

const rtStore = useRealtimeStore()
const router = useRouter()

const initConnection = async (port: number): Promise<void> => {
  console.log('[Renderer] Initializing connection with port:', port)
  const baseUrl = `http://127.0.0.1:${port}`
  setBaseUrl(baseUrl)
  rtStore.setBaseUrl(baseUrl)

  rtStore.disconnect()

  const deviceOk = await runDeviceCheck()
  if (!deviceOk && deviceUnavailable.value) {
    return
  }
  rtStore.connect()
}

let removeNavigateListener: (() => void) | undefined
let removeBackendPortListener: (() => void) | undefined

onMounted(async () => {
  removeNavigateListener = window.api.onNavigate((route) => {
    router.push(route)
  })

  // Try to get existing port first
  const existingPort = await window.api.getBackendPort()
  if (existingPort) {
    void initConnection(existingPort)
  }

  // Listen for port updates (in case backend restarts or starts late)
  removeBackendPortListener = window.api.onBackendPort((port) => {
    console.log('[Renderer] Backend port received:', port)
    void initConnection(port)
  })
})

onUnmounted(() => {
  removeNavigateListener?.()
  removeBackendPortListener?.()
})
</script>

<template>
  <n-config-provider :theme="darkTheme" :theme-overrides="themeOverrides">
    <n-message-provider :duration="5000" keep-alive-on-hover closable>
      <n-dialog-provider>
        <div class="app-wrapper">
          <RouterView />
        </div>
        <BannedUserModal />
        <VipExpiredModal />
        <VersionUpdateModal />
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<style>
/* Ensure the app takes full height */
html,
body,
#app {
  height: 100%;
  margin: 0;
  overflow: hidden;
  background-color: #000;
  font-family:
    'Inter',
    'Noto Sans SC',
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    Roboto,
    'Helvetica Neue',
    Arial,
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.app-wrapper {
  position: relative;
  height: 100%;
  width: 100%;
}
</style>
