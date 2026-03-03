<script setup lang="ts">
import { ref, type PropType } from 'vue'
import type { Anchor } from '../../../api/anchor'

const props = defineProps({
  messageId: { type: String, required: true },
  anchors: { type: Array as PropType<Anchor[]>, required: true },
  awaitingConfirmation: { type: Boolean, default: true },
  isInteractive: { type: Boolean, default: true },
  cancelled: { type: Boolean, default: false }
})

const emit = defineEmits<{
  (e: 'confirm', anchorId: number): void
  (e: 'cancel'): void
}>()

const selectedAnchorId = ref<number | null>(null)

const selectAnchor = (id: number): void => {
  if (!props.isInteractive || props.cancelled) return
  selectedAnchorId.value = id
}

const handleConfirm = (): void => {
  if (selectedAnchorId.value != null) emit('confirm', selectedAnchorId.value)
}

const handleCancel = (): void => {
  emit('cancel')
}
</script>

<template>
  <div class="selection-container">
    <div v-if="!cancelled" class="selection-title">
      {{ !isInteractive ? '已选定主播' : '请选择要剪辑的主播（点击选中）' }}
    </div>
    <div v-else class="cancelled-badge">已取消</div>
    <div class="anchors-list">
      <div
        v-for="anchor in anchors"
        :key="anchor.id"
        class="anchor-card"
        :class="{
          selected: selectedAnchorId === anchor.id,
          disabled: !isInteractive || cancelled
        }"
        @click="selectAnchor(anchor.id)"
      >
        <div v-if="anchor.avatar" class="anchor-avatar">
          <img :src="anchor.avatar" :alt="anchor.name" />
        </div>
        <div v-else class="anchor-avatar placeholder">
          <span>{{ (anchor.name || '主').charAt(0) }}</span>
        </div>
        <div class="anchor-name">{{ anchor.name }}</div>
      </div>
    </div>
    <div v-if="awaitingConfirmation && isInteractive && !cancelled" class="confirmation-buttons">
      <button class="btn-confirm" :disabled="selectedAnchorId == null" @click="handleConfirm">
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

.cancelled-badge {
  display: inline-block;
  padding: 2px 8px;
  background: rgba(239, 68, 68, 0.1);
  color: #fca5a5;
  border-radius: 6px;
  font-size: 11px;
  margin-bottom: 12px;
}

.anchors-list {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.anchor-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 16px;
  min-width: 80px;
  background: rgba(39, 39, 42, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.anchor-card:hover:not(.disabled) {
  border-color: rgba(79, 172, 254, 0.4);
  background: rgba(79, 172, 254, 0.08);
}

.anchor-card.selected {
  border-color: #00f2fe;
  background: rgba(0, 242, 254, 0.12);
  box-shadow: 0 0 12px rgba(0, 242, 254, 0.2);
}

.anchor-card.disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.anchor-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  overflow: hidden;
  background: #27272a;
}

.anchor-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.anchor-avatar.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 600;
  color: #71717a;
}

.anchor-name {
  font-size: 12px;
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
