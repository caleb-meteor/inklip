<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
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
  NInputGroup,
  NDivider,
  NSelect,
  NModal
} from 'naive-ui'
import {
  ArrowBack,
  FolderOpenOutline,
  KeyOutline,
  ChatbubblesOutline
} from '@vicons/ionicons5'
import { saveConfig, getConfig, setApiKey, getApiKey } from '../api/config'
import { submitFeedback, type SubmitFeedbackParams } from '../api/report'
import { useRealtimeStore } from '../stores/realtime'

const router = useRouter()
const rtStore = useRealtimeStore()
const route = useRoute()
const message = useMessage()

const videoDataDirectory = ref('')
const apiKey = ref('')
const hasApiKey = ref(false)
const isEditingApiKey = ref(false)
const loading = ref(false)
const migrating = ref(false)
const migrateProgress = ref('')
const apiKeyRefresh = ref(0)

const copiedJustNow = ref(false)
let copyResetTimer: ReturnType<typeof setTimeout> | null = null

// 计算掩盖后的授权码显示值
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

/** 与 ApiKeyChangeBlock（弹窗）一致：复制授权码成功不弹 success，按钮短暂显示「已复制」 */
const copyFullApiKey = async (): Promise<void> => {
  const savedApiKey = localStorage.getItem('apiKey')
  if (!savedApiKey) {
    message.warning('当前没有已保存的授权码')
    return
  }
  try {
    await navigator.clipboard.writeText(savedApiKey)
    copiedJustNow.value = true
    if (copyResetTimer) clearTimeout(copyResetTimer)
    copyResetTimer = setTimeout(() => {
      copiedJustNow.value = false
      copyResetTimer = null
    }, 2000)
  } catch (err) {
    console.error('复制授权码失败:', err)
    message.error('复制失败，请稍后重试')
  }
}

const loadVideoDataDirectory = async (): Promise<void> => {
  const dir = await window.api.getVideoDataDirectory()
  videoDataDirectory.value = dir
  const config = await getConfig()
  if (config.videoDataDirectory) videoDataDirectory.value = config.videoDataDirectory
}

const selectDirectory = async (): Promise<void> => {
  loading.value = true
  migrating.value = false
  migrateProgress.value = ''

  const doSelect = async (): Promise<void> => {
    const result = await window.api.selectDirectory({
      title: '选择视频数据目录',
      defaultPath: videoDataDirectory.value
    })
    if (!result.success || !result.directory) {
      if (!result.canceled) message.error(result.error || '选择目录失败')
      return
    }

    const newDir = result.directory
    const oldDir = videoDataDirectory.value

    if (oldDir !== newDir) {
      migrating.value = true
      migrateProgress.value = '正在迁移文件并更新配置...'
    }

    await saveConfig({ videoDataDirectory: newDir })
    if (oldDir !== newDir) {
      migrateProgress.value = '文件迁移和配置更新完成'
      message.success('视频数据目录已更新，文件已自动迁移')
    } else {
      message.success('配置已保存')
    }

    videoDataDirectory.value = newDir
  }
  await doSelect().finally(() => {
    migrating.value = false
    loading.value = false
  })
}

// ==================== 建议反馈 ====================
const showFeedbackModal = ref(false)
const feedbackSubmitting = ref(false)
const feedbackForm = ref({
  type: null as string | null,
  reason: '',
  detail: '',
  contact: ''
})

const feedbackTypeOptions = [
  { label: '功能需求', value: 'feature_request' },
  { label: 'Bug 反馈', value: 'bug_report' },
  { label: 'AI 内容反馈', value: 'ai_content' }
]

const openFeedbackModal = (presetType?: string): void => {
  feedbackForm.value = { type: presetType || null, reason: '', detail: '', contact: '' }
  showFeedbackModal.value = true
}

const handleSubmitFeedback = async (): Promise<void> => {
  if (!feedbackForm.value.type) {
    message.warning('请选择反馈类型')
    return
  }
  if (!feedbackForm.value.reason.trim()) {
    message.warning('请填写反馈标题')
    return
  }
  feedbackSubmitting.value = true
  await submitFeedback({
    type: feedbackForm.value.type as SubmitFeedbackParams['type'],
    reason: feedbackForm.value.reason.trim(),
    detail: feedbackForm.value.detail,
    contact: feedbackForm.value.contact
  }).finally(() => {
    feedbackSubmitting.value = false
  })
  message.success('反馈已提交，感谢您的支持！')
  showFeedbackModal.value = false
}

const loadApiKey = async (): Promise<void> => {
  const savedApiKey = localStorage.getItem('apiKey')
  if (savedApiKey) {
    hasApiKey.value = true
    apiKey.value = ''
  } else {
    // 如果本地没有 apiKey，尝试从后端获取
    const response = await getApiKey()
    if (response.api_key) {
      // 保存到本地存储
      localStorage.setItem('apiKey', response.api_key)
      hasApiKey.value = true
      apiKey.value = ''
      console.log('[Settings] 从后端获取授权码成功')
    } else {
      hasApiKey.value = false
      apiKey.value = ''
    }
  }
}

const saveApiKey = async (): Promise<void> => {
  const apiKeyValue = apiKey.value.trim()
  if (!apiKeyValue) {
    return
  }
  loading.value = true
  await setApiKey(apiKeyValue).finally(() => {
    loading.value = false
  })
  localStorage.setItem('apiKey', apiKeyValue)
  hasApiKey.value = true
  isEditingApiKey.value = false
  apiKey.value = ''
  apiKeyRefresh.value++
  window.dispatchEvent(new CustomEvent('apiKeyChanged', { detail: { hasApiKey: true } }))
  rtStore.reauthenticate()
}

onMounted(() => {
  loadVideoDataDirectory()
  loadApiKey()
  if (route.query.feedback) {
    openFeedbackModal(route.query.feedback as string)
  }
})

watch(
  () => route.query.feedback,
  (val) => {
    if (val) openFeedbackModal(val as string)
  }
)
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
          <n-h2 style="margin: 0; font-size: 24px; line-height: 1.2">设置</n-h2>
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
                <n-input v-model:value="videoDataDirectory" placeholder="视频数据目录路径" readonly>
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
                <n-text
                  v-if="migrateProgress"
                  depth="3"
                  style="font-size: 12px; margin-top: 8px; display: block"
                >
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
                <div class="setting-title">授权码</div>
                <div class="setting-desc">用于访问云端服务的认证密钥</div>
              </div>

              <div class="setting-control">
                <n-space vertical>
                  <div v-if="hasApiKey && !isEditingApiKey" class="api-key-display">
                    <n-input :value="maskedApiKey" readonly type="text">
                      <template #suffix>
                        <n-button
                          text
                          type="primary"
                          title="修改授权码"
                          @click="isEditingApiKey = true"
                        >
                          修改
                        </n-button>
                        <n-divider vertical style="margin: 0 12px" />
                        <n-button
                          text
                          type="primary"
                          class="settings-api-key-copy"
                          :class="{ 'settings-api-key-copy--copied': copiedJustNow }"
                          :disabled="copiedJustNow"
                          title="复制完整授权码"
                          @click="copyFullApiKey"
                        >
                          {{ copiedJustNow ? '已复制' : '复制' }}
                        </n-button>
                      </template>
                    </n-input>
                  </div>

                  <n-input-group v-if="!hasApiKey || isEditingApiKey">
                    <n-input
                      v-model:value="apiKey"
                      type="password"
                      placeholder="请输入授权码"
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
                      @click="
                        () => {
                          isEditingApiKey = false
                          apiKey = ''
                        }
                      "
                    >
                      取消
                    </n-button>
                  </n-input-group>

                  <n-text depth="3" style="font-size: 12px">
                    {{
                      hasApiKey && !isEditingApiKey
                        ? '您的授权码已安全保存'
                        : '请输入有效的授权码以启用云端功能'
                    }}
                  </n-text>
                </n-space>
              </div>
            </div>
          </n-card>

          <!-- 建议反馈（涵盖功能需求、Bug 反馈、AI 内容反馈） -->
          <n-card :bordered="false" class="setting-card" title="建议反馈">
            <template #header-extra>
              <n-icon size="20" depth="3"><ChatbubblesOutline /></n-icon>
            </template>
            <n-alert type="info" class="mb-4" :show-icon="true" :bordered="false">
              您可以向我们提交功能需求、Bug 反馈或 AI 内容反馈，帮助我们持续改进产品。
            </n-alert>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-title">提交反馈</div>
                <div class="setting-desc">功能需求、Bug 反馈、AI 内容反馈</div>
              </div>
              <div class="setting-control">
                <n-space>
                  <n-button type="primary" secondary @click="openFeedbackModal()">
                    提交反馈
                  </n-button>
                  <n-button type="warning" secondary @click="openFeedbackModal('ai_content')">
                    举报 AI 不当内容
                  </n-button>
                </n-space>
              </div>
            </div>
          </n-card>
        </n-space>
      </div>

      <!-- 建议反馈弹窗 -->
      <n-modal
        v-model:show="showFeedbackModal"
        preset="card"
        title="建议反馈"
        :bordered="false"
        style="width: 520px"
        :mask-closable="!feedbackSubmitting"
      >
        <n-space vertical size="large">
          <div>
            <n-text depth="3" style="font-size: 13px; display: block; margin-bottom: 8px">
              反馈类型 *
            </n-text>
            <n-select
              v-model:value="feedbackForm.type"
              :options="feedbackTypeOptions"
              placeholder="请选择反馈类型"
            />
          </div>
          <div>
            <n-text depth="3" style="font-size: 13px; display: block; margin-bottom: 8px">
              标题 *
            </n-text>
            <n-input
              v-model:value="feedbackForm.reason"
              placeholder="请简要描述您的反馈"
            />
          </div>
          <div>
            <n-text depth="3" style="font-size: 13px; display: block; margin-bottom: 8px">
              详细描述
            </n-text>
            <n-input
              v-model:value="feedbackForm.detail"
              type="textarea"
              placeholder="请详细描述（可选）"
              :rows="4"
            />
          </div>
          <div>
            <n-text depth="3" style="font-size: 13px; display: block; margin-bottom: 8px">
              联系方式
            </n-text>
            <n-input
              v-model:value="feedbackForm.contact"
              placeholder="方便我们回复您（可选）"
            />
          </div>
          <n-space justify="end">
            <n-button :disabled="feedbackSubmitting" @click="showFeedbackModal = false">
              取消
            </n-button>
            <n-button
              type="primary"
              :loading="feedbackSubmitting"
              :disabled="!feedbackForm.type || !feedbackForm.reason.trim()"
              @click="handleSubmitFeedback"
            >
              提交反馈
            </n-button>
          </n-space>
        </n-space>
      </n-modal>
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

/* 与 ApiKeyChangeBlock 弹窗内「复制」一致 */
.settings-api-key-copy--copied {
  color: var(--n-success-color, #18a058) !important;
  cursor: default;
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
