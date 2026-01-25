<script setup lang="ts">
import { NModal, NButton, NSpace, NIcon } from 'naive-ui'
import { CloudUploadOutline, FolderOutline } from '@vicons/ionicons5'

interface Props {
  show?: boolean
  uploading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  show: false,
  uploading: false
})

const emit = defineEmits<{
  'update:show': [value: boolean]
  'select-file': []
  'select-folder': []
}>()

const handleSelectFile = (): void => {
  emit('select-file')
  emit('update:show', false)
}

const handleSelectFolder = (): void => {
  emit('select-folder')
  emit('update:show', false)
}

const handleClose = (): void => {
  if (!props.uploading) {
    emit('update:show', false)
  }
}
</script>

<template>
  <n-modal
    :show="props.show"
    :mask-closable="!props.uploading"
    :closable="!props.uploading"
    preset="card"
    title="选择导入方式"
    style="width: 500px"
    @update:show="(val) => emit('update:show', val)"
    @close="handleClose"
  >
    <div class="upload-select-content">
      <div class="upload-select-hint">请选择导入方式：</div>
      <n-space vertical :size="16">
        <n-button
          :disabled="props.uploading"
          :loading="props.uploading"
          block
          size="large"
          type="primary"
          @click="handleSelectFile"
        >
          <template #icon>
            <n-icon><CloudUploadOutline /></n-icon>
          </template>
          导入视频文件
        </n-button>
        <div class="folder-upload-section">
          <n-button
            :disabled="props.uploading"
            :loading="props.uploading"
            block
            size="large"
            type="info"
            @click="handleSelectFolder"
          >
            <template #icon>
              <n-icon><FolderOutline /></n-icon>
            </template>
            导入文件夹
          </n-button>
          <div class="folder-upload-hint">
            如果文件夹中存在与视频同名的字幕文件，将自动匹配并使用，跳过自动解析
          </div>
        </div>
      </n-space>
      <div v-if="props.uploading" class="uploading-hint">正在上传中，请稍候...</div>
    </div>
  </n-modal>
</template>

<style scoped>
.upload-select-content {
  padding: 8px 0;
}

.upload-select-hint {
  margin-bottom: 20px;
  color: #999;
  font-size: 14px;
}

.uploading-hint {
  margin-top: 16px;
  text-align: center;
  color: #63e2b7;
  font-size: 13px;
}

.folder-upload-section {
  width: 100%;
}

.folder-upload-hint {
  margin-top: 8px;
  padding: 8px 12px;
  background: rgba(99, 226, 183, 0.1);
  border: 1px solid rgba(99, 226, 183, 0.2);
  border-radius: 4px;
  color: #63e2b7;
  font-size: 12px;
  line-height: 1.5;
}
</style>
