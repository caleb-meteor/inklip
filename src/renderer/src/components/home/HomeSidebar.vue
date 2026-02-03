<script setup lang="ts">
import { ref, onMounted, computed, nextTick, h } from 'vue'
import { NIcon, NAvatar, NPopconfirm, NInput, NButton, NUpload, NDropdown, NModal, useMessage, useDialog, type UploadFileInfo } from 'naive-ui'
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
  TrashOutline
} from '@vicons/ionicons5'
import type { AiChatTopic } from '../../api/aiChat'
import { getAnchorsApi, createAnchorApi, updateAnchorApi, deleteAnchorApi, type Anchor } from '../../api/anchor'
import { getProductsApi, createProductApi, updateProductApi, deleteProductApi, type Product } from '../../api/product'

defineProps<{
}>()

const emit = defineEmits<{
  (e: 'navigate', path: string): void
}>()

const message = useMessage()
const dialog = useDialog()
const anchors = ref<Anchor[]>([])
const products = ref<Product[]>([])
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

// Context Menu State
const showDropdown = ref(false)
const dropdownX = ref(0)
const dropdownY = ref(0)
const contextMenuAnchor = ref<Anchor | null>(null)
const contextMenuProduct = ref<Product | null>(null)
const contextMenuType = ref<'anchor' | 'product'>('anchor')

const dropdownOptions = [
  { label: '编辑', key: 'edit', icon: () => h(NIcon, null, { default: () => h(PencilOutline) }) },
  { label: '删除', key: 'delete', icon: () => h(NIcon, null, { default: () => h(TrashOutline) }) }
]

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

const getAvatarColor = (name: string): string => {
  const colors = ['#f56a00', '#7265e6', '#ffbf00', '#00a2ae', '#1890ff', '#52c41a', '#eb2f96']
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
    
    message.success('添加主播成功')
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
    
    message.success('添加产品成功')
    return true
  } catch (error) {
    console.error('Failed to add product:', error)
    message.error('添加产品失败')
    return false
  } finally {
    loading.value = false
  }
}

const handleContextMenu = (e: MouseEvent, item: Anchor | Product, type: 'anchor' | 'product') => {
  e.preventDefault()
  showDropdown.value = false
  contextMenuType.value = type
  
  if (type === 'anchor') {
    contextMenuAnchor.value = item as Anchor
    contextMenuProduct.value = null
  } else {
    contextMenuProduct.value = item as Product
    contextMenuAnchor.value = null
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
    }
  } else if (key === 'delete') {
    if (contextMenuType.value === 'anchor' && contextMenuAnchor.value) {
      confirmDeleteAnchor(contextMenuAnchor.value)
    } else if (contextMenuType.value === 'product' && contextMenuProduct.value) {
      confirmDeleteProduct(contextMenuProduct.value)
    }
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

    message.success('更新成功')
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

    message.success('更新成功')
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
        message.success('删除成功')
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
        
        message.success('删除成功')
      } catch (error) {
        message.error('删除失败')
        console.error(error)
      }
    }
  })
}
</script>

<template>
  <div class="chat-sidebar">
    <div class="sidebar-content">
      <!-- 全局素材区域 -->
      <div class="sidebar-group">
        <div class="section-title">全局素材</div>
        <div class="nav-item disabled">
          <n-icon size="14" class="arrow-icon"><ChevronForwardOutline /></n-icon>
          <n-icon size="18" color="#eab308"><PlanetOutline /></n-icon>
          <span>全局素材库</span>
          <span class="pending-tag">待开发</span>
        </div>
      </div>

      <div class="divider"></div>

      <!-- 主播选择区域 -->
      <div class="anchors-section">
        <div class="section-header">
          <div class="section-title" style="margin-bottom: 0;">主播选择</div>
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
                    :size="40"
                    class="anchor-avatar"
                    :src="anchor.avatar || undefined"
                    :style="{ backgroundColor: getAvatarColor(anchor.name), color: '#fff', fontSize: '16px' }"
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
      <div class="anchor-details-section" v-if="selectedAnchorId && currentAnchor">
        <div class="section-title">主播专属素材</div>
        
        <!-- 公共素材 (静态) -->
        <div class="nav-item disabled">
          <n-icon size="14" class="arrow-icon"><ChevronForwardOutline /></n-icon>
          <n-icon size="18" color="#a855f7"><PersonOutline /></n-icon>
          <span>公共素材库</span>
          <span class="pending-tag">待开发</span>
        </div>

        <!-- 产品管理 Header -->
        <div class="section-header" style="margin-top: 6px; margin-bottom: 4px;">
          <div class="section-title" style="margin-bottom: 0;">产品列表</div>
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
              <div class="product-item" @contextmenu="handleContextMenu($event, product, 'product')">
                <div class="nav-item" @click="toggleProduct(product.id)">
                  <n-icon size="14" class="arrow-icon">
                    <ChevronDownOutline v-if="expandedProductIds.includes(product.id)" />
                    <ChevronForwardOutline v-else />
                  </n-icon>
                  <!-- Check if product has cover, otherwise use folder icon -->
                  <div v-if="product.cover" style="width: 18px; height: 18px; border-radius: 2px; overflow: hidden; margin-right: 2px; display: flex; flex-shrink: 0;">
                     <img :src="product.cover" style="width: 100%; height: 100%; object-fit: cover;" />
                  </div>
                  <n-icon v-else size="18" color="#3b82f6"><FolderOpenOutline /></n-icon>
                  <span>{{ product.name }}</span>
                </div>
                
                <!-- 视频列表 (模拟) -->
                <div v-show="expandedProductIds.includes(product.id)" class="videos-list">
                   <!-- 预览图卡片 -->
                  <div class="video-preview-card">
                     <div class="preview-placeholder">
                        <n-icon size="24" color="#fff"><VideocamOutline /></n-icon>
                     </div>
                     <div class="preview-name">开箱评测_V.mp4</div>
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
      
      <div class="anchor-details-section empty-area" v-else-if="anchors.length > 0">
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
  overflow-y: auto;
}

.sidebar-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-title {
  font-size: 11px;
  font-weight: 600;
  color: #71717a;
  margin-bottom: 6px;
  text-transform: capitalize;
  letter-spacing: 0.05em;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 4px;
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
  gap: 8px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
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
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px 6px;
  padding: 4px 0;
}

.anchor-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  cursor: pointer;
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
}

.products-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.videos-list {
  padding-left: 28px; /* Slightly less indentation to give more space */
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
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
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
