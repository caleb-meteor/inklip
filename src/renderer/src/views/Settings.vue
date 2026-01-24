<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NCard, NInput, NSpace, NText, NMessageProvider, useMessage, NAlert, NIcon, NH2 } from 'naive-ui'
import { Settings as SettingsIcon } from '@vicons/ionicons5'
import { saveConfig, getConfig, setApiKey, getApiKey, validateApiKey } from '../api/config'
import { useWebsocketStore } from '../stores/websocket'

const router = useRouter()
const message = useMessage()
const wsStore = useWebsocketStore()

const videoDataDirectory = ref('')
const apiKey = ref('')
const hasApiKey = ref(false)
const isEditingApiKey = ref(false)
const loading = ref(false)
const migrating = ref(false)
const migrateProgress = ref('')
const apiKeyRefresh = ref(0)

// 计算掩盖后的 API Key 显示值
const maskedApiKey = computed(() => {
  // 添加刷新依赖，确保localStorage变化时能重新计算
  apiKeyRefresh.value
  if (!hasApiKey.value) {
    return ''
  }
  const savedApiKey = localStorage.getItem('apiKey')
  if (!savedApiKey) {
    return ''
  }
  // 显示前 4 位 + 8 个 * + 后 4 位
  const first4 = savedApiKey.slice(0, 4)
  const last4 = savedApiKey.slice(-4)
  return first4 + '********' + last4
})

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

const loadApiKey = async (): Promise<void> => {
  const savedApiKey = localStorage.getItem('apiKey')
  if (savedApiKey) {
    hasApiKey.value = true
    apiKey.value = ''
  } else {
    // 如果本地没有 apiKey，尝试从后端获取
    try {
      const response = await getApiKey()
      if (response.api_key) {
        // 保存到本地存储
        localStorage.setItem('apiKey', response.api_key)
        hasApiKey.value = true
        apiKey.value = ''
        console.log('[Settings] 从后端获取 API Key 成功')
      } else {
        hasApiKey.value = false
        apiKey.value = ''
      }
    } catch (error) {
      // 如果获取失败，则 apiKey 为空
      console.debug('[Settings] 无法从后端获取 API Key:', error)
      hasApiKey.value = false
      apiKey.value = ''
    }
  }
}

const saveApiKey = (): void => {
  const apiKeyValue = apiKey.value.trim()
  if (apiKeyValue) {
    loading.value = true
    // 先验证 API Key 是否有效
    validateApiKey(apiKeyValue)
      .then((response) => {
        if (!response.status) {
          message.error('API Key 验证失败，请检查密钥是否正确')
          return
        }
        // 验证成功，保存 API Key
        return setApiKey(apiKeyValue)
      })
      .then(() => {
        // 保存到本地存储
        localStorage.setItem('apiKey', apiKeyValue)
        message.success('API Key 已验证并保存')
        hasApiKey.value = true
        isEditingApiKey.value = false
        apiKey.value = ''
        // 触发刷新以更新 maskedApiKey
        apiKeyRefresh.value++
        // 触发自定义事件，通知其他组件 apiKey 已更新
        window.dispatchEvent(new CustomEvent('apiKeyChanged', { detail: { hasApiKey: true } }))
      })
      .catch((error) => {
        console.error('验证或设置 API Key 失败:', error)
        message.error(`操作失败: ${(error as Error).message}`)
      })
      .finally(() => {
        loading.value = false
      })
  }
}

onMounted(() => {
  loadVideoDataDirectory()
  loadApiKey()
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
              <n-text strong>API Key</n-text>
            </div>
            <n-space vertical style="width: 100%">
              <div v-if="hasApiKey && !isEditingApiKey" class="api-key-display">
                <n-input
                  :value="maskedApiKey"
                  readonly
                  type="text"
                  style="width: 100%"
                />
              </div>
              <n-input
                v-if="!hasApiKey || isEditingApiKey"
                v-model:value="apiKey"
                type="password"
                placeholder="请输入 API Key"
                show-password-on="click"
                style="width: 100%"
                @keyup.enter="saveApiKey"
              />
              <n-space>
                <n-button
                  v-if="!hasApiKey && !isEditingApiKey"
                  type="primary"
                  @click="isEditingApiKey = true"
                >
                  设置
                </n-button>
                <n-button
                  v-if="isEditingApiKey"
                  type="primary"
                  :loading="loading"
                  :disabled="!apiKey.trim()"
                  @click="saveApiKey"
                >
                  保存
                </n-button>
                <n-button
                  v-if="hasApiKey && !isEditingApiKey"
                  type="primary"
                  @click="isEditingApiKey = true"
                >
                  修改
                </n-button>
                <n-button
                  v-if="isEditingApiKey"
                  @click="() => { isEditingApiKey = false; apiKey = ''; }"
                >
                  取消
                </n-button>
              </n-space>
              <n-text depth="3" style="font-size: 12px">
                {{ hasApiKey && !isEditingApiKey ? '已保存 API Key' : '输入 API Key 后点击保存' }}
              </n-text>
            </n-space>
          </div>

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

