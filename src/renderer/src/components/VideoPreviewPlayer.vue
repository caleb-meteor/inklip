<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount, useTemplateRef } from 'vue'
import { FilmOutline, SyncOutline } from '@vicons/ionicons5'
import { NIcon } from 'naive-ui'
import { useGlobalVideoPreview } from '../composables/useGlobalVideoPreview'
import { extractVideoCover } from '../utils/extractVideoCover'

const props = withDefaults(
  defineProps<{
    path?: string
    cover?: string
    duration?: number
    aspectRatio?: string
    disabled?: boolean
    videoId?: number // Optional video ID for subtitle matching
    subtitleData?: any // Optional subtitle data (array) passed directly
    videoType?: 'material' | 'edited' // Distinction for backend subtitle fetching
    /** 是否显示「已删除」状态，用于处理中不显示已删除。不传则按 isDeleted 自动判断 */
    showDeletedOverlay?: boolean
  }>(),
  { showDeletedOverlay: undefined }
)

const emit = defineEmits<{
  (e: 'dblclick'): void
}>()

/** useTemplateRef 保证与 targetContainer 比较时响应式更新正确（Vue 3.5） */
const videoContainerRef = useTemplateRef<HTMLElement>('videoContainerRef')
const coverLoadError = ref(false)
/** 封面仍可从本地 path 提取；时长仅展示后端 duration，不在前端计算 */
const extractedCover = ref('')

watch(
  () => props.path,
  (path) => {
    coverLoadError.value = false
    extractedCover.value = ''
    if (!path) return
    extractVideoCover(path)
      .then((m) => {
        extractedCover.value = m.coverBase64
          ? `data:image/jpeg;base64,${m.coverBase64}`
          : ''
      })
      .catch(() => {
        extractedCover.value = ''
      })
  },
  { immediate: true }
)
const { isLoading, hasError, showPreview, hidePreview, isCurrentlyPreviewing, targetContainer } =
  useGlobalVideoPreview()

/** 仅使用前端提取的封面，不使用后端 cover */
const coverUrl = computed(() =>
  props.path ? extractedCover.value : ''
)

/** 时长仅用后端传入的 props.duration */
const displayDuration = computed(() =>
  props.duration != null && props.duration > 0 ? props.duration : 0
)

const onCoverError = (): void => {
  coverLoadError.value = true
}

// 被删除：路径为空、封面加载失败或视频加载失败
const isDeleted = computed(
  () =>
    !props.path ||
    coverLoadError.value ||
    (!!props.path && isCurrentlyPreviewing(props.path) && hasError.value)
)
// 是否展示「已删除」UI：父组件可控制，处理中时传 false 以显示处理状态
const shouldShowDeleted = computed(() => props.showDeletedOverlay !== false && isDeleted.value)

/** 当前卡片是否为全局内联预览的挂载目标（避免切换视频后旧卡片仍显示激活态） */
const isThisPreviewTarget = computed(
  () =>
    !!props.path &&
    !!videoContainerRef.value &&
    targetContainer.value === videoContainerRef.value
)

/** 仅 playAtTime / 显式 showPreview 时展示内联视频，不响应鼠标悬停 */
const isInlinePreviewActive = computed(
  () =>
    !!props.path &&
    !props.disabled &&
    !shouldShowDeleted.value &&
    isCurrentlyPreviewing(props.path) &&
    isThisPreviewTarget.value
)

const showPreviewLoading = computed(
  () =>
    !!props.path &&
    isCurrentlyPreviewing(props.path) &&
    isThisPreviewTarget.value &&
    isLoading.value
)

/** startTime 不传时不跳转时间，不从片头强制 seek */
const playAtTime = (startTime?: number, endTime?: number): void => {
  if (!props.path || props.disabled || !videoContainerRef.value) return
  showPreview(props.path, videoContainerRef.value, startTime, false, endTime)
}

defineExpose({
  playAtTime
})

const formatDuration = (seconds?: number): string => {
  if (!seconds) return ''
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

const handleDblClick = (e: MouseEvent): void => {
  if (isDeleted.value || props.disabled) return
  e.stopPropagation()
  emit('dblclick')
}

onBeforeUnmount(() => {
  if (props.path && isCurrentlyPreviewing(props.path)) {
    hidePreview()
  }
})
</script>

<template>
  <div
    class="video-preview-player"
    :class="{ 'is-deleted': shouldShowDeleted }"
    :style="{ aspectRatio: aspectRatio || '9/16' }"
    @dblclick="handleDblClick"
  >
    <!-- Background Area: Cover Image -->
    <div class="thumbnail-area">
      <img
        v-if="coverUrl && !coverLoadError"
        :src="coverUrl"
        class="video-cover"
        @error="onCoverError"
      />
      <div v-else class="icon-placeholder-bg">
        <n-icon size="48" color="#444">
          <FilmOutline />
        </n-icon>
      </div>

      <!-- Duration Badge（被删除时不显示；时长来自 props，由 normalizeVideo 传入后端 duration） -->
      <div v-if="displayDuration && !shouldShowDeleted" class="v-duration-badge">
        {{ formatDuration(displayDuration) }}
      </div>

      <!-- 路径为空、封面/视频文件加载失败时显示（处理中不显示） -->
      <div v-if="shouldShowDeleted" class="deleted-overlay" @click.stop @dblclick.stop>
        <span class="deleted-label">视频已被删除</span>
      </div>
    </div>

    <!-- Video Preview Overlay -->
    <div
      ref="videoContainerRef"
      class="video-preview-container"
      :class="{ active: isInlinePreviewActive }"
    >
      <Transition name="fade">
        <div v-if="showPreviewLoading" class="loading-indicator">
          <n-icon class="n-icon-spin" size="18">
            <SyncOutline />
          </n-icon>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.video-preview-player {
  width: 100%;
  background: #1a1a1a;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  cursor: pointer;
  border-radius: inherit;
}

.video-preview-player:hover {
  z-index: 10;
}

.video-preview-player.is-deleted {
  cursor: default;
}

.video-preview-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 2;
  background: transparent;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;
}

.video-preview-container.active {
  opacity: 1;
  pointer-events: auto;
}

.loading-indicator {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0, 0, 0, 0.7);
  color: #63e2b7;
  font-size: 12px;
  padding: 6px 12px;
  border-radius: 4px;
  font-weight: 500;
  pointer-events: none;
  z-index: 3;
}

.thumbnail-area {
  width: 100%;
  height: 100%;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
}

.video-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.icon-placeholder-bg {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1f1f1f 0%, #111 100%);
}

.v-duration-badge {
  position: absolute;
  bottom: 8px;
  right: 8px;
  background: rgba(0, 0, 0, 0.8);
  color: #fff;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  z-index: 6;
}

.deleted-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.75);
  z-index: 5;
}

.deleted-label {
  padding: 4px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  color: #ff4d4f;
  background: rgba(255, 77, 79, 0.1);
  border: 1px solid rgba(255, 77, 79, 0.4);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
