<script setup lang="ts">
import { ref, onMounted, computed, nextTick, h, watch } from 'vue'
import { NIcon, NAvatar, NPopconfirm, NInput, NButton, NUpload, NDropdown, NModal, NTooltip, useMessage, useDialog, type UploadFileInfo } from 'naive-ui'
import {
  VideocamOutline,
  CutOutline,
  ImagesOutline,
  FolderOpenOutline,
  CubeOutline,
  FilmOutline,
  ChevronForwardOutline,
  ChevronDownOutline,
  PersonAddOutline,
  PlanetOutline,
  PersonOutline,
  PencilOutline,
  TrashOutline,
  MenuOutline,
  ChevronBackOutline,
  PeopleOutline,
  LibraryOutline,
  CloudUploadOutline,
  AddCircleOutline
} from '@vicons/ionicons5'
import type { AiChatTopic } from '../../api/aiChat'
import { getVideosApi, uploadVideosBatchApi, deleteVideoApi, renameVideoApi, type VideoItem } from '../../api/video'
import { getAnchorsApi, createAnchorApi, updateAnchorApi, deleteAnchorApi, type Anchor } from '../../api/anchor'
import { getProductsApi, createProductApi, updateProductApi, deleteProductApi, type Product } from '../../api/product'
import VideoUploadChatModal from './VideoUploadChatModal.vue'
import RenameModal from '../RenameModal.vue'
import DeleteModal from '../DeleteModal.vue'
import { getMediaUrl } from '../../utils/media'

defineProps<{
  collapsed: boolean
}>()

const emit = defineEmits<{
  (e: 'navigate', path: string): void
  (e: 'toggle-left-collapse'): void
  (e: 'play-video', video: VideoItem): void
  (e: 'update:selected-anchor', anchor: Anchor | null): void
}>()

const message = useMessage()
const dialog = useDialog()
const anchors = ref<Anchor[]>([])
const products = ref<Product[]>([])
const videos = ref<VideoItem[]>([])
const selectedAnchorId = ref<number | null>(null)
const expandedProductIds = ref<number[]>([])

// Anchor State
const newAnchorName = ref('')
const newAnchorAvatar = ref<string>('')
const fileList = ref<UploadFileInfo[]>([])

// Product State
const newProductName = ref('')
const newProductCover = ref<string>('')
const productFileList = ref<UploadFileInfo[]>([])

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
const showDeleteModal = ref(false)
const currentVideoForAction = ref<VideoItem | null>(null)

// Edit Anchor State
const editAnchorId = ref<number | null>(null)
const editName = ref('')
const editAvatar = ref('')
const editFileList = ref<UploadFileInfo[]>([])

// Edit Product State
const editProductId = ref<number | null>(null)
const editProductName = ref('')
const editProductCover = ref('')
const editProductFileList = ref<UploadFileInfo[]>([])

const currentAnchor = computed(() => anchors.value.find(a => a.id === selectedAnchorId.value))

watch(currentAnchor, (newVal) => {
  emit('update:selected-anchor', newVal || null)
}, { immediate: true })

const currentAnchorProducts = computed(() => {
  if (!selectedAnchorId.value) return []
  return products.value.filter(p => p.anchor_id === selectedAnchorId.value)
})

onMounted(async () => {
  try {
    const [anchorsRes, productsRes] = await Promise.all([
      getAnchorsApi({ all: true }),
      getProductsApi({ all: true })
    ])
    anchors.value = anchorsRes.list
    products.value = productsRes.list
    
    // Load all videos
    try {
      videos.value = await getVideosApi()
    } catch (e) {
      console.error('Failed to load videos', e)
    }

    // 默认选择第一个主播
    if (anchors.value.length > 0) {
      selectedAnchorId.value = anchors.value[0].id
    }
  } catch (error) {
    console.error('Failed to fetch resources:', error)
  }
})

const handleNavigate = (path: string): void => {
  emit('navigate', path)
}

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
}

const getProductVideos = (productId: number) => {
  return videos.value.filter(v => v.product_id === productId)
}

const formatDuration = (seconds?: number) => {
  if (!seconds) return '00:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

const openUploadModal = (product: Product) => {
  currentUploadProduct.value = product
  showUploadModal.value = true
}

const handleUploadSuccess = async () => {
    // Re-fetch all videos
    try {
        videos.value = await getVideosApi()
    } catch(e) {
        console.error('Failed to refresh videos', e)
    }
}

const getAvatarColor = (name: string): string => {
  const colors = [
    '#f56a00', '#7265e6', '#ffbf00', '#00a2ae', '#1890ff', '#52c41a', '#eb2f96',
    '#e11d48', '#0891b2', '#4f46e5', '#d97706', '#059669', '#7c3aed', '#db2777'
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

const handleUploadChange = (data: { fileList: UploadFileInfo[] }) => {
  fileList.value = data.fileList
  if (data.fileList.length > 0 && data.fileList[0].file) {
    const file = data.fileList[0].file
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => {
      newAnchorAvatar.value = reader.result as string
    }
  } else {
    newAnchorAvatar.value = ''
  }
}

const handleProductUploadChange = (data: { fileList: UploadFileInfo[] }) => {
  productFileList.value = data.fileList
  if (data.fileList.length > 0 && data.fileList[0].file) {
    const file = data.fileList[0].file
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => {
      newProductCover.value = reader.result as string
    }
  } else {
    newProductCover.value = ''
  }
}

const handleAddAnchor = async () => {
  if (!newAnchorName.value.trim()) {
    message.warning('请输入主播名称')
    return false
  }

  loading.value = true
  try {
    const newAnchor = await createAnchorApi({
      name: newAnchorName.value.trim(),
      avatar: newAnchorAvatar.value
    })
    
    anchors.value.push(newAnchor)
    // 选中新添加的主播
    selectedAnchorId.value = newAnchor.id
    
    // Reset inputs
    newAnchorName.value = ''
    newAnchorAvatar.value = ''
    fileList.value = []
    
    // message.success('添加主播成功')
    return true
  } catch (error) {
    console.error('Failed to add anchor:', error)
    message.error('添加主播失败')
    return false
  } finally {
    loading.value = false
  }
}

const handleAddProduct = async () => {
  if (!selectedAnchorId.value) return false
  if (!newProductName.value.trim()) {
    message.warning('请输入产品名称')
    return false
  }

  loading.value = true
  try {
    const newProduct = await createProductApi({
      name: newProductName.value.trim(),
      anchor_id: selectedAnchorId.value,
      cover: newProductCover.value
    })
    
    products.value.push(newProduct)
    
    // Reset inputs
    newProductName.value = ''
    newProductCover.value = ''
    productFileList.value = []
    
    // message.success('添加产品成功')
    return true
  } catch (error) {
    console.error('Failed to add product:', error)
    message.error('添加产品失败')
    return false
  } finally {
    loading.value = false
  }
}

const handleContextMenu = (e: MouseEvent, item: Anchor | Product | VideoItem, type: 'anchor' | 'product' | 'video') => {
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
      confirmDeleteAnchor(contextMenuAnchor.value)
    } else if (contextMenuType.value === 'product' && contextMenuProduct.value) {
      confirmDeleteProduct(contextMenuProduct.value)
    } else if (contextMenuType.value === 'video' && contextMenuVideo.value) {
      currentVideoForAction.value = contextMenuVideo.value
      showDeleteModal.value = true
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
  
  try {
    const updatedVideo = await renameVideoApi(currentVideoForAction.value.id, finalName)
    
    // Update local list
    const index = videos.value.findIndex(v => v.id === updatedVideo.id)
    if (index !== -1) {
      videos.value[index] = updatedVideo
    }
    
    // message.success('重命名成功')
    showRenameModal.value = false
  } catch (error) {
    console.error('Failed to rename video:', error)
    message.error('重命名失败')
  }
}

const handleDeleteVideoConfirm = async () => {
  if (!currentVideoForAction.value) return

  try {
    await deleteVideoApi(currentVideoForAction.value.id)
    
    // Remove from local list
    videos.value = videos.value.filter(v => v.id !== currentVideoForAction.value!.id)
    
    // message.success('删除视频成功')
    showDeleteModal.value = false
  } catch (error) {
    console.error('Failed to delete video:', error)
    message.error('删除视频失败')
  }
}

const startEdit = (anchor: Anchor) => {
  editAnchorId.value = anchor.id
  editName.value = anchor.name
  editAvatar.value = anchor.avatar
  editFileList.value = anchor.avatar ? [{
    id: '1',
    name: 'avatar',
    status: 'finished',
    url: anchor.avatar
  }] : []
}

const startEditProduct = (product: Product) => {
  editProductId.value = product.id
  editProductName.value = product.name
  editProductCover.value = product.cover
  editProductFileList.value = product.cover ? [{
    id: '1',
    name: 'cover',
    status: 'finished',
    url: product.cover
  }] : []
}

const handleEditUploadChange = (data: { fileList: UploadFileInfo[] }) => {
  editFileList.value = data.fileList
  if (data.fileList.length > 0 && data.fileList[0].file) {
    const file = data.fileList[0].file
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => {
      editAvatar.value = reader.result as string
    }
  } else if (data.fileList.length === 0) {
    editAvatar.value = ''
  }
}

const handleEditProductUploadChange = (data: { fileList: UploadFileInfo[] }) => {
  editProductFileList.value = data.fileList
  if (data.fileList.length > 0 && data.fileList[0].file) {
    const file = data.fileList[0].file
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => {
      editProductCover.value = reader.result as string
    }
  } else if (data.fileList.length === 0) {
    editProductCover.value = ''
  }
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
  try {
    const updated = await updateAnchorApi({
      id: editAnchorId.value,
      name: editName.value.trim(),
      avatar: editAvatar.value
    })
    
    // Update local list
    const index = anchors.value.findIndex(a => a.id === updated.id)
    if (index !== -1) {
      anchors.value[index] = updated
    }
    
    // Update current selected if it was the one
    if (selectedAnchorId.value === updated.id) {
       // computed `currentAnchor` will automatically update
    }

    // message.success('更新成功')
    editAnchorId.value = null // Close popconfirm
  } catch (error) {
    message.error('更新失败')
    console.error(error)
  } finally {
    loading.value = false
  }
}

const handleUpdateProduct = async () => {
  if (!editProductId.value || !editProductName.value.trim()) return

  loading.value = true
  try {
    const updated = await updateProductApi({
      id: editProductId.value,
      name: editProductName.value.trim(),
      cover: editProductCover.value
    })
    
    // Update local list
    const index = products.value.findIndex(p => p.id === updated.id)
    if (index !== -1) {
      products.value[index] = updated
    }

    // message.success('更新成功')
    editProductId.value = null
  } catch (error) {
    message.error('更新失败')
    console.error(error)
  } finally {
    loading.value = false
  }
}

const confirmDeleteAnchor = (anchor: Anchor) => {
  dialog.warning({
    title: '确认删除',
    content: `确定要删除主播 "${anchor.name}" 吗？此操作不可恢复。`,
    positiveText: '确定',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await deleteAnchorApi(anchor.id)
        anchors.value = anchors.value.filter(a => a.id !== anchor.id)
        if (selectedAnchorId.value === anchor.id) {
          selectedAnchorId.value = null
        }
        // message.success('删除成功')
      } catch (error) {
        message.error('删除失败')
        console.error(error)
      }
    }
  })
}

const confirmDeleteProduct = (product: Product) => {
  dialog.warning({
    title: '确认删除',
    content: `确定要删除产品 "${product.name}" 吗？此操作不可恢复。`,
    positiveText: '确定',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await deleteProductApi(product.id)
        products.value = products.value.filter(p => p.id !== product.id)
        
        // Remove from expanded list if present
        const expandIndex = expandedProductIds.value.indexOf(product.id)
        if (expandIndex > -1) {
           expandedProductIds.value.splice(expandIndex, 1)
        }
        
        // message.success('删除成功')
      } catch (error) {
        message.error('删除失败')
        console.error(error)
      }
    }
  })
}
</script>

<template>
  <div class="chat-sidebar" :class="{ 'sidebar-collapsed': collapsed }">
    <div class="sidebar-content">
      <!-- 全局素材区域 -->
      <div class="sidebar-group">
        <div class="section-title-wrapper">
          <div class="section-title" v-show="!collapsed" style="color: #fbbf24;">全局素材</div>
          <div class="sidebar-toggle-btn" @click="emit('toggle-left-collapse')" :title="collapsed ? '展开' : '折叠'">
            <n-icon size="16">
              <MenuOutline v-if="collapsed" />
              <ChevronBackOutline v-else />
            </n-icon>
          </div>
        </div>
        
        <div class="nav-item disabled" v-show="!collapsed">
          <n-icon size="14" class="arrow-icon"><ChevronForwardOutline /></n-icon>
          <n-icon size="18" color="#eab308"><PlanetOutline /></n-icon>
          <span>全局素材库</span>
          <span class="pending-tag">待开发</span>
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
                  :style="{ backgroundColor: getAvatarColor(currentAnchor.name), color: '#fff', fontSize: '10px' }"
                >
                  <template v-if="!currentAnchor.avatar">{{ currentAnchor.name.charAt(0) }}</template>
                </n-avatar>
                <n-icon v-else size="20" color="#3b82f6"><PeopleOutline /></n-icon>
              </div>
            </template>
            {{ currentAnchor ? currentAnchor.name : '主播列表' }}
          </n-tooltip>

          <n-tooltip placement="right" v-if="selectedAnchorId">
            <template #trigger>
              <div class="collapsed-icon-item">
                <n-icon size="20"><LibraryOutline /></n-icon>
              </div>
            </template>
            主播公共素材
          </n-tooltip>

          <n-tooltip placement="right" v-if="selectedAnchorId">
            <template #trigger>
              <div class="collapsed-icon-item">
                <n-icon size="20" color="#10b981"><CubeOutline /></n-icon>
              </div>
            </template>
            产品列表
          </n-tooltip>
        </div>
      </div>

      <div class="divider" v-show="!collapsed"></div>

      <!-- 主播选择区域 -->
      <div class="anchors-section" v-show="!collapsed">
        <div class="section-header">
          <div class="section-title" style="margin-bottom: 0; color: #3b82f6;">主播选择</div>
          <n-popconfirm
            @positive-click="handleAddAnchor"
            :show-icon="false"
            placement="right"
            positive-text="添加"
            negative-text="取消"
          >
            <template #trigger>
              <div class="add-anchor-btn">
                <n-icon size="14"><PersonAddOutline /></n-icon>
                <span>添加主播</span>
              </div>
            </template>
            <div style="width: 240px; display: flex; flex-direction: column; gap: 16px; padding: 8px 4px;">
              <div style="display: flex; justify-content: center;">
                <n-upload
                  :file-list="fileList"
                  list-type="image-card"
                  :max="1"
                  accept="image/*"
                  @change="handleUploadChange"
                  :show-preview-button="false"
                  style="--n-item-size: 80px;"
                >
                  <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%;">
                    <n-icon size="18" depth="3"><PersonAddOutline /></n-icon>
                    <span style="font-size: 10px; margin-top: 4px; color: #666;">上传头像</span>
                  </div>
                </n-upload>
              </div>
              
              <div>
                <div style="margin-bottom: 6px; font-weight: 500; font-size: 12px;">新主播名称</div>
                <n-input 
                  v-model:value="newAnchorName" 
                  placeholder="请输入名称" 
                  size="small"
                  @keyup.enter="handleAddAnchor"
                  autofocus
                />
              </div>
            </div>
          </n-popconfirm>
        </div>
        
        <div class="anchors-grid" v-if="anchors.length > 0">
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
                    :style="{ backgroundColor: getAvatarColor(anchor.name), color: '#fff', fontSize: '14px' }"
                  >
                    <template v-if="!anchor.avatar">
                      {{ anchor.name.charAt(0) }}
                    </template>
                  </n-avatar>
                </div>
                <span class="anchor-name">{{ anchor.name }}</span>
              </div>
            </template>
            <!-- Edit Content matches Add Content -->
            <div style="width: 240px; display: flex; flex-direction: column; gap: 16px; padding: 8px 4px;">
              <div style="display: flex; justify-content: center;">
                <n-upload
                  :file-list="editFileList"
                  list-type="image-card"
                  :max="1"
                  accept="image/*"
                  @change="handleEditUploadChange"
                  :show-preview-button="false"
                  style="--n-item-size: 80px;"
                >
                  <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%;">
                    <n-icon size="18" depth="3"><PencilOutline /></n-icon>
                    <span style="font-size: 10px; margin-top: 4px; color: #666;">更换头像</span>
                  </div>
                </n-upload>
              </div>
              
              <div>
                <div style="margin-bottom: 6px; font-weight: 500; font-size: 12px;">主播名称</div>
                <n-input 
                  v-model:value="editName" 
                  placeholder="请输入名称" 
                  size="small"
                  @keyup.enter="handleUpdateAnchor"
                  autofocus
                />
              </div>
            </div>
          </n-popconfirm>
        </div>
        <div class="empty-state" v-else>
          <span>暂无主播</span>
        </div>
      </div>

      <div class="divider"></div>

      <!-- 主播专属素材区域 -->
      <div class="anchor-details-section" v-if="selectedAnchorId && currentAnchor && !collapsed">
        <div class="section-title" style="color: #a855f7;">主播专属素材</div>
        
        <!-- 公共素材 (静态) -->
        <div class="nav-item disabled">
          <n-icon size="14" class="arrow-icon"><ChevronForwardOutline /></n-icon>
          <n-icon size="18" color="#a855f7"><LibraryOutline /></n-icon>
          <span>公共素材库</span>
          <span class="pending-tag">待开发</span>
        </div>

        <!-- 产品管理 Header -->
        <div class="section-header" style="margin-top: 6px; margin-bottom: 4px;">
          <div class="section-title" style="margin-bottom: 0; color: #10b981;">产品列表</div>
          <n-popconfirm
            @positive-click="handleAddProduct"
            :show-icon="false"
            placement="right"
            positive-text="添加"
            negative-text="取消"
          >
            <template #trigger>
              <div class="add-anchor-btn">
                <n-icon size="14"><FolderOpenOutline /></n-icon>
                <span>添加产品</span>
              </div>
            </template>
            <div style="width: 240px; display: flex; flex-direction: column; gap: 16px; padding: 8px 4px;">
              <div style="display: flex; justify-content: center;">
                <n-upload
                  :file-list="productFileList"
                  list-type="image-card"
                  :max="1"
                  accept="image/*"
                  @change="handleProductUploadChange"
                  :show-preview-button="false"
                  style="--n-item-size: 80px;"
                >
                  <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%;">
                    <n-icon size="18" depth="3"><ImagesOutline /></n-icon>
                    <span style="font-size: 10px; margin-top: 4px; color: #666;">产品封面</span>
                  </div>
                </n-upload>
              </div>
              
              <div>
                <div style="margin-bottom: 6px; font-weight: 500; font-size: 12px;">产品名称</div>
                <n-input 
                  v-model:value="newProductName" 
                  placeholder="请输入名称" 
                  size="small"
                  @keyup.enter="handleAddProduct"
                  autofocus
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
                <div class="nav-item" @click="toggleProduct(product.id)" @contextmenu="handleContextMenu($event, product, 'product')">
                  <n-icon size="14" class="arrow-icon">
                    <ChevronDownOutline v-if="expandedProductIds.includes(product.id)" />
                    <ChevronForwardOutline v-else />
                  </n-icon>
                  <!-- Check if product has cover, otherwise use folder icon -->
                  <div v-if="product.cover" style="width: 18px; height: 18px; border-radius: 2px; overflow: hidden; margin-right: 2px; display: flex; flex-shrink: 0;">
                     <img :src="product.cover" style="width: 100%; height: 100%; object-fit: cover;" />
                  </div>
                  <n-icon v-else size="18" :color="getAvatarColor(product.name)"><FolderOpenOutline /></n-icon>
                  <span>{{ product.name }}</span>
                </div>
                
                <!-- 视频列表 -->
                <div v-show="expandedProductIds.includes(product.id)" class="videos-list">
                   <!-- Upload Buttons -->
                   <div 
                     v-if="getProductVideos(product.id).length < 6" 
                     class="video-preview-card upload-card" 
                     @click="openUploadModal(product)"
                   >
                     <div class="preview-placeholder upload-placeholder">
                        <n-icon size="24" color="#a1a1aa"><AddCircleOutline /></n-icon>
                        <span style="font-size: 10px; margin-top: 4px; color: #a1a1aa;">上传视频</span>
                     </div>
                   </div>

                   <!-- Videos -->
                  <div 
                    class="video-preview-card" 
                    v-for="video in getProductVideos(product.id)" 
                    :key="video.id"
                    @dblclick="emit('play-video', video)"
                    @contextmenu="handleContextMenu($event, video, 'video')"
                  >
                     <div class="preview-placeholder">
                        <img v-if="video.cover" :src="getMediaUrl(video.cover)" class="video-cover-img" />
                        <n-icon v-else size="24" color="#fff"><VideocamOutline /></n-icon>
                        <div class="video-duration">{{ formatDuration(video.duration) }}</div>
                     </div>
                     <div class="preview-name" :title="video.name">{{ video.name }}</div>
                  </div>
                </div>
              </div>
            </template>
            <!-- Edit Content -->
            <div style="width: 240px; display: flex; flex-direction: column; gap: 16px; padding: 8px 4px;">
              <div style="display: flex; justify-content: center;">
                <n-upload
                  :file-list="editProductFileList"
                  list-type="image-card"
                  :max="1"
                  accept="image/*"
                  @change="handleEditProductUploadChange"
                  :show-preview-button="false"
                  style="--n-item-size: 80px;"
                >
                  <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%;">
                    <n-icon size="18" depth="3"><ImagesOutline /></n-icon>
                    <span style="font-size: 10px; margin-top: 4px; color: #666;">更换封面</span>
                  </div>
                </n-upload>
              </div>
              
              <div>
                <div style="margin-bottom: 6px; font-weight: 500; font-size: 12px;">产品名称</div>
                <n-input 
                  v-model:value="editProductName" 
                  placeholder="请输入名称" 
                  size="small"
                  @keyup.enter="handleUpdateProduct"
                  autofocus
                />
              </div>
            </div>
          </n-popconfirm>
          <div class="empty-state" v-if="currentAnchorProducts.length === 0">
            <span>暂无产品</span>
          </div>
        </div>
      </div>
      
      <div class="anchor-details-section empty-area" v-else-if="anchors.length > 0 && !collapsed">
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
      :pre-selected-anchor="currentAnchor ? {id: currentAnchor.id, name: currentAnchor.name} : undefined"
      :pre-selected-product="currentUploadProduct ? {id: currentUploadProduct.id, name: currentUploadProduct.name} : undefined"
      @success="handleUploadSuccess"
    />

    <RenameModal
      v-if="currentVideoForAction"
      v-model:show="showRenameModal"
      :video-name="currentVideoForAction.name"
      @confirm="handleRenameVideoConfirm"
    />

    <DeleteModal
      v-if="currentVideoForAction"
      v-model:show="showDeleteModal"
      :video-name="currentVideoForAction.name"
      @confirm="handleDeleteVideoConfirm"
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
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
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

.collapsed-icon-item:hover, .collapsed-icon-item.active {
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
  scrollbar-width: none; /* Firefox */
}

.products-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.videos-list {
  padding-left: 0px;
  padding-top: 8px;
  padding-bottom: 8px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.video-preview-card {
  width: 100%;
  cursor: pointer;
  transition: transform 0.2s;
}

.video-preview-card:hover {
  transform: scale(1.02);
}

.preview-placeholder {
  width: 100%;
  aspect-ratio: 9/16;
  background: linear-gradient(180deg, #475569 0%, #334155 100%);
  border-radius: 6px;
  display: flex;
  flex-direction: column; /* Changed for consistent layout */
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
  position: relative;
  overflow: hidden; /* Ensure image fits */
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
  border-radius: 6px;
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
}

.preview-name {
  font-size: 10px;
  color: #3b82f6;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
