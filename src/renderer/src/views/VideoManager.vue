<script setup lang="ts">
import { ref, h, computed, onMounted, watch } from 'vue'
import type { VNode, Component } from 'vue'
import { useRouter } from 'vue-router' // Import useRouter
import {
  NLayout,
  NLayoutSider,
  NLayoutHeader,
  NLayoutContent,
  NMenu,
  NButton,
  NSpace,
  NInput,
  NIcon,
  NEllipsis,
  useMessage
} from 'naive-ui'
import VideoPreviewPlayer from '../components/VideoPreviewPlayer.vue'
import VideoStatusOverlay from '../components/VideoStatusOverlay.vue'
import {
  SearchOutline,
  FilmOutline,
  HomeOutline,
  ReloadOutline,
  ColorPaletteOutline,
  PersonOutline,
  PricetagOutline,
  CloudUploadOutline
} from '@vicons/ionicons5'

const router = useRouter() // Initialize router

function renderIcon(icon: Component): () => VNode {
  return () => h(NIcon, null, { default: () => h(icon) })
}

// Category-based menu structure
const menuOptions = [
  {
    label: '全部视频',
    key: 'all',
    icon: renderIcon(FilmOutline)
  },
  {
    label: '风格',
    key: 'category-style',
    icon: renderIcon(ColorPaletteOutline),
    children: [
      { label: '时尚', key: 'style-fashion' },
      { label: '简约', key: 'style-minimal' },
      { label: '复古', key: 'style-vintage' },
      { label: '科技', key: 'style-tech' }
    ]
  },
  {
    label: '主播',
    key: 'category-anchor',
    icon: renderIcon(PersonOutline),
    children: [
      { label: '主播A', key: 'anchor-a' },
      { label: '主播B', key: 'anchor-b' },
      { label: '主播C', key: 'anchor-c' }
    ]
  },
  {
    label: '产品',
    key: 'category-product',
    icon: renderIcon(PricetagOutline),
    children: [
      { label: '服装', key: 'product-clothing' },
      { label: '美妆', key: 'product-beauty' },
      { label: '数码', key: 'product-digital' },
      { label: '家居', key: 'product-home' }
    ]
  }
]

export interface FileItem {
  id: number
  name: string
  type: 'video' | 'image' | 'document' | 'audio'
  size: string
  modified: string
  path: string
  parentId: number | null
  cover?: string
  duration?: number
  width?: number
  height?: number
  status?: number
  parse_percentage?: number
  created_at?: string
  updated_at?: string
  imageError?: boolean
}

import { uploadVideoApi, getVideosApi, VideoUploadResponse } from '../api/video'
import { useWebsocketStore, type VideoParseProgress } from '../stores/websocket'

const wsStore = useWebsocketStore()

const allFiles = ref<FileItem[]>([])

const addFile = (file: FileItem): void => {
  allFiles.value.push(file)
}

const message = useMessage()
const isRefreshing = ref(false)
const isUploading = ref(false)

const fetchVideos = async (): Promise<void> => {
  try {
    isRefreshing.value = true
    const data = await getVideosApi()
    allFiles.value = data.map((item) => ({
      id: item.id,
      name: item.name,
      type: 'video',
      size: formatSize(item.size),
      modified: (item.updated_at || item.created_at || '').split('T')[0],
      path: item.path,
      parentId: null,
      cover: item.cover,
      duration: item.duration,
      width: item.width,
      height: item.height,
      status: item.status,
      parse_percentage: item.parse_percentage,
      created_at: item.created_at,
      updated_at: item.updated_at
    }))
  } catch (error) {
    console.error('Failed to fetch videos', error)
  } finally {
    isRefreshing.value = false
  }
}

watch(
  () => wsStore.videoUploaded,
  () => {
    fetchVideos()
  }
)

onMounted(() => {
  fetchVideos()
})

const activeKey = ref<string | null>('all')

const currentFiles = computed(() => {
  // If 'all' is selected, show all videos
  if (activeKey.value === 'all') {
    return allFiles.value
  }

  // Category filtering logic
  // In a real app, videos would have category tags from the backend
  // For now, we'll show all videos for any category selection
  // TODO: Implement actual category filtering when backend supports it
  return allFiles.value
})

const goHome = (): void => {
  router.push('/home')
}

const selectedFileId = ref<number | null>(null)
const playingFileId = ref<number | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)

const triggerUpload = (): void => {
  if (isUploading.value) return
  fileInputRef.value?.click()
}

const handleFileChange = async (e: Event): Promise<void> => {
  const target = e.target as HTMLInputElement
  if (target.files && target.files.length > 0) {
    const file = target.files[0]
    try {
      const filePath = window.api.getPathForFile(file)
      await uploadFile(filePath)
    } catch (error) {
      console.error('File selection failed', error)
    }
    // Clear input so same file can be selected again
    target.value = ''
  }
}

const handleFileSelect = (file: FileItem): void => {
  selectedFileId.value = file.id
}

const handleTogglePlay = (file: FileItem): void => {
  if (playingFileId.value === file.id) {
    playingFileId.value = null
  } else {
    playingFileId.value = file.id
  }
}

const handleFileOpen = (file: FileItem): void => {
  // For videos, just log for now or preview
  console.log('Opened file:', file.name)
}

const handleDragOver = (e: DragEvent): void => {
  // By default, drops are not allowed (forbidden cursor).
  // We only call preventDefault() (allowing the drop) if we confirm it's a video or unsure.

  if (e.dataTransfer) {
    // If strict checking is possible via items
    if (e.dataTransfer.items.length > 0) {
      let isInvalid = false
      for (let i = 0; i < e.dataTransfer.items.length; i++) {
        const item = e.dataTransfer.items[i]
        // If it's a file and NOT a video, it's invalid
        if (item.kind === 'file' && !item.type.startsWith('video/')) {
          isInvalid = true
          break
        }
      }

      if (isInvalid) {
        // Do NOT preventDefault. Set effect to none explicitly.
        e.dataTransfer.dropEffect = 'none'
        return
      }
    }
  }

  // If valid or unknown, allow drop
  e.preventDefault()
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'copy'
  }
}

const handleDrop = async (e: DragEvent): Promise<void> => {
  e.preventDefault()
  if (e.dataTransfer && e.dataTransfer.files.length > 0) {
    const file = e.dataTransfer.files[0]

    // Check if the file is a video
    if (!file.type.startsWith('video/')) {
      console.warn('Only video files are allowed')
      // You could add a UI notification here like message.error('只能上传视频文件')
      return
    }

    // Use Electron's webUtils to get the file path (via preload script)
    try {
      const filePath = window.api.getPathForFile(file)
      console.log('File path:', filePath)
      await uploadFile(filePath)
    } catch (error) {
      console.error('Upload failed', error)
    }
  }
}

// uploadVideoApi is already imported

const uploadFile = async (path: string): Promise<void> => {
  if (isUploading.value) return

  const messageReactive = message.loading('视频上传分析中...', { duration: 0 })
  try {
    isUploading.value = true
    const res = (await uploadVideoApi(path)) as VideoUploadResponse

    addFile({
      id: res.id,
      name: res.name || (res.path ? res.path.split('/').pop() : 'Untitled') || 'Untitled',
      type: 'video',
      size: formatSize(res.size || 0),
      modified: (res.updated_at || res.created_at || new Date().toISOString()).split('T')[0],
      path: res.path || '',
      parentId: null,
      cover: res.cover,
      duration: res.duration,
      width: res.width,
      height: res.height,
      status: res.status,
      created_at: res.created_at,
      updated_at: res.updated_at
    })
    console.log('Upload success', res)
    // Refresh list immediately
    fetchVideos()
    message.success('上传成功')
  } catch (err) {
    console.error('API Error', err)
    message.error('上传失败，请重试')
  } finally {
    isUploading.value = false
    messageReactive.destroy()
  }
}

const formatSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const getAspectRatio = (file: FileItem): string => {
  // If width and height are available, use actual aspect ratio
  if (file.width && file.height) {
    return `${file.width} / ${file.height}`
  }
  // Default to vertical video aspect ratio (9:16)
  return '9 / 16'
}

/**
 * 映射视频状态
 * 0: 待执行 (pending) -> processing
 * 1: 完成 (completed) -> completed
 * 2: 执行中 (running) -> processing
 * 3: 执行失败 (failed) -> failed
 */
const mapStatus = (status?: number): 'processing' | 'completed' | 'failed' | undefined => {
  if (status === undefined) return undefined
  switch (status) {
    case 0:
      return 'processing'  // 待执行 (pending)
    case 1:
      return 'completed'   // 完成 (completed)
    case 2:
      return 'processing'  // 执行中 (running)
    case 3:
      return 'failed'      // 执行失败 (failed)
    default:
      return 'processing'
  }
}

/**
 * 获取视频显示状态
 * 状态定义：
 * 0: 待执行 (pending)
 * 1: 完成 (completed)
 * 2: 执行中 (running)
 * 3: 执行失败 (failed)
 */
const getVideoStatus = (file: FileItem): 'processing' | 'completed' | 'failed' | undefined => {
  // 如果状态为 1（完成），直接返回 completed
  if (file.status === 1) {
    return 'completed'
  }
  
  // 如果状态为 3（执行失败），直接返回 failed
  if (file.status === 3) {
    return 'failed'
  }
  
  // 如果状态为 0（待执行）或 2（执行中），检查是否有进度（WebSocket 或数据库）
  if (file.status === 0 || file.status === 2) {
    const progress = getVideoProgress(file.id, file)
    // 如果有进度数据，显示 processing（执行中/待执行）
    if (progress?.status === 'parsing' || (file.parse_percentage !== undefined && file.parse_percentage < 100)) {
      return 'processing'
    }
    // 即使没有进度，状态 0 和 2 也应该显示为 processing
    return 'processing'
  }
  
  // 否则使用数据库状态映射
  return mapStatus(file.status)
}

// Create a computed map that tracks the reactive store
// This ensures Vue can track changes to the reactive object
const videoProgressMap = computed(() => {
  // Access the reactive object to establish dependency tracking
  const progressObj = wsStore.videoParseProgress
  // Iterate over all keys to ensure Vue tracks all properties
  Object.keys(progressObj).forEach(key => {
    // Access each property to establish dependency
    const _ = progressObj[Number(key)]
  })
  // Return the reactive object reference directly
  return progressObj
})

/**
 * 获取视频进度
 * 优先使用 WebSocket 实时进度，如果没有则使用数据库中的 parse_percentage
 */
const getVideoProgress = (videoId: number, file?: FileItem): VideoParseProgress | undefined => {
  // 优先使用 WebSocket 实时进度
  const wsProgress = videoProgressMap.value[videoId]
  if (wsProgress) {
    return wsProgress
  }
  
  // 如果没有 WebSocket 进度，但数据库中有百分比，且状态为 0（待执行）或 2（执行中），则使用数据库中的值
  if (file?.parse_percentage !== undefined && (file.status === 0 || file.status === 2)) {
    return {
      videoId,
      percentage: file.parse_percentage,
      status: 'parsing'
    }
  }
  
  return undefined
}
</script>

<template>
  <div class="video-manager-container" @dragover="handleDragOver" @drop="handleDrop">
    <n-layout has-sider style="height: 100vh">
      <n-layout-sider bordered width="240" content-style="padding: 0;" class="sidebar">
        <div class="sidebar-content">
          <div class="sidebar-header">
            <n-button text class="home-button" @click="goHome">
              <template #icon>
                <n-icon><HomeOutline /></n-icon>
              </template>
              <span>返回首页</span>
            </n-button>
          </div>
          <div class="menu-wrapper">
            <n-menu v-model:value="activeKey" :options="menuOptions" default-expand-all />
          </div>
        </div>
      </n-layout-sider>

      <n-layout>
        <n-layout-header bordered class="toolbar">
          <n-space justify="space-between" align="center" style="height: 100%">
            <n-space align="center">
              <n-button circle size="small" :loading="isRefreshing" @click="fetchVideos">
                <template #icon>
                  <n-icon><ReloadOutline /></n-icon>
                </template>
              </n-button>
              <span style="font-size: 14px; color: #888">视频管理</span>
            </n-space>

            <n-space align="center">
              <n-input size="small" placeholder="搜索">
                <template #prefix>
                  <n-icon :component="SearchOutline" />
                </template>
              </n-input>
            </n-space>
          </n-space>
        </n-layout-header>

        <n-layout-content content-style="padding: 24px;">
          <input
            ref="fileInputRef"
            type="file"
            accept="video/*"
            style="display: none"
            @change="handleFileChange"
          />

          <div class="file-grid">
            <!-- Upload Prompt/Action Card -->
            <div
              class="file-item upload-card"
              :class="{ disabled: isUploading }"
              @click="triggerUpload"
            >
              <div class="icon-wrapper upload-icon-wrapper">
                <n-icon size="32" color="#63e2b7">
                  <span v-if="isUploading" style="font-size: 14px; position: absolute">...</span>
                  <CloudUploadOutline v-else />
                </n-icon>
              </div>
              <div class="upload-hint-text">
                {{ isUploading ? '上传中...' : '导入视频' }}
              </div>
              <div class="upload-hint-sub">
                {{ isUploading ? '请稍候' : '拖入或点击上传' }}
              </div>
            </div>

            <div
              v-for="file in currentFiles"
              :key="file.id"
              class="file-item"
              :class="{ selected: selectedFileId === file.id }"
              @click="handleFileSelect(file)"
              @dblclick="handleFileOpen(file)"
            >
              <div class="icon-wrapper">
                <div class="cover-wrapper">
                  <VideoPreviewPlayer
                    :path="file.path"
                    :cover="file.cover"
                    :duration="file.duration"
                    :aspect-ratio="getAspectRatio(file)"
                    :disabled="getVideoStatus(file) !== 'completed'"
                    @dblclick="handleFileOpen(file)"
                  />
                  <VideoStatusOverlay
                    :status="getVideoStatus(file)"
                    :parse-progress="getVideoProgress(file.id, file)"
                    :show-path-missing="!file.path"
                  />
                </div>
              </div>
              <n-ellipsis style="max-width: 100px; margin-top: 8px">{{ file.name }}</n-ellipsis>
              <div class="file-meta">{{ file.size }}</div>
            </div>
          </div>
        </n-layout-content>
      </n-layout>
    </n-layout>
  </div>
</template>

<style scoped>
.video-manager-container {
  background: #1e1e1e;
  color: #e0e0e0;
}

.sidebar {
  background: #252526;
}

.sidebar-content {
  padding: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  height: 50px;
  display: flex;
  align-items: center;
  padding: 0 16px;
  margin-bottom: 0;
  border-bottom: 1px solid #333;
}

.home-button {
  width: 100%;
  justify-content: flex-start;
  padding: 10px 12px;
  border-radius: 6px;
  transition: all 0.2s;
  color: #aaa;
  font-size: 14px;
}

.home-button:hover {
  background: rgba(255, 255, 255, 0.05);
  color: #63e2b7;
}

.menu-wrapper {
  padding: 16px;
  flex: 1;
  overflow-y: auto;
}

/* Traffic lights styles removed as they are replaced by the Home button */

.toolbar {
  height: 50px;
  padding: 0 16px;
  background: #2d2d2d;
  border-bottom: 1px solid #1e1e1e !important;
}

.file-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 10px;
  width: 100%;
}

@media (min-width: 1024px) {
  .file-grid {
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  }
}

@media (min-width: 1440px) {
  .file-grid {
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  }
}

.file-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  padding: 10px;
  border-radius: 6px;
  border: 1px solid transparent;
  width: 100%;
  max-width: 225px;
}

.file-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.file-item.selected {
  background: rgba(99, 226, 183, 0.15);
  border-color: rgba(99, 226, 183, 0.5);
}

.icon-wrapper {
  margin-bottom: 4px;
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 80px;
}

.cover-wrapper {
  width: 100%;
  border-radius: 4px;
  overflow: hidden;
  position: relative;
  background: #000;
  /* aspect-ratio will be set dynamically via inline style */
}

.video-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.duration-badge {
  position: absolute;
  bottom: 4px;
  right: 4px;
  background: rgba(0, 0, 0, 0.75);
  color: white;
  padding: 2px 4px;
  border-radius: 2px;
  font-size: 10px;
}

.file-meta {
  font-size: 0.8rem;
  color: #888;
}

.upload-card {
  border: 1px dashed #444;
  background: rgba(255, 255, 255, 0.02);
  transition: all 0.3s ease;
  justify-content: center;
}

.upload-card:hover {
  border-color: #63e2b7;
  background: rgba(99, 226, 183, 0.05);
}

.upload-card.disabled {
  opacity: 0.5;
  cursor: not-allowed;
  border-color: #444;
  background: rgba(255, 255, 255, 0.02);
}

.upload-icon-wrapper {
  min-height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  margin-bottom: 8px;
}

.upload-hint-text {
  font-size: 14px;
  font-weight: 500;
  color: #e0e0e0;
}

.upload-hint-sub {
  font-size: 11px;
  color: #666;
  margin-top: 2px;
}
</style>
