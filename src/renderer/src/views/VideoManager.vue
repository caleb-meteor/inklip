<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, onActivated } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { NLayout, NLayoutSider, NLayoutHeader, NLayoutContent } from 'naive-ui'
import { useVideoManager } from '../composables/useVideoManager'
import { useVideoGroups } from '../composables/useVideoGroups'
import { useVideoAnchors } from '../composables/useVideoAnchors'
import { useVideoProducts } from '../composables/useVideoProducts'
import { useWebsocketStore } from '../stores/websocket'
import type { FileItem } from '../types/video'
import VideoCard from '../components/VideoCard.vue'
import UploadCard from '../components/UploadCard.vue'
import VideoContextMenu from '../components/VideoContextMenu.vue'
import GroupContextMenu from '../components/GroupContextMenu.vue'
import VideoManagerSidebar from '../components/VideoManagerSidebar.vue'
import VideoManagerToolbar from '../components/VideoManagerToolbar.vue'
import RenameModal from '../components/RenameModal.vue'
import GroupModal from '../components/GroupModal.vue'
import AnchorModal from '../components/AnchorModal.vue'
import ProductModal from '../components/ProductModal.vue'
import DeleteModal from '../components/DeleteModal.vue'
import CreateItemModal from '../components/CreateItemModal.vue'
import VideoCategoryModal from '../components/VideoCategoryModal.vue'

const router = useRouter()
const route = useRoute()
const wsStore = useWebsocketStore()

// 使用 composables
const {
  allFiles,
  isRefreshing,
  isUploading,
  selectedFileId,
  fetchVideos,
  uploadFilesBatch,
  uploadFolder,
  renameVideo,
  deleteVideo,
  getAspectRatio,
  getVideoStatus,
  getVideoProgress,
  getStatusText,
  updateVideoStatus
} = useVideoManager()

const {
  groups,
  activeGroupId,
  currentGroup,
  fetchGroups,
  createGroup,
  renameGroup,
  deleteGroup,
  updateVideoGroup,
  getFileGroup
} = useVideoGroups()

const {
  anchors,
  activeAnchorId,
  currentAnchor,
  fetchAnchors,
  createAnchor,
  renameAnchor,
  deleteAnchor,
  updateVideoAnchor,
  getFileAnchor
} = useVideoAnchors()

const {
  products,
  activeProductId,
  currentProduct,
  fetchProducts,
  createProduct,
  renameProduct,
  deleteProduct,
  updateVideoProduct,
  getFileProduct
} = useVideoProducts()


// 对话框状态
const showRenameModal = ref(false)
const renameVideoId = ref<number | null>(null)
const renameVideoName = ref('')

const showGroupModal = ref(false)
const groupVideoId = ref<number | null>(null)
const groupVideoCurrentGroupName = ref('')
const groupVideoCurrentGroupId = ref<number | null>(null)

const showAnchorModal = ref(false)
const anchorVideoId = ref<number | null>(null)
const anchorVideoCurrentAnchorName = ref('')
const anchorVideoCurrentAnchorId = ref<number | null>(null)

const showProductModal = ref(false)
const productVideoId = ref<number | null>(null)
const productVideoCurrentProductName = ref('')
const productVideoCurrentProductId = ref<number | null>(null)

// 统一的分类设置弹窗
const showCategoryModal = ref(false)
const categoryVideoId = ref<number | null>(null)
const categoryVideoCurrentGroupName = ref('')
const categoryVideoCurrentAnchorName = ref('')
const categoryVideoCurrentProductName = ref('')
const categoryVideoCurrentGroupId = ref<number | null>(null)
const categoryVideoCurrentAnchorId = ref<number | null>(null)
const categoryVideoCurrentProductId = ref<number | null>(null)

const showDeleteModal = ref(false)
const deleteVideoId = ref<number | null>(null)
const deleteVideoName = ref('')

// 右键菜单相关
const showContextMenu = ref(false)
const contextMenuPosition = ref({ x: 0, y: 0 })
const contextMenuFile = ref<FileItem | null>(null)

// 分组右键菜单相关
const showGroupContextMenu = ref(false)
const groupContextMenuPosition = ref({ x: 0, y: 0 })
const groupContextMenuId = ref<number | null>(null)

// 重命名分组对话框相关
const showRenameGroupModal = ref(false)
const renameGroupId = ref<number | null>(null)
const renameGroupName = ref('')

// 主播右键菜单相关
const showAnchorContextMenu = ref(false)
const anchorContextMenuPosition = ref({ x: 0, y: 0 })
const anchorContextMenuId = ref<number | null>(null)

// 重命名主播对话框相关
const showRenameAnchorModal = ref(false)
const renameAnchorId = ref<number | null>(null)
const renameAnchorName = ref('')

// 产品右键菜单相关
const showProductContextMenu = ref(false)
const productContextMenuPosition = ref({ x: 0, y: 0 })
const productContextMenuId = ref<number | null>(null)

// 重命名产品对话框相关
const showRenameProductModal = ref(false)
const renameProductId = ref<number | null>(null)
const renameProductName = ref('')

// 新增对话框相关
const showCreateGroupModal = ref(false)
const showCreateAnchorModal = ref(false)
const showCreateProductModal = ref(false)

// 菜单相关
const activeKey = ref<string | null>('all')

// 搜索关键词
const searchKeyword = ref('')

// 计算属性 - 支持分组/主播/产品过滤和搜索过滤
const currentFiles = computed(() => {
  let filtered = allFiles.value

  // 先按分组过滤
  if (activeGroupId.value !== null) {
    filtered = filtered.filter(file => {
      const group = getFileGroup(file)
      return group?.id === activeGroupId.value
    })
  }

  // 按主播过滤
  if (activeAnchorId.value !== null) {
    filtered = filtered.filter(file => {
      const anchor = getFileAnchor(file)
      return anchor?.id === activeAnchorId.value
    })
  }

  // 按产品过滤
  if (activeProductId.value !== null) {
    filtered = filtered.filter(file => {
      const product = getFileProduct(file)
      return product?.id === activeProductId.value
    })
  }

  // 再按搜索关键词过滤
  if (searchKeyword.value.trim()) {
    const keyword = searchKeyword.value.trim().toLowerCase()
    filtered = filtered.filter(file => 
      file.name.toLowerCase().includes(keyword)
    )
  }

  return filtered
})

// 监听 WebSocket 上传事件
watch(
  () => wsStore.videoUploaded,
  () => {
    fetchVideos()
  }
)

// 监听 WebSocket 视频状态更新
watch(
  () => wsStore.videoParseProgress,
  (newProgress) => {
    // 当视频进度更新时，更新本地状态
    Object.keys(newProgress).forEach((videoIdStr) => {
      const videoId = Number(videoIdStr)
      const progress = newProgress[videoId]
      if (progress) {
        // 更新视频状态
        if (progress.status === 'completed') {
          updateVideoStatus(videoId, 4, 100) // 4 = COMPLETED
        } else if (progress.status === 'failed') {
          updateVideoStatus(videoId, 5) // 5 = FAILED
        } else if (progress.status === 'parsing' || progress.status === 'transcribing') {
          // 处理中状态，根据当前状态决定更新
          const file = allFiles.value.find(f => f.id === videoId)
          if (file) {
            // 如果当前状态不是处理中状态（1, 2, 3），则更新状态
            if (file.status !== 1 && file.status !== 2 && file.status !== 3) {
              // 根据进度状态判断应该设置的状态
              if (progress.status === 'transcribing') {
                updateVideoStatus(videoId, 3, progress.percentage) // 3 = TRANSCRIBING
              } else {
                // 默认设置为提取封面中（1）
                updateVideoStatus(videoId, 1, progress.percentage)
              }
            } else {
              // 状态已经是处理中，更新进度百分比和状态（如果需要）
              if (progress.percentage !== undefined) {
                file.parse_percentage = progress.percentage
              }
              // 如果进度状态是 transcribing 但当前状态不是3，更新状态
              if (progress.status === 'transcribing' && file.status !== 3) {
                updateVideoStatus(videoId, 3, progress.percentage)
              }
            }
          }
        }
      }
    })
  },
  { deep: true }
)

// 刷新数据的统一方法
const refreshAllData = (): void => {
  fetchVideos()
  fetchGroups()
  fetchAnchors()
  fetchProducts()
  
  // 检查并重新连接 WebSocket
  if (!wsStore.connected) {
    console.log('[VideoManager] WebSocket 未连接，尝试重新连接')
    wsStore.connect()
  }
}

// 处理窗口焦点和可见性变化，恢复时刷新数据
const handleVisibilityChange = (): void => {
  if (!document.hidden) {
    // 窗口变为可见时，刷新数据
    console.log('[VideoManager] 窗口变为可见，刷新数据')
    refreshAllData()
  }
}

const handleWindowFocus = (): void => {
  // 窗口获得焦点时，刷新数据
  console.log('[VideoManager] 窗口获得焦点，刷新数据')
  refreshAllData()
}

// 监听路由变化，当切换回此页面时刷新数据
watch(
  () => route.name,
  (newName, oldName) => {
    // 当路由切换到此页面时刷新数据
    if (newName === 'VideoManager' && oldName !== newName) {
      console.log('[VideoManager] 路由切换到此页面，刷新数据')
      refreshAllData()
    }
  }
)

// 初始化
onMounted(() => {
  refreshAllData()
  
  // 监听窗口可见性变化
  document.addEventListener('visibilitychange', handleVisibilityChange)
  // 监听窗口焦点变化
  window.addEventListener('focus', handleWindowFocus)
  // 监听点击外部事件
  document.addEventListener('click', handleClickOutside)
})

// 当组件被激活时（keep-alive 场景）也刷新数据
onActivated(() => {
  console.log('[VideoManager] 组件被激活，刷新数据')
  refreshAllData()
})

onUnmounted(() => {
  // 清理事件监听器
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  window.removeEventListener('focus', handleWindowFocus)
  document.removeEventListener('click', handleClickOutside)
})

// 文件上传（统一使用批量上传）
const triggerUpload = async (): Promise<void> => {
  if (isUploading.value) return
  
  try {
    const result = await window.api.selectVideoFile()
    if (result.success) {
      // 如果当前选中了分组、主播或产品，上传时自动添加到对应的分类
      const categoryIds: number[] = []
      if (activeGroupId.value !== null) {
        categoryIds.push(activeGroupId.value)
      }
      if (activeAnchorId.value !== null) {
        categoryIds.push(activeAnchorId.value)
      }
      if (activeProductId.value !== null) {
        categoryIds.push(activeProductId.value)
      }
      
      // 统一使用批量上传
      if (result.filePaths && result.filePaths.length > 0) {
        await uploadFilesBatch(
          result.filePaths, 
          categoryIds.length > 0 ? categoryIds : undefined
        )
      }
    }
  } catch (error) {
    console.error('File selection failed', error)
  }
}

// 文件夹上传（自动检测视频和字幕文件）
const triggerFolderUpload = async (): Promise<void> => {
  if (isUploading.value) return
  
  // 如果当前选中了分组、主播或产品，上传时自动添加到对应的分类
  const categoryIds: number[] = []
  if (activeGroupId.value !== null) {
    categoryIds.push(activeGroupId.value)
  }
  if (activeAnchorId.value !== null) {
    categoryIds.push(activeAnchorId.value)
  }
  if (activeProductId.value !== null) {
    categoryIds.push(activeProductId.value)
  }
  
  await uploadFolder(categoryIds.length > 0 ? categoryIds : undefined)
}

// 拖拽上传
const handleDragOver = (e: DragEvent): void => {
  if (e.dataTransfer) {
    if (e.dataTransfer.items.length > 0) {
      let isInvalid = false
      for (let i = 0; i < e.dataTransfer.items.length; i++) {
        const item = e.dataTransfer.items[i]
        if (item.kind === 'file' && !item.type.startsWith('video/')) {
          isInvalid = true
          break
        }
      }
      if (isInvalid) {
        e.dataTransfer.dropEffect = 'none'
        return
      }
    }
  }
  e.preventDefault()
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'copy'
  }
}

const handleDrop = async (e: DragEvent): Promise<void> => {
  e.preventDefault()
  if (e.dataTransfer && e.dataTransfer.files.length > 0) {
    // 过滤出视频文件
    const videoFiles = Array.from(e.dataTransfer.files).filter(file => 
      file.type.startsWith('video/')
    )
    
    if (videoFiles.length === 0) {
      console.warn('No video files found')
      return
    }
    
    try {
      // 如果当前选中了分组、主播或产品，上传时自动添加到对应的分类
      const categoryIds: number[] = []
      if (activeGroupId.value !== null) {
        categoryIds.push(activeGroupId.value)
      }
      if (activeAnchorId.value !== null) {
        categoryIds.push(activeAnchorId.value)
      }
      if (activeProductId.value !== null) {
        categoryIds.push(activeProductId.value)
      }
      
      // 获取所有视频文件的路径
      const filePaths = videoFiles.map(file => window.api.getPathForFile(file))
      
      // 统一使用批量上传
      await uploadFilesBatch(filePaths, categoryIds.length > 0 ? categoryIds : undefined)
    } catch (error) {
      console.error('Upload failed', error)
    }
  }
}

// 视频操作
const handleFileSelect = (file: FileItem): void => {
  selectedFileId.value = file.id
}


// 右键菜单
const handleContextMenu = (e: MouseEvent, file: FileItem): void => {
  e.preventDefault()
  e.stopPropagation()
  closeAllContextMenus() // 先关闭所有其他右键菜单
  contextMenuFile.value = file
  contextMenuPosition.value = { x: e.clientX, y: e.clientY }
  showContextMenu.value = true
}

const closeContextMenu = (): void => {
  showContextMenu.value = false
  contextMenuFile.value = null
}

// 关闭所有右键菜单
const closeAllContextMenus = (): void => {
  closeContextMenu()
  closeGroupContextMenu()
  closeAnchorContextMenu()
  closeProductContextMenu()
}

// 重命名
const handleRenameMenuItem = (): void => {
  if (!contextMenuFile.value) return
  const file = contextMenuFile.value
  closeContextMenu()
  renameVideoId.value = file.id
  renameVideoName.value = file.name
  showRenameModal.value = true
}

const handleRename = async (newName: string): Promise<void> => {
  if (!renameVideoId.value) return
  try {
    await renameVideo(renameVideoId.value, newName)
    showRenameModal.value = false
  } catch (error) {
    // Error already handled in composable
  }
}

// 统一的分类设置
const handleCategoryMenuItem = (): void => {
  if (!contextMenuFile.value) return
  const file = contextMenuFile.value
  closeContextMenu()
  categoryVideoId.value = file.id
  
  const currentGroup = getFileGroup(file)
  const currentAnchor = getFileAnchor(file)
  const currentProduct = getFileProduct(file)
  
  categoryVideoCurrentGroupName.value = currentGroup?.name || ''
  categoryVideoCurrentAnchorName.value = currentAnchor?.name || ''
  categoryVideoCurrentProductName.value = currentProduct?.name || ''
  
  categoryVideoCurrentGroupId.value = currentGroup?.id || null
  categoryVideoCurrentAnchorId.value = currentAnchor?.id || null
  categoryVideoCurrentProductId.value = currentProduct?.id || null
  
  showCategoryModal.value = true
}

// 处理统一的分类设置确认
const handleCategoryConfirm = async (
  groupName: string, 
  anchorName: string, 
  productName: string
): Promise<void> => {
  if (!categoryVideoId.value) return
  
  const videoId = categoryVideoId.value
  
  // 处理分组
  const groupValue = groupName.trim()
  let targetGroupId: number | null = null
  if (groupValue) {
    const existingGroup = groups.value.find(g => g.name === groupValue)
    if (existingGroup) {
      targetGroupId = existingGroup.id
    } else {
      try {
        const newGroup = await createGroup(groupValue)
        targetGroupId = newGroup.id
      } catch (error) {
        // Error already handled
      }
    }
  }
  
  // 处理主播
  const anchorValue = anchorName.trim()
  let targetAnchorId: number | null = null
  if (anchorValue) {
    const existingAnchor = anchors.value.find(a => a.name === anchorValue)
    if (existingAnchor) {
      targetAnchorId = existingAnchor.id
    } else {
      try {
        const newAnchor = await createAnchor(anchorValue)
        targetAnchorId = newAnchor.id
      } catch (error) {
        // Error already handled
      }
    }
  }
  
  // 处理产品
  const productValue = productName.trim()
  let targetProductId: number | null = null
  if (productValue) {
    const existingProduct = products.value.find(p => p.name === productValue)
    if (existingProduct) {
      targetProductId = existingProduct.id
    } else {
      try {
        const newProduct = await createProduct(productValue)
        targetProductId = newProduct.id
      } catch (error) {
        // Error already handled
      }
    }
  }
  
  // 更新视频分类
  try {
    // 更新分组
    await updateVideoGroup(videoId, targetGroupId, categoryVideoCurrentGroupId.value)
    // 更新主播
    await updateVideoAnchor(videoId, targetAnchorId, categoryVideoCurrentAnchorId.value)
    // 更新产品
    await updateVideoProduct(videoId, targetProductId, categoryVideoCurrentProductId.value)
    
    showCategoryModal.value = false
    await fetchVideos()
  } catch (error) {
    // Error already handled
  }
}

// 分组（保留用于兼容）
const handleGroupMenuItem = (): void => {
  if (!contextMenuFile.value) return
  const file = contextMenuFile.value
  closeContextMenu()
  groupVideoId.value = file.id
  const currentGroup = getFileGroup(file)
  if (currentGroup) {
    groupVideoCurrentGroupName.value = currentGroup.name
    groupVideoCurrentGroupId.value = currentGroup.id
  } else {
    groupVideoCurrentGroupName.value = ''
    groupVideoCurrentGroupId.value = null
  }
  showGroupModal.value = true
}

const handleRemoveGroupMenuItem = async (): Promise<void> => {
  if (!contextMenuFile.value) return
  const file = contextMenuFile.value
  closeContextMenu()
  const currentGroup = getFileGroup(file)
  try {
    await updateVideoGroup(file.id, null, currentGroup?.id)
    await fetchVideos()
  } catch (error) {
    // Error already handled in composable
  }
}

const handleGroup = async (groupName: string): Promise<void> => {
  if (!groupVideoId.value) return

  const inputValue = groupName.trim()
  
  if (!inputValue) {
    try {
      await updateVideoGroup(groupVideoId.value, null, groupVideoCurrentGroupId.value)
      showGroupModal.value = false
      await fetchVideos()
    } catch (error) {
      // Error already handled
    }
    return
  }

  let targetGroupId: number | null = null
  const existingGroup = groups.value.find(g => g.name === inputValue)
  
  if (existingGroup) {
    targetGroupId = existingGroup.id
  } else {
    try {
      const newGroup = await createGroup(inputValue)
      targetGroupId = newGroup.id
    } catch (error) {
      return
    }
  }

  try {
    await updateVideoGroup(groupVideoId.value, targetGroupId, groupVideoCurrentGroupId.value)
    showGroupModal.value = false
    await fetchVideos()
  } catch (error) {
    // Error already handled
  }
}

// 主播
const handleAnchorMenuItem = (): void => {
  if (!contextMenuFile.value) return
  const file = contextMenuFile.value
  closeContextMenu()
  anchorVideoId.value = file.id
  const currentAnchor = getFileAnchor(file)
  if (currentAnchor) {
    anchorVideoCurrentAnchorName.value = currentAnchor.name
    anchorVideoCurrentAnchorId.value = currentAnchor.id
  } else {
    anchorVideoCurrentAnchorName.value = ''
    anchorVideoCurrentAnchorId.value = null
  }
  showAnchorModal.value = true
}

const handleRemoveAnchorMenuItem = async (): Promise<void> => {
  if (!contextMenuFile.value) return
  const file = contextMenuFile.value
  closeContextMenu()
  const currentAnchor = getFileAnchor(file)
  try {
    await updateVideoAnchor(file.id, null, currentAnchor?.id)
    await fetchVideos()
  } catch (error) {
    // Error already handled in composable
  }
}

const handleAnchor = async (anchorName: string): Promise<void> => {
  if (!anchorVideoId.value) return

  const inputValue = anchorName.trim()
  
  if (!inputValue) {
    try {
      await updateVideoAnchor(anchorVideoId.value, null, anchorVideoCurrentAnchorId.value)
      showAnchorModal.value = false
      await fetchVideos()
    } catch (error) {
      // Error already handled
    }
    return
  }

  let targetAnchorId: number | null = null
  const existingAnchor = anchors.value.find(a => a.name === inputValue)
  
  if (existingAnchor) {
    targetAnchorId = existingAnchor.id
  } else {
    try {
      const newAnchor = await createAnchor(inputValue)
      targetAnchorId = newAnchor.id
    } catch (error) {
      return
    }
  }

  try {
    await updateVideoAnchor(anchorVideoId.value, targetAnchorId, anchorVideoCurrentAnchorId.value)
    showAnchorModal.value = false
    await fetchVideos()
  } catch (error) {
    // Error already handled
  }
}

// 产品
const handleProductMenuItem = (): void => {
  if (!contextMenuFile.value) return
  const file = contextMenuFile.value
  closeContextMenu()
  productVideoId.value = file.id
  const currentProduct = getFileProduct(file)
  if (currentProduct) {
    productVideoCurrentProductName.value = currentProduct.name
    productVideoCurrentProductId.value = currentProduct.id
  } else {
    productVideoCurrentProductName.value = ''
    productVideoCurrentProductId.value = null
  }
  showProductModal.value = true
}

const handleRemoveProductMenuItem = async (): Promise<void> => {
  if (!contextMenuFile.value) return
  const file = contextMenuFile.value
  closeContextMenu()
  const currentProduct = getFileProduct(file)
  try {
    await updateVideoProduct(file.id, null, currentProduct?.id)
    await fetchVideos()
  } catch (error) {
    // Error already handled in composable
  }
}

const handleProduct = async (productName: string): Promise<void> => {
  if (!productVideoId.value) return

  const inputValue = productName.trim()
  
  if (!inputValue) {
    try {
      await updateVideoProduct(productVideoId.value, null, productVideoCurrentProductId.value)
      showProductModal.value = false
      await fetchVideos()
    } catch (error) {
      // Error already handled
    }
    return
  }

  let targetProductId: number | null = null
  const existingProduct = products.value.find(p => p.name === inputValue)
  
  if (existingProduct) {
    targetProductId = existingProduct.id
  } else {
    try {
      const newProduct = await createProduct(inputValue)
      targetProductId = newProduct.id
    } catch (error) {
      return
    }
  }

  try {
    await updateVideoProduct(productVideoId.value, targetProductId, productVideoCurrentProductId.value)
    showProductModal.value = false
    await fetchVideos()
  } catch (error) {
    // Error already handled
  }
}

// 删除
const handleDeleteMenuItem = (): void => {
  if (!contextMenuFile.value) return
  const file = contextMenuFile.value
  closeContextMenu()
  deleteVideoId.value = file.id
  deleteVideoName.value = file.name
  showDeleteModal.value = true
}

const handleDelete = async (): Promise<void> => {
  if (!deleteVideoId.value) return
  try {
    await deleteVideo(deleteVideoId.value)
    showDeleteModal.value = false
  } catch (error) {
    // Error already handled
  }
}

// 菜单选择 - 分组、主播、产品筛选相互独立
const handleMenuSelect = (key: string): void => {
  if (key === 'all') {
    // 点击"全部视频"时，清空所有筛选
    activeKey.value = 'all'
    activeGroupId.value = null
    activeAnchorId.value = null
    activeProductId.value = null
    return
  }
  
  // 分组选择
  if (key.startsWith('group-')) {
    const groupId = parseInt(key.replace('group-', ''))
    // 如果点击的是当前已选中的分组，则取消选择
    if (activeGroupId.value === groupId) {
      activeGroupId.value = null
      // 如果所有筛选都为空，设置为 all
      if (activeAnchorId.value === null && activeProductId.value === null) {
        activeKey.value = 'all'
      }
    } else {
      activeGroupId.value = groupId
      // 更新 activeKey，但不清空其他筛选
      activeKey.value = key
    }
  } 
  // 主播选择
  else if (key.startsWith('anchor-')) {
    const anchorId = parseInt(key.replace('anchor-', ''))
    // 如果点击的是当前已选中的主播，则取消选择
    if (activeAnchorId.value === anchorId) {
      activeAnchorId.value = null
      // 如果所有筛选都为空，设置为 all
      if (activeGroupId.value === null && activeProductId.value === null) {
        activeKey.value = 'all'
      }
    } else {
      activeAnchorId.value = anchorId
      // 更新 activeKey，但不清空其他筛选
      activeKey.value = key
    }
  } 
  // 产品选择
  else if (key.startsWith('product-')) {
    const productId = parseInt(key.replace('product-', ''))
    // 如果点击的是当前已选中的产品，则取消选择
    if (activeProductId.value === productId) {
      activeProductId.value = null
      // 如果所有筛选都为空，设置为 all
      if (activeGroupId.value === null && activeAnchorId.value === null) {
        activeKey.value = 'all'
      }
    } else {
      activeProductId.value = productId
      // 更新 activeKey，但不清空其他筛选
      activeKey.value = key
    }
  }
}

// 分组右键菜单
const handleGroupContextMenu = (e: MouseEvent, groupId: number): void => {
  e.preventDefault()
  e.stopPropagation()
  closeAllContextMenus() // 先关闭所有其他右键菜单
  groupContextMenuId.value = groupId
  groupContextMenuPosition.value = { x: e.clientX, y: e.clientY }
  showGroupContextMenu.value = true
}

const closeGroupContextMenu = (): void => {
  showGroupContextMenu.value = false
  groupContextMenuId.value = null
}

const handleRenameGroupMenuItem = (): void => {
  if (!groupContextMenuId.value) return
  const group = groups.value.find(g => g.id === groupContextMenuId.value)
  if (group) {
    renameGroupId.value = group.id
    renameGroupName.value = group.name
    closeGroupContextMenu()
    showRenameGroupModal.value = true
  }
}

const handleRenameGroup = async (newName: string): Promise<void> => {
  if (!renameGroupId.value) return
  try {
    await renameGroup(renameGroupId.value, newName)
    showRenameGroupModal.value = false
  } catch (error) {
    // Error already handled
  }
}

const handleDeleteGroup = async (): Promise<void> => {
  if (!groupContextMenuId.value) return
  try {
    await deleteGroup(groupContextMenuId.value)
    closeGroupContextMenu()
  } catch (error) {
    // Error already handled
  }
}

const handleAddGroupMenuItem = (): void => {
  closeGroupContextMenu()
  showCreateGroupModal.value = true
}

const handleCreateGroup = async (groupName: string): Promise<void> => {
  try {
    await createGroup(groupName)
    showCreateGroupModal.value = false
  } catch (error) {
    // Error already handled
  }
}

// 主播右键菜单
const handleAnchorContextMenu = (e: MouseEvent, anchorId: number): void => {
  e.preventDefault()
  e.stopPropagation()
  closeAllContextMenus() // 先关闭所有其他右键菜单
  anchorContextMenuId.value = anchorId
  anchorContextMenuPosition.value = { x: e.clientX, y: e.clientY }
  showAnchorContextMenu.value = true
}

const closeAnchorContextMenu = (): void => {
  showAnchorContextMenu.value = false
  anchorContextMenuId.value = null
}

const handleRenameAnchorMenuItem = (): void => {
  if (!anchorContextMenuId.value) return
  const anchor = anchors.value.find(a => a.id === anchorContextMenuId.value)
  if (anchor) {
    renameAnchorId.value = anchor.id
    renameAnchorName.value = anchor.name
    closeAnchorContextMenu()
    showRenameAnchorModal.value = true
  }
}

const handleRenameAnchor = async (newName: string): Promise<void> => {
  if (!renameAnchorId.value) return
  try {
    await renameAnchor(renameAnchorId.value, newName)
    showRenameAnchorModal.value = false
  } catch (error) {
    // Error already handled
  }
}

const handleDeleteAnchor = async (): Promise<void> => {
  if (!anchorContextMenuId.value) return
  try {
    await deleteAnchor(anchorContextMenuId.value)
    closeAnchorContextMenu()
  } catch (error) {
    // Error already handled
  }
}

const handleAddAnchorMenuItem = (): void => {
  closeAnchorContextMenu()
  showCreateAnchorModal.value = true
}

const handleCreateAnchor = async (anchorName: string): Promise<void> => {
  try {
    await createAnchor(anchorName)
    showCreateAnchorModal.value = false
  } catch (error) {
    // Error already handled
  }
}

// 产品右键菜单
const handleProductContextMenu = (e: MouseEvent, productId: number): void => {
  e.preventDefault()
  e.stopPropagation()
  closeAllContextMenus() // 先关闭所有其他右键菜单
  productContextMenuId.value = productId
  productContextMenuPosition.value = { x: e.clientX, y: e.clientY }
  showProductContextMenu.value = true
}

const closeProductContextMenu = (): void => {
  showProductContextMenu.value = false
  productContextMenuId.value = null
}

const handleRenameProductMenuItem = (): void => {
  if (!productContextMenuId.value) return
  const product = products.value.find(p => p.id === productContextMenuId.value)
  if (product) {
    renameProductId.value = product.id
    renameProductName.value = product.name
    closeProductContextMenu()
    showRenameProductModal.value = true
  }
}

const handleRenameProduct = async (newName: string): Promise<void> => {
  if (!renameProductId.value) return
  try {
    await renameProduct(renameProductId.value, newName)
    showRenameProductModal.value = false
  } catch (error) {
    // Error already handled
  }
}

const handleDeleteProduct = async (): Promise<void> => {
  if (!productContextMenuId.value) return
  try {
    await deleteProduct(productContextMenuId.value)
    closeProductContextMenu()
  } catch (error) {
    // Error already handled
  }
}

const handleAddProductMenuItem = (): void => {
  closeProductContextMenu()
  showCreateProductModal.value = true
}

const handleCreateProduct = async (productName: string): Promise<void> => {
  try {
    await createProduct(productName)
    showCreateProductModal.value = false
  } catch (error) {
    // Error already handled
  }
}

// 点击外部关闭菜单
const handleClickOutside = (e: MouseEvent): void => {
  const target = e.target as HTMLElement
  
  if (showContextMenu.value && !target.closest('.context-menu')) {
    closeContextMenu()
  }
  
  if (showGroupContextMenu.value && !target.closest('.group-context-menu')) {
    closeGroupContextMenu()
  }
  
  if (showAnchorContextMenu.value && !target.closest('.anchor-context-menu')) {
    closeAnchorContextMenu()
  }
  
  if (showProductContextMenu.value && !target.closest('.product-context-menu')) {
    closeProductContextMenu()
  }
}

</script>

<template>
  <div class="video-manager-container" @dragover="handleDragOver" @drop="handleDrop">
    <n-layout position="absolute">
      <!-- 头部 - 绝对定位，覆盖右侧区域 -->
      <n-layout-header
        style="height: 50px; right: 0; top: 0"
        bordered
      >
        <VideoManagerToolbar
          :is-refreshing="isRefreshing"
          :current-group="currentGroup"
          @refresh="fetchVideos"
          @go-home="router.push('/home')"
          @search="(keyword) => searchKeyword = keyword"
        />
      </n-layout-header>

      <!-- 中间区域 - 包含侧边栏和内容，绝对定位 -->
      <n-layout
        has-sider
        bordered
        position="absolute"
        style="top: 50px; bottom: 0; left: 0; right: 0"
      >
        <!-- 侧边栏 -->
        <n-layout-sider
          bordered
        >
          <VideoManagerSidebar
            :groups="groups"
            :anchors="anchors"
            :products="products"
            :active-key="activeKey"
            :active-group-id="activeGroupId"
            :active-anchor-id="activeAnchorId"
            :active-product-id="activeProductId"
            @menu-select="handleMenuSelect"
            @group-context-menu="handleGroupContextMenu"
            @anchor-context-menu="handleAnchorContextMenu"
            @product-context-menu="handleProductContextMenu"
          />
        </n-layout-sider>

        <!-- 内容区域 -->
        <n-layout content-style="padding: 24px; overflow-y: auto;">
          <div class="file-grid">
            <UploadCard :uploading="isUploading" @select-file="triggerUpload" @select-folder="triggerFolderUpload" />

            <VideoCard
              v-for="file in currentFiles"
              :key="file.id"
              :file="file"
              :selected="selectedFileId === file.id"
              :group="getFileGroup(file)"
              :anchor="getFileAnchor(file)"
              :product="getFileProduct(file)"
              :aspect-ratio="getAspectRatio(file)"
              :video-status="getVideoStatus(file)"
              :video-progress="getVideoProgress(file.id, file)"
              @select="handleFileSelect"
              @context-menu="handleContextMenu"
            />
          </div>
        </n-layout>
      </n-layout>
    </n-layout>

    <!-- 右键菜单 -->
    <VideoContextMenu
      v-if="showContextMenu"
      :file="contextMenuFile"
      :position="contextMenuPosition"
      @rename="handleRenameMenuItem"
      @category="handleCategoryMenuItem"
      @delete="handleDeleteMenuItem"
    />

    <!-- 分组右键菜单 -->
    <GroupContextMenu
      v-if="showGroupContextMenu"
      :position="groupContextMenuPosition"
      type="group"
      @add="handleAddGroupMenuItem"
      @rename="handleRenameGroupMenuItem"
      @delete="handleDeleteGroup"
    />

    <!-- 对话框 -->
    <RenameModal
      v-model:show="showRenameModal"
      :video-name="renameVideoName"
      @confirm="handleRename"
    />

    <GroupModal
      v-model:show="showGroupModal"
      :groups="groups"
      :current-group-name="groupVideoCurrentGroupName"
      @confirm="handleGroup"
    />

    <DeleteModal
      v-model:show="showDeleteModal"
      :video-name="deleteVideoName"
      @confirm="handleDelete"
    />

    <!-- 重命名分组对话框 -->
    <RenameModal
      v-model:show="showRenameGroupModal"
      :video-name="renameGroupName"
      @confirm="handleRenameGroup"
    />

    <!-- 主播对话框 -->
    <AnchorModal
      v-model:show="showAnchorModal"
      :anchors="anchors"
      :current-anchor-name="anchorVideoCurrentAnchorName"
      @confirm="handleAnchor"
    />

    <!-- 产品对话框 -->
    <ProductModal
      v-model:show="showProductModal"
      :products="products"
      :current-product-name="productVideoCurrentProductName"
      @confirm="handleProduct"
    />

    <!-- 统一的分类设置对话框 -->
    <VideoCategoryModal
      v-model:show="showCategoryModal"
      :groups="groups"
      :anchors="anchors"
      :products="products"
      :current-group-name="categoryVideoCurrentGroupName"
      :current-anchor-name="categoryVideoCurrentAnchorName"
      :current-product-name="categoryVideoCurrentProductName"
      @confirm="handleCategoryConfirm"
    />

    <!-- 主播右键菜单 -->
    <GroupContextMenu
      v-if="showAnchorContextMenu"
      :position="anchorContextMenuPosition"
      type="anchor"
      @add="handleAddAnchorMenuItem"
      @rename="handleRenameAnchorMenuItem"
      @delete="handleDeleteAnchor"
    />

    <!-- 产品右键菜单 -->
    <GroupContextMenu
      v-if="showProductContextMenu"
      :position="productContextMenuPosition"
      type="product"
      @add="handleAddProductMenuItem"
      @rename="handleRenameProductMenuItem"
      @delete="handleDeleteProduct"
    />

    <!-- 重命名主播对话框 -->
    <RenameModal
      v-model:show="showRenameAnchorModal"
      :video-name="renameAnchorName"
      @confirm="handleRenameAnchor"
    />

    <!-- 重命名产品对话框 -->
    <RenameModal
      v-model:show="showRenameProductModal"
      :video-name="renameProductName"
      @confirm="handleRenameProduct"
    />

    <!-- 新增分组对话框 -->
    <CreateItemModal
      v-model:show="showCreateGroupModal"
      title="新增分组"
      label="分组名称"
      placeholder="请输入分组名称"
      @confirm="handleCreateGroup"
    />

    <!-- 新增主播对话框 -->
    <CreateItemModal
      v-model:show="showCreateAnchorModal"
      title="新增主播"
      label="主播名称"
      placeholder="请输入主播名称"
      @confirm="handleCreateAnchor"
    />

    <!-- 新增产品对话框 -->
    <CreateItemModal
      v-model:show="showCreateProductModal"
      title="新增产品"
      label="产品名称"
      placeholder="请输入产品名称"
      @confirm="handleCreateProduct"
    />
  </div>
</template>

<style scoped>
.video-manager-container {
  background: #1e1e1e;
  color: #e0e0e0;
  position: relative;
  width: 100%;
  height: 100vh;
  overflow: hidden;
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

</style>
