<script setup lang="ts">
import { NModal, NButton } from 'naive-ui'
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useRealtimeStore } from '../stores/realtime'

/** 新版本下载/官网地址，点击「立即更新」时打开 */
const VERSION_DOWNLOAD_URL = 'https://inklip.caleb.center'

const route = useRoute()
const rtStore = useRealtimeStore()

/** 优先级 4：无授权码不可用、未到期时才可能弹本窗。主界面 /home 与 /quick-clip */
const isHomeRoute = computed(() => route.path === '/home' || route.path === '/quick-clip')
const show = computed(
  () =>
    rtStore.versionUpdateInfo != null &&
    isHomeRoute.value &&
    !rtStore.isUserBanned &&
    !rtStore.isMembershipExpired &&
    (rtStore.userInfoReceivedFromCloud || rtStore.versionUpdateInfo.force_update)
)

const versionUpdateInfo = computed(() => rtStore.versionUpdateInfo)
const isForceUpdate = computed(() => versionUpdateInfo.value?.force_update ?? false)

const onLater = (): void => {
  rtStore.clearVersionUpdate()
}

const onGo = (): void => {
  window.api.openExternal(VERSION_DOWNLOAD_URL)
}
</script>

<template>
  <n-modal
    :show="show"
    :mask-closable="!isForceUpdate"
    :close-on-esc="!isForceUpdate"
    :closable="!isForceUpdate"
    class="version-update-modal"
  >
    <div class="version-update-card">
      <div class="version-update-header">
        <div class="header-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
        </div>
        <h2 class="header-title">发现新版本</h2>
        <span v-if="versionUpdateInfo?.version" class="version-badge">{{ versionUpdateInfo.version }}</span>
      </div>

      <p class="version-update-desc">
        发现新版本，建议更新以获得更好体验。
      </p>

      <div v-if="versionUpdateInfo?.changelog" class="changelog-wrap">
        <div class="changelog-scroll">
          <pre class="changelog-text">{{ versionUpdateInfo.changelog }}</pre>
        </div>
      </div>

      <div v-if="isForceUpdate" class="force-update-tip">
        此版本包含重要更新，须更新后方可继续使用。
      </div>

      <div class="version-update-actions">
        <n-button v-if="!isForceUpdate" secondary class="action-btn" @click="onLater">
          稍后提醒
        </n-button>
        <n-button type="primary" class="action-btn action-primary" @click="onGo">
          立即更新
        </n-button>
      </div>
    </div>
  </n-modal>
</template>

<style scoped>
.version-update-modal {
  width: 360px;
}

.version-update-card {
  display: flex;
  flex-direction: column;
  background: var(--n-color, #1e1e1e);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

.version-update-header {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  padding: 24px 20px 16px;
  gap: 8px;
  background: linear-gradient(180deg, rgba(59, 130, 246, 0.1) 0%, transparent 100%);
}

.header-icon {
  color: #60a5fa;
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

.version-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  background: rgba(59, 130, 246, 0.15);
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  font-family: var(--n-font-family-mono);
  color: #60a5fa;
  line-height: 1;
  border: 1px solid rgba(59, 130, 246, 0.3);
}

.version-update-desc {
  margin: 0 20px;
  padding: 0 0 12px;
  font-size: 14px;
  line-height: 1.5;
  color: var(--n-text-color-2);
}

.changelog-wrap {
  padding: 0 20px 12px;
}

.changelog-scroll {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 6px;
  padding: 10px 12px;
  max-height: 160px;
  overflow-y: auto;
  border: 1px solid var(--n-border-color);
}

.changelog-scroll::-webkit-scrollbar {
  width: 4px;
}

.changelog-scroll::-webkit-scrollbar-thumb {
  background-color: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
}

.changelog-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--n-text-color-2);
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
}

.force-update-tip {
  margin: 0 20px 12px;
  padding: 10px;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.2);
  color: #fbbf24;
  border-radius: 6px;
  font-size: 12px;
  text-align: center;
}

.version-update-actions {
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
