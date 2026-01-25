<script setup lang="ts">
import { ref } from 'vue'
import { NIcon } from 'naive-ui'
import { CloudUploadOutline } from '@vicons/ionicons5'
import UploadSelectModal from './UploadSelectModal.vue'

interface Props {
  uploading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  uploading: false
})

const emit = defineEmits<{
  'select-file': []
  'select-folder': []
}>()

const showSelectModal = ref(false)

const handleClick = (): void => {
  if (!props.uploading) {
    showSelectModal.value = true
  }
}

const handleSelectFile = (): void => {
  emit('select-file')
}

const handleSelectFolder = (): void => {
  emit('select-folder')
}
</script>

<template>
  <div>
    <div class="file-item upload-card" :class="{ disabled: props.uploading }" @click="handleClick">
      <div class="icon-wrapper upload-icon-wrapper">
        <n-icon size="32" color="#63e2b7">
          <span v-if="props.uploading" style="font-size: 14px; position: absolute">...</span>
          <CloudUploadOutline v-else />
        </n-icon>
      </div>
      <div class="upload-hint-text">
        {{ props.uploading ? '上传中...' : '导入视频' }}
      </div>
      <div class="upload-hint-sub">
        {{ props.uploading ? '请稍候' : '拖入或点击上传' }}
      </div>
    </div>
    <UploadSelectModal
      v-model:show="showSelectModal"
      :uploading="props.uploading"
      @select-file="handleSelectFile"
      @select-folder="handleSelectFolder"
    />
  </div>
</template>

<style scoped>
.file-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  padding: 10px;
  border-radius: 6px;
  border: 1px solid transparent;
  width: 100%;
  max-width: 225px;
}

.upload-card {
  border: 1px dashed #444;
  background: rgba(255, 255, 255, 0.02);
  transition: all 0.3s ease;
  justify-content: center;
}

.upload-card:hover {
  border-color: #63e2b7;
  background: rgba(99, 226, 183, 0.05);
}

.upload-card.disabled {
  opacity: 0.5;
  cursor: not-allowed;
  border-color: #444;
  background: rgba(255, 255, 255, 0.02);
}

.icon-wrapper {
  margin-bottom: 4px;
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 80px;
}

.upload-icon-wrapper {
  aspect-ratio: 9/16;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  margin-bottom: 8px;
}

.upload-hint-text {
  font-size: 14px;
  font-weight: 500;
  color: #e0e0e0;
}

.upload-hint-sub {
  font-size: 11px;
  color: #666;
  margin-top: 2px;
}
</style>
