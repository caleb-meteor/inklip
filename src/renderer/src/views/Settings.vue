<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NCard, NInput, NSpace, NText, NMessageProvider, useMessage, NAlert, NIcon, NH2 } from 'naive-ui'
import { Settings as SettingsIcon } from '@vicons/ionicons5'
import { saveConfig, getConfig } from '../api/config'

const router = useRouter()
const message = useMessage()

const videoDataDirectory = ref('')
const loading = ref(false)
const migrating = ref(false)
const migrateProgress = ref('')

const loadVideoDataDirectory = async () => {
  try {
    // 先从 Electron 获取当前配置
    const dir = await window.api.getVideoDataDirectory()
    videoDataDirectory.value = dir
    
    // 然后从 Python 后端获取配置（如果存在）
    try {
      const config = await getConfig()
      if (config.videoDataDirectory) {
        videoDataDirectory.value = config.videoDataDirectory
      }
    } catch (error) {
      // 如果后端未启动或配置不存在，使用 Electron 的配置
      console.debug('无法从后端获取配置，使用 Electron 配置')
    }
  } catch (error) {
    console.error('Failed to load video data directory:', error)
    message.error('加载视频数据目录失败')
  }
}

const restarting = ref(false)

const selectDirectory = async () => {
  try {
    loading.value = true
    migrating.value = false
    migrateProgress.value = ''
    
    // 1. 选择目录（Electron 负责）
    const result = await window.api.selectVideoDataDirectory()
    if (!result.success || !result.directory) {
      if (!result.canceled) {
        message.error(result.error || '选择目录失败')
      }
      return
    }
    
    const newDir = result.directory
    const oldDir = result.oldDirectory || videoDataDirectory.value
    
    // 2. 如果目录不同，显示迁移提示
    if (oldDir !== newDir) {
      migrating.value = true
      migrateProgress.value = '正在迁移文件并更新配置...'
    }
    
    // 3. 保存配置到 Python 后端（后端会自动处理文件迁移）
    try {
      await saveConfig({ videoDataDirectory: newDir })
      console.log('[Settings] 配置已保存到后端')
      
      if (oldDir !== newDir) {
        migrateProgress.value = '文件迁移和配置更新完成'
        message.success('视频数据目录已更新，文件已自动迁移')
      } else {
        message.success('配置已保存')
      }
    } catch (error) {
      console.error('[Settings] 保存配置失败:', error)
      message.error(`更新失败: ${(error as Error).message}`)
      migrating.value = false
      return
    }
    
    // 4. 更新本地显示
    videoDataDirectory.value = newDir
    migrating.value = false
  } catch (error) {
    console.error('Failed to select directory:', error)
    message.error('选择目录失败')
    restarting.value = false
    migrating.value = false
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadVideoDataDirectory()
})
</script>

<template>
  <n-message-provider>
    <div class="settings-container">
      <div class="header">
        <n-space align="center">
          <n-icon size="24" color="#63e2b7">
            <SettingsIcon />
          </n-icon>
          <n-h2 style="margin: 0">
            <n-text type="primary">设置</n-text>
          </n-h2>
        </n-space>
        <n-button secondary @click="router.push('/home')">返回</n-button>
      </div>

      <div class="content">
        <n-card title="设置" class="settings-card">
          <n-alert type="info" style="margin-bottom: 20px">
            <div>
                <strong> 修改目录后，系统会自动将原目录下的所有视频文件迁移到新目录。</strong>
              </div>
            
          </n-alert>

          <div class="setting-item">
            <div class="setting-label">
              <n-text strong>视频数据目录</n-text>
            </div>
            <n-space vertical style="width: 100%">
              <n-input
                v-model:value="videoDataDirectory"
                placeholder="视频数据目录路径"
                readonly
                style="width: 100%"
              />
              <n-space vertical style="width: 100%">
                <n-button type="primary" :loading="loading || migrating" @click="selectDirectory">
                  {{ migrating ? '正在迁移文件...' : '选择目录' }}
                </n-button>
                <n-text v-if="migrateProgress" depth="3" style="font-size: 12px">
                  {{ migrateProgress }}
                </n-text>
              </n-space>
            </n-space>
          </div>
        </n-card>
      </div>
    </div>
  </n-message-provider>
</template>

<style scoped>
.settings-container {
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
  margin-bottom: 40px;
}

.content {
  flex: 1;
  max-width: 800px;
  width: 100%;
}

.settings-card {
  background: #262626;
  border-color: #333;
}

.setting-item {
  margin-bottom: 24px;
}

.setting-label {
  margin-bottom: 12px;
  display: flex;
  align-items: center;
}
</style>

