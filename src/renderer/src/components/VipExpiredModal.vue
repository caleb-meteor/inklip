<script setup lang="ts">
import { NModal, NButton, NInput, NSpace, NText, useMessage } from 'naive-ui'
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { getApiKey, setApiKey } from '../api/config'
import { useRealtimeStore } from '../stores/realtime'
import ContactSupportBlock from './ContactSupportBlock.vue'

/** 续费/会员页地址 */
const VIP_RENEW_URL = 'https://inklip.caleb.center'

const route = useRoute()
const rtStore = useRealtimeStore()
const message = useMessage()

const manualApiKey = ref('')
const savingKey = ref(false)
/** 弹窗打开时解析到的当前 Key，仅用于展示掩码与复制 */
const currentApiKey = ref('')
const loadingCurrentKey = ref(false)
/** 与设置页 API 配置一致：复制成功不弹 success，按钮短暂显示「已复制」 */
const copiedJustNow = ref(false)
let copyResetTimer: ReturnType<typeof setTimeout> | null = null

/** 与 Settings.vue maskedApiKey 规则一致：前 4 + ******** + 后 4 */
const maskedCurrentApiKey = computed(() => {
  const savedApiKey = currentApiKey.value.trim()
  if (!savedApiKey) return ''
  const first4 = savedApiKey.slice(0, 4)
  const last4 = savedApiKey.slice(-4)
  return first4 + '********' + last4
})

const hasCurrentApiKey = computed(() => !!currentApiKey.value.trim())

const copyFullApiKey = async (): Promise<void> => {
  const savedApiKey = currentApiKey.value.trim()
  if (!savedApiKey) {
    message.warning('当前没有已保存的 API Key')
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
    console.error('复制 API Key 失败:', err)
    message.error('复制失败，请稍后重试')
  }
}

const isHomeRoute = computed(() => route.path === '/home' || route.path === '/quick-clip')
const show = computed(
  () =>
    isHomeRoute.value &&
    rtStore.userInfoReceivedFromCloud &&
    !rtStore.isUserBanned &&
    rtStore.isMembershipExpired
)

watch(show, async (visible) => {
  if (!visible) {
    currentApiKey.value = ''
    copiedJustNow.value = false
    if (copyResetTimer) {
      clearTimeout(copyResetTimer)
      copyResetTimer = null
    }
    return
  }
  loadingCurrentKey.value = true
  const fromLs = localStorage.getItem('apiKey')
  if (fromLs) {
    currentApiKey.value = fromLs
    loadingCurrentKey.value = false
  } else {
    const res = await getApiKey()
      .catch(() => ({ api_key: localStorage.getItem('apiKey') ?? undefined }))
      .finally(() => {
        loadingCurrentKey.value = false
      })
    currentApiKey.value = (res.api_key ?? '').trim()
  }
})

const onRenew = (): void => {
  window.api.openExternal(VIP_RENEW_URL)
}

const onSaveManualKey = async (): Promise<void> => {
  const v = manualApiKey.value.trim()
  if (!v) {
    message.warning('请输入 API Key')
    return
  }
  savingKey.value = true
  await setApiKey(v).finally(() => {
    savingKey.value = false
  })
  manualApiKey.value = ''
  currentApiKey.value = v
  await rtStore.refreshBackendActivation()
  rtStore.reauthenticate()
}
</script>

<template>
  <n-modal
    :show="show"
    :mask-closable="false"
    :close-on-esc="false"
    :closable="false"
    class="vip-expired-modal"
  >
    <div class="vip-expired-card">
      <div class="vip-expired-header">
        <div class="header-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M12 6v6l4 2"></path>
          </svg>
        </div>
        <h2 class="header-title">会员已到期</h2>
      </div>

      <p class="vip-expired-desc">
        您的会员已到期，请续费后继续使用智能剪辑等会员功能。
      </p>

      <div class="vip-expired-actions">
        <n-button type="primary" class="action-btn action-primary" @click="onRenew">
          联系客服续费
        </n-button>
      </div>

      <ContactSupportBlock />

      <n-space vertical :size="10" class="vip-expired-key-block">
        <n-text depth="3" style="font-size: 12px">
          若已续费或需使用其他账号，可更换 API Key：
        </n-text>
        <div v-if="hasCurrentApiKey || loadingCurrentKey" class="api-key-display">
          <n-input
            :value="loadingCurrentKey ? '正在读取…' : maskedCurrentApiKey"
            readonly
            type="text"
            :disabled="loadingCurrentKey"
          >
            <template #suffix>
              <n-button
                text
                type="primary"
                class="settings-api-key-copy"
                :class="{ 'settings-api-key-copy--copied': copiedJustNow }"
                :disabled="copiedJustNow || loadingCurrentKey || !hasCurrentApiKey"
                title="复制完整 API Key"
                @click="copyFullApiKey"
              >
                {{ copiedJustNow ? '已复制' : '复制' }}
              </n-button>
            </template>
          </n-input>
        </div>
        <n-input
          v-model:value="manualApiKey"
          type="password"
          show-password-on="click"
          placeholder="粘贴或输入 API Key"
          :disabled="savingKey"
          @keyup.enter="onSaveManualKey"
        />
        <n-button block class="action-btn" :loading="savingKey" @click="onSaveManualKey">
          确认更换
        </n-button>
      </n-space>
    </div>
  </n-modal>
</template>

<style scoped>
.vip-expired-modal {
  width: 360px;
}

.vip-expired-card {
  display: flex;
  flex-direction: column;
  background: var(--n-color, #1e1e1e);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

.vip-expired-header {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  padding: 24px 20px 16px;
  gap: 8px;
  background: linear-gradient(180deg, rgba(245, 158, 11, 0.1) 0%, transparent 100%);
}

.header-icon {
  color: #f59e0b;
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

.vip-expired-desc {
  margin: 0 20px;
  padding: 0 0 12px;
  font-size: 14px;
  line-height: 1.5;
  color: var(--n-text-color-2);
}

.vip-expired-key-block {
  width: 100%;
  padding: 12px 20px 20px;
  box-sizing: border-box;
}

/* 与设置页「API 配置」只读 Key + 后缀复制一致 */
.api-key-display {
  width: 100%;
}

/* 与 Settings.vue / ApiKeyChangeBlock「复制」一致 */
.settings-api-key-copy--copied {
  color: var(--n-success-color, #18a058) !important;
  cursor: default;
}

.vip-expired-actions {
  display: flex;
  gap: 12px;
  padding: 0 20px 12px;
}

.action-btn {
  flex: 1;
  border-radius: 8px;
  font-weight: 500;
}

.action-primary {
  flex: 1;
}
</style>
