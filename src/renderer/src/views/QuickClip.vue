<script setup lang="ts">
import { provide, reactive, computed } from 'vue'
import { useQuickClip } from '../composables/useQuickClip'
import QuickClipSubtitleList from './quick-clip/QuickClipSubtitleList.vue'
import QuickClipSelectedList from './quick-clip/QuickClipSelectedList.vue'
import QuickClipPreview from './quick-clip/QuickClipPreview.vue'

export interface CurrentWorkspace {
  id: number
  name: string
}

const props = defineProps<{
  currentWorkspace: CurrentWorkspace | null
}>()

defineEmits<{
  (e: 'navigate', path: string): void
}>()

const selectedWorkspaceIdRef = computed(() => props.currentWorkspace?.id ?? null)
const quickClip = useQuickClip(selectedWorkspaceIdRef, { videosProvidedByParent: true })
provide('quickClip', reactive(quickClip))

defineExpose({
  scrollToVideoSubtitles: quickClip.scrollToVideoSubtitles,
  loadVideos: quickClip.loadVideos,
  setVideosFromParent: (list: import('../api/video').VideoItem[]) => quickClip.loadVideos(list)
})

function onApplyExport(exportVideoId: number) {
  quickClip.loadExportHistorySubtitles(exportVideoId)
}
</script>

<template>
  <div class="quick-clip-content">
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
.quick-clip-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 1fr 300px;
  grid-template-rows: 1fr;
  gap: 12px;
  padding: 12px;
  box-sizing: border-box;
}
.quick-clip-grid > * {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
</style>
