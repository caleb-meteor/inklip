<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { NInput, NButton, NIcon } from 'naive-ui'
import { Send, Expand, Contract, StopCircleOutline } from '@vicons/ionicons5'

const props = defineProps({
  disabled: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['send'])

const text = ref('')
const inputRef = ref<any>(null)
const isExpanded = ref(false)
const isFocused = ref(false)

const placeholderText = computed(() => {
  return props.disabled
    ? 'AI 正在处理当前任务，您可以开启新对话同时进行其他操作'
    : '描述你想剪辑的内容...'
})

const toggleExpand = (): void => {
  isExpanded.value = !isExpanded.value
}

const handleFocus = () => {
  isFocused.value = true
}

const handleBlur = () => {
  isFocused.value = false
}

const handleSend = (): void => {
  if (props.disabled) return
  if (text.value.trim()) {
    emit('send', text.value)
    text.value = ''
  }
}

const handleKeyDown = (e: KeyboardEvent): void => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

// Focus the input on mount
onMounted(() => {
  setTimeout(() => {
    inputRef.value?.focus()
  }, 300)
})
</script>

<template>
  <div class="chat-input-container">
    <div :class="['input-wrapper', { 'is-expanded': isExpanded, 'is-focused': isFocused }]">
      <div class="input-inner">
        <n-input
          ref="inputRef"
          v-model:value="text"
          type="textarea"
          :placeholder="placeholderText"
          :autosize="isExpanded ? { minRows: 10, maxRows: 20 } : { minRows: 1, maxRows: 8 }"
          :disabled="disabled"
          class="custom-input"
          @keydown="handleKeyDown"
          @focus="handleFocus"
          @blur="handleBlur"
        />

        <div class="right-actions">
          <n-button
            v-if="text.length > 50 || isExpanded"
            quaternary
            circle
            class="action-btn expand-btn"
            @click="toggleExpand"
          >
            <template #icon>
              <n-icon size="18">
                <Expand v-if="!isExpanded" />
                <Contract v-else />
              </n-icon>
            </template>
          </n-button>

          <n-button
            v-if="!disabled"
            type="primary"
            circle
            class="send-btn"
            :disabled="!text.trim()"
            @click="handleSend"
          >
            <template #icon>
              <n-icon size="18"><Send /></n-icon>
            </template>
          </n-button>

          <div v-else class="loading-container">
            <div class="pulse-ring"></div>
            <n-button circle secondary class="stop-btn" disabled>
              <template #icon>
                <n-icon size="20"><StopCircleOutline /></n-icon>
              </template>
            </n-button>
          </div>
        </div>
      </div>

      <div v-if="!disabled" class="input-hint">
        <span><b>Enter</b> 发送</span>
        <span class="hint-divider"></span>
        <span><b>Shift + Enter</b> 换行</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-input-container {
  width: 100%;
  position: relative;
  display: flex;
  justify-content: center;
  padding: 0 0;
}

.input-wrapper {
  width: 100%;
  background: rgba(32, 32, 35, 0.7);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 24px;
  padding: 8px 12px;
  transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.input-wrapper.is-focused {
  background: rgba(39, 39, 42, 0.85);
  border-color: rgba(79, 172, 254, 0.5);
  box-shadow:
    0 12px 48px rgba(0, 0, 0, 0.5),
    0 0 0 1px rgba(79, 172, 254, 0.2);
  transform: translateY(-2px);
}

.input-wrapper.is-expanded {
  border-radius: 20px;
}

.input-inner {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  min-height: 48px;
}

.action-btn {
  color: #a1a1aa;
  margin-bottom: 4px;
  transition: all 0.2s ease;
}

.action-btn:hover {
  color: #4facfe;
  background: rgba(79, 172, 254, 0.15);
}

.custom-input {
  flex: 1;
}

.custom-input :deep(.n-input) {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  font-size: 15px;
  padding: 0 !important;
  line-height: 1.6;
}

.custom-input :deep(.n-input__textarea-el) {
  color: #f4f4f5;
  caret-color: #4facfe;
  padding: 12px 4px !important;
}

.custom-input :deep(.n-input__placeholder) {
  color: #71717a;
  padding: 12px 4px !important;
}

.right-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  padding-bottom: 6px;
}

.send-btn {
  width: 36px;
  height: 36px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%) !important;
  border: none !important;
  box-shadow: 0 4px 12px rgba(79, 172, 254, 0.4);
}

.send-btn:hover:not(:disabled) {
  transform: scale(1.08) rotate(-5deg);
  box-shadow: 0 6px 16px rgba(79, 172, 254, 0.5);
}

.send-btn:disabled {
  background: rgba(255, 255, 255, 0.05) !important;
  color: #3f3f46;
  box-shadow: none;
}

.loading-container {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
}

.stop-btn {
  width: 36px;
  height: 36px;
  background: rgba(255, 255, 255, 0.05) !important;
  border: none !important;
  color: #71717a;
}

.pulse-ring {
  position: absolute;
  width: 100%;
  height: 100%;
  border: 2px solid #4facfe;
  border-radius: 50%;
  animation: pulse 2s cubic-bezier(0.24, 0, 0.38, 1) infinite;
}

@keyframes pulse {
  0% {
    transform: scale(0.8);
    opacity: 0.8;
  }
  100% {
    transform: scale(1.5);
    opacity: 0;
  }
}

.input-hint {
  display: flex;
  justify-content: flex-end;
  padding: 4px 12px 0;
  font-size: 11px;
  color: #52525b;
  opacity: 0.7;
}

.hint-divider {
  width: 1px;
  height: 10px;
  background: rgba(255, 255, 255, 0.1);
  margin: 4px 8px 0;
}

.input-hint b {
  color: #71717a;
  font-weight: 600;
}
</style>
