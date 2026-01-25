<script setup lang="ts">
import { ref, watch } from 'vue'
import { NModal, NForm, NFormItem, NInput } from 'naive-ui'

interface Props {
  show: boolean
  videoName: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:show': [value: boolean]
  confirm: [name: string]
}>()

const renameVideoName = ref('')

watch(
  () => props.show,
  (newVal) => {
    if (newVal) {
      // 获取文件名（不含扩展名）
      const lastDotIndex = props.videoName.lastIndexOf('.')
      renameVideoName.value =
        lastDotIndex === -1 ? props.videoName : props.videoName.substring(0, lastDotIndex)
    }
  }
)

const handleConfirm = (): boolean => {
  if (!renameVideoName.value.trim()) {
    return false
  }

  // 如果用户输入的名称不包含扩展名，自动添加原文件的扩展名
  let newName = renameVideoName.value.trim()
  const lastDotIndex = props.videoName.lastIndexOf('.')
  if (lastDotIndex !== -1) {
    const extension = props.videoName.substring(lastDotIndex)
    if (!newName.endsWith(extension)) {
      newName = newName + extension
    }
  }

  emit('confirm', newName)
  return true
}
</script>

<template>
  <n-modal
    :show="props.show"
    preset="dialog"
    title="重命名视频"
    positive-text="确定"
    negative-text="取消"
    @update:show="emit('update:show', $event)"
    @positive-click="handleConfirm"
  >
    <n-form>
      <n-form-item label="视频名称">
        <n-input
          v-model:value="renameVideoName"
          placeholder="请输入视频名称"
          @keyup.enter="handleConfirm"
        />
      </n-form-item>
    </n-form>
  </n-modal>
</template>
