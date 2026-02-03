<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { NInput, NButton, NIcon } from 'naive-ui'
import {
  Send,
  Attach,
  Expand,
  Contract
} from '@vicons/ionicons5'

const props = defineProps({
  disabled: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['send', 'open-upload-modal'])

const text = ref('')
const inputRef = ref<any>(null)
const isExpanded = ref(false)

const placeholderText = computed(() => {
  return props.disabled ? 'AI 正在处理任务...' : '描述你想剪辑的内容...'
})

const toggleExpand = (): void => {
  isExpanded.value = !isExpanded.value
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
    <div :class="['input-wrapper', { 'is-expanded': isExpanded, 'is-focused': inputRef?.focused }]">
      <div class="input-inner">
        <n-button 
          quaternary 
          circle 
          class="action-btn attach-btn"
          @click="emit('open-upload-modal')"
        >
          <template #icon>
            <n-icon size="20"><Attach /></n-icon>
          </template>
        </n-button>
        
        <n-input
          ref="inputRef"
          v-model:value="text"
          type="textarea"
          :placeholder="placeholderText"
          :autosize="isExpanded ? { minRows: 10, maxRows: 20 } : { minRows: 1, maxRows: 8 }"
          :disabled="disabled"
          class="custom-input"
          @keydown="handleKeyDown"
        />

        <div class="right-actions">
           <n-button 
            v-if="text.length > 50"
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
            type="primary" 
            circle 
            class="send-btn"
            :disabled="disabled || !text.trim()"
            @click="handleSend"
          >
            <template #icon>
              <n-icon size="18"><Send /></n-icon>
            </template>
          </n-button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-input-container {
  width: 100%;
  max-width: 800px;
  position: relative;
  display: flex;
  justify-content: center;
}

.input-wrapper {
  width: 100%;
  background: rgba(30, 30, 32, 0.6);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 28px;
  padding: 10px 14px;
  transition: all 0.4s cubic-bezier(0.25, 1, 0.5, 1);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
}

.input-wrapper.is-focused,
.input-wrapper:focus-within {
  background: rgba(39, 39, 42, 0.8);
  border-color: rgba(79, 172, 254, 0.4);
  box-shadow: 0 15px 40px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(79, 172, 254, 0.3);
  transform: translateY(-2px);
}

.input-wrapper.is-expanded {
  border-radius: 20px;
}

.input-inner {
  display: flex;
  gap: 12px;
  align-items: flex-end;
  min-height: 44px;
}

.action-btn {
  color: #71717a;
  margin-bottom: 4px;
  transition: all 0.2s ease;
}

.action-btn:hover {
  color: #4facfe;
  background: rgba(79, 172, 254, 0.1);
}

.custom-input {
  flex: 1;
  padding-bottom: 8px;
}

.custom-input :deep(.n-input) {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  font-size: 16px;
  padding: 0 !important;
  line-height: 1.6;
}

.custom-input :deep(.n-input__textarea-el) {
  color: #ececed;
  caret-color: #00f2fe;
  padding-top: 12px;
}

.custom-input :deep(.n-input__placeholder) {
  color: #52525b;
}

.right-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  padding-bottom: 4px;
}

.send-btn {
  width: 38px;
  height: 38px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border: none !important;
}

.send-btn:not(:disabled) {
  background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
  color: #000;
  box-shadow: 0 4px 12px rgba(79, 172, 254, 0.4);
}

.send-btn:not(:disabled):hover {
  transform: scale(1.1) rotate(-5deg);
  box-shadow: 0 6px 20px rgba(0, 242, 254, 0.6);
  filter: brightness(1.1);
}

.send-btn:disabled {
  background: #27272a;
  color: #52525b;
  opacity: 0.6;
}
</style>
