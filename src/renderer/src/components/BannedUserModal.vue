<script setup lang="ts">
import { NModal, NButton, NInput, NSpace, useMessage } from 'naive-ui'
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useRealtimeStore } from '../stores/realtime'
import { registerDeviceOnCloud, setApiKey } from '../api/config'
import ContactSupportBlock from './ContactSupportBlock.vue'

const route = useRoute()
const rtStore = useRealtimeStore()
const message = useMessage()

const manualApiKey = ref('')
const savingKey = ref(false)
const registering = ref(false)

/** 等待用量同步，或 API Key 不可用；主界面 /home 与 /quick-clip */
const isHomeRoute = computed(
  () => route.path === '/home' || route.path === '/quick-clip' || route.path === '/douyin'
)
const show = computed(
  () => isHomeRoute.value && (rtStore.isAwaitingCloudActivation || rtStore.isUserBanned)
)

const modalKind = computed<'banned' | 'activation' | 'pending'>(() => {
  if (rtStore.isUserBanned) return 'banned'
  if (!rtStore.hasApiKey) return 'activation'
  return 'pending'
})

const onRetrySync = (): void => {
  window.dispatchEvent(new CustomEvent('cloudActivationSynced', { detail: { activated: false } }))
  void rtStore.refreshBackendActivation()
  rtStore.reauthenticate()
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
  message.success('API Key 已保存')
  await rtStore.refreshBackendActivation()
  rtStore.reauthenticate()
}

const onRegisterThisDevice = async (): Promise<void> => {
  registering.value = true
  await registerDeviceOnCloud().finally(() => {
    registering.value = false
  })
  message.success('已使用本机注册云端账号')
  await rtStore.refreshBackendActivation()
  rtStore.reauthenticate()
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
    :style="{
      width: modalKind === 'pending' ? '360px' : '400px',
      borderRadius: '12px'
    }"
    class="banned-user-modal"
    :class="{
      'banned-user-modal--pending': modalKind === 'pending',
      'banned-user-modal--activation': modalKind === 'activation',
      'banned-user-modal--banned': modalKind === 'banned'
    }"
  >
    <template #header>
      <div class="banned-header">
        <div
          class="header-icon"
          :class="{
            'header-icon--pending': modalKind === 'pending',
            'header-icon--activation': modalKind === 'activation'
          }"
        >
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
            <path d="M4 14.9A7 7 0 0 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.24" />
            <path d="M12 12v9" />
            <path d="m16 16-4-4-4 4" />
          </svg>
          <svg
            v-else-if="modalKind === 'activation'"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="header-icon-svg"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
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
            modalKind === 'banned'
              ? 'API Key 不可用'
              : modalKind === 'activation'
                ? '需要激活'
                : '正在同步会员信息'
          }}
        </h2>
      </div>
    </template>

    <p class="banned-desc">
      {{
        modalKind === 'banned'
          ? '当前 API Key 无法继续使用，如有疑问请联系客服。'
          : modalKind === 'activation'
            ? '请输入已有 API Key，或使用本机注册获取免费试用'
            : '正在从云端同步用量与会员状态。若长时间停留在此，可重试连接。'
      }}
    </p>

    <ContactSupportBlock />

    <template v-if="modalKind === 'activation' || modalKind === 'banned'" #footer>
      <n-space vertical :size="12" style="width: 100%">
        <n-input
          v-model:value="manualApiKey"
          type="password"
          show-password-on="click"
          placeholder="粘贴或输入 API Key"
          :disabled="savingKey || registering"
          @keyup.enter="onSaveManualKey"
        />
        <n-button
          type="primary"
          block
          class="action-btn"
          :loading="savingKey"
          :disabled="registering"
          @click="onSaveManualKey"
        >
          确认
        </n-button>
        <n-button
          v-if="modalKind === 'activation'"
          secondary
          block
          class="action-btn"
          :loading="registering"
          :disabled="savingKey"
          @click="onRegisterThisDevice"
        >
          本机注册
        </n-button>
      </n-space>
    </template>

    <template v-else-if="modalKind === 'pending'" #footer>
      <div class="banned-actions">
        <n-button type="primary" class="action-btn" @click="onRetrySync">重试连接</n-button>
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

.header-icon--activation {
  color: #a78bfa;
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

.banned-user-modal--activation :deep(.n-card-header) {
  background: linear-gradient(180deg, rgba(167, 139, 250, 0.12) 0%, transparent 100%);
}

.banned-user-modal--banned :deep(.n-card-header) {
  background: linear-gradient(180deg, rgba(239, 68, 68, 0.1) 0%, transparent 100%);
}

:deep(.n-card__footer) {
  padding-top: 0;
}
</style>
