<script setup lang="ts">
import { NModal } from 'naive-ui'

interface Props {
  show: boolean
  videoName: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:show': [value: boolean]
  confirm: []
}>()
</script>

<template>
  <n-modal
    :show="props.show"
    preset="dialog"
    title="删除视频"
    positive-text="删除"
    negative-text="取消"
    type="warning"
    @update:show="emit('update:show', $event)"
    @positive-click="emit('confirm')"
  >
    <div style="padding: 16px 0">
      <p>
        确定要删除视频 <strong>{{ props.videoName }}</strong> 吗？
      </p>
      <p style="color: #888; font-size: 12px; margin-top: 8px">
        此操作不可恢复，将同时删除视频文件及相关资源。
      </p>
    </div>
  </n-modal>
</template>
