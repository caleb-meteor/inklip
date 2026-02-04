<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { NModal, NInput, NButton, NIcon } from 'naive-ui'
import { PencilOutline, CloseOutline } from '@vicons/ionicons5'

interface Props {
  show: boolean
  videoName: string
  loading?: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:show': [value: boolean]
  confirm: [name: string]
}>()

const renameVideoName = ref('')

const extension = computed(() => {
  const lastDotIndex = props.videoName.lastIndexOf('.')
  return lastDotIndex !== -1 ? props.videoName.substring(lastDotIndex) : ''
})

watch(
  () => props.show,
  (newVal) => {
    if (newVal) {
      const lastDotIndex = props.videoName.lastIndexOf('.')
      renameVideoName.value =
        lastDotIndex === -1 ? props.videoName : props.videoName.substring(0, lastDotIndex)
    }
  }
)

const handleClose = () => {
  emit('update:show', false)
}

const handleConfirm = () => {
  if (!renameVideoName.value.trim()) return
  emit('confirm', renameVideoName.value.trim())
}
</script>

<template>
  <n-modal
    :show="props.show"
    preset="card"
    :style="{ width: '420px', borderRadius: '12px' }"
    :bordered="false"
    size="small"
    class="custom-rename-modal"
    :mask-closable="true"
    @update:show="emit('update:show', $event)"
  >
    <template #header>
      <div class="modal-header">
        <div class="icon-bg">
          <n-icon size="18" color="#f59e0b"><PencilOutline /></n-icon>
        </div>
        <span>重命名视频</span>
      </div>
    </template>
    
    <template #header-extra>
       <div class="close-btn" @click="handleClose">
         <n-icon size="20"><CloseOutline /></n-icon>
       </div>
    </template>

    <div class="modal-content">
      <div class="input-label">视频名称</div>
      <n-input
        v-model:value="renameVideoName"
        placeholder="请输入名称"
        @keyup.enter="handleConfirm"
        autofocus
        class="custom-input"
        size="large"
      >
        <template #suffix>
           <span class="extension-text">{{ extension }}</span>
        </template>
      </n-input>
      <div class="hint-text">
        <p>修改名称不影响原始文件内容，仅更新显示名称。</p>
      </div>
    </div>

    <template #footer>
      <div class="modal-footer">
        <n-button quaternary size="medium" @click="handleClose">取消</n-button>
        <n-button type="primary" size="medium" :loading="props.loading" @click="handleConfirm" color="#f59e0b">
          确认修改
        </n-button>
      </div>
    </template>
  </n-modal>
</template>

<style scoped>
.modal-header {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 16px;
  font-weight: 600;
}

.icon-bg {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: rgba(245, 158, 11, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn {
  cursor: pointer;
  color: #71717a;
  transition: all 0.2s;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #e4e4e7;
}

.modal-content {
  padding: 12px 0 20px;
}

.input-label {
  font-size: 13px;
  color: #a1a1aa;
  margin-bottom: 8px;
  font-weight: 500;
}

.custom-input {
  /* background-color: rgba(255, 255, 255, 0.03); */
}

.extension-text {
  color: #52525b;
  user-select: none;
  font-family: monospace;
  font-size: 13px;
  padding-left: 4px;
  background: rgba(255, 255, 255, 0.05);
  padding: 2px 6px;
  border-radius: 4px;
}

.hint-text {
  font-size: 12px;
  color: #52525b;
  margin-top: 12px;
  line-height: 1.5;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
