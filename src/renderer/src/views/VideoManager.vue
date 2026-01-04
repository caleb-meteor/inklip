<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { NLayout, NLayoutSider, NLayoutHeader, NLayoutContent } from 'naive-ui'
import { useVideoManager } from '../composables/useVideoManager'
import { useVideoGroups } from '../composables/useVideoGroups'
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
import DeleteModal from '../components/DeleteModal.vue'

const router = useRouter()
const wsStore = useWebsocketStore()

// 使用 composables
const {
  allFiles,
  isRefreshing,
  isUploading,
  selectedFileId,
  fetchVideos,
  uploadFile,
  renameVideo,
  deleteVideo,
  getAspectRatio,
  getVideoStatus,
  getVideoProgress
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

// 文件上传相关
const fileInputRef = ref<HTMLInputElement | null>(null)

// 对话框状态
const showRenameModal = ref(false)
const renameVideoId = ref<number | null>(null)
const renameVideoName = ref('')

const showGroupModal = ref(false)
const groupVideoId = ref<number | null>(null)
const groupVideoCurrentGroupName = ref('')

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

// 菜单相关
const activeKey = ref<string | null>('all')

// 搜索关键词
const searchKeyword = ref('')

// 计算属性 - 支持分组过滤和搜索过滤
const currentFiles = computed(() => {
  let filtered = allFiles.value

  // 先按分组过滤
  if (activeGroupId.value !== null) {
    filtered = filtered.filter(file => file.group_id === activeGroupId.value)
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

// 初始化
onMounted(() => {
  fetchVideos()
  fetchGroups()
})

// 文件上传
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
    target.value = ''
  }
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
    const file = e.dataTransfer.files[0]
    if (!file.type.startsWith('video/')) {
      console.warn('Only video files are allowed')
      return
    }
    try {
      const filePath = window.api.getPathForFile(file)
      await uploadFile(filePath)
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
  contextMenuFile.value = file
  contextMenuPosition.value = { x: e.clientX, y: e.clientY }
  showContextMenu.value = true
}

const closeContextMenu = (): void => {
  showContextMenu.value = false
  contextMenuFile.value = null
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

// 分组
const handleGroupMenuItem = (): void => {
  if (!contextMenuFile.value) return
  const file = contextMenuFile.value
  closeContextMenu()
  groupVideoId.value = file.id
  if (file.group_id) {
    const group = groups.value.find(g => g.id === file.group_id)
    groupVideoCurrentGroupName.value = group ? group.name : ''
  } else {
    groupVideoCurrentGroupName.value = ''
  }
  showGroupModal.value = true
}

const handleRemoveGroupMenuItem = async (): Promise<void> => {
  if (!contextMenuFile.value) return
  const file = contextMenuFile.value
  closeContextMenu()
  try {
    await updateVideoGroup(file.id, null)
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
      await updateVideoGroup(groupVideoId.value, null)
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
    await updateVideoGroup(groupVideoId.value, targetGroupId)
    showGroupModal.value = false
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

// 菜单选择
const handleMenuSelect = (key: string): void => {
  // 如果点击的是当前已选中的节点，则取消选择
  if (key === activeKey.value) {
    activeKey.value = 'all'
    activeGroupId.value = null
    return
  }
  
  activeKey.value = key
  
  if (key.startsWith('group-')) {
    const groupId = parseInt(key.replace('group-', ''))
    activeGroupId.value = groupId
  } else if (key === 'all') {
    activeGroupId.value = null
  }
}

// 分组右键菜单
const handleGroupContextMenu = (e: MouseEvent, groupId: number): void => {
  e.preventDefault()
  e.stopPropagation()
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

// 点击外部关闭菜单
const handleClickOutside = (e: MouseEvent): void => {
  const target = e.target as HTMLElement
  
  if (showContextMenu.value && !target.closest('.context-menu')) {
    closeContextMenu()
  }
  
  if (showGroupContextMenu.value && !target.closest('.group-context-menu')) {
    closeGroupContextMenu()
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
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
            :active-key="activeKey"
            @menu-select="handleMenuSelect"
            @group-context-menu="handleGroupContextMenu"
          />
        </n-layout-sider>

        <!-- 内容区域 -->
        <n-layout content-style="padding: 24px; overflow-y: auto;">
          <input
            ref="fileInputRef"
            type="file"
            accept="video/*"
            style="display: none"
            @change="handleFileChange"
          />

          <div class="file-grid">
            <UploadCard :uploading="isUploading" @click="triggerUpload" />

            <VideoCard
              v-for="file in currentFiles"
              :key="file.id"
              :file="file"
              :selected="selectedFileId === file.id"
              :group="getFileGroup(file)"
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
      @group="handleGroupMenuItem"
      @remove-group="handleRemoveGroupMenuItem"
      @delete="handleDeleteMenuItem"
    />

    <!-- 分组右键菜单 -->
    <GroupContextMenu
      v-if="showGroupContextMenu"
      :position="groupContextMenuPosition"
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
