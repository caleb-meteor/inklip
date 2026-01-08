<script setup lang="ts">
import { NButton, NSpace, NH1, NText, NCard, NGrid, NGi, NIcon } from 'naive-ui'
import { useRouter } from 'vue-router'
import { Videocam, Cut, Settings } from '@vicons/ionicons5'
import { logout } from '../router'

const router = useRouter()

const handleLogout = () => {
  logout()
  router.push('/login')
}

const navigateTo = (path: string) => {
  router.push(path)
}
</script>

<template>
  <div class="home-container">
    <div class="header">
      <n-h1> <n-text type="primary">影氪</n-text> 工作台 </n-h1>
      <n-space>
        <n-button secondary size="small" @click="navigateTo('/settings')">
          <template #icon>
            <n-icon><Settings /></n-icon>
          </template>
          设置
        </n-button>
        <n-button secondary type="error" size="small" @click="handleLogout"> 退出登录 </n-button>
      </n-space>
    </div>

    <div class="content">
      <n-grid x-gap="24" y-gap="24" :cols="2">
        <n-gi>
          <n-card hoverable class="feature-card" @click="navigateTo('/video-manager')">
            <template #header>
              <n-space align="center">
                <n-icon size="30" color="#63e2b7">
                  <Videocam />
                </n-icon>
                <span class="card-title">视频管理</span>
              </n-space>
            </template>
            <p>管理您的本地和云端视频素材，支持批量导入与整理。</p>
          </n-card>
        </n-gi>
        <n-gi>
          <n-card hoverable class="feature-card" @click="navigateTo('/smart-editor')">
            <template #header>
              <n-space align="center">
                <n-icon size="30" color="#63e2b7">
                  <Cut />
                </n-icon>
                <span class="card-title">智能剪辑</span>
              </n-space>
            </template>
            <p>基于 AI 的智能剪辑工具，快速生成精彩视频。</p>
          </n-card>
        </n-gi>
      </n-grid>
    </div>
  </div>
</template>

<style scoped>
.home-container {
  height: 100vh;
  width: 100%;
  padding: 40px;
  background: #1a1a1a;
  color: #fff;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 60px;
}

.content {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: flex-start;
}

.feature-card {
  cursor: pointer;
  height: 200px;
  transition: transform 0.3s ease;
  background: #262626;
  border-color: #333;
}

.feature-card:hover {
  transform: translateY(-5px);
  border-color: #63e2b7;
}

.card-title {
  font-size: 1.2rem;
  font-weight: bold;
}
</style>
