<script setup lang="ts">
import { provide, reactive, computed } from 'vue'
import { NButton, NIcon } from 'naive-ui'
import { ChevronBackOutline } from '@vicons/ionicons5'
import type { Anchor } from '../api/anchor'
import { useQuickClip } from '../composables/useQuickClip'
import QuickClipSubtitleList from './quick-clip/QuickClipSubtitleList.vue'
import QuickClipSelectedList from './quick-clip/QuickClipSelectedList.vue'
import QuickClipPreview from './quick-clip/QuickClipPreview.vue'

const props = defineProps<{
  currentAnchor: Anchor | null
}>()

const emit = defineEmits<{
  (e: 'navigate', path: string): void
}>()

const selectedAnchorIdRef = computed(() => props.currentAnchor?.id ?? null)
const quickClip = useQuickClip(selectedAnchorIdRef)
provide('quickClip', reactive(quickClip))

defineExpose({
  scrollToVideoSubtitles: quickClip.scrollToVideoSubtitles,
  loadVideos: quickClip.loadVideos
})

function handleNavigate(path: string) {
  emit('navigate', path)
}

function onApplyExport(exportVideoId: number) {
  quickClip.loadExportHistorySubtitles(exportVideoId)
}
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
      <span class="quick-clip-title">字幕剪辑</span>
      <span v-if="props.currentAnchor" style="font-size: 12px; color: rgba(255,255,255,0.5); margin-left: 8px;">
        当前选择主播：{{ props.currentAnchor.name }}
      </span>
    </div>

    <div class="quick-clip-grid">
      <QuickClipSubtitleList />
      <QuickClipSelectedList @apply-export="onApplyExport" />
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
  grid-template-columns: 1fr 1fr 300px;
  grid-template-rows: 1fr;
  gap: 12px;
  padding: 12px;
  height: calc(100% - 53px);
  box-sizing: border-box;
}
.quick-clip-grid > * {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
</style>
