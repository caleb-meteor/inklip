<script setup lang="ts">
import { NModal, NButton } from 'naive-ui'
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useRealtimeStore } from '../stores/realtime'
import ApiKeyChangeBlock from './ApiKeyChangeBlock.vue'
import ContactSupportBlock from './ContactSupportBlock.vue'

const route = useRoute()
const rtStore = useRealtimeStore()

/** 优先级 1：待激活、封禁或 API Key 异常时只弹本窗，不弹到期/更新。主界面 /home 与 /quick-clip 均显示 */
const isHomeRoute = computed(() => route.path === '/home' || route.path === '/quick-clip')
const show = computed(
  () =>
    isHomeRoute.value &&
    (rtStore.isAwaitingCloudActivation || rtStore.isUserBanned || !!rtStore.apiKeyExceptionInfo)
)

/** 展示优先级：API Key 异常 > 已封禁 > 待激活（未拿到云端信息） */
const modalKind = computed<'api_key' | 'banned' | 'pending'>(() => {
  if (rtStore.apiKeyExceptionInfo) return 'api_key'
  if (rtStore.isUserBanned) return 'banned'
  return 'pending'
})

const apiKeyExceptionTitle = computed(() => {
  const code = rtStore.apiKeyExceptionInfo?.code
  if (code === 'api_key_device_limit') {
    return 'API Key 绑定设备数已达上限'
  }
  return 'API Key 校验未通过'
})

const showApiKeyForm = ref(false)

const onShowForm = (): void => {
  showApiKeyForm.value = true
}

const onApiKeyCancel = (): void => {
  showApiKeyForm.value = false
}

const onApiKeySuccess = (): void => {
  rtStore.clearApiKeyException()
  window.dispatchEvent(new CustomEvent('apiKeyChanged', { detail: { hasApiKey: true } }))
  rtStore.reauthenticate()
  showApiKeyForm.value = false
}
</script>

<template>
  <n-modal
    :show="show"
    preset="card"
    :mask-closable="false"
    :close-on-esc="false"
    :closable="false"
    :bordered="false"
    :style="{ width: '360px', borderRadius: '12px' }"
    class="banned-user-modal"
    :class="{ 'banned-user-modal--pending': modalKind === 'pending' }"
  >
    <template #header>
      <div class="banned-header">
        <div
          class="header-icon"
          :class="{ 'header-icon--pending': modalKind === 'pending' }"
        >
          <!-- 待激活：云端同步 / 连接中 -->
          <svg
            v-if="modalKind === 'pending'"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="header-icon-svg"
          >
            <!-- 云端同步 / 上传激活（云 + 向上箭头） -->
            <path d="M4 14.9A7 7 0 0 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.24" />
            <path d="M12 12v9" />
            <path d="m16 16-4-4-4 4" />
          </svg>
          <!-- 封禁 / API Key 异常 -->
          <svg
            v-else
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="header-icon-svg"
          >
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
          </svg>
        </div>
        <h2 class="header-title">
          {{
            modalKind === 'api_key'
              ? apiKeyExceptionTitle
              : modalKind === 'banned'
                ? '账号已被封禁'
                : '待激活'
          }}
        </h2>
      </div>
    </template>

    <p class="banned-desc">
      {{
        modalKind === 'api_key'
          ? rtStore.apiKeyExceptionInfo?.message ?? 'API Key 异常，请更换 API Key 后重试。'
          : modalKind === 'banned'
            ? '账号已被封禁，请更换 API Key 后重试。'
            : '正在连接云端以同步账户信息，请稍候。若长时间无响应，请检查网络或在设置中填写 API Key。'
      }}
    </p>

    <ApiKeyChangeBlock
      :show-form="showApiKeyForm"
      @cancel="onApiKeyCancel"
      @success="onApiKeySuccess"
    />

    <ContactSupportBlock />

    <template #footer>
      <div v-if="!showApiKeyForm" class="banned-actions">
        <n-button type="primary" class="action-btn" @click="onShowForm">
          更换 API Key
        </n-button>
      </div>
    </template>
  </n-modal>
</template>

<style scoped>
.banned-header {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
}

.header-icon {
  color: #f87171;
  display: flex;
  align-items: center;
  justify-content: center;
}

.header-icon-svg {
  width: 26px;
  height: 26px;
}

.header-icon--pending {
  color: #38bdf8;
}

.header-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--n-text-color-1);
  line-height: 1;
}

.banned-desc {
  margin: 0 0 8px;
  font-size: 14px;
  line-height: 1.5;
  color: var(--n-text-color-2);
}

.action-btn {
  width: 100%;
  border-radius: 8px;
  font-weight: 500;
}

:deep(.n-card-header) {
  padding-bottom: 12px;
  background: linear-gradient(180deg, rgba(239, 68, 68, 0.08) 0%, transparent 100%);
}

.banned-user-modal--pending :deep(.n-card-header) {
  background: linear-gradient(180deg, rgba(56, 189, 248, 0.12) 0%, transparent 100%);
}

:deep(.n-card__footer) {
  padding-top: 0;
}
</style>
