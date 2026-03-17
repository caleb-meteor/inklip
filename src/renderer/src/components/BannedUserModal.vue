<script setup lang="ts">
import { NModal, NButton } from 'naive-ui'
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useRealtimeStore } from '../stores/realtime'
import ApiKeyChangeBlock from './ApiKeyChangeBlock.vue'
import ContactSupportBlock from './ContactSupportBlock.vue'

const route = useRoute()
const rtStore = useRealtimeStore()

/** 优先级 1：有封禁或异常时只弹本窗，不弹到期/更新 */
const show = computed(
  () => route.path === '/home' && (rtStore.isUserBanned || !!rtStore.apiKeyExceptionInfo)
)

/** 封禁优先于异常：两者同时存在时展示封禁 */
const isBanned = computed(() => rtStore.isUserBanned)

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
  >
    <template #header>
      <div class="banned-header">
        <div class="header-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
          </svg>
        </div>
        <h2 class="header-title">
          {{ isBanned ? '账号已被封禁' : 'API Key 异常' }}
        </h2>
      </div>
    </template>

    <p class="banned-desc">
      {{ isBanned ? '账号已被封禁，请更换 API Key 后重试。' : (rtStore.apiKeyExceptionInfo?.message ?? 'API Key 异常，请更换 API Key 后重试。') }}
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

:deep(.n-card__footer) {
  padding-top: 0;
}
</style>
