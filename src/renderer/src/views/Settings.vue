<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import {
  NButton,
  NCard,
  NInput,
  NSpace,
  NText,
  NMessageProvider,
  useMessage,
  NAlert,
  NIcon,
  NH2,
  NInputGroup
} from 'naive-ui'
import { Settings as SettingsIcon, ArrowBack, FolderOpenOutline, KeyOutline } from '@vicons/ionicons5'
import { saveConfig, getConfig, setApiKey, getApiKey, validateApiKey } from '../api/config'

const router = useRouter()
const message = useMessage()

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
  void apiKeyRefresh.value
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

const loadVideoDataDirectory = async (): Promise<void> => {
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
    } catch {
      // 如果后端未启动或配置不存在，使用 Electron 的配置
      console.debug('无法从后端获取配置，使用 Electron 配置')
    }
  } catch (error) {
    console.error('Failed to load video data directory:', error)
    message.error('加载视频数据目录失败')
  }
}

const restarting = ref(false)

const selectDirectory = async (): Promise<void> => {
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
    <div class="settings-page">
      <div class="settings-header">
        <n-button quaternary circle size="large" @click="router.push('/home')">
          <template #icon>
            <n-icon size="24"><ArrowBack /></n-icon>
          </template>
        </n-button>
        <div class="header-title">
          <n-h2 style="margin: 0; font-size: 24px; line-height: 1.2;">设置</n-h2>
          <n-text depth="3" class="header-subtitle">管理应用程序配置和首选项</n-text>
        </div>
      </div>

      <div class="settings-content">
        <n-space vertical size="large">
          <!-- 存储设置 -->
          <n-card :bordered="false" class="setting-card" title="存储设置">
            <template #header-extra>
              <n-icon size="20" depth="3"><FolderOpenOutline /></n-icon>
            </template>
            
            <n-alert type="info" class="mb-4" :show-icon="true" :bordered="false">
              修改目录后，系统会自动将原目录下的所有视频文件迁移到新目录。
            </n-alert>

            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-title">视频数据目录</div>
                <div class="setting-desc">存储视频文件和相关数据的本地路径</div>
              </div>
              <div class="setting-control">
                 <n-input
                    v-model:value="videoDataDirectory"
                    placeholder="视频数据目录路径"
                    readonly
                  >
                  <template #suffix>
                    <n-button 
                      text 
                      type="primary" 
                      :loading="loading || migrating" 
                      @click="selectDirectory"
                    >
                      {{ migrating ? '迁移中' : '更改' }}
                    </n-button>
                  </template>
                 </n-input>
                 <n-text v-if="migrateProgress" depth="3" style="font-size: 12px; margin-top: 8px; display: block;">
                  {{ migrateProgress }}
                </n-text>
              </div>
            </div>
          </n-card>

          <!-- API 设置 -->
          <n-card :bordered="false" class="setting-card" title="API 配置">
            <template #header-extra>
              <n-icon size="20" depth="3"><KeyOutline /></n-icon>
            </template>

            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-title">API Key</div>
                <div class="setting-desc">用于访问云端服务的认证密钥</div>
              </div>
              
              <div class="setting-control">
                <n-space vertical>
                   <div v-if="hasApiKey && !isEditingApiKey" class="api-key-display">
                      <n-input :value="maskedApiKey" readonly type="text">
                        <template #suffix>
                          <n-button text type="primary" @click="isEditingApiKey = true">修改</n-button>
                        </template>
                      </n-input>
                   </div>

                   <n-input-group v-if="!hasApiKey || isEditingApiKey">
                      <n-input
                        v-model:value="apiKey"
                        type="password"
                        placeholder="请输入 API Key"
                        show-password-on="click"
                        @keyup.enter="saveApiKey"
                      />
                      <n-button
                        type="primary"
                        :loading="loading"
                        :disabled="!apiKey.trim()"
                        @click="saveApiKey"
                      >
                        保存
                      </n-button>
                      <n-button
                         v-if="hasApiKey"
                         @click="() => { isEditingApiKey = false; apiKey = ''; }"
                      >
                        取消
                      </n-button>
                   </n-input-group>
                   
                   <n-text depth="3" style="font-size: 12px">
                    {{ hasApiKey && !isEditingApiKey ? '您的 API Key 已安全保存' : '请输入有效的 API Key 以启用云端功能' }}
                  </n-text>
                </n-space>
              </div>
            </div>
          </n-card>
        </n-space>
      </div>
    </div>
  </n-message-provider>
</template>

<style scoped>
.settings-page {
  height: 100vh;
  width: 100%;
  background: #101014;
  color: #fff;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.settings-header {
  padding: 24px 40px;
  display: flex;
  align-items: center;
  gap: 20px;
  background: #18181c;
  border-bottom: 1px solid rgba(255, 255, 255, 0.09);
  flex-shrink: 0;
}

.header-title {
  display: flex;
  flex-direction: column;
}

.header-subtitle {
  font-size: 13px;
  margin-top: 4px;
}

.settings-content {
  flex: 1;
  padding: 32px 40px;
  overflow-y: auto;
  min-width: 600px;
  max-width: 1000px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
}

.setting-card {
  background: #18181c;
  border-radius: 8px;
}

.mb-4 {
  margin-bottom: 20px;
}

.setting-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 40px;
  padding: 8px 0;
}

.setting-info {
  flex: 0 0 240px;
}

.setting-title {
  font-size: 15px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.9);
  margin-bottom: 6px;
}

.setting-desc {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  line-height: 1.5;
}

.setting-control {
  flex: 1;
  max-width: 480px;
}

/* Custom scrollbar */
.settings-content::-webkit-scrollbar {
  width: 6px;
}
.settings-content::-webkit-scrollbar-track {
  background: transparent;
}
.settings-content::-webkit-scrollbar-thumb {
  background: #333;
  border-radius: 3px;
}

:deep(.n-card-header) {
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  margin-bottom: 20px;
}

:deep(.n-card__content) {
  padding-top: 0;
}
</style>
