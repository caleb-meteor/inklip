<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  NLayout,
  NLayoutSider,
  NLayoutContent,
  NSelect,
  NInput,
  NButton,
  NIcon,
  NScrollbar,
  useMessage
} from 'naive-ui'
import {
  VideocamOutline,
  DocumentTextOutline,
  ListOutline,
  PlayOutline,
  AddOutline,
  RemoveOutline,
  ChevronBackOutline,
  ChevronDownOutline,
  ChevronForwardOutline,
  LocateOutline,
  DownloadOutline
} from '@vicons/ionicons5'
import HomeSidebar from '../components/home/HomeSidebar.vue'
import AppStatusBar from '../components/AppStatusBar.vue'
import { getVideosApi, type VideoItem, exportSegmentsApi } from '../api/video'
import { getProductsApi, type Product } from '../api/product'
import type { Anchor } from '../api/anchor'
import { parseSubtitleToSegments, type SubtitleSegmentItem } from '../utils/subtitle'
import { getMediaUrl } from '../utils/media'

const router = useRouter()
const message = useMessage()
const appVersion = ref('1.0.0')
const leftSidebarCollapsed = ref(false)

// 左侧栏：当前选中的主播（由 HomeSidebar 通过事件上报）
const currentAnchor = ref<Anchor | null>(null)
const homeSidebarRef = ref<InstanceType<typeof HomeSidebar> | null>(null)

// 产品与视频
const products = ref<Product[]>([])
const selectedProductId = ref<number | null>(null)
const sourceVideos = ref<VideoItem[]>([])
const loadingVideos = ref(false)
const sourceVideoRefs = ref<Record<number, HTMLVideoElement>>({})

function setSourceVideoRef(el: any, videoId: number) {
  if (el) {
    sourceVideoRefs.value[videoId] = el as HTMLVideoElement
  }
}

const currentAnchorProducts = computed(() =>
  currentAnchor.value ? products.value.filter((p) => p.anchor_id === currentAnchor.value!.id) : []
)

const productOptions = computed(() =>
  currentAnchorProducts.value.map((p) => ({ label: p.name, value: p.id }))
)

// 所有视频的字幕片段（带视频信息，顺序与 sourceVideos 一致）
interface SegmentWithVideo extends SubtitleSegmentItem {
  videoId: number
  videoName: string
  videoPath: string
  segmentIndex: number
}
const allSegments = ref<SegmentWithVideo[]>([])
const subtitleSearch = ref('')
const collapsedGroups = ref<Set<number>>(new Set())

function toggleGroup(videoId: number) {
  if (collapsedGroups.value.has(videoId)) {
    collapsedGroups.value.delete(videoId)
  } else {
    collapsedGroups.value.add(videoId)
  }
}

// 按视频分组的字幕片段
interface VideoSegmentGroup {
  videoId: number
  videoName: string
  segments: SegmentWithVideo[]
}

const filteredSegmentGroups = computed(() => {
  const groupsMap: Record<number, VideoSegmentGroup> = {}
  const q = subtitleSearch.value.trim().toLowerCase()
  
  allSegments.value.forEach(seg => {
    if (q && !seg.text.toLowerCase().includes(q)) return
    
    if (!groupsMap[seg.videoId]) {
      groupsMap[seg.videoId] = {
        videoId: seg.videoId,
        videoName: seg.videoName,
        segments: []
      }
    }
    groupsMap[seg.videoId].segments.push(seg)
  })
  
  // 按照原视频列表 (sourceVideos) 的顺序返回分组
  const result: VideoSegmentGroup[] = []
  sourceVideos.value.forEach(v => {
    if (groupsMap[v.id]) {
      result.push(groupsMap[v.id])
    }
  })
  return result
})

// 已选择的字幕（可排序）
const selectedSegments = ref<SegmentWithVideo[]>([])

// 预览：按选择顺序播放
const previewVideoRef = ref<HTMLVideoElement | null>(null)
const isPreviewPlaying = ref(false)
const currentPreviewIndex = ref(-1)

function formatTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function loadProducts() {
  getProductsApi({ all: true }).then((res) => {
    products.value = res.list
  })
}

function loadVideos() {
  if (!selectedProductId.value) {
    sourceVideos.value = []
    allSegments.value = []
    return
  }
  loadingVideos.value = true
  getVideosApi({ product_id: selectedProductId.value })
    .then((list) => {
      sourceVideos.value = list
      const segs: SegmentWithVideo[] = []
      list.forEach((v) => {
        const path = v.path ? getMediaUrl(v.path) : ''
        const items = parseSubtitleToSegments(v.subtitle)
        items.forEach((item, idx) => {
          segs.push({
            ...item,
            videoId: v.id,
            videoName: v.name,
            videoPath: path,
            segmentIndex: idx
          })
        })
      })
      allSegments.value = segs
    })
    .finally(() => {
      loadingVideos.value = false
    })
}

watch(selectedProductId, loadVideos)
watch(
  () => currentAnchor.value?.id,
  () => {
    if (!currentAnchor.value) {
      selectedProductId.value = null
      return
    }
    const ids = currentAnchorProducts.value.map((p) => p.id)
    if (!selectedProductId.value || !ids.includes(selectedProductId.value)) {
      selectedProductId.value = ids[0] ?? null
    }
  }
)
watch(
  () => currentAnchorProducts.value.length,
  () => {
    if (currentAnchorProducts.value.length > 0 && !selectedProductId.value) {
      selectedProductId.value = currentAnchorProducts.value[0].id
    }
  }
)

const selectedSourceKeys = ref<Set<string>>(new Set())
const lastSelectedSourceKey = ref<string | null>(null)

function toggleSourceSelection(seg: SegmentWithVideo, event: MouseEvent) {
  const key = `${seg.videoId}-${seg.segmentIndex}`
  if (event.ctrlKey || event.metaKey) {
    if (selectedSourceKeys.value.has(key)) {
      selectedSourceKeys.value.delete(key)
    } else {
      selectedSourceKeys.value.add(key)
      lastSelectedSourceKey.value = key
    }
  } else if (event.shiftKey && lastSelectedSourceKey.value) {
    const flatList = filteredSegmentGroups.value.flatMap(g => g.segments)
    const flatKeys = flatList.map(s => `${s.videoId}-${s.segmentIndex}`)
    const startIndex = flatKeys.indexOf(lastSelectedSourceKey.value)
    const endIndex = flatKeys.indexOf(key)
    if (startIndex !== -1 && endIndex !== -1) {
      const start = Math.min(startIndex, endIndex)
      const end = Math.max(startIndex, endIndex)
      for (let i = start; i <= end; i++) {
        selectedSourceKeys.value.add(flatKeys[i])
      }
    }
  } else {
    // Normal click: just select this one
    selectedSourceKeys.value.clear()
    selectedSourceKeys.value.add(key)
    lastSelectedSourceKey.value = key
  }
}

function addSelectedSegments() {
  if (selectedSourceKeys.value.size === 0) return
  const flatList = filteredSegmentGroups.value.flatMap(g => g.segments)
  const toAdd = flatList.filter(seg => selectedSourceKeys.value.has(`${seg.videoId}-${seg.segmentIndex}`))
  
  toAdd.forEach(seg => {
    if (!selectedSegments.value.some(s => s.videoId === seg.videoId && s.segmentIndex === seg.segmentIndex)) {
      selectedSegments.value.push(seg)
    }
  })
  selectedSourceKeys.value.clear()
  lastSelectedSourceKey.value = null
}

function addSegment(seg: SegmentWithVideo) {
  const key = `${seg.videoId}-${seg.segmentIndex}`
  // If clicking add on a selected item, add all selected items
  if (selectedSourceKeys.value.has(key) && selectedSourceKeys.value.size > 1) {
    addSelectedSegments()
    return
  }
  
  // Otherwise, just add this specific one
  if (selectedSegments.value.some((s) => s.videoId === seg.videoId && s.segmentIndex === seg.segmentIndex)) return
  selectedSegments.value.push(seg)
}

function removeSelectedSegments() {
  if (selectedSegmentIndexes.value.size > 0 && !isPreviewPlaying.value) {
    const indexesToDelete = Array.from(selectedSegmentIndexes.value).sort((a, b) => b - a)
    for (const idx of indexesToDelete) {
      selectedSegments.value.splice(idx, 1)
    }
    selectedSegmentIndexes.value.clear()
  }
}

function removeSegment(index: number) {
  if (selectedSegmentIndexes.value.has(index) && selectedSegmentIndexes.value.size > 1) {
    removeSelectedSegments()
    return
  }
  selectedSegments.value.splice(index, 1)
  selectedSegmentIndexes.value.clear()
}

function handleGlobalKeydown(e: KeyboardEvent) {
  if (e.key === 'Delete' || e.key === 'Backspace') {
    // Only delete if we have selected items and aren't typing in an input
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
    
    removeSelectedSegments()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
})

const draggedIndexes = ref<number[]>([])
const dragOverIndex = ref<number | null>(null)
const dropPosition = ref<'top' | 'bottom'>('top')

// 选中的字幕片段索引（用于多选拖拽）
const selectedSegmentIndexes = ref<Set<number>>(new Set())

function toggleSegmentSelection(index: number, event: MouseEvent) {
  if (event.ctrlKey || event.metaKey) {
    // Ctrl/Cmd: toggle individual
    if (selectedSegmentIndexes.value.has(index)) {
      selectedSegmentIndexes.value.delete(index)
    } else {
      selectedSegmentIndexes.value.add(index)
    }
  } else if (event.shiftKey && selectedSegmentIndexes.value.size > 0) {
    // Shift: select range
    const array = Array.from(selectedSegmentIndexes.value)
    const lastSelected = array[array.length - 1]
    const start = Math.min(lastSelected, index)
    const end = Math.max(lastSelected, index)
    for (let i = start; i <= end; i++) {
      selectedSegmentIndexes.value.add(i)
    }
  } else {
    // Normal click: select only this one
    selectedSegmentIndexes.value.clear()
    selectedSegmentIndexes.value.add(index)
  }
}

function onDragStart(event: DragEvent, index: number) {
  // If the dragged item is not in the current selection, clear selection and select it
  if (!selectedSegmentIndexes.value.has(index)) {
    selectedSegmentIndexes.value.clear()
    selectedSegmentIndexes.value.add(index)
  }
  
  // Store all currently selected indexes sorted
  draggedIndexes.value = Array.from(selectedSegmentIndexes.value).sort((a, b) => a - b)
  
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', draggedIndexes.value.join(','))
    
    // Optional: create a custom drag image indicating multiple items
    if (draggedIndexes.value.length > 1) {
      const dragBadge = document.createElement('div')
      dragBadge.textContent = `移动 ${draggedIndexes.value.length} 项`
      dragBadge.style.background = '#4facfe'
      dragBadge.style.color = '#fff'
      dragBadge.style.padding = '4px 8px'
      dragBadge.style.borderRadius = '4px'
      dragBadge.style.position = 'absolute'
      dragBadge.style.top = '-1000px'
      document.body.appendChild(dragBadge)
      event.dataTransfer.setDragImage(dragBadge, 0, 0)
      setTimeout(() => document.body.removeChild(dragBadge), 0)
    }
  }
}

function onDragOver(event: DragEvent, index: number) {
  if (draggedIndexes.value.length === 0) return
  // Don't allow dropping on any of the currently dragged items
  if (draggedIndexes.value.includes(index)) {
    dragOverIndex.value = null
    return
  }

  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const offsetY = event.clientY - rect.top
  
  if (offsetY < rect.height / 2) {
    dropPosition.value = 'top'
  } else {
    dropPosition.value = 'bottom'
  }
  
  dragOverIndex.value = index
}

function onDrop(event: DragEvent, index: number) {
  if (draggedIndexes.value.length === 0) return
  if (draggedIndexes.value.includes(index)) return

  // Extract all dragged items from back to front to keep indexes stable during removal
  const itemsToMove: SegmentWithVideo[] = []
  for (let i = draggedIndexes.value.length - 1; i >= 0; i--) {
    const idx = draggedIndexes.value[i]
    itemsToMove.unshift(selectedSegments.value.splice(idx, 1)[0])
  }
  
  let insertIndex = index
  
  // Adjust insertion index based on how many dragged items were BEFORE the insert position
  const draggedBeforeCount = draggedIndexes.value.filter(idx => idx < insertIndex).length
  insertIndex -= draggedBeforeCount
  
  if (dropPosition.value === 'bottom') {
    insertIndex++
  }
  
  // Insert all items at the new position
  selectedSegments.value.splice(insertIndex, 0, ...itemsToMove)

  // Update selection to match new positions
  selectedSegmentIndexes.value.clear()
  for (let i = 0; i < itemsToMove.length; i++) {
    selectedSegmentIndexes.value.add(insertIndex + i)
  }

  draggedIndexes.value = []
  dragOverIndex.value = null
}

function onListDragOver(event: DragEvent) {
  if (draggedIndexes.value.length === 0) return
  dragOverIndex.value = selectedSegments.value.length - 1
  dropPosition.value = 'bottom'
}

function onListDrop(event: DragEvent) {
  if (draggedIndexes.value.length === 0) return
  
  const itemsToMove: SegmentWithVideo[] = []
  for (let i = draggedIndexes.value.length - 1; i >= 0; i--) {
    const idx = draggedIndexes.value[i]
    itemsToMove.unshift(selectedSegments.value.splice(idx, 1)[0])
  }
  
  const insertIndex = selectedSegments.value.length
  selectedSegments.value.push(...itemsToMove)
  
  selectedSegmentIndexes.value.clear()
  for (let i = 0; i < itemsToMove.length; i++) {
    selectedSegmentIndexes.value.add(insertIndex + i)
  }

  draggedIndexes.value = []
  dragOverIndex.value = null
}

function onDragEnd() {
  draggedIndexes.value = []
  dragOverIndex.value = null
}

function playNextSegment() {
  currentPreviewIndex.value++
  if (currentPreviewIndex.value >= selectedSegments.value.length) {
    isPreviewPlaying.value = false
    currentPreviewIndex.value = -1
    return
  }
  const seg = selectedSegments.value[currentPreviewIndex.value]
  const video = previewVideoRef.value
  if (!video) return

  // Check if we need to load a new source
  const currentSrc = video.getAttribute('src')
  if (currentSrc !== seg.videoPath) {
    video.src = seg.videoPath
    video.load()
    const onLoadedMetadata = () => {
      video.removeEventListener('loadedmetadata', onLoadedMetadata)
      video.currentTime = seg.fromS
      video.play().catch((e) => {
        console.error("Play failed:", e)
        isPreviewPlaying.value = false
      })
    }
    video.addEventListener('loadedmetadata', onLoadedMetadata)
  } else {
    // Same video source, just seek
    video.currentTime = seg.fromS
    video.play().catch((e) => {
      console.error("Play failed:", e)
      isPreviewPlaying.value = false
    })
  }
}

function playSourceSegment(seg: SegmentWithVideo) {
  const video = sourceVideoRefs.value[seg.videoId]
  if (!video) return

  // 停止所有原视频的播放
  Object.values(sourceVideoRefs.value).forEach(v => {
    if (v && v !== video) v.pause()
  })

  // 滚动到原视频，防止视频在可视区域外
  video.scrollIntoView({ behavior: 'smooth', block: 'center' })

  video.currentTime = seg.fromS
  video.muted = false // 取消静音以便预览

  // 监听播放进度，到时间点自动暂停
  const onTimeUpdate = () => {
    if (video.currentTime >= seg.toS) {
      video.pause()
      video.removeEventListener('timeupdate', onTimeUpdate)
    }
  }

  // 清理之前的监听器，避免多个片段逻辑重叠
  if ((video as any)._segmentTimeUpdate) {
    video.removeEventListener('timeupdate', (video as any)._segmentTimeUpdate)
  }
  (video as any)._segmentTimeUpdate = onTimeUpdate
  video.addEventListener('timeupdate', onTimeUpdate)

  video.play().catch((e) => {
    console.error("Source video play failed:", e)
  })
}

function onPreviewTimeUpdate() {
  const video = previewVideoRef.value
  const idx = currentPreviewIndex.value
  if (!video || idx < 0 || idx >= selectedSegments.value.length) return
  const seg = selectedSegments.value[idx]
  if (video.currentTime >= seg.toS) {
    video.pause()
    playNextSegment()
  }
}

function stopPreview() {
  isPreviewPlaying.value = false
  currentPreviewIndex.value = -1
  const video = previewVideoRef.value
  if (video) {
    video.pause()
  }
}

function startPreview() {
  if (selectedSegments.value.length === 0) {
    message.warning('请先选择要预览的字幕')
    return
  }
  if (isPreviewPlaying.value) {
    stopPreview()
    return
  }
  currentPreviewIndex.value = -1
  isPreviewPlaying.value = true
  playNextSegment()
}

function scrollToVideoSubtitles(videoId: number) {
  // Clear search if any, so we can find the subtitles
  if (subtitleSearch.value) {
    subtitleSearch.value = ''
  }
  
  // Wait for DOM update if search was cleared
  nextTick(() => {
    // Find the group for this video
    const group = filteredSegmentGroups.value.find(g => g.videoId === videoId)
    if (group && group.segments.length > 0) {
      // 自动展开该组
      if (collapsedGroups.value.has(videoId)) {
        collapsedGroups.value.delete(videoId)
      }
      
      nextTick(() => {
        const firstSegment = group.segments[0]
        const el = document.getElementById(`subtitle-seg-${videoId}-${firstSegment.segmentIndex}`)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' })
          
          // Optional: add a temporary highlight effect
          el.classList.add('flash-highlight')
          setTimeout(() => {
            el.classList.remove('flash-highlight')
          }, 1500)
        }
      })
    } else {
      message.info('该视频暂无字幕')
    }
  })
}

function locateContext(seg: SegmentWithVideo) {
  if (subtitleSearch.value) {
    subtitleSearch.value = ''
  }
  
  nextTick(() => {
    if (collapsedGroups.value.has(seg.videoId)) {
      collapsedGroups.value.delete(seg.videoId)
    }
    
    nextTick(() => {
      const el = document.getElementById(`subtitle-seg-${seg.videoId}-${seg.segmentIndex}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.classList.add('flash-highlight')
        setTimeout(() => {
          el.classList.remove('flash-highlight')
        }, 1500)
      }
    })
  })
}

function navigateTo(path: string) {
  router.push(path)
}

const isExporting = ref(false)

async function handleExportSegments() {
  if (selectedSegments.value.length === 0) {
    message.warning('请先选择要导出的字幕片段')
    return
  }

  isExporting.value = true
  try {
    const requestSegments = selectedSegments.value.map(seg => ({
      video_id: seg.videoId,
      start_s: seg.fromS,
      end_s: seg.toS
    }))

    const res = await exportSegmentsApi(requestSegments)
    if (res && res.path && res.suggested_name) {
      if (window.api?.downloadVideo) {
        await window.api.downloadVideo(res.path, res.suggested_name)
      } else {
        message.warning('当前环境不支持下载视频')
      }
    }
  } catch (error: any) {
    console.error('Export segments error:', error)
    message.error(error.message || '导出视频失败')
  } finally {
    isExporting.value = false
  }
}

onMounted(() => {
  loadProducts()
  if (window.api?.getAppVersion) {
    window.api.getAppVersion().then((v: string) => {
      appVersion.value = v
    })
  }
})
</script>

<template>
  <div class="app-container">
    <div class="main-layout-wrapper">
      <n-layout has-sider class="quick-clip-layout">
        <n-layout-sider
          width="240"
          collapse-mode="width"
          :collapsed-width="48"
          :collapsed="leftSidebarCollapsed"
          bordered
          class="home-sider"
        >
          <HomeSidebar
            ref="homeSidebarRef"
            :collapsed="leftSidebarCollapsed"
            @navigate="navigateTo"
            @toggle-left-collapse="leftSidebarCollapsed = !leftSidebarCollapsed"
            @update:selected-anchor="currentAnchor = $event"
          />
        </n-layout-sider>

        <n-layout-content class="quick-clip-content">
          <div class="quick-clip-header">
            <n-button quaternary size="small" @click="navigateTo('/home')">
              <template #icon>
                <n-icon><ChevronBackOutline /></n-icon>
              </template>
              返回首页
            </n-button>
            <span class="quick-clip-title">快速剪辑</span>
            <n-select
              v-model:value="selectedProductId"
              :options="productOptions"
              placeholder="选择产品（原视频来源）"
              clearable
              style="width: 220px"
              size="small"
            />
          </div>

          <div class="quick-clip-grid">
            <!-- 1. 原视频 -->
            <div class="panel panel-videos">
              <div class="panel-header">
                <n-icon size="18"><VideocamOutline /></n-icon>
                <span>原视频</span>
              </div>
              <n-scrollbar class="panel-body">
                <div v-if="!selectedProductId" class="panel-empty">请先在顶部选择产品</div>
                <div v-else-if="loadingVideos" class="panel-empty">加载中...</div>
                <div v-else-if="sourceVideos.length === 0" class="panel-empty">该产品下暂无视频</div>
                <div v-else class="video-list">
                  <div
                    v-for="v in sourceVideos"
                    :key="v.id"
                    class="video-card"
                    :title="v.name"
                    style="cursor: pointer;"
                    @click="scrollToVideoSubtitles(v.id)"
                  >
                    <div class="video-card-thumb">
                      <video
                        v-if="v.path"
                        :ref="(el) => setSourceVideoRef(el, v.id)"
                        :src="getMediaUrl(v.path)"
                        muted
                        controls
                        preload="metadata"
                        class="thumb-video"
                      />
                      <span v-else class="thumb-placeholder">无预览</span>
                    </div>
                    <div class="video-card-name">{{ v.name }}</div>
                  </div>
                </div>
              </n-scrollbar>
            </div>

            <!-- 2. 视频字幕（支持搜索） -->
            <div class="panel panel-subtitles">
              <div class="panel-header" style="justify-content: space-between;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <n-icon size="18"><DocumentTextOutline /></n-icon>
                  <span>视频字幕</span>
                </div>
                <n-button 
                  v-show="selectedSourceKeys.size > 0"
                  size="tiny" 
                  type="primary" 
                  @click="addSelectedSegments"
                >
                  添加选中 ({{ selectedSourceKeys.size }})
                </n-button>
              </div>
              <div class="panel-search">
                <n-input
                  v-model:value="subtitleSearch"
                  placeholder="搜索字幕..."
                  size="small"
                  clearable
                />
              </div>
              <div class="subtitle-panel-body">
                <n-scrollbar>
                  <div v-if="allSegments.length === 0" class="panel-empty">选择产品后加载字幕</div>
                  <div v-else class="segment-list">
                    <div v-for="group in filteredSegmentGroups" :key="group.videoId" class="segment-group">
                      <div class="segment-group-header" @click="toggleGroup(group.videoId)" style="cursor: pointer;">
                        <n-icon size="14">
                          <ChevronForwardOutline v-if="collapsedGroups.has(group.videoId)" />
                          <ChevronDownOutline v-else />
                        </n-icon>
                        <n-icon size="14"><VideocamOutline /></n-icon>
                        <span class="segment-group-title" :title="group.videoName">{{ group.videoName }}</span>
                      </div>
                      <div v-show="!collapsedGroups.has(group.videoId)" class="segment-group-content">
                        <div
                          v-for="(seg, idx) in group.segments"
                          :key="`${seg.videoId}-${seg.segmentIndex}`"
                          :id="`subtitle-seg-${seg.videoId}-${seg.segmentIndex}`"
                          class="segment-row"
                          :class="{ 'is-selected': selectedSourceKeys.has(`${seg.videoId}-${seg.segmentIndex}`) }"
                          @click="toggleSourceSelection(seg, $event)"
                        >
                        <span class="segment-time">{{ formatTime(seg.fromS) }} - {{ formatTime(seg.toS) }}</span>
                        <span class="segment-text" :title="seg.text">{{ seg.text }}</span>
                        <n-button quaternary size="tiny" type="warning" class="segment-action" title="定位上下文" @click.stop="locateContext(seg)" v-show="subtitleSearch">
                          <n-icon><LocateOutline /></n-icon>
                        </n-button>
                        <n-button quaternary size="tiny" type="info" class="segment-action" title="播放" @click.stop="playSourceSegment(seg)">
                          <n-icon><PlayOutline /></n-icon>
                        </n-button>
                        <n-button quaternary size="tiny" type="primary" class="segment-action" title="添加" @click.stop="addSegment(seg)">
                          <n-icon><AddOutline /></n-icon>
                        </n-button>
                        </div>
                      </div>
                    </div>
                  </div>
                </n-scrollbar>
              </div>
            </div>

            <!-- 3. 选择的字幕（可排序） -->
            <div class="panel panel-selected">
              <div class="panel-header" style="justify-content: space-between;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <n-icon size="18"><ListOutline /></n-icon>
                  <span>选择的字幕</span>
                </div>
                <n-button 
                  v-show="selectedSegmentIndexes.size > 0 && !isPreviewPlaying"
                  size="tiny" 
                  type="error" 
                  @click="removeSelectedSegments"
                >
                  删除选中 ({{ selectedSegmentIndexes.size }})
                </n-button>
              </div>
              <div class="subtitle-panel-body">
                <n-scrollbar>
                  <div v-if="selectedSegments.length === 0" class="panel-empty">从左侧字幕点击添加</div>
                  <div
                    v-else
                    class="selected-list"
                    @dragenter.prevent
                    @dragover.prevent="!isPreviewPlaying && onListDragOver($event)"
                    @drop="!isPreviewPlaying && onListDrop($event)"
                  >
                  <div
                    v-for="(seg, idx) in selectedSegments"
                    :key="`sel-${idx}-${seg.videoId}-${seg.segmentIndex}`"
                    class="selected-row"
                    :class="{
                      'is-selected': selectedSegmentIndexes.has(idx),
                      'is-dragging': draggedIndexes.includes(idx),
                      'is-dragover-top': dragOverIndex === idx && dropPosition === 'top',
                      'is-dragover-bottom': dragOverIndex === idx && dropPosition === 'bottom'
                    }"
                    :draggable="!isPreviewPlaying"
                    @click="!isPreviewPlaying && toggleSegmentSelection(idx, $event)"
                    @dragstart="!isPreviewPlaying && onDragStart($event, idx)"
                    @dragenter.prevent
                    @dragover.prevent.stop="!isPreviewPlaying && onDragOver($event, idx)"
                    @drop.stop="!isPreviewPlaying && onDrop($event, idx)"
                    @dragend="onDragEnd"
                  >
                      <div class="selected-content">
                        <span class="selected-time">{{ formatTime(seg.fromS) }} - {{ formatTime(seg.toS) }}</span>
                        <span class="selected-text">{{ seg.text }}</span>
                        <span class="selected-video">{{ seg.videoName }}</span>
                      </div>
                      <n-button quaternary size="tiny" type="error" @click.stop="removeSegment(idx)" v-show="!isPreviewPlaying">
                        <n-icon><RemoveOutline /></n-icon>
                      </n-button>
                  </div>
                </div>
                </n-scrollbar>
              </div>
            </div>

            <!-- 4. 预览 -->
            <div class="panel panel-preview">
              <div class="panel-header">
                <n-icon size="18"><PlayOutline /></n-icon>
                <span>预览选择字幕视频</span>
              </div>
              <div class="panel-body preview-body">
                <div class="preview-video-wrap" :class="{ 'is-playing': isPreviewPlaying }">
                  <video
                    ref="previewVideoRef"
                    class="preview-video"
                    @timeupdate="onPreviewTimeUpdate"
                    @ended="playNextSegment"
                  />
                  <!-- 覆盖层：拦截播放器控件点击 -->
                  <div class="preview-overlay"></div>
                </div>
                <n-button
                  type="primary"
                  block
                  :disabled="selectedSegments.length === 0"
                  @click="startPreview"
                >
                  <template #icon>
                    <n-icon><PlayOutline /></n-icon>
                  </template>
                  {{ isPreviewPlaying ? '停止播放' : '按选择顺序播放' }}
                </n-button>
                <n-button
                  type="info"
                  block
                  :disabled="selectedSegments.length === 0"
                  :loading="isExporting"
                  @click="handleExportSegments"
                >
                  <template #icon>
                    <n-icon><DownloadOutline /></n-icon>
                  </template>
                  导出所选片段
                </n-button>
              </div>
            </div>
          </div>
        </n-layout-content>
      </n-layout>
    </div>
    <AppStatusBar :app-version="appVersion" @navigate-to-settings="navigateTo('/settings')" />
  </div>
</template>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background: #09090b;
}
.main-layout-wrapper {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
}
.quick-clip-layout {
  height: 100%;
  background: #0f0f0f;
}
.home-sider {
  background: #09090b;
  border-right: 1px solid rgba(255, 255, 255, 0.05);
}
.quick-clip-content {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
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
  /* 调整列宽比例：原视频固定适当宽度，两个字幕区较宽，预览区中等 */
  grid-template-columns: 200px 1.5fr 1.5fr 1.2fr;
  grid-template-rows: 1fr;
  gap: 12px;
  padding: 12px;
  height: calc(100% - 53px); /* 100% minus header height */
  box-sizing: border-box;
}
.panel {
  background: rgba(24, 24, 28, 0.95);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}
.panel-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  font-weight: 600;
  font-size: 13px;
  color: #f5f5f7;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.panel-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  height: 100%;
}

/* 字幕区域：让内部 NScrollbar 填满并滚动 */
.subtitle-panel-body {
  flex: 1;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.subtitle-panel-body :deep(.n-scrollbar) {
  flex: 1;
  min-height: 0;
  height: 100%;
}
.subtitle-panel-body :deep(.n-scrollbar-rail) {
  height: 100%;
}
.subtitle-panel-body :deep(.n-scrollbar-content) {
  min-height: 100%;
}
.panel-search {
  flex-shrink: 0;
  padding: 8px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}
.panel-empty {
  padding: 24px;
  text-align: center;
  color: rgba(255, 255, 255, 0.45);
  font-size: 13px;
}
.video-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 12px;
}
.video-card {
  width: 100%; /* 宽度占满原视频区域 */
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  padding: 8px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.04);
  transition: all 0.2s ease;
  box-sizing: border-box;
}
.video-card:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(79, 172, 254, 0.3);
}
.video-card-thumb {
  width: 100%;
  aspect-ratio: 9/16;
  flex-shrink: 0;
  border-radius: 6px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
}
.thumb-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.thumb-placeholder {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
}
.video-card-name {
  width: 100%;
  text-align: center;
  font-size: 12px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.7);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.4;
  margin-top: 0;
}
.subtitle-panel-body :deep(.n-scrollbar) {
  height: 100%;
}
.subtitle-panel-body :deep(.n-scrollbar-content) {
  min-height: 100%;
  display: flex;
  flex-direction: column;
}
.segment-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
}
.segment-group {
  display: flex;
  flex-direction: column;
}
.segment-group-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.segment-group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  margin-top: 4px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  color: #4facfe;
  font-size: 12px;
  font-weight: 600;
  position: sticky;
  top: 0;
  z-index: 10;
  backdrop-filter: blur(10px);
}
.segment-group-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.segment-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.04);
  cursor: pointer;
  transition: background 0.2s;
  margin-left: 8px;
  user-select: none;
}
.segment-row:hover {
  background: rgba(255, 255, 255, 0.06);
}
.segment-row.is-selected {
  background: rgba(79, 172, 254, 0.2);
  border-color: rgba(79, 172, 254, 0.5);
}
.segment-time {
  flex-shrink: 0;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  font-family: monospace;
}
.segment-text {
  flex: 1;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.segment-action {
  flex-shrink: 0;
}
@keyframes flash {
  0% { background-color: rgba(255, 255, 255, 0.03); }
  50% { background-color: rgba(242, 201, 76, 0.4); }
  100% { background-color: rgba(255, 255, 255, 0.03); }
}
.flash-highlight {
  animation: flash 1.5s ease-in-out;
}
.selected-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  flex: 1;
}
.selected-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(79, 172, 254, 0.08);
  border: 1px solid rgba(79, 172, 254, 0.2);
  cursor: grab;
  transition: all 0.2s ease;
  user-select: none;
}
.selected-row.is-selected {
  background: rgba(79, 172, 254, 0.2);
  border-color: rgba(79, 172, 254, 0.5);
}
.selected-row:active {
  cursor: grabbing;
}
.selected-row.is-dragging {
  opacity: 0.5;
  background: rgba(79, 172, 254, 0.15);
  transform: scale(0.98);
}
.selected-row.is-dragover-top {
  border-top: 2px solid #4facfe;
  background: rgba(79, 172, 254, 0.12);
}
.selected-row.is-dragover-bottom {
  border-bottom: 2px solid #4facfe;
  background: rgba(79, 172, 254, 0.12);
}
.selected-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.selected-time {
  font-size: 11px;
  color: #4facfe;
  font-family: monospace;
}
.selected-text {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.9);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.selected-video {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.45);
}
.preview-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
}
.preview-video-wrap {
  flex: 1;
  min-height: 120px;
  border-radius: 8px;
  overflow: hidden;
  background: #000;
  position: relative;
}
.preview-video {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.preview-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 10;
  background: transparent;
  display: block; /* 始终显示覆盖层，完全禁止操作 */
}
/* 移除了仅在 is-playing 时拦截的规则 */
</style>
