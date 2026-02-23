<script setup lang="ts">
import UnifiedVideoCard from './UnifiedVideoCard.vue'
import type { FileItem } from '../types/video'
import type { DictItem } from '../api/dict'
import type { VideoParseProgress } from '../stores/realtime'

interface Props {
  file: FileItem
  selected?: boolean
  group?: DictItem | null
  anchor?: DictItem | null
  product?: DictItem | null
  aspectRatio: string
  videoStatus: 'processing' | 'completed' | 'failed' | 'pending' | undefined
  videoProgress?: VideoParseProgress
  videoType?: 'material' | 'edited'
}

const props = withDefaults(defineProps<Props>(), {
  selected: false,
  videoType: 'material'
})

const emit = defineEmits<{
  select: [file: FileItem]
  open: [file: FileItem]
  contextMenu: [event: MouseEvent, file: FileItem]
}>()
</script>

<template>
  <UnifiedVideoCard
    :video="props.file"
    :video-type="props.videoType"
    :selected="props.selected"
    :aspect-ratio="props.aspectRatio"
    :show-badges="!!(props.group || props.anchor || props.product)"
    :group="props.group"
    :anchor="props.anchor"
    :product="props.product"
    :parse-progress="props.videoProgress"
    @select="emit('select', props.file)"
    @open="emit('open', props.file)"
    @context-menu="emit('contextMenu', $event, props.file)"
  />
</template>
