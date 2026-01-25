<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { NInput, NButton, NIcon, NTooltip } from 'naive-ui'
import {
  SendOutline,
  AttachOutline,
  ExpandOutline,
  ContractOutline
} from '@vicons/ionicons5'

const emit = defineEmits(['send'])

const text = ref('')
const inputRef = ref<any>(null)
const isExpanded = ref(false)

const toggleExpand = (): void => {
  isExpanded.value = !isExpanded.value
}

const handleSend = (): void => {
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
    <div :class="['input-wrapper', { 'is-expanded': isExpanded }]">
      <n-input
        ref="inputRef"
        v-model:value="text"
        type="textarea"
        placeholder="有什么我可以帮您的？"
        :autosize="isExpanded ? { minRows: 8, maxRows: 20 } : { minRows: 1, maxRows: 10 }"
        class="custom-input"
        @keydown="handleKeyDown"
      />
      
      <div class="actions">
        <div class="left-actions">
          <n-tooltip trigger="hover">
            <template #trigger>
              <n-button quaternary circle size="medium">
                <template #icon>
                  <n-icon><AttachOutline /></n-icon>
                </template>
              </n-button>
            </template>
            上传文件
          </n-tooltip>

          <n-tooltip trigger="hover">
            <template #trigger>
              <n-button quaternary circle size="medium" @click="toggleExpand">
                <template #icon>
                  <n-icon>
                    <ExpandOutline v-if="!isExpanded" />
                    <ContractOutline v-else />
                  </n-icon>
                </template>
              </n-button>
            </template>
            {{ isExpanded ? '收起' : '放大' }}
          </n-tooltip>
        </div>

        <div class="right-actions">
          <n-button 
            type="primary" 
            circle 
            size="medium" 
            :disabled="!text.trim()"
            @click="handleSend"
          >
            <template #icon>
              <n-icon><SendOutline /></n-icon>
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
  margin: 0 auto;
  position: relative;
}

.input-wrapper {
  background: #262626;
  border: 1px solid #333;
  border-radius: 20px;
  padding: 12px 16px;
  transition: all 0.4s cubic-bezier(0.165, 0.84, 0.44, 1);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
}

.input-wrapper.is-expanded {
  min-height: 300px;
  border-radius: 12px;
  max-width: 900px;
  margin-left: -50px;
  margin-right: -50px;
}

.input-wrapper:focus-within {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2), 0 8px 30px rgba(0, 0, 0, 0.3);
  background: #2d2d2d;
}

.custom-input :deep(.n-input) {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  font-size: 16px;
  padding: 0 !important;
}

.custom-input :deep(.n-input__textarea-el) {
  color: #efeff5;
  caret-color: #3b82f6;
}

.custom-input :deep(.n-input__placeholder) {
  color: #666;
}

.actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px solid #333;
}

.left-actions {
  display: flex;
  gap: 8px;
}

.right-actions {
  display: flex;
  align-items: center;
}

/* Glassmorphism effect for the input area */
.input-wrapper {
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}
</style>
