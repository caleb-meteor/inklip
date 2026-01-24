<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { NModal, NForm, NFormItem, NInput } from 'naive-ui'
import type { DictItem } from '../api/dict'

interface Props {
  show: boolean
  anchors: DictItem[]
  currentAnchorName?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:show': [value: boolean]
  confirm: [anchorName: string]
}>()

const anchorInputValue = ref('')
const showAnchorDropdown = ref(false)

watch(
  () => props.show,
  (newVal) => {
    if (newVal) {
      anchorInputValue.value = props.currentAnchorName || ''
      showAnchorDropdown.value = false
    }
  }
)

const anchorInputOptions = computed(() => {
  const inputValue = anchorInputValue.value.toLowerCase()
  if (!inputValue) {
    return props.anchors.map((anchor) => ({
      label: anchor.name,
      value: anchor.name,
      id: anchor.id
    }))
  }
  return props.anchors
    .filter((anchor) => anchor.name.toLowerCase().includes(inputValue))
    .map((anchor) => ({
      label: anchor.name,
      value: anchor.name,
      id: anchor.id
    }))
})

const handleAnchorInputBlur = (): void => {
  setTimeout(() => {
    showAnchorDropdown.value = false
  }, 200)
}

const handleConfirm = (): boolean => {
  emit('confirm', anchorInputValue.value.trim())
  return true
}
</script>

<template>
  <n-modal
    :show="props.show"
    preset="dialog"
    title="添加主播"
    positive-text="确定"
    negative-text="取消"
    @update:show="emit('update:show', $event)"
    @positive-click="handleConfirm"
  >
    <n-form>
      <n-form-item label="主播名称">
        <div style="position: relative">
          <n-input
            v-model:value="anchorInputValue"
            placeholder="选择已有主播或输入新主播名称"
            clearable
            @focus="showAnchorDropdown = true"
            @blur="handleAnchorInputBlur"
            @input="showAnchorDropdown = true"
          />
          <div v-if="showAnchorDropdown && anchorInputOptions.length > 0" class="anchor-dropdown">
            <div
              v-for="option in anchorInputOptions"
              :key="option.id"
              class="anchor-dropdown-item"
              @mousedown.prevent="
                () => {
                  anchorInputValue = option.value
                  showAnchorDropdown = false
                }
              "
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
.anchor-dropdown {
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

.anchor-dropdown-item {
  padding: 8px 12px;
  cursor: pointer;
  color: #e0e0e0;
  font-size: 14px;
  transition: background-color 0.2s;
}

.anchor-dropdown-item:hover {
  background: rgba(99, 226, 183, 0.15);
  color: #63e2b7;
}
</style>
