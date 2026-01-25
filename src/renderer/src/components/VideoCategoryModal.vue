<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { NModal, NFormItem, NInput } from 'naive-ui'
import type { DictItem } from '../api/dict'

interface Props {
  show: boolean
  groups: DictItem[]
  anchors: DictItem[]
  products: DictItem[]
  currentGroupName?: string
  currentAnchorName?: string
  currentProductName?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:show': [value: boolean]
  confirm: [groupName: string, anchorName: string, productName: string]
}>()

const groupInputValue = ref('')
const anchorInputValue = ref('')
const productInputValue = ref('')

const showGroupDropdown = ref(false)
const showAnchorDropdown = ref(false)
const showProductDropdown = ref(false)

watch(
  () => props.show,
  (newVal) => {
    if (newVal) {
      groupInputValue.value = props.currentGroupName || ''
      anchorInputValue.value = props.currentAnchorName || ''
      productInputValue.value = props.currentProductName || ''
      showGroupDropdown.value = false
      showAnchorDropdown.value = false
      showProductDropdown.value = false
    }
  }
)

const groupInputOptions = computed(() => {
  const inputValue = groupInputValue.value.toLowerCase()
  if (!inputValue) {
    return props.groups.map((group) => ({
      label: group.name,
      value: group.name,
      id: group.id
    }))
  }
  return props.groups
    .filter((group) => group.name.toLowerCase().includes(inputValue))
    .map((group) => ({
      label: group.name,
      value: group.name,
      id: group.id
    }))
})

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

const productInputOptions = computed(() => {
  const inputValue = productInputValue.value.toLowerCase()
  if (!inputValue) {
    return props.products.map((product) => ({
      label: product.name,
      value: product.name,
      id: product.id
    }))
  }
  return props.products
    .filter((product) => product.name.toLowerCase().includes(inputValue))
    .map((product) => ({
      label: product.name,
      value: product.name,
      id: product.id
    }))
})

const handleGroupInputBlur = (): void => {
  setTimeout(() => {
    showGroupDropdown.value = false
  }, 200)
}

const handleAnchorInputBlur = (): void => {
  setTimeout(() => {
    showAnchorDropdown.value = false
  }, 200)
}

const handleProductInputBlur = (): void => {
  setTimeout(() => {
    showProductDropdown.value = false
  }, 200)
}

const handleConfirm = (): boolean => {
  emit(
    'confirm',
    groupInputValue.value.trim(),
    anchorInputValue.value.trim(),
    productInputValue.value.trim()
  )
  return true
}
</script>

<template>
  <n-modal
    :show="props.show"
    preset="dialog"
    title="设置分类"
    positive-text="确定"
    negative-text="取消"
    style="width: 700px"
    @update:show="emit('update:show', $event)"
    @positive-click="handleConfirm"
  >
    <div class="category-form-container">
      <n-form-item label="分组" class="category-form-item">
        <div style="position: relative">
          <n-input
            v-model:value="groupInputValue"
            placeholder="选择已有分组或输入新分组名称"
            clearable
            @focus="showGroupDropdown = true"
            @blur="handleGroupInputBlur"
            @input="showGroupDropdown = true"
          />
          <div v-if="showGroupDropdown && groupInputOptions.length > 0" class="category-dropdown">
            <div
              v-for="option in groupInputOptions"
              :key="option.id"
              class="category-dropdown-item"
              @mousedown.prevent="
                () => {
                  groupInputValue = option.value
                  showGroupDropdown = false
                }
              "
            >
              {{ option.label }}
            </div>
          </div>
        </div>
      </n-form-item>

      <n-form-item label="主播" class="category-form-item">
        <div style="position: relative">
          <n-input
            v-model:value="anchorInputValue"
            placeholder="选择已有主播或输入新主播名称"
            clearable
            @focus="showAnchorDropdown = true"
            @blur="handleAnchorInputBlur"
            @input="showAnchorDropdown = true"
          />
          <div v-if="showAnchorDropdown && anchorInputOptions.length > 0" class="category-dropdown">
            <div
              v-for="option in anchorInputOptions"
              :key="option.id"
              class="category-dropdown-item"
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

      <n-form-item label="产品" class="category-form-item">
        <div style="position: relative">
          <n-input
            v-model:value="productInputValue"
            placeholder="选择已有产品或输入新产品名称"
            clearable
            @focus="showProductDropdown = true"
            @blur="handleProductInputBlur"
            @input="showProductDropdown = true"
          />
          <div
            v-if="showProductDropdown && productInputOptions.length > 0"
            class="category-dropdown"
          >
            <div
              v-for="option in productInputOptions"
              :key="option.id"
              class="category-dropdown-item"
              @mousedown.prevent="
                () => {
                  productInputValue = option.value
                  showProductDropdown = false
                }
              "
            >
              {{ option.label }}
            </div>
          </div>
        </div>
      </n-form-item>
    </div>
  </n-modal>
</template>

<style scoped>
.category-form-container {
  display: flex;
  gap: 16px;
  width: 100%;
}

.category-form-item {
  flex: 1;
  margin-bottom: 0;
}

.category-dropdown {
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

.category-dropdown-item {
  padding: 8px 12px;
  cursor: pointer;
  color: #e0e0e0;
  font-size: 14px;
  transition: background-color 0.2s;
}

.category-dropdown-item:hover {
  background: rgba(99, 226, 183, 0.15);
  color: #63e2b7;
}
</style>
