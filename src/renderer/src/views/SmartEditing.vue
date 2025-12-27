<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  NInputNumber,
  NInput,
  NCheckbox,
  NEllipsis,
  NEmpty,
  NModal,
  NLayout,
  NLayoutHeader,
  NLayoutContent,
  NLayoutSider,
  NIcon,
  NButton,
  NSpace,
  NSelect,
  useMessage
} from 'naive-ui'
import { ChevronBack, AddOutline, Cut, CloseOutline, SearchOutline } from '@vicons/ionicons5'
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
  imageError?: boolean
}

export interface HistoryItem {
  id: number
  userId?: number
  video_id?: string
  prompt?: string
  min_duration?: number
  max_duration?: number
  status: 'processing' | 'completed' | 'failed'
  output_path?: string
  output_cover?: string
  created_at?: string
  updated_at?: string
  name: string
  subtitle?: string
  path?: string
  cover?: string
  duration?: number
  width?: number
  height?: number
  size?: string
  createTime: string
  imageError?: boolean
}

export type MediaItem = FileItem | HistoryItem

import {
  getVideosApi,
  smartCutApi,
  getSmartCutsApi,
  getPromptBuiltinsApi,
  type PromptBuiltin
} from '../api/video'
import HistoryItemCard from '../components/HistoryItemCard.vue'
import VideoPreviewPlayer from '../components/VideoPreviewPlayer.vue'
import { useWebsocketStore } from '../stores/websocket'

const wsStore = useWebsocketStore()

const router = useRouter()
const allFiles = ref<FileItem[]>([])

const fetchVideos = async (): Promise<void> => {
  try {
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
      status: item.status
    }))
  } catch (error) {
    console.error('Failed to fetch videos', error)
  }
}

const formatSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const videoFiles = computed(() => {
  return allFiles.value.filter((file) => file.type === 'video')
})

const searchKeyword = ref('')
const showSelector = ref(false)
const selectedVideoIds = ref<number[]>([])
const tempSelectedIds = ref<number[]>([])

const selectedVideos = computed(() => {
  return allFiles.value.filter((file) => selectedVideoIds.value.includes(file.id))
})

const openSelector = async (): Promise<void> => {
  searchKeyword.value = '' // Clear search keyword when opening
  tempSelectedIds.value = [...selectedVideoIds.value]
  await fetchVideos() // Refresh video list
  showSelector.value = true
}

const confirmSelection = (): void => {
  selectedVideoIds.value = [...tempSelectedIds.value]
  showSelector.value = false
}

const toggleSelection = (id: number): void => {
  const video = allFiles.value.find((v) => v.id === id)
  if (video && video.status !== 1) {
    message.warning('只能选择已处理完成的视频')
    return
  }

  const index = tempSelectedIds.value.indexOf(id)
  if (index > -1) {
    tempSelectedIds.value.splice(index, 1)
  } else {
    if (tempSelectedIds.value.length >= 3) {
      message.warning('最多只能选择 3 个视频')
      return
    }
    tempSelectedIds.value.push(id)
  }
}
const removeVideo = (id: number): void => {
  selectedVideoIds.value = selectedVideoIds.value.filter((vId) => vId !== id)
}

const filteredVideoFiles = computed(() => {
  if (!searchKeyword.value) return videoFiles.value
  const keyword = searchKeyword.value.toLowerCase()
  return videoFiles.value.filter((file) => file.name.toLowerCase().includes(keyword))
})
const goBack = (): void => {
  router.push('/home')
}

const message = useMessage()
const isProcessing = ref(false)
const promptText = ref('')
const builtInPrompts = ref<PromptBuiltin[]>([])

const fetchBuiltInPrompts = async (): Promise<void> => {
  const res = await getPromptBuiltinsApi()
  builtInPrompts.value = res.list
}

// Prompt Logic
const selectedSchemeValue = ref<string | null>(null) // Stores either ID or 'custom'
const selectedPromptMode = computed(() =>
  selectedSchemeValue.value === 'custom' ? 'custom' : 'builtin'
)

const schemeOptions = computed(() => {
  console.log(builtInPrompts.value)
  const options = builtInPrompts.value.map((item) => ({
    label: item.name,
    value: String(item.id)
  }))
  // Add Custom Option
  options.push({
    label: '自定义方案',
    value: 'custom'
  })
  return options
})

const handleSchemeChange = (val: string): void => {
  selectedSchemeValue.value = val

  if (val === 'custom') {
    // If switching TO custom, clear text if it matches a builtin description (avoid confusion)
    const isBuiltinDesc = builtInPrompts.value.some((b) => b.description === promptText.value)
    if (isBuiltinDesc) {
      promptText.value = ''
    }
  } else {
    // Switching TO a builtin
    const item = builtInPrompts.value.find((b) => String(b.id) === val)
    if (item) {
      promptText.value = item.description
    }
  }
}

// Duration Parameters
const minDuration = ref(80)
const maxDuration = ref(100)

const totalSelectedDuration = computed(() => {
  return selectedVideos.value.reduce((acc, video) => acc + (video.duration || 0), 0)
})

const durationError = computed(() => {
  if (!minDuration.value || !maxDuration.value) return '时长不能为空'
  if (minDuration.value >= maxDuration.value) return '最小时长必须小于最大时长'
  if (maxDuration.value > totalSelectedDuration.value) {
    return `最大时长不能超过总时长 (${Math.floor(totalSelectedDuration.value)}s)`
  }
  return ''
})

const handleStartSmartCut = async (prompt?: string, min?: number, max?: number): Promise<void> => {
  if (!selectedVideoIds.value.length) {
    message.warning('请先选择要剪辑的视频')
    return
  }

  const outMin = min !== undefined ? min : minDuration.value
  const outMax = max !== undefined ? max : maxDuration.value

  // Robust validation
  if (!outMin || !outMax) {
    message.error('请输入有效的时长参数')
    return
  }

  const total = totalSelectedDuration.value
  if (outMax > total) {
    message.error(`最大时长 (${outMax}s) 不能超过视频总时长 (${Math.floor(total)}s)`)
    return
  }
  if (outMin >= outMax) {
    message.error('最小时长必须小于最大时长')
    return
  }
  if (outMin < 1) {
    message.error('最小时长不能少于 1 秒')
    return
  }

  try {
    isProcessing.value = true
    message.info('任务提交成功，等待处理...')

    const res = await smartCutApi(
      selectedVideoIds.value,
      prompt || promptText.value,
      outMin,
      outMax
    )

    message.success(`剪辑完成！`)
    console.log('Smart cut response:', res)

    // Refresh history
    fetchHistory()
    fetchVideos()
    promptText.value = ''
  } catch (error) {
    console.error('Smart cut failed:', error)
    message.error('任务提交失败，请检查网络或重试')
  } finally {
    isProcessing.value = false
  }
}

const historyList = ref<HistoryItem[]>([])
const historyPage = ref(1)
const historyPageSize = ref(15)
const hasMoreHistory = ref(true)
const playingVideoId = ref<number | null>(null)
const isHistoryLoading = ref(false)

const mapStatus = (status: number): 'processing' | 'completed' | 'failed' => {
  switch (status) {
    case 0:
      return 'processing'
    case 1:
      return 'completed'
    case 2:
      return 'failed'
    default:
      return 'processing'
  }
}

const fetchHistory = async (isLoadMore = false): Promise<void> => {
  if (isHistoryLoading.value || (!hasMoreHistory.value && isLoadMore)) return

  try {
    isHistoryLoading.value = true
    if (!isLoadMore) {
      historyPage.value = 1
      historyList.value = []
    }

    const res = await getSmartCutsApi(historyPage.value, historyPageSize.value)
    if (!res || !res.list) {
      hasMoreHistory.value = false
      return
    }

    const newItems: HistoryItem[] = res.list.map((item) => ({
      id: item.id,
      name: item.name || '未命名任务',
      status: mapStatus(item.status),
      subtitle: item.subtitle,
      path: item.path,
      cover: item.cover,
      duration: item.duration,
      width: item.width,
      height: item.height,
      size: item.size ? formatSize(item.size) : '',
      createTime: item.created_at ? item.created_at.replace('T', ' ').substring(0, 16) : '未知时间'
    }))

    if (isLoadMore) {
      historyList.value.push(...newItems)
    } else {
      historyList.value = newItems
    }

    hasMoreHistory.value = historyList.value.length < res.total
    if (hasMoreHistory.value) {
      historyPage.value++
    }
  } catch (err) {
    console.error('Failed to fetch history:', err)
  } finally {
    isHistoryLoading.value = false
  }
}

const handleHistoryScroll = (e: Event): void => {
  const target = e.target as HTMLElement
  if (target.scrollHeight - target.scrollTop - target.clientHeight < 20) {
    fetchHistory(true)
  }
}

const handlePlay = (item: HistoryItem): void => {
  if (playingVideoId.value === item.id) {
    playingVideoId.value = null
  } else {
    playingVideoId.value = item.id
  }
}

const getAspectRatio = (file: FileItem): string => {
  if (file.width && file.height) {
    return `${file.width} / ${file.height}`
  }
  return '9 / 16'
}

watch(
  () => wsStore.smartCutUpdated,
  () => {
    fetchHistory(false)
  }
)

onMounted(() => {
  fetchVideos()
  fetchHistory()
  fetchBuiltInPrompts()
})

const handleExport = async (item: HistoryItem): Promise<void> => {
  if (!item.path) {
    message.error('视频文件不存在，无法导出')
    return
  }

  try {
    const fileName = item.name.endsWith('.mp4') ? item.name : `${item.name}.mp4`
    const loadingMsg = message.loading('正在准备...', { duration: 0 })

    const result = await window.api.downloadVideo(item.path, fileName)
    loadingMsg.destroy()

    if (result.success) {
      message.success(`已保存至: ${result.path}`)
    } else if (result.canceled) {
      message.info('已取消保存')
    } else {
      message.error(`保存失败: ${result.error}`)
    }
  } catch (error) {
    console.error('[Renderer] Save error:', error)
    message.error('保存过程中发生错误')
  }
}
</script>

<template>
  <div class="smart-editing-container">
    <n-layout style="height: 100vh; background: #1e1e1e">
      <n-layout-header bordered class="header">
        <div class="header-content">
          <n-space align="center">
            <n-button text class="go-back-btn" @click="goBack">
              <n-icon><ChevronBack /></n-icon>
            </n-button>
            <span class="header-title">智能剪辑</span>
          </n-space>
          <div class="header-right-title">
            <span>剪辑历史</span>
          </div>
        </div>
      </n-layout-header>

      <n-layout has-sider style="height: calc(100vh - 60px)">
        <!-- Left Side: Main Action Area -->
        <n-layout-content content-style="padding: 24px;">
          <!-- Empty State / Initial Action -->
          <div v-if="selectedVideos.length === 0" class="empty-state-card" @click="openSelector">
            <div class="empty-content">
              <div class="empty-icon-bg">
                <n-icon size="48" color="#63e2b7"><AddOutline /></n-icon>
              </div>
              <div class="empty-text-group">
                <div class="empty-title">开始新任务</div>
                <div class="empty-desc">点击选择视频或将视频拖入此处</div>
              </div>
              <n-button type="primary" color="#63e2b7" quaternary style="margin-top: 16px">
                选择视频
              </n-button>
            </div>
          </div>

          <!-- Selected Videos workspace -->
          <div v-else class="content-wrapper">
            <div class="workspace-container">
              <!-- Upper Part: Videos and Actions -->
              <div class="video-workspace">
                <div class="section-header">
                  <span style="font-size: 16px; font-weight: 500">
                    已选择 {{ selectedVideos.length }}/3 个视频
                    <span class="header-total-duration">
                      (当前总计 {{ Math.floor(totalSelectedDuration) }}s)
                    </span>
                  </span>
                </div>

                <div class="video-list-compact">
                  <div v-for="video in selectedVideos" :key="video.id" class="compact-video-card">
                    <div class="compact-card-top">
                      <VideoPreviewPlayer
                        :path="video.path"
                        :name="video.name"
                        :cover="video.cover"
                        :duration="video.duration"
                        :aspect-ratio="getAspectRatio(video)"
                      />
                      <div class="remove-btn-compact" @click.stop="removeVideo(video.id)">
                        <n-icon><CloseOutline /></n-icon>
                      </div>
                    </div>
                    <div class="compact-card-info">
                      <n-ellipsis class="compact-name">{{ video.name }}</n-ellipsis>
                    </div>
                  </div>

                  <div
                    v-if="selectedVideos.length < 3"
                    class="compact-video-card add-placeholder"
                    @click="openSelector"
                  >
                    <div class="add-placeholder-content">
                      <n-icon size="24" color="#444"><AddOutline /></n-icon>
                      <span>添加视频</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Parameters Configuration Section -->
              <!-- New Horizontal Control Bar -->
              <div class="control-bar-wrapper">
                <div class="smart-control-bar">
                  <!-- Duration Group -->
                  <div class="control-group">
                    <span class="control-label">时长</span>
                    <n-input-number
                      v-model:value="minDuration"
                      :min="1"
                      placeholder="Min"
                      class="bar-input"
                      size="small"
                      :show-button="false"
                    />
                    <span class="range-separator">-</span>
                    <n-input-number
                      v-model:value="maxDuration"
                      :min="1"
                      :max="Math.floor(totalSelectedDuration) || 300"
                      placeholder="Max"
                      class="bar-input"
                      size="small"
                      :show-button="false"
                    />
                    <span class="unit">s</span>
                  </div>

                  <div class="bar-divider"></div>

                  <!-- Scheme Group -->
                  <div class="control-group scheme-group">
                    <span class="control-label">方案</span>
                    <n-select
                      v-model:value="selectedSchemeValue"
                      :options="schemeOptions"
                      placeholder="请选择方案"
                      size="small"
                      class="scheme-select"
                      @update:value="handleSchemeChange"
                    />
                  </div>

                  <div class="bar-divider"></div>

                  <!-- Start Action -->
                  <n-button
                    type="primary"
                    color="#63e2b7"
                    class="bar-start-btn"
                    :loading="isProcessing"
                    @click="handleStartSmartCut()"
                  >
                    <template #icon
                      ><n-icon><Cut /></n-icon
                    ></template>
                    开始剪辑
                  </n-button>
                </div>

                <!-- Duration Error Hint -->
                <Transition name="fade">
                  <div v-if="durationError" class="bar-error-hint">
                    {{ durationError }}
                  </div>
                </Transition>

                <!-- Custom Prompt Edit Area (Conditional) -->
                <Transition name="slide-down">
                  <div v-if="selectedPromptMode === 'custom'" class="custom-edit-area">
                    <n-input
                      v-model:value="promptText"
                      type="textarea"
                      placeholder="请输入您的自定义剪辑方案..."
                      :rows="3"
                      class="custom-textarea"
                    />
                  </div>
                </Transition>
              </div>
            </div>
          </div>
        </n-layout-content>
        <!-- Right Side: History -->
        <n-layout-sider
          bordered
          width="260"
          content-style="padding: 0 24px 24px 24px; background: #252526;"
        >
          <div class="history-container">
            <!-- Header title moved to top layout header -->

            <div class="history-list" @scroll="handleHistoryScroll">
              <HistoryItemCard
                v-for="item in historyList"
                :key="item.id"
                :item="item"
                @play="handlePlay"
                @export="handleExport"
              />

              <!-- Loading / No More indicators -->
              <div v-if="isHistoryLoading" class="history-loading">加载中...</div>
              <div v-else-if="!hasMoreHistory && historyList.length > 0" class="history-nomore">
                没有更多了
              </div>
              <div v-else-if="historyList.length === 0 && !isHistoryLoading" class="history-empty">
                暂无记录
              </div>
            </div>
          </div>
        </n-layout-sider>
      </n-layout>
    </n-layout>

    <!-- Video Selector Modal -->
    <n-modal
      v-model:show="showSelector"
      preset="card"
      title="选择视频"
      style="width: 600px; max-width: 90%"
    >
      <div v-if="videoFiles.length === 0" style="text-align: center; padding: 20px">
        暂无视频文件，请先去文件管理上传
      </div>
      <template v-else>
        <n-input
          v-model:value="searchKeyword"
          placeholder="搜索视频名称..."
          clearable
          style="margin-bottom: 16px"
        >
          <template #prefix>
            <n-icon><SearchOutline /></n-icon>
          </template>
        </n-input>
        <div v-if="filteredVideoFiles.length > 0" class="file-grid-modal">
          <div
            v-for="file in filteredVideoFiles"
            :key="file.id"
            class="file-item-modal"
            :class="{
              selected: tempSelectedIds.includes(file.id),
              disabled: file.status !== 1
            }"
            @click="file.status === 1 && toggleSelection(file.id)"
          >
            <div class="checkbox-overlay" :class="{ is_active: tempSelectedIds.includes(file.id) }">
              <n-checkbox
                :checked="tempSelectedIds.includes(file.id)"
                @update:checked="() => toggleSelection(file.id)"
                @click.stop
              />
            </div>
            <div class="icon-wrapper-modal">
              <VideoPreviewPlayer
                :path="file.path"
                :name="file.name"
                :cover="file.cover"
                :duration="file.duration"
                :status="mapStatus(file.status || 0)"
                :aspect-ratio="getAspectRatio(file)"
              />
            </div>
            <n-ellipsis style="max-width: 100%; margin-top: 6px; font-size: 11px">{{
              file.name
            }}</n-ellipsis>
          </div>
        </div>
        <n-empty v-else description="没有找到匹配的视频" style="padding: 24px" />
      </template>
      <template #footer>
        <n-space justify="end">
          <n-button @click="showSelector = false">取消</n-button>
          <n-button type="primary" @click="confirmSelection">确定</n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<style scoped>
.smart-editing-container {
  height: 100vh;
  color: #e0e0e0;
}

.header {
  height: 60px;
  padding: 0 24px;
  background: #252526;
  border-bottom: 1px solid #1e1e1e !important;
}

.header-content {
  height: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-right-title {
  width: 212px; /* 260px (sider width) - 24px (sider left padding) - 24px (header padding) */
  text-align: left;
  font-size: 16px;
  font-weight: bold;
  color: #e0e0e0;
  display: flex;
  align-items: center;
}

.empty-state-card {
  margin-top: 40px;
  width: 100%;
  max-width: 600px;
  margin-left: auto;
  margin-right: auto;
  background: #242424;
  border: 2px dashed #444;
  border-radius: 20px;
  padding: 60px 40px;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-state-card:hover {
  border-color: #63e2b7;
  background: rgba(99, 226, 183, 0.05);
  transform: translateY(-2px);
}

.empty-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.empty-icon-bg {
  width: 80px;
  height: 80px;
  background: #1a1a1a;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.empty-text-group {
  text-align: center;
}

.empty-title {
  font-size: 18px;
  font-weight: 600;
  color: #fff;
  margin-bottom: 4px;
}

.empty-desc {
  font-size: 13px;
  color: #666;
}

.content-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.workspace-container {
  display: flex;
  flex-direction: column;
  gap: 32px;
  width: 100%;
  max-width: 1000px;
  padding: 0 20px;
  margin: 0 auto;
}

.video-workspace {
  width: 100%;
  background: rgba(255, 255, 255, 0.01);
  padding: 24px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.config-workspace {
  width: 100%;
  background: rgba(40, 40, 40, 0.3);
  padding: 24px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.config-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.config-title {
  font-size: 14px;
  font-weight: 600;
  color: #63e2b7;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.config-row {
  display: flex;
  gap: 16px;
}

.config-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.config-item.half {
  flex: 1;
}

.config-label {
  font-size: 12px;
  color: #888;
  font-weight: 500;
}

.config-input :deep(.n-input__border),
.config-input-num :deep(.n-input__border) {
  border-color: rgba(255, 255, 255, 0.1) !important;
}

.config-input :deep(.n-input:not(.n-input--disabled).n-input--focus .n-input__border),
.config-input-num :deep(.n-button:hover + .n-input__border) {
  border-color: #63e2b7 !important;
}

.config-input-num {
  width: 100% !important;
}

.action-workspace-bottom {
  width: 100%;
  display: flex;
  justify-content: center;
}

.action-grid-horizontal {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  width: 100%;
}

.workspace-lower {
  padding-top: 8px;
}

.duration-bar {
  display: flex;
  align-items: center;
  gap: 32px;
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0.01));
  padding: 20px 32px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
}

.duration-label {
  font-size: 15px;
  color: #ccc;
  font-weight: 500;
  letter-spacing: 0.5px;
}

.total-hint-box {
  margin-left: auto;
  font-size: 12px;
  color: #63e2b7;
  background: rgba(99, 226, 183, 0.1);
  padding: 6px 16px;
  border-radius: 20px;
  border: 1px solid rgba(99, 226, 183, 0.2);
}

.header-total-duration {
  font-weight: normal;
  font-size: 13px;
  color: #888;
  margin-left: 12px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #aaa;
}

.video-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 16px;
}

.selected-video-card {
  background: #242424;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid #333;
  position: relative;
  transition: all 0.3s ease;
  display: flex;
  flex-direction: column;
}

.selected-video-card:hover {
  border-color: #63e2b7;
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.compact-card-top {
  position: relative;
  width: 100%;
}

.remove-btn-compact {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 30;
  width: 22px;
  height: 22px;
  background: rgba(0, 0, 0, 0.7);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #fff;
  transition: all 0.2s;
  backdrop-filter: blur(4px);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.remove-btn-compact {
  opacity: 1;
}

.remove-btn-compact:hover {
  background: #ff4d4f;
  transform: scale(1.1);
}

.add-placeholder {
  border: 2px dashed #444;
  background: rgba(255, 255, 255, 0.02);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 9/16;
  transition: all 0.3s;
}

.add-placeholder:hover {
  border-color: #63e2b7;
  background: rgba(99, 226, 183, 0.03);
}

.add-placeholder-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: #555;
  font-size: 12px;
}

.add-placeholder:hover .add-placeholder-content {
  color: #63e2b7;
}

.remove-btn {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 20;
  width: 24px;
  height: 24px;
  background: rgba(0, 0, 0, 0.6);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #fff;
  opacity: 0;
  transition: all 0.2s;
  backdrop-filter: blur(4px);
}

.selected-video-card:hover .remove-btn {
  opacity: 1;
}

.remove-btn:hover {
  background: #ff4d4f;
  transform: scale(1.1);
}

.add-video-card {
  background: rgba(255, 255, 255, 0.02);
  border-radius: 12px;
  border: 1px dashed #444;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
  min-height: 180px;
}

.add-video-card:hover {
  border-color: #63e2b7;
  background: rgba(99, 226, 183, 0.05);
}

.add-card-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: #666;
  font-size: 14px;
}

.add-video-card:hover .add-card-content {
  color: #63e2b7;
}

.add-video-card:hover .add-card-content n-icon {
  color: #63e2b7;
}

.card-top {
  width: 100%;
}

.card-info {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.video-name {
  font-size: 13px;
  font-weight: 500;
  color: #e0e0e0;
  margin-bottom: 2px;
}

.video-meta {
  font-size: 11px;
  color: #666;
}

.video-list-compact {
  display: flex;
  justify-content: center;
  gap: 20px;
  overflow-x: auto;
  padding: 8px 4px;
  margin-top: 16px;
}

.compact-video-card {
  flex: 1;
  min-width: 100px;
  max-width: 180px;
  background: #2a2a2a;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid #3a3a3a;
  position: relative;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.compact-video-card:hover {
  transform: translateY(-4px);
  border-color: #63e2b7;
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.3);
}

.bottom-controls {
  margin-top: 24px;
  border-top: 1px solid #333;
  padding-top: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.config-compact-section {
  background: rgba(255, 255, 255, 0.02);
  padding: 16px;
  border-radius: 8px;
  border: 1px solid #333;
}

.config-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
}

.config-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.tiny-label {
  font-size: 12px;
  color: #666;
  white-space: nowrap;
}

.action-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.action-card-small {
  padding: 16px 24px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 16px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border: 1px solid rgba(255, 255, 255, 0.05);
  position: relative;
  overflow: hidden;
}

.action-card-small.primary {
  background: linear-gradient(135deg, rgba(99, 226, 183, 0.1) 0%, rgba(99, 226, 183, 0.05) 100%);
  border-color: rgba(99, 226, 183, 0.2);
  color: #63e2b7;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
}

.action-card-small.primary:hover {
  background: linear-gradient(135deg, rgba(99, 226, 183, 0.2) 0%, rgba(99, 226, 183, 0.1) 100%);
  border-color: #63e2b7;
  transform: translateY(-4px);
  box-shadow: 0 8px 25px rgba(99, 226, 183, 0.2);
}

.action-card-small.secondary {
  background: rgba(255, 255, 255, 0.03);
  color: #aaa;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
}

.action-card-small.secondary:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.2);
  color: #fff;
  transform: translateY(-4px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
}

.card-labels {
  display: flex;
  flex-direction: column;
}

.card-main-title {
  font-size: 14px;
  font-weight: 600;
}

.card-sub-title {
  font-size: 11px;
  opacity: 0.6;
}

.action-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid #333;
  border-radius: 12px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 20px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.action-card:hover {
  background: rgba(99, 226, 183, 0.05);
  border-color: #63e2b7;
  transform: scale(1.02);
}

.action-card-icon {
  width: 60px;
  height: 60px;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.action-title {
  font-size: 16px;
  font-weight: 500;
  color: #fff;
  margin-bottom: 4px;
}

.action-desc {
  font-size: 13px;
  color: #666;
}

.action-card:hover .action-desc {
  color: #888;
}

/* Custom Modal Styling */
.custom-modal {
  border-radius: 16px !important;
  background: #1e1e20 !important;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4) !important;
  border: 1px solid rgba(255, 255, 255, 0.05) !important;
}

:deep(.custom-modal .n-card-header__main) {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: #fff;
}

.modal-section {
  margin-bottom: 28px;
}

.modal-section:last-child {
  margin-bottom: 0;
}

.modal-section-title {
  font-size: 13px;
  font-weight: 600;
  color: #888;
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 1px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.modal-section-title::before {
  content: '';
  display: inline-block;
  width: 3px;
  height: 14px;
  background: #63e2b7;
  border-radius: 2px;
}

.prompt-modal-body {
  padding: 8px 4px;
}

.prompt-modal-footer {
  margin-top: 32px;
  display: flex;
  justify-content: flex-end;
  gap: 16px;
}

.modal-prompt-input {
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.02) !important;
}

.modal-prompt-input :deep(.n-input__border) {
  border-color: rgba(255, 255, 255, 0.1) !important;
}

.modal-prompt-input :deep(.n-input:not(.n-input--disabled).n-input--focus .n-input__border) {
  border-color: #63e2b7 !important;
  box-shadow: 0 0 0 2px rgba(99, 226, 183, 0.2) !important;
}

.modal-prompt-input :deep(.n-input__description) {
  color: #555;
  font-size: 12px;
}

/* Button Refinement */
.btn-cancel {
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
  background: transparent !important;
  color: #aaa !important;
  transition: all 0.3s !important;
  border-radius: 8px !important;
}

.btn-cancel:hover {
  background: rgba(255, 255, 255, 0.05) !important;
  color: #fff !important;
  border-color: rgba(255, 255, 255, 0.2) !important;
}

.btn-submit {
  background: linear-gradient(135deg, #63e2b7 0%, #34d399 100%) !important;
  border: none !important;
  color: #000 !important;
  font-weight: 700 !important;
  border-radius: 8px !important;
  box-shadow: 0 4px 12px rgba(99, 226, 183, 0.3) !important;
  transition: all 0.3s !important;
}

/* Duration Input Refinement */
:deep(.modal-section .n-input-number) {
  background: rgba(255, 255, 255, 0.03) !important;
  border-radius: 8px !important;
}

:deep(.modal-section .n-input-number .n-input__border) {
  border-color: rgba(255, 255, 255, 0.1) !important;
}

:deep(.modal-section .n-input-number:hover .n-input__border) {
  border-color: rgba(99, 226, 183, 0.5) !important;
}

.modal-section span {
  font-weight: 500;
  color: #555;
  font-size: 13px;
}

.duration-error-hint {
  margin-top: 8px;
  font-size: 12px;
  color: #f0a020;
  background: rgba(240, 160, 32, 0.1);
  padding: 4px 12px;
  border-radius: 4px;
  display: inline-block;
}

.btn-submit:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(99, 226, 183, 0.4) !important;
  filter: brightness(1.1);
}

.btn-submit:active {
  transform: translateY(0);
}

.history-container {
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* Removed unused history header style as title is now in layout header */

.history-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow-y: auto;
  flex: 1;
  padding: 6px 4px 8px 0; /* Minimal top/bottom padding */
}

.go-back-btn {
  font-size: 20px;
  margin-right: 12px;
}

.header-title {
  font-size: 18px;
  font-weight: bold;
}

.history-loading,
.history-nomore,
.history-empty {
  padding: 16px;
  text-align: center;
  color: #888;
  font-size: 12px;
}

/* Video Player Styles */
.player-wrapper {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.player-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid #333;
}

.playing-title {
  font-size: 16px;
  font-weight: 500;
  color: #e0e0e0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.video-container {
  flex: 1;
  background: #000;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
}

.main-video {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
}

.smart-control-bar {
  display: flex;
  align-items: center;
  background: #2a2a2a;
  border-radius: 12px;
  padding: 8px 16px;
  border: 1px solid #3a3a3a;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  flex-wrap: nowrap; /* Force single line */
  overflow-x: auto; /* Allow scroll if screen is too small, though max-width should prevent */
}

.control-group {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap; /* Prevent wrapping */
  flex-shrink: 0;
}

.control-label {
  font-size: 13px;
  color: #888;
  font-weight: 500;
  margin-right: 4px;
  white-space: nowrap;
}

.scheme-select {
  width: 140px;
}

.range-separator {
  color: #666;
}

.unit {
  font-size: 12px;
  color: #666;
  margin-left: 2px;
}

.bar-divider {
  width: 1px;
  height: 20px;
  background: #444;
  margin: 0 16px; /* Reduce margin */
  flex-shrink: 0;
}

.bar-start-btn {
  margin-left: auto; /* Push to right */
  padding: 0 20px;
  font-weight: bold;
  height: 32px; /* Slightly smaller */
  border-radius: 16px;
  white-space: nowrap;
  flex-shrink: 0;
}
.player-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 8px;
}

.player-meta {
  display: flex;
  align-items: center;
  gap: 12px;
}

.player-time {
  font-size: 12px;
  color: #888;
}

.close-player-btn {
  color: #aaa;
  transition: color 0.2s;
}

.close-player-btn:hover {
  color: #63e2b7;
}

/* Modal Grid Styles */
.file-grid-modal {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 16px;
  max-height: 400px;
  overflow-y: auto;
  padding: 4px;
}

.file-item-modal {
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  padding: 8px;
  border-radius: 6px;
  border: 1px solid transparent;
  position: relative;
  transition: all 0.2s;
}

.file-item-modal:hover {
  background: rgba(255, 255, 255, 0.05);
}

.file-item-modal.selected {
  background: rgba(99, 226, 183, 0.1);
  border-color: rgba(99, 226, 183, 0.4);
}

.checkbox-overlay {
  position: absolute;
  top: 6px;
  left: 6px;
  z-index: 10;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  border-radius: 6px;
  padding: 4px;
  line-height: 0;
  transition: all 0.2s;
}

.checkbox-overlay.is_active {
  background: #63e2b7;
}

.icon-wrapper-modal {
  width: 100%;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #333;
  transition: border-color 0.2s;
}

.file-item-modal:hover .icon-wrapper-modal {
  border-color: #63e2b7;
}

.cover-wrapper-modal {
  width: 100%;
  position: relative;
}

.video-cover-modal {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.duration-badge-modal {
  position: absolute;
  bottom: 4px;
  right: 4px;
  background: rgba(0, 0, 0, 0.75);
  color: white;
  padding: 1px 4px;
  border-radius: 2px;
  font-size: 10px;
}

.file-item-modal.disabled {
  opacity: 0.5;
  cursor: not-allowed;
  filter: grayscale(0.5);
}

.file-item-modal.disabled:hover .icon-wrapper-modal {
  border-color: #333;
}

.builtin-prompts {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-top: 12px;
}

.builtin-list {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.builtin-tag {
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.builtin-tag.active-tag {
  background: rgba(99, 226, 183, 0.2) !important;
  color: #63e2b7 !important;
  border-color: #63e2b7 !important;
  font-weight: 500;
}

.builtin-tag:hover {
  border-color: #63e2b7;
}

.custom-prompt-btn {
  height: 28px;
}

.selected-prompt-preview {
  margin-top: 12px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  padding: 12px;
}

.preview-label {
  font-size: 11px;
  color: #63e2b7;
  margin-bottom: 4px;
}

.preview-content {
  font-size: 13px;
  color: #ccc;
  line-height: 1.4;
  white-space: pre-wrap;
}

.single-action {
  display: flex !important;
  grid-template-columns: none !important;
}

.full-width {
  width: 100%;
  justify-content: center;
  height: 56px;
  background: #63e2b7 !important;
  color: #000 !important;
  border: none !important;
}

.full-width:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(99, 226, 183, 0.4);
  filter: brightness(1.05);
}

.full-width:active {
  transform: translateY(0);
}

.card-labels.centered {
  align-items: center;
  text-align: center;
}

.card-labels.centered .card-main-title {
  font-size: 16px;
  font-weight: bold;
}
</style>
