<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { NModal, NForm, NFormItem, NInput } from 'naive-ui'
import type { DictItem } from '../api/dict'

interface Props {
  show: boolean
  products: DictItem[]
  currentProductName?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:show': [value: boolean]
  confirm: [productName: string]
}>()

const productInputValue = ref('')
const showProductDropdown = ref(false)

watch(
  () => props.show,
  (newVal) => {
    if (newVal) {
      productInputValue.value = props.currentProductName || ''
      showProductDropdown.value = false
    }
  }
)

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

const handleProductInputBlur = (): void => {
  setTimeout(() => {
    showProductDropdown.value = false
  }, 200)
}

const handleConfirm = (): boolean => {
  emit('confirm', productInputValue.value.trim())
  return true
}
</script>

<template>
  <n-modal
    :show="props.show"
    preset="dialog"
    title="添加产品"
    positive-text="确定"
    negative-text="取消"
    @update:show="emit('update:show', $event)"
    @positive-click="handleConfirm"
  >
    <n-form>
      <n-form-item label="产品名称">
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
            class="product-dropdown"
          >
            <div
              v-for="option in productInputOptions"
              :key="option.id"
              class="product-dropdown-item"
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
    </n-form>
  </n-modal>
</template>

<style scoped>
.product-dropdown {
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

.product-dropdown-item {
  padding: 8px 12px;
  cursor: pointer;
  color: #e0e0e0;
  font-size: 14px;
  transition: background-color 0.2s;
}

.product-dropdown-item:hover {
  background: rgba(99, 226, 183, 0.15);
  color: #63e2b7;
}
</style>
