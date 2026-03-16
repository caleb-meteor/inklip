<script setup lang="ts">
import { NModal, NButton, NInput, NFormItem, useMessage } from 'naive-ui'
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useRealtimeStore } from '../stores/realtime'
import { validateApiKey, setApiKey } from '../api/config'

const route = useRoute()
const rtStore = useRealtimeStore()
const message = useMessage()

/** 仅在首页且用户被封禁时显示；不可关闭，优先级高于版本更新弹窗 */
const show = computed(
  () => route.path === '/home' && rtStore.isUserBanned
)

/** 是否显示「更换 API Key」表单（单独交互区） */
const showApiKeyForm = ref(false)
const newApiKey = ref('')
const saving = ref(false)

const onShowForm = (): void => {
  showApiKeyForm.value = true
  newApiKey.value = ''
}

const onSaveApiKey = async (): Promise<void> => {
  const key = newApiKey.value.trim()
  if (!key) {
    message.warning('请输入新的 API Key')
    return
  }
  saving.value = true
  try {
    const res = await validateApiKey(key)
    if (!res.status) {
      message.error('API Key 验证失败，请检查密钥是否正确')
      return
    }
    await setApiKey(key)
    localStorage.setItem('apiKey', key)
    message.success('API Key 已更换，正在重新连接…')
    window.dispatchEvent(new CustomEvent('apiKeyChanged', { detail: { hasApiKey: true } }))
    rtStore.reauthenticate()
    showApiKeyForm.value = false
    newApiKey.value = ''
  } catch (err) {
    message.error(`操作失败: ${(err as Error).message}`)
  } finally {
    saving.value = false
  }
}

/** 当前 API Key 的脱敏显示（前4 + *** + 后4） */
const maskedCurrentApiKey = computed(() => {
  const saved = localStorage.getItem('apiKey')
  if (!saved || saved.length < 8) return ''
  return saved.slice(0, 4) + '********' + saved.slice(-4)
})

const hasCurrentApiKey = computed(() => !!localStorage.getItem('apiKey'))

const copyCurrentApiKey = async (): Promise<void> => {
  const saved = localStorage.getItem('apiKey')
  if (!saved) {
    message.warning('当前没有已保存的 API Key')
    return
  }
  try {
    await navigator.clipboard.writeText(saved)
    message.success('已复制当前 API Key')
  } catch (err) {
    message.error('复制失败，请稍后重试')
  }
}
</script>

<template>
  <n-modal
    :show="show"
    :mask-closable="false"
    :close-on-esc="false"
    :closable="false"
    class="banned-user-modal"
    :z-index="10001"
  >
    <div class="banned-card">
      <div class="banned-header">
        <div class="header-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
          </svg>
        </div>
        <h2 class="header-title">账号已被封禁</h2>
      </div>

      <p class="banned-desc">
        账号已被封禁，请更换 API Key 后重试。
      </p>

      <!-- 当前 API Key 可复制（脱敏显示，复制在最后） -->
      <div v-if="hasCurrentApiKey" class="current-key-row" :class="{ 'current-key-row--compact': showApiKeyForm }">
        <span class="current-key-masked">{{ maskedCurrentApiKey }}</span>
        <n-button text type="primary" size="small" class="current-key-copy" @click="copyCurrentApiKey">
          复制
        </n-button>
      </div>

      <!-- 单独：更换 API Key 的表单交互 -->
      <div v-if="showApiKeyForm" class="api-key-form">
        <n-form-item label="新 API Key" :show-label="true">
          <n-input
            v-model:value="newApiKey"
            type="password"
            placeholder="请输入新的 API Key"
            show-password-on="click"
            clearable
            :disabled="saving"
            @keydown.enter="onSaveApiKey"
          />
        </n-form-item>
        <div class="form-actions">
          <n-button
            type="primary"
            :loading="saving"
            block
            class="action-btn"
            @click="onSaveApiKey"
          >
            验证并保存
          </n-button>
        </div>
      </div>

      <div v-else class="banned-actions">
        <n-button type="primary" class="action-btn" @click="onShowForm">
          更换 API Key
        </n-button>
      </div>
    </div>
  </n-modal>
</template>

<style scoped>
.banned-user-modal {
  width: 360px;
  background: var(--n-color);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

.banned-card {
  display: flex;
  flex-direction: column;
}

.banned-header {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  padding: 24px 20px 16px;
  gap: 10px;
  background: linear-gradient(180deg, rgba(239, 68, 68, 0.08) 0%, transparent 100%);
}

.header-icon {
  color: #f87171;
  display: flex;
  align-items: center;
  justify-content: center;
}

.header-icon svg {
  width: 26px;
  height: 26px;
}

.header-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--n-text-color-1);
  line-height: 1;
}

.banned-desc {
  margin: 0 20px;
  padding: 0 0 8px;
  font-size: 14px;
  line-height: 1.5;
  color: var(--n-text-color-2);
}

.current-key-row {
  display: flex;
  align-items: center;
  margin: 0 20px 12px;
  padding: 8px 10px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 6px;
  font-size: 13px;
}

.current-key-row--compact {
  margin-bottom: 8px;
}

.current-key-masked {
  font-family: var(--n-font-family-mono);
  color: var(--n-text-color-1);
  letter-spacing: 0.5px;
}

.current-key-copy {
  margin-left: auto;
}

.api-key-form {
  padding: 8px 20px 20px;
}

.api-key-form :deep(.n-form-item) {
  margin-bottom: 12px;
}

.api-key-form :deep(.n-form-item .n-form-item-label) {
  font-size: 13px;
  color: var(--n-text-color-2);
}

.form-actions {
  margin-top: 4px;
}

.banned-actions {
  padding: 16px 20px 20px;
}

.action-btn {
  width: 100%;
  border-radius: 8px;
  font-weight: 500;
}
</style>
