<script setup lang="ts">
import { ref, type PropType } from 'vue'
import type { Product } from '../../../api/product'

const props = defineProps({
  messageId: { type: String, required: true },
  products: { type: Array as PropType<Product[]>, required: true },
  anchorName: { type: String, default: '' },
  awaitingConfirmation: { type: Boolean, default: true },
  isInteractive: { type: Boolean, default: true },
  cancelled: { type: Boolean, default: false }
})

const emit = defineEmits<{
  (e: 'confirm', productId: number): void
  (e: 'cancel'): void
}>()

const selectedProductId = ref<number | null>(null)

const selectProduct = (id: number): void => {
  if (!props.isInteractive || props.cancelled) return
  selectedProductId.value = id
}

const handleConfirm = (): void => {
  if (selectedProductId.value != null) emit('confirm', selectedProductId.value)
}

const handleCancel = (): void => {
  emit('cancel')
}
</script>

<template>
  <div class="selection-container">
    <div v-if="!cancelled" class="selection-title">
      {{ !isInteractive ? '已选定产品' : '请选择产品（点击选中）' }}
      <span v-if="anchorName" class="anchor-hint"> · 主播：{{ anchorName }}</span>
    </div>
    <div v-else class="cancelled-badge">已取消</div>
    <div class="products-list">
      <div
        v-for="product in products"
        :key="product.id"
        class="product-card"
        :class="{
          selected: selectedProductId === product.id,
          disabled: !isInteractive || cancelled
        }"
        @click="selectProduct(product.id)"
      >
        <div v-if="product.cover" class="product-cover">
          <img :src="product.cover" :alt="product.name" />
        </div>
        <div v-else class="product-cover placeholder">
          <span>{{ (product.name || '品').charAt(0) }}</span>
        </div>
        <div class="product-name">{{ product.name }}</div>
      </div>
    </div>
    <div v-if="awaitingConfirmation && isInteractive && !cancelled" class="confirmation-buttons">
      <button class="btn-confirm" :disabled="selectedProductId == null" @click="handleConfirm">
        确认并继续（已选 1 个）
      </button>
      <button class="btn-cancel" @click="handleCancel">取消</button>
    </div>
  </div>
</template>

<style scoped>
.selection-container {
  margin-top: 16px;
  padding: 16px;
  background: rgba(24, 24, 27, 0.4);
  backdrop-filter: blur(10px);
  border-radius: 16px;
  border: 1px solid rgba(79, 172, 254, 0.15);
}

.selection-title {
  font-size: 13px;
  color: #a1a1aa;
  margin-bottom: 12px;
  font-weight: 500;
}

.anchor-hint {
  color: #71717a;
  font-size: 12px;
}

.cancelled-badge {
  display: inline-block;
  padding: 2px 8px;
  background: rgba(239, 68, 68, 0.1);
  color: #fca5a5;
  border-radius: 6px;
  font-size: 11px;
  margin-bottom: 12px;
}

.products-list {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.product-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 8px;
  width: 90px;
  background: rgba(39, 39, 42, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.product-card:hover:not(.disabled) {
  border-color: rgba(79, 172, 254, 0.4);
  background: rgba(79, 172, 254, 0.08);
}

.product-card.selected {
  border-color: #00f2fe;
  background: rgba(0, 242, 254, 0.12);
  box-shadow: 0 0 12px rgba(0, 242, 254, 0.2);
}

.product-card.disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.product-cover {
  width: 56px;
  height: 56px;
  border-radius: 8px;
  overflow: hidden;
  background: #27272a;
}

.product-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.product-cover.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 600;
  color: #71717a;
}

.product-name {
  font-size: 11px;
  font-weight: 600;
  color: #e4e4e7;
  text-align: center;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.confirmation-buttons {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.btn-confirm {
  padding: 8px 16px;
  background: linear-gradient(135deg, #4facfe, #00f2fe);
  color: #0a0a0b;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}

.btn-confirm:hover:not(:disabled) {
  opacity: 0.9;
}

.btn-confirm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-cancel {
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.08);
  color: #a1a1aa;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-cancel:hover {
  background: rgba(255, 255, 255, 0.12);
}
</style>
