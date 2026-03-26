<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import appIcon from '../../../../resources/icon.png'

const router = useRouter()
const status = ref('正在启动服务...')
const percentage = ref(0)
const error = ref('')

let removeBackendStartFailed: (() => void) | undefined
let removeBackendPortWait: (() => void) | undefined

onMounted(async () => {
  let initInterval: ReturnType<typeof setInterval> | undefined

  initInterval = setInterval(() => {
    if (percentage.value < 80) percentage.value += 5
  }, 100)

  removeBackendStartFailed = window.api.onBackendStartFailed((err) => {
    error.value = `核心服务启动异常 (${err.code})`
    status.value = '启动失败'
    percentage.value = 100
    if (initInterval) clearInterval(initInterval)
  })

  const startupError = await window.api.getBackendStartupError()
  if (startupError) {
    error.value = `核心服务启动异常 (${startupError.code})`
    status.value = '启动失败'
    percentage.value = 100
    if (initInterval) clearInterval(initInterval)
    return
  }

  status.value = '正在启动后端服务...'

  const p = await window.api.getBackendPort()
  if (!p) {
    await new Promise<number>((resolve) => {
      removeBackendPortWait = window.api.onBackendPort((port) => {
        removeBackendPortWait?.()
        removeBackendPortWait = undefined
        resolve(port)
      })
    })
  }

  if (initInterval) clearInterval(initInterval)
  percentage.value = 100
  status.value = '准备就绪'

  setTimeout(() => {
    router.push('/home')
  }, 280)
})

onUnmounted(() => {
  removeBackendStartFailed?.()
  removeBackendPortWait?.()
})
</script>

<template>
  <div class="splash-container">
    <div class="content">
      <div class="logo-area">
        <div class="logo-box">
          <img :src="appIcon" alt="影氪 Logo" class="app-logo" />
        </div>
        <h1>影氪</h1>
      </div>

      <div class="status-area">
        <div class="progress-bar">
          <div
            class="progress-fill"
            :class="{ error: !!error }"
            :style="{ width: percentage + '%' }"
          ></div>
        </div>
        <p class="status-text" :class="{ error: !!error }">{{ error || status }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.splash-container {
  height: 100vh;
  width: 100vw;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
  color: #fff;
  user-select: none;
}

.content {
  text-align: center;
  width: 480px; /* Increased to accommodate single line text */
}

.logo-box {
  margin-bottom: 24px;
  height: 100px;
  display: flex;
  justify-content: center;
  align-items: center;
}

.app-logo {
  width: 100px;
  height: 100px;
  border-radius: 22px; /* standard macOS squircle approximation */
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  object-fit: cover;
}

h1 {
  font-size: 32px;
  font-weight: 900;
  letter-spacing: 8px;
  margin: 0;
  color: #fff;
  text-indent: 8px; /* Offset to center text with tracking */
  background: linear-gradient(to bottom, #fff 40%, #888 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  font-family: 'Noto Sans SC', sans-serif;
}

.status-area {
  width: 100%;
}

.progress-bar {
  height: 2px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 1px;
  overflow: hidden;
  margin-bottom: 16px;
}

.progress-fill {
  height: 100%;
  background: #3b82f6;
  transition: width 0.4s cubic-bezier(0.1, 0.7, 0.1, 1);
  box-shadow: 0 0 15px rgba(59, 130, 246, 0.6);
}

.status-text {
  font-size: 11px;
  font-weight: 300;
  color: rgba(255, 255, 255, 0.4);
  margin: 0;
  height: 24px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: center;
  letter-spacing: 1px;
  text-transform: uppercase;
  transition: all 0.3s ease;
}

.status-text.error {
  color: #ff4d4f;
  font-weight: 500;
  font-size: 13px; /* Slightly larger */
  text-shadow: 0 0 10px rgba(255, 77, 79, 0.4);
}

.progress-fill.error {
  background: #ff4d4f;
  box-shadow: 0 0 20px rgba(255, 77, 79, 0.6);
}
</style>
