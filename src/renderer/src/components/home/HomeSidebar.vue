<script setup lang="ts">
import { ref, onMounted, computed, nextTick, h, watch } from 'vue'
import { useRoute } from 'vue-router'
import { NIcon, NAvatar, NPopconfirm, NInput, NDropdown, NTooltip, useMessage } from 'naive-ui'
import {
  FolderOpenOutline,
  CubeOutline,
  ChevronForwardOutline,
  ChevronDownOutline,
  PersonAddOutline,
  PlanetOutline,
  PencilOutline,
  TrashOutline,
  MenuOutline,
  ChevronBackOutline,
  PeopleOutline,
  LibraryOutline,
  AddCircleOutline,
  CutOutline
} from '@vicons/ionicons5'
import {
  getVideosApi,
  deleteVideoApi,
  renameVideoApi,
  type VideoItem,
  type HomePlayPayload
} from '../../api/video'
import {
  getAnchorsApi,
  createAnchorApi,
  updateAnchorApi,
  deleteAnchorApi,
  type Anchor
} from '../../api/anchor'
import {
  getProductsApi,
  createProductApi,
  updateProductApi,
  deleteProductApi,
  type Product
} from '../../api/product'
import VideoUploadChatModal from './VideoUploadChatModal.vue'
import RenameModal from '../RenameModal.vue'
import { useRealtimeStore } from '../../stores/realtime'
import UnifiedVideoPreview from '../UnifiedVideoPreview.vue'

defineProps<{
  collapsed: boolean
}>()

const emit = defineEmits<{
  (e: 'navigate', path: string): void
  (e: 'toggle-left-collapse'): void
  (e: 'play-video', payload: HomePlayPayload): void
  (e: 'update:selected-anchor', anchor: Anchor | null): void
  (e: 'select-product', productId: number): void
  (e: 'click-video', videoId: number): void
  (e: 'videos-updated', list: VideoItem[]): void
}>()

const message = useMessage()
const route = useRoute()
const wsStore = useRealtimeStore()
const isVip = computed(() => wsStore.usageInfo?.isVip ?? false)
const anchors = ref<Anchor[]>([])
const products = ref<Product[]>([])
const videos = ref<VideoItem[]>([])
const ANCHOR_STORAGE_KEY = 'home.selectedAnchorId'
function readStoredAnchorId(): number | null {
  const s = sessionStorage.getItem(ANCHOR_STORAGE_KEY)
  if (s) {
    const n = Number(s)
    if (Number.isInteger(n)) return n
  }
  return null
}
const selectedAnchorId = ref<number | null>(readStoredAnchorId())
const expandedProductIds = ref<number[]>([])

// 主播选中变化时写入 sessionStorage，切回页面时可恢复
watch(
  selectedAnchorId,
  (id) => {
    sessionStorage.setItem(ANCHOR_STORAGE_KEY, id != null ? String(id) : '')
  },
  { flush: 'post' }
)

// Anchor State
const newAnchorName = ref('')

// Product State
const newProductName = ref('')

const loading = ref(false)
const showUploadModal = ref(false)
const currentUploadProduct = ref<Product | null>(null)

// Context Menu State
const showDropdown = ref(false)
const dropdownX = ref(0)
const dropdownY = ref(0)
const contextMenuAnchor = ref<Anchor | null>(null)
const contextMenuProduct = ref<Product | null>(null)
const contextMenuVideo = ref<VideoItem | null>(null)
const contextMenuType = ref<'anchor' | 'product' | 'video'>('anchor')

const dropdownOptions = [
  { label: '编辑', key: 'edit', icon: () => h(NIcon, null, { default: () => h(PencilOutline) }) },
  { label: '删除', key: 'delete', icon: () => h(NIcon, null, { default: () => h(TrashOutline) }) }
]

// Video Action State
const showRenameModal = ref(false)
const currentVideoForAction = ref<VideoItem | null>(null)

// Edit Anchor State
const editAnchorId = ref<number | null>(null)
const editName = ref('')

// Edit Product State
const editProductId = ref<number | null>(null)
const editProductName = ref('')

// 首页数量限制已移除，不再校验主播/产品/视频数量上限

const currentAnchor = computed(() => anchors.value.find((a) => a.id === selectedAnchorId.value))

watch(
  currentAnchor,
  (newVal) => {
    emit('update:selected-anchor', newVal || null)
  },
  { immediate: true }
)

// 监听 SSE 推送的视频上传/解析状态：后端推送 video_upload / video_status 后更新左侧视频列表
watch(
  () => wsStore.videoUploaded,
  async (ts) => {
    if (!ts) return
    await refreshVideosFromApi()
  }
)

const currentAnchorProducts = computed(() => {
  if (!selectedAnchorId.value) return []
  return products.value.filter((p) => p.anchor_id === selectedAnchorId.value)
})

const goToQuickClip = () => {
  const query = new URLSearchParams()
  if (selectedAnchorId.value) {
    query.append('anchorId', String(selectedAnchorId.value))
  }
  const queryString = query.toString()
  emit('navigate', `/quick-clip${queryString ? '?' + queryString : ''}`)
}

/** 加载主播、产品、视频列表（用于首屏加载与休眠/长时间未操作后恢复） */
const loadAll = async (): Promise<void> => {
  const [anchorsRes, productsRes, videosRes] = await Promise.allSettled([
    getAnchorsApi({ all: true }),
    getProductsApi({ all: true }),
    getVideosApi()
  ])
  if (anchorsRes.status === 'fulfilled') {
    anchors.value = anchorsRes.value.list
    if (route.query.anchorId) {
      selectedAnchorId.value = Number(route.query.anchorId)
    } else if (anchors.value.length > 0) {
      const id = selectedAnchorId.value
      const exists = id != null && anchors.value.some((a) => a.id === id)
      if (!exists) selectedAnchorId.value = anchors.value[0].id
    }
  }
  if (productsRes.status === 'fulfilled') {
    products.value = productsRes.value.list
    if (route.query.productId) {
      const pId = Number(route.query.productId)
      if (!expandedProductIds.value.includes(pId)) {
        expandedProductIds.value.push(pId)
      }
      nextTick(() => {
        emit('select-product', pId)
      })
    }
  }
  if (videosRes.status === 'fulfilled') {
    const list = videosRes.value
    videos.value = list
    emit('videos-updated', list)
  }
}

onMounted(() => {
  loadAll()
})

defineExpose({ loadAll })

const toggleAnchor = (id: number): void => {
  if (selectedAnchorId.value === id) {
    selectedAnchorId.value = null
  } else {
    selectedAnchorId.value = id
  }
}

const toggleProduct = (id: number): void => {
  const index = expandedProductIds.value.indexOf(id)
  if (index > -1) {
    expandedProductIds.value.splice(index, 1)
  } else {
    expandedProductIds.value.push(id)
  }
  emit('select-product', id)
}

const getProductVideos = (productId: number) => {
  return videos.value.filter((v) => v.product_id === productId)
}

/** 根据实时推送刷新首页左侧视频列表（上传/解析状态变化时由推送触发） */
const refreshVideosFromApi = async () => {
  const list = await getVideosApi()
  videos.value = list
  list.forEach((v) => {
    if (v.task_status === 2) wsStore.clearVideoProgress(v.id)
  })
  emit('videos-updated', list)
}

const openUploadModal = (product: Product) => {
  currentUploadProduct.value = product
  showUploadModal.value = true
}

const handleUploadSuccess = async () => {
  const list = await getVideosApi()
  videos.value = list
  emit('videos-updated', list)
}

const getAvatarColor = (name: string): string => {
  const colors = [
    '#f56a00',
    '#7265e6',
    '#ffbf00',
    '#00a2ae',
    '#1890ff',
    '#52c41a',
    '#eb2f96',
    '#e11d48',
    '#0891b2',
    '#4f46e5',
    '#d97706',
    '#059669',
    '#7c3aed',
    '#db2777'
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

const handleAddAnchor = async (): Promise<boolean> => {
  if (!newAnchorName.value.trim()) {
    message.warning('请输入主播名称')
    return false
  }

  const newAnchor = await createAnchorApi({
    name: newAnchorName.value.trim()
  })

  anchors.value.push(newAnchor)
  // 选中新添加的主播
  selectedAnchorId.value = newAnchor.id

  // Reset inputs
  newAnchorName.value = ''
  return true
}

const handleAddProduct = async () => {
  if (!selectedAnchorId.value) return false
  if (!newProductName.value.trim()) {
    message.warning('请输入产品名称')
    return false
  }

  const newProduct = await createProductApi({
    name: newProductName.value.trim(),
    anchor_id: selectedAnchorId.value
  })

  products.value.push(newProduct)

  // Reset inputs
  newProductName.value = ''

  // message.success('添加产品成功')
  return true
}

const handleContextMenu = (
  e: MouseEvent,
  item: Anchor | Product | VideoItem,
  type: 'anchor' | 'product' | 'video'
) => {
  e.preventDefault()
  showDropdown.value = false
  contextMenuType.value = type

  if (type === 'anchor') {
    contextMenuAnchor.value = item as Anchor
    contextMenuProduct.value = null
    contextMenuVideo.value = null
  } else if (type === 'product') {
    contextMenuProduct.value = item as Product
    contextMenuAnchor.value = null
    contextMenuVideo.value = null
  } else {
    contextMenuVideo.value = item as VideoItem
    contextMenuAnchor.value = null
    contextMenuProduct.value = null
  }

  nextTick().then(() => {
    dropdownX.value = e.clientX
    dropdownY.value = e.clientY
    showDropdown.value = true
  })
}

const handleClickOutside = () => {
  showDropdown.value = false
}

const handleSelectDropdown = (key: string) => {
  showDropdown.value = false

  if (key === 'edit') {
    if (contextMenuType.value === 'anchor' && contextMenuAnchor.value) {
      startEdit(contextMenuAnchor.value)
    } else if (contextMenuType.value === 'product' && contextMenuProduct.value) {
      startEditProduct(contextMenuProduct.value)
    } else if (contextMenuType.value === 'video' && contextMenuVideo.value) {
      currentVideoForAction.value = contextMenuVideo.value
      showRenameModal.value = true
    }
  } else if (key === 'delete') {
    if (contextMenuType.value === 'anchor' && contextMenuAnchor.value) {
      doDeleteAnchor(contextMenuAnchor.value)
    } else if (contextMenuType.value === 'product' && contextMenuProduct.value) {
      doDeleteProduct(contextMenuProduct.value)
    } else if (contextMenuType.value === 'video' && contextMenuVideo.value) {
      currentVideoForAction.value = contextMenuVideo.value
      handleDeleteVideoConfirm()
    }
  }
}

const handleRenameVideoConfirm = async (newName: string) => {
  if (!currentVideoForAction.value || !newName.trim()) return

  // Preserve extension if implementation requires, but usually renameVideoApi might handle just name or require full name.
  // Assuming the user types the new name without extension in the RenameModal,
  // we might need to append the original extension.
  let finalName = newName.trim()
  const originalName = currentVideoForAction.value.name
  const lastDotIndex = originalName.lastIndexOf('.')
  const ext = lastDotIndex !== -1 ? originalName.substring(lastDotIndex) : ''

  // Checking if newName already has the extension (user might have typed it)
  if (ext && !finalName.endsWith(ext)) {
    finalName += ext
  }

  const updatedVideo = await renameVideoApi(currentVideoForAction.value.id, finalName)
  const index = videos.value.findIndex((v) => v.id === updatedVideo.id)
  if (index !== -1) videos.value[index] = updatedVideo
  showRenameModal.value = false
}

const handleDeleteVideoConfirm = async () => {
  if (!currentVideoForAction.value) return

  await deleteVideoApi(currentVideoForAction.value.id)
  videos.value = videos.value.filter((v) => v.id !== currentVideoForAction.value!.id)
  currentVideoForAction.value = null
}

const startEdit = (anchor: Anchor) => {
  editAnchorId.value = anchor.id
  editName.value = anchor.name
}

const startEditProduct = (product: Product) => {
  editProductId.value = product.id
  editProductName.value = product.name
}

const cancelEdit = () => {
  editAnchorId.value = null
}

const cancelEditProduct = () => {
  editProductId.value = null
}

const handleUpdateAnchor = async () => {
  if (!editAnchorId.value || !editName.value.trim()) return

  loading.value = true
  const doUpdate = async () => {
    const updated = await updateAnchorApi({
      id: editAnchorId.value!,
      name: editName.value.trim()
    })
    const index = anchors.value.findIndex((a) => a.id === updated.id)
    if (index !== -1) anchors.value[index] = updated
    editAnchorId.value = null
  }
  await doUpdate().finally(() => {
    loading.value = false
  })
}

const handleUpdateProduct = async () => {
  if (!editProductId.value || !editProductName.value.trim()) return

  loading.value = true
  const doUpdate = async () => {
    const updated = await updateProductApi({
      id: editProductId.value!,
      name: editProductName.value.trim()
    })
    const index = products.value.findIndex((p) => p.id === updated.id)
    if (index !== -1) products.value[index] = updated
    editProductId.value = null
  }
  await doUpdate().finally(() => {
    loading.value = false
  })
}

const doDeleteAnchor = async (anchor: Anchor) => {
  await deleteAnchorApi(anchor.id)
  anchors.value = anchors.value.filter((a) => a.id !== anchor.id)
  if (selectedAnchorId.value === anchor.id) selectedAnchorId.value = null
}

const doDeleteProduct = async (product: Product) => {
  await deleteProductApi(product.id)
  products.value = products.value.filter((p) => p.id !== product.id)
  const expandIndex = expandedProductIds.value.indexOf(product.id)
  if (expandIndex > -1) expandedProductIds.value.splice(expandIndex, 1)
}
</script>

<template>
  <div class="chat-sidebar" :class="{ 'sidebar-collapsed': collapsed }">
    <div class="sidebar-content">
      <!-- 全局素材区域 -->
      <div class="sidebar-group">
        <div class="section-title-wrapper">
          <div v-show="!collapsed" class="section-title" style="color: #fbbf24">全局素材</div>
          <div
            class="sidebar-toggle-btn"
            :title="collapsed ? '展开' : '折叠'"
            @click="emit('toggle-left-collapse')"
          >
            <n-icon size="16">
              <MenuOutline v-if="collapsed" />
              <ChevronBackOutline v-else />
            </n-icon>
          </div>
        </div>

        <div v-show="!collapsed" class="nav-item disabled">
          <n-icon size="14" class="arrow-icon"><ChevronForwardOutline /></n-icon>
          <n-icon size="18" color="#eab308"><PlanetOutline /></n-icon>
          <span>全局素材库</span>
          <span class="pending-tag">待开发</span>
        </div>

        <div v-if="isVip" v-show="!collapsed" class="nav-item clickable" @click="goToQuickClip">
          <n-icon size="14" class="arrow-icon"><ChevronForwardOutline /></n-icon>
          <n-icon size="18" color="#10b981"><CutOutline /></n-icon>
          <span>字幕剪辑</span>
        </div>

        <!-- Collapsed Icons Display -->
        <div v-if="collapsed" class="collapsed-icons-list" @click="emit('toggle-left-collapse')">
          <n-tooltip placement="right">
            <template #trigger>
              <div class="collapsed-icon-item">
                <n-icon size="20"><PlanetOutline /></n-icon>
              </div>
            </template>
            全局素材
          </n-tooltip>

          <div class="collapsed-divider"></div>

          <n-tooltip placement="right">
            <template #trigger>
              <div class="collapsed-icon-item" :class="{ active: !selectedAnchorId }">
                <n-avatar
                  v-if="currentAnchor"
                  round
                  :size="24"
                  :src="currentAnchor.avatar || undefined"
                  :style="{
                    backgroundColor: getAvatarColor(currentAnchor.name),
                    color: '#fff',
                    fontSize: '10px'
                  }"
                >
                  <template v-if="!currentAnchor.avatar">{{
                    currentAnchor.name.charAt(0)
                  }}</template>
                </n-avatar>
                <n-icon v-else size="20" color="#3b82f6"><PeopleOutline /></n-icon>
              </div>
            </template>
            {{ currentAnchor ? currentAnchor.name : '主播列表' }}
          </n-tooltip>

          <n-tooltip v-if="isVip" placement="right">
            <template #trigger>
              <div class="collapsed-icon-item" @click="goToQuickClip">
                <n-icon size="20" color="#10b981"><CutOutline /></n-icon>
              </div>
            </template>
            字幕剪辑
          </n-tooltip>

          <n-tooltip v-if="selectedAnchorId" placement="right">
            <template #trigger>
              <div class="collapsed-icon-item">
                <n-icon size="20"><LibraryOutline /></n-icon>
              </div>
            </template>
            主播公共素材
          </n-tooltip>

          <n-tooltip v-if="selectedAnchorId" placement="right">
            <template #trigger>
              <div class="collapsed-icon-item">
                <n-icon size="20" color="#10b981"><CubeOutline /></n-icon>
              </div>
            </template>
            产品列表
          </n-tooltip>
        </div>
      </div>

      <div v-show="!collapsed" class="divider"></div>

      <!-- 主播选择区域 -->
      <div v-show="!collapsed" class="anchors-section">
        <div class="section-header">
          <div class="section-title" style="margin-bottom: 0; color: #3b82f6">主播选择</div>
          <n-popconfirm
            :show-icon="false"
            placement="right"
            positive-text="添加"
            negative-text="取消"
            @positive-click="handleAddAnchor"
          >
            <template #trigger>
              <div class="add-anchor-btn">
                <n-icon size="14"><PersonAddOutline /></n-icon>
                <span>添加主播</span>
              </div>
            </template>
            <div
              style="
                width: 240px;
                display: flex;
                flex-direction: column;
                gap: 16px;
                padding: 8px 4px;
              "
            >
              <div>
                <div style="margin-bottom: 6px; font-weight: 500; font-size: 12px">新主播名称</div>
                <n-input
                  v-model:value="newAnchorName"
                  placeholder="请输入名称"
                  size="small"
                  autofocus
                  @keyup.enter="handleAddAnchor"
                />
              </div>
            </div>
          </n-popconfirm>
        </div>

        <div v-if="anchors.length > 0" class="anchors-grid">
          <n-popconfirm
            v-for="anchor in anchors"
            :key="anchor.id"
            :show="editAnchorId === anchor.id"
            trigger="manual"
            placement="right"
            :show-icon="false"
            positive-text="保存"
            negative-text="取消"
            @positive-click="handleUpdateAnchor"
            @negative-click="cancelEdit"
            @clickoutside="cancelEdit"
          >
            <template #trigger>
              <div
                class="anchor-tile"
                :class="{ active: selectedAnchorId === anchor.id }"
                @click="toggleAnchor(anchor.id)"
                @contextmenu="handleContextMenu($event, anchor, 'anchor')"
              >
                <div class="avatar-wrapper">
                  <n-avatar
                    round
                    :size="32"
                    class="anchor-avatar"
                    :src="anchor.avatar || undefined"
                    :style="{
                      backgroundColor: getAvatarColor(anchor.name),
                      color: '#fff',
                      fontSize: '14px'
                    }"
                  >
                    <template v-if="!anchor.avatar">
                      {{ anchor.name.charAt(0) }}
                    </template>
                  </n-avatar>
                </div>
                <span class="anchor-name">{{ anchor.name }}</span>
              </div>
            </template>
            <!-- Edit Content (only name, hide avatar upload) -->
            <div
              style="
                width: 240px;
                display: flex;
                flex-direction: column;
                gap: 16px;
                padding: 8px 4px;
              "
            >
              <div>
                <div style="margin-bottom: 6px; font-weight: 500; font-size: 12px">主播名称</div>
                <n-input
                  v-model:value="editName"
                  placeholder="请输入名称"
                  size="small"
                  autofocus
                  @keyup.enter="handleUpdateAnchor"
                />
              </div>
            </div>
          </n-popconfirm>
        </div>
        <div v-else class="empty-state">
          <span>暂无主播</span>
        </div>
      </div>

      <div class="divider"></div>

      <!-- 主播专属素材区域 -->
      <div v-if="selectedAnchorId && currentAnchor && !collapsed" class="anchor-details-section">
        <div class="section-title" style="color: #a855f7">主播专属素材</div>

        <!-- 公共素材 (静态) -->
        <div class="nav-item disabled">
          <n-icon size="14" class="arrow-icon"><ChevronForwardOutline /></n-icon>
          <n-icon size="18" color="#a855f7"><LibraryOutline /></n-icon>
          <span>公共素材库</span>
          <span class="pending-tag">待开发</span>
        </div>

        <!-- 产品管理 Header -->
        <div class="section-header" style="margin-top: 6px; margin-bottom: 4px">
          <div class="section-title" style="margin-bottom: 0; color: #10b981">产品列表</div>
          <n-popconfirm
            v-if="selectedAnchorId"
            :show-icon="false"
            placement="right"
            positive-text="添加"
            negative-text="取消"
            @positive-click="handleAddProduct"
          >
            <template #trigger>
              <div class="add-anchor-btn">
                <n-icon size="14"><FolderOpenOutline /></n-icon>
                <span>添加产品</span>
              </div>
            </template>
            <div
              style="
                width: 240px;
                display: flex;
                flex-direction: column;
                gap: 16px;
                padding: 8px 4px;
              "
            >
              <div>
                <div style="margin-bottom: 6px; font-weight: 500; font-size: 12px">产品名称</div>
                <n-input
                  v-model:value="newProductName"
                  placeholder="请输入名称"
                  size="small"
                  autofocus
                  @keyup.enter="handleAddProduct"
                />
              </div>
            </div>
          </n-popconfirm>
        </div>

        <!-- 产品列表 -->
        <div class="products-list">
          <n-popconfirm
            v-for="product in currentAnchorProducts"
            :key="product.id"
            :show="editProductId === product.id"
            trigger="manual"
            placement="right"
            :show-icon="false"
            positive-text="保存"
            negative-text="取消"
            @positive-click="handleUpdateProduct"
            @negative-click="cancelEditProduct"
            @clickoutside="cancelEditProduct"
          >
            <template #trigger>
              <div class="product-item">
                <div
                  class="nav-item"
                  @click="toggleProduct(product.id)"
                  @contextmenu="handleContextMenu($event, product, 'product')"
                >
                  <n-icon size="14" class="arrow-icon">
                    <ChevronDownOutline v-if="expandedProductIds.includes(product.id)" />
                    <ChevronForwardOutline v-else />
                  </n-icon>
                  <!-- Check if product has cover, otherwise use folder icon -->
                  <div
                    v-if="product.cover"
                    style="
                      width: 18px;
                      height: 18px;
                      border-radius: 2px;
                      overflow: hidden;
                      margin-right: 2px;
                      display: flex;
                      flex-shrink: 0;
                    "
                  >
                    <img
                      :src="product.cover"
                      style="width: 100%; height: 100%; object-fit: cover"
                    />
                  </div>
                  <n-icon v-else size="18" :color="getAvatarColor(product.name)"
                    ><FolderOpenOutline
                  /></n-icon>
                  <span>{{ product.name }}</span>
                </div>

                <!-- 视频列表 -->
                <div v-show="expandedProductIds.includes(product.id)" class="videos-list">
                  <!-- Upload Buttons（已移除每产品视频数量限制，始终显示上传入口） -->
                  <div
                    class="video-preview-card upload-card"
                    @click="openUploadModal(product)"
                  >
                    <div class="preview-placeholder upload-placeholder">
                      <n-icon size="24" color="#a1a1aa"><AddCircleOutline /></n-icon>
                      <span style="font-size: 10px; margin-top: 4px; color: #a1a1aa">上传视频</span>
                    </div>
                    <div class="preview-name"></div>
                  </div>

                  <!-- Videos -->
                  <div
                    v-for="video in getProductVideos(product.id)"
                    :key="video.id"
                    class="video-preview-card"
                    @click="emit('click-video', video.id)"
                    @dblclick="emit('play-video', { video, videoType: 'material' })"
                    @contextmenu="handleContextMenu($event, video, 'video')"
                  >
                    <div class="preview-placeholder">
                      <UnifiedVideoPreview
                        :video="video"
                        video-type="material"
                        aspect-ratio="9/16"
                        @dblclick="emit('play-video', { video, videoType: 'material' })"
                      />
                    </div>
                    <div class="preview-name" :title="video.name">{{ video.name }}</div>
                  </div>
                </div>
              </div>
            </template>
            <!-- Edit Content (only name, hide cover upload) -->
            <div
              style="
                width: 240px;
                display: flex;
                flex-direction: column;
                gap: 16px;
                padding: 8px 4px;
              "
            >
              <div>
                <div style="margin-bottom: 6px; font-weight: 500; font-size: 12px">产品名称</div>
                <n-input
                  v-model:value="editProductName"
                  placeholder="请输入名称"
                  size="small"
                  autofocus
                  @keyup.enter="handleUpdateProduct"
                />
              </div>
            </div>
          </n-popconfirm>
          <div v-if="currentAnchorProducts.length === 0" class="empty-state">
            <span>暂无产品</span>
          </div>
        </div>
      </div>

      <div v-else-if="anchors.length > 0 && !collapsed" class="anchor-details-section empty-area">
        <div class="empty-text">请选择一个主播查看资源</div>
      </div>
    </div>

    <!-- Context Menu -->
    <n-dropdown
      placement="bottom-start"
      trigger="manual"
      :x="dropdownX"
      :y="dropdownY"
      :options="dropdownOptions"
      :show="showDropdown"
      :on-clickoutside="handleClickOutside"
      @select="handleSelectDropdown"
    />

    <!-- Edit Modal Removed -->

    <VideoUploadChatModal
      v-model:show="showUploadModal"
      :pre-selected-anchor="
        currentAnchor ? { id: currentAnchor.id, name: currentAnchor.name } : undefined
      "
      :pre-selected-product="
        currentUploadProduct
          ? { id: currentUploadProduct.id, name: currentUploadProduct.name }
          : undefined
      "
      :pre-selected-product-video-count="
        currentUploadProduct ? getProductVideos(currentUploadProduct.id).length : undefined
      "
      @success="handleUploadSuccess"
    />

    <RenameModal
      v-if="currentVideoForAction"
      v-model:show="showRenameModal"
      :video-name="currentVideoForAction.name"
      @confirm="handleRenameVideoConfirm"
    />
  </div>
</template>

<style scoped>
.chat-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px;
  box-sizing: border-box;
  color: #e5e5e5;
  font-family:
    'Inter',
    system-ui,
    -apple-system,
    sans-serif;
  overflow: hidden;
}

/* Hide scrollbar for Chrome/Safari/Opera */
.anchor-details-section::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

.chat-sidebar.sidebar-collapsed {
  padding: 16px 0;
}

.sidebar-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: hidden; /* Ensure content doesn't overflow parent */
}

.sidebar-collapsed .sidebar-content {
  align-items: center;
}

.sidebar-group {
  width: 100%;
  flex-shrink: 0;
}

.section-title-wrapper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 2px;
  height: 24px;
}

.sidebar-collapsed .section-title-wrapper {
  justify-content: center;
  width: 100%;
  margin-bottom: 0;
}

.section-title {
  font-size: 11px;
  font-weight: 600;
  color: #71717a;
  text-transform: capitalize;
  letter-spacing: 0.05em;
  margin-bottom: 0;
}

.sidebar-toggle-btn {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  cursor: pointer;
  color: #71717a;
  transition: all 0.2s;
  background: transparent;
}

.sidebar-toggle-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #e4e4e7;
}

.sidebar-collapsed .sidebar-toggle-btn {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.collapsed-icons-list {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  margin-top: 16px;
  width: 100%;
}

.collapsed-icon-item {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #71717a;
  transition: all 0.2s ease;
  cursor: pointer;
}

.collapsed-icon-item:hover,
.collapsed-icon-item.active {
  background: rgba(255, 255, 255, 0.08);
  color: #e4e4e7;
}

.collapsed-icon-item.active-indicator {
  position: relative;
}

.collapsed-icon-item.active-indicator::after {
  content: '';
  position: absolute;
  left: -2px;
  top: 50%;
  transform: translateY(-50%);
  width: 2px;
  height: 16px;
  background: #eab308;
  border-radius: 1px;
}

.collapsed-divider {
  width: 24px;
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
  margin: 4px 0;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 4px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  color: #e4e4e7;
  font-size: 14px;
  font-weight: 500;
  user-select: none;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.nav-item.clickable {
  cursor: pointer;
}

.nav-item.disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none; /* Prevent clicks/hover effects */
}

.pending-tag {
  font-size: 10px;
  background: rgba(255, 255, 255, 0.1);
  padding: 1px 4px;
  border-radius: 4px;
  margin-left: auto;
  color: #a1a1aa;
}

.arrow-icon {
  color: #52525b;
  margin-right: -4px;
}

/* Anchors Section */
.anchors-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex-shrink: 0;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2px;
}

.add-anchor-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 4px;
  color: #3b82f6;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s;
}

.add-anchor-btn:hover {
  background: rgba(59, 130, 246, 0.2);
}

.add-anchor-btn.disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}

.divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
  margin: 4px 0;
}

.anchors-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  padding: 2px 0;
}

.anchor-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  cursor: pointer;
  width: 48px;
}

.avatar-wrapper {
  position: relative;
  padding: 2px;
  border-radius: 50%;
  border: 2px solid transparent;
  transition: all 0.2s;
}

.anchor-tile.active .avatar-wrapper {
  border-color: #3b82f6; /* Blue ring */
}

.anchor-avatar {
  display: block;
}

.anchor-name {
  font-size: 11px;
  color: #71717a;
  text-align: center;
  width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.anchor-tile.active .anchor-name {
  color: #3b82f6;
}

.anchor-details-section {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  -ms-overflow-style: none; /* IE and Edge */
  scrollbar-width: none; /* Firefox */
}

.anchor-details-section::-webkit-scrollbar {
  display: none;
}

.products-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.videos-list {
  padding: 8px 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  width: 100%;
  box-sizing: border-box;
}

.video-preview-card {
  width: 100%;
  min-width: 0;
  cursor: pointer;
  transition: transform 0.2s;
  overflow: hidden;
}

.video-preview-card:hover {
  transform: scale(1.02);
}

.preview-placeholder {
  width: 100%;
  aspect-ratio: 9/16;
  background: linear-gradient(180deg, #475569 0%, #334155 100%);
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
  box-shadow: 0 2px 4px -1px rgba(0, 0, 0, 0.3);
  position: relative;
  overflow: hidden;
  min-height: 0;
}

.upload-placeholder {
  border: 1px dashed rgba(255, 255, 255, 0.2);
  background: transparent;
  box-shadow: none;
  transition: all 0.2s;
}

.upload-card:hover .upload-placeholder {
  border-color: rgba(255, 255, 255, 0.4);
  background: rgba(255, 255, 255, 0.05);
}

.video-cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 4px;
  position: absolute;
  top: 0;
  left: 0;
}

.video-duration {
  position: absolute;
  bottom: 4px;
  right: 4px;
  background: rgba(0, 0, 0, 0.6);
  color: white;
  font-size: 8px;
  padding: 1px 3px;
  border-radius: 2px;
  z-index: 1;
}

.video-parse-progress {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  z-index: 2;
}

.video-parse-progress .progress-text {
  font-size: 10px;
  color: #fff;
}

.video-parse-progress .progress-failed {
  font-size: 10px;
  color: #f87171;
}

.preview-name {
  font-size: 10px;
  color: #3b82f6;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  height: 14px;
  line-height: 14px;
}

.empty-state {
  padding: 12px;
  color: #52525b;
  font-size: 12px;
  text-align: center;
}

.empty-area {
  min-height: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-text {
  color: #52525b;
  font-size: 12px;
}
</style>
