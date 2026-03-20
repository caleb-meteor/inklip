<script setup lang="ts">
import { NModal, NButton } from 'naive-ui'
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useRealtimeStore } from '../stores/realtime'
import ApiKeyChangeBlock from './ApiKeyChangeBlock.vue'
import ContactSupportBlock from './ContactSupportBlock.vue'

/** 续费/会员页地址 */
const VIP_RENEW_URL = 'https://inklip.caleb.center'

const route = useRoute()
const rtStore = useRealtimeStore()

/** 优先级 3：无封禁、无异常时才可能弹本窗；有封禁或异常时不弹。主界面 /home 与 /quick-clip 均显示 */
const isHomeRoute = computed(() => route.path === '/home' || route.path === '/quick-clip')
const show = computed(
  () =>
    isHomeRoute.value &&
    rtStore.userInfoReceivedFromCloud &&
    !rtStore.isUserBanned &&
    !rtStore.apiKeyExceptionInfo &&
    rtStore.isMembershipExpired
)

const showApiKeyForm = ref(false)

const onShowForm = (): void => {
  showApiKeyForm.value = true
}

const onApiKeyCancel = (): void => {
  showApiKeyForm.value = false
}

const onApiKeySuccess = (): void => {
  window.dispatchEvent(new CustomEvent('apiKeyChanged', { detail: { hasApiKey: true } }))
  rtStore.reauthenticate()
  showApiKeyForm.value = false
}

const onRenew = (): void => {
  window.api.openExternal(VIP_RENEW_URL)
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
        您的会员已到期，请续费或更换 API Key 后继续使用智能剪辑等会员功能。
      </p>

      <div class="vip-expired-body">
        <ApiKeyChangeBlock
          :show-form="showApiKeyForm"
          @cancel="onApiKeyCancel"
          @success="onApiKeySuccess"
        />
      </div>

      <div v-if="!showApiKeyForm" class="vip-expired-actions">
        <n-button secondary class="action-btn" @click="onShowForm">
          更换 API Key
        </n-button>
        <n-button type="primary" class="action-btn action-primary" @click="onRenew">
          联系客服续费
        </n-button>
      </div>

      <ContactSupportBlock />
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

.vip-expired-body {
  padding: 0 20px;
  margin-bottom: 12px;
}

.vip-expired-body:has(.api-key-form) {
  margin-bottom: 0;
  padding-bottom: 20px;
}

.vip-expired-actions {
  display: flex;
  gap: 12px;
  padding: 0 20px 20px;
}

.action-btn {
  flex: 1;
  border-radius: 8px;
  font-weight: 500;
}

.action-primary {
  flex: 1.2;
}
</style>
