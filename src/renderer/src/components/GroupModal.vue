<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { NModal, NForm, NFormItem, NInput } from 'naive-ui'
import type { DictItem } from '../api/dict'

interface Props {
  show: boolean
  groups: DictItem[]
  currentGroupName?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:show': [value: boolean]
  confirm: [groupName: string]
}>()

const groupInputValue = ref('')
const showGroupDropdown = ref(false)

watch(() => props.show, (newVal) => {
  if (newVal) {
    groupInputValue.value = props.currentGroupName || ''
    showGroupDropdown.value = false
  }
})

const groupInputOptions = computed(() => {
  const inputValue = groupInputValue.value.toLowerCase()
  if (!inputValue) {
    return props.groups.map(group => ({
      label: group.name,
      value: group.name,
      id: group.id
    }))
  }
  return props.groups
    .filter(group => group.name.toLowerCase().includes(inputValue))
    .map(group => ({
      label: group.name,
      value: group.name,
      id: group.id
    }))
})

const handleGroupInputBlur = (): void => {
  setTimeout(() => {
    showGroupDropdown.value = false
  }, 200)
}

const handleConfirm = () => {
  emit('confirm', groupInputValue.value.trim())
  return true
}
</script>

<template>
  <n-modal
    :show="props.show"
    preset="dialog"
    title="分组视频"
    positive-text="确定"
    negative-text="取消"
    @update:show="emit('update:show', $event)"
    @positive-click="handleConfirm"
  >
    <n-form>
      <n-form-item label="分组名称">
        <div style="position: relative;">
          <n-input
            v-model:value="groupInputValue"
            placeholder="选择已有分组或输入新分组名称"
            clearable
            @focus="showGroupDropdown = true"
            @blur="handleGroupInputBlur"
            @input="showGroupDropdown = true"
          />
          <div
            v-if="showGroupDropdown && groupInputOptions.length > 0"
            class="group-dropdown"
          >
            <div
              v-for="option in groupInputOptions"
              :key="option.id"
              class="group-dropdown-item"
              @mousedown.prevent="() => {
                groupInputValue = option.value
                showGroupDropdown = false
              }"
            >
              {{ option.label }}
            </div>
          </div>
        </div>
      </n-form-item>
    </n-form>
  </n-modal>
</template>

<style scoped>
.group-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: #2d2d2d;
  border: 1px solid #444;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  max-height: 200px;
  overflow-y: auto;
  z-index: 1000;
  margin-top: 4px;
}

.group-dropdown-item {
  padding: 8px 12px;
  cursor: pointer;
  color: #e0e0e0;
  font-size: 14px;
  transition: background-color 0.2s;
}

.group-dropdown-item:hover {
  background: rgba(99, 226, 183, 0.15);
  color: #63e2b7;
}
</style>

