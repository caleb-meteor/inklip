<script setup lang="ts">
import { NConfigProvider, NMessageProvider, darkTheme, type GlobalThemeOverrides } from 'naive-ui'
import { RouterView, useRouter, useRoute } from 'vue-router'
import { onMounted } from 'vue'
import { useWebsocketStore } from './stores/websocket'
import { setBaseUrl } from './utils/request'
import Footer from './components/Footer.vue'

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

const wsStore = useWebsocketStore()
const router = useRouter()
const route = useRoute()

const initConnection = (port: number): void => {
  console.log('[Renderer] Initializing connection with port:', port)
  const baseUrl = `http://127.0.0.1:${port}`
  setBaseUrl(baseUrl)
  wsStore.setBaseUrl(`ws://127.0.0.1:${port}/api/ws`)

  // Reconnect WebSocket if token exists
  if (localStorage.getItem('token')) {
    wsStore.disconnect()
    wsStore.connect()
  }
}

onMounted(async () => {
  window.api.onNavigate((route) => {
    router.push(route)
  })

  // Try to get existing port first
  const existingPort = await window.api.getBackendPort()
  if (existingPort) {
    initConnection(existingPort)
  }

  // Listen for port updates (in case backend restarts or starts late)
  window.api.onBackendPort((port) => {
    console.log('[Renderer] Backend port received:', port)
    initConnection(port)
  })
})
</script>

<template>
  <n-config-provider :theme="darkTheme" :theme-overrides="themeOverrides">
    <n-message-provider>
      <div class="app-wrapper">
        <RouterView />
        <Footer v-if="route.name !== 'Splash' && route.name !== 'Login'" />
      </div>
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
