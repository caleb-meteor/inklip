<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import appIcon from '../../../../resources/icon.png'

const router = useRouter()
const status = ref('正在启动服务...')
const percentage = ref(0)
const error = ref('')

onMounted(async () => {
  try {
    // Phase 1: Verify Backend Connection
    const interval = setInterval(() => {
      if (percentage.value < 30) percentage.value += 5
    }, 100)

    const port = await window.api.getBackendPort()

    if (port) {
      percentage.value = 40
      status.value = '后端服务已连接'
    }
    clearInterval(interval)

    // Phase 2: Check Resources
    status.value = '正在校验资源文件...'
    percentage.value = 50

    const resourcesExist = await window.api.checkResources()

    if (!resourcesExist) {
      status.value = 'Downloading resources...'
      window.api.onDownloadProgress((progress: any) => {
        const formatSize = (bytes: number): string => {
          if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
          return `${(bytes / 1024).toFixed(1)}KB`
        }

        const currentText = formatSize(progress.current || 0)
        const totalText = formatSize(progress.total || 0)

        let speedText = ''
        if (progress.speed !== undefined) {
          const speed = progress.speed
          if (speed >= 1024 * 1024) {
            speedText = ` - ${(speed / (1024 * 1024)).toFixed(1)} MB/s`
          } else {
            speedText = ` - ${(speed / 1024).toFixed(1)} KB/s`
          }
        }

        status.value = `正在下载资源文件... (${currentText} / ${totalText}) ${progress.percentage}%${speedText}`
        const downloadPhase = progress.percentage * 0.4
        percentage.value = 50 + downloadPhase
      })

      await window.api.downloadResources()
    }

    // Phase 3: Finalize
    percentage.value = 100
    status.value = '准备就绪'

    setTimeout(() => {
      const token = localStorage.getItem('token')
      if (token) {
        router.push('/home')
      } else {
        router.push('/login')
      }
    }, 500)
  } catch (e) {
    error.value = (e as Error).message
    status.value = '初始化失败'
  }
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
          <div class="progress-fill" :style="{ width: percentage + '%' }"></div>
        </div>
        <p class="status-text">{{ error || status }}</p>
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
}
</style>
