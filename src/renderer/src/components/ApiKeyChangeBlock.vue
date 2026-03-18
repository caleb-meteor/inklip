<script setup lang="ts">
import { NButton, NInput, NFormItem, useMessage } from 'naive-ui'
import { computed, ref, nextTick, watch } from 'vue'
import { validateApiKey, setApiKey } from '../api/config'

const props = defineProps<{
  /** 是否显示「新 API Key」表单及取消/验证按钮 */
  showForm: boolean
}>()

const emit = defineEmits<{
  (e: 'cancel'): void
  (e: 'success'): void
}>()

const message = useMessage()
const newApiKey = ref('')
const saving = ref(false)
const apiKeyInputRef = ref<InstanceType<typeof NInput> | null>(null)

watch(
  () => props.showForm,
  (visible) => {
    if (visible) {
      newApiKey.value = ''
      nextTick(() => apiKeyInputRef.value?.focus())
    }
  }
)

const maskedCurrentApiKey = computed(() => {
  const saved = localStorage.getItem('apiKey')
  if (!saved || saved.length < 8) return ''
  return saved.slice(0, 4) + '********' + saved.slice(-4)
})

const hasCurrentApiKey = computed(() => !!localStorage.getItem('apiKey'))

const copiedJustNow = ref(false)
let copyResetTimer: ReturnType<typeof setTimeout> | null = null

const copyCurrentApiKey = async (): Promise<void> => {
  const saved = localStorage.getItem('apiKey')
  if (!saved) {
    message.warning('当前没有已保存的 API Key')
    return
  }
  try {
    await navigator.clipboard.writeText(saved)
    copiedJustNow.value = true
    if (copyResetTimer) clearTimeout(copyResetTimer)
    copyResetTimer = setTimeout(() => {
      copiedJustNow.value = false
      copyResetTimer = null
    }, 2000)
  } catch (err) {
    message.error('复制失败，请稍后重试')
  }
}

const onCancel = (): void => {
  emit('cancel')
}

const onValidate = async (): Promise<void> => {
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
    emit('success')
    newApiKey.value = ''
  } catch (err) {
    message.error(`操作失败: ${(err as Error).message}`)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="api-key-change-block">
    <div v-if="hasCurrentApiKey" class="current-key-row" :class="{ 'current-key-row--compact': showForm }">
      <span class="current-key-masked">{{ maskedCurrentApiKey }}</span>
      <n-button
        text
        type="primary"
        size="small"
        class="current-key-copy"
        :class="{ 'current-key-copy--copied': copiedJustNow }"
        :disabled="copiedJustNow"
        @click="copyCurrentApiKey"
      >
        {{ copiedJustNow ? '已复制' : '复制' }}
      </n-button>
    </div>

    <div v-if="showForm" class="api-key-form">
      <n-form-item label="新 API Key" :show-label="true">
        <n-input
          ref="apiKeyInputRef"
          v-model:value="newApiKey"
          type="password"
          placeholder="请输入新的 API Key"
          show-password-on="click"
          clearable
          :disabled="saving"
          @keydown.enter="onValidate"
        />
      </n-form-item>
      <div class="form-actions">
        <n-button secondary class="action-btn" :disabled="saving" @click="onCancel">
          取消
        </n-button>
        <n-button type="primary" class="action-btn action-validate" :loading="saving" @click="onValidate">
          验证
        </n-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.api-key-change-block {
  width: 100%;
}

.current-key-row {
  display: flex;
  align-items: center;
  margin: 0 0 12px;
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

.current-key-copy--copied {
  color: var(--n-success-color, #18a058) !important;
  cursor: default;
}

.api-key-form :deep(.n-form-item) {
  margin-bottom: 12px;
}

.api-key-form :deep(.n-form-item .n-form-item-label) {
  font-size: 13px;
  color: var(--n-text-color-2);
}

.form-actions {
  display: flex;
  gap: 12px;
}

.form-actions .action-btn {
  flex: 1;
  border-radius: 8px;
  font-weight: 500;
}

.form-actions .action-validate {
  flex: 1;
}
</style>
