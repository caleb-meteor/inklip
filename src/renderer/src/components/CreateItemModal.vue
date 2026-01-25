<script setup lang="ts">
import { ref, watch } from 'vue'
import { NModal, NForm, NFormItem, NInput } from 'naive-ui'

interface Props {
  show: boolean
  title: string
  label: string
  placeholder?: string
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '请输入名称'
})

const emit = defineEmits<{
  'update:show': [value: boolean]
  confirm: [name: string]
}>()

const inputValue = ref('')

watch(
  () => props.show,
  (newVal) => {
    if (newVal) {
      inputValue.value = ''
    }
  }
)

const handleConfirm = (): boolean => {
  if (!inputValue.value.trim()) {
    return false
  }
  emit('confirm', inputValue.value.trim())
  return true
}
</script>

<template>
  <n-modal
    :show="props.show"
    preset="dialog"
    :title="props.title"
    positive-text="确定"
    negative-text="取消"
    @update:show="emit('update:show', $event)"
    @positive-click="handleConfirm"
  >
    <n-form>
      <n-form-item :label="props.label">
        <n-input
          v-model:value="inputValue"
          :placeholder="props.placeholder"
          @keyup.enter="handleConfirm"
        />
      </n-form-item>
    </n-form>
  </n-modal>
</template>
