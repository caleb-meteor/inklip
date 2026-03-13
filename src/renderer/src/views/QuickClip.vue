<script setup lang="ts">
import { onMounted, provide, reactive, toRef, ref } from 'vue'
import { NButton, NIcon } from 'naive-ui'
import { ChevronBackOutline } from '@vicons/ionicons5'
import { getProductsApi, type Product } from '../api/product'
import type { Anchor } from '../api/anchor'
import { useQuickClip } from '../composables/useQuickClip'
import QuickClipSubtitleList from './quick-clip/QuickClipSubtitleList.vue'
import QuickClipSelectedList from './quick-clip/QuickClipSelectedList.vue'
import QuickClipPreview from './quick-clip/QuickClipPreview.vue'

const props = defineProps<{
  currentAnchor: Anchor | null
  selectedProductId: number | null
}>()

const emit = defineEmits<{
  (e: 'navigate', path: string): void
}>()

const products = ref<Product[]>([])

const selectedProductIdRef = toRef(props, 'selectedProductId')
const quickClip = useQuickClip(selectedProductIdRef)
// 用 reactive 包装后，子组件模板里 qc.xxx 会拿到解包后的值（Set/Array 等），否则拿到的是 Ref
provide('quickClip', reactive(quickClip))

defineExpose({
  scrollToVideoSubtitles: quickClip.scrollToVideoSubtitles
})

function loadProducts() {
  getProductsApi({ all: true }).then((res) => {
    products.value = res.list
  })
}

function handleNavigate(path: string) {
  emit('navigate', path)
}

onMounted(() => {
  loadProducts()
})
</script>

<template>
  <div class="quick-clip-content">
    <div class="quick-clip-header">
      <n-button quaternary size="small" @click="handleNavigate('/home')">
        <template #icon>
          <n-icon><ChevronBackOutline /></n-icon>
        </template>
        返回首页
      </n-button>
      <span class="quick-clip-title">快速剪辑</span>
      <span v-if="props.selectedProductId" style="font-size: 12px; color: rgba(255,255,255,0.5); margin-left: 8px;">
        当前选择产品：{{ products.find(p => p.id === props.selectedProductId)?.name || '未选择' }}
      </span>
    </div>

    <div class="quick-clip-grid">
      <QuickClipSubtitleList />
      <QuickClipSelectedList />
      <QuickClipPreview />
    </div>
  </div>
</template>

<style scoped>
.quick-clip-content {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #0f0f0f;
}
.quick-clip-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  background: #0f0f0f;
}
.quick-clip-title {
  font-weight: 600;
  font-size: 16px;
  color: #f5f5f7;
}
.quick-clip-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 360px 1.5fr 1.2fr;
  grid-template-rows: 1fr;
  gap: 12px;
  padding: 12px;
  height: calc(100% - 53px);
  box-sizing: border-box;
}
</style>
