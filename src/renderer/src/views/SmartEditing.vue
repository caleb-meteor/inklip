<script setup lang="ts">
import { ref, computed, onMounted, watch, h } from 'vue'
import type { SelectOption } from 'naive-ui'
import type { VNodeChild } from 'vue'
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
  NForm,
  NFormItem,
  useMessage,
  useDialog
} from 'naive-ui'
import {
  ChevronBack,
  AddOutline,
  Cut,
  CloseOutline,
  SearchOutline,
  CreateOutline
} from '@vicons/ionicons5'
import { FileItem } from '../types/video'

interface HistoryItem {
  id: number
  prompt?: string
  min_duration?: number
  max_duration?: number
  status: 'processing' | 'completed' | 'failed'
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

import {
  getVideosApi,
  smartCutApi,
  getSmartCutsApi,
  getPromptBuiltinsApi,
  deleteSmartCutApi,
  type PromptBuiltin
} from '../api/video'
import { useVideoGroups } from '../composables/useVideoGroups'
import { useVideoAnchors } from '../composables/useVideoAnchors'
import { useVideoProducts } from '../composables/useVideoProducts'
import HistoryItemCard from '../components/HistoryItemCard.vue'
import VideoPreviewPlayer from '../components/VideoPreviewPlayer.vue'
import VideoStatusOverlay from '../components/VideoStatusOverlay.vue'
import { useWebsocketStore } from '../stores/websocket'
import {
  MAX_SOURCE_VIDEO_DURATION,
  MAX_OUTPUT_VIDEO_DURATION,
  checkSourceVideoDuration,
  formatDuration
} from '../constants/video'

const wsStore = useWebsocketStore()

const router = useRouter()
const allFiles = ref<FileItem[]>([])

// 使用 composables
const { groups, activeGroupId, fetchGroups, getFileGroup } = useVideoGroups()

const { anchors, activeAnchorId, fetchAnchors, getFileAnchor } = useVideoAnchors()

const { products, activeProductId, fetchProducts, getFileProduct } = useVideoProducts()

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
      status: item.status,
      categories: item.categories || []
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

const selectedProductName = ref<string>('')

const formData = computed(() => ({
  minDuration: minDuration.value,
  maxDuration: maxDuration.value,
  scheme: selectedSchemeValue.value,
  product: selectedProductName.value
}))

// 监听选择的视频，如果所有视频都有相同的产品，自动填充
watch(
  selectedVideos,
  (videos) => {
    if (videos.length === 0) {
      selectedProductName.value = ''
      return
    }

    // 获取所有视频的产品
    const productNames = videos
      .map((video) => {
        const product = getFileProduct(video)
        return product?.name || null
      })
      .filter((name) => name !== null)

    // 如果所有视频都有产品，且产品相同，则自动填充
    if (productNames.length === videos.length) {
      const uniqueProductNames = [...new Set(productNames)]
      if (uniqueProductNames.length === 1) {
        selectedProductName.value = uniqueProductNames[0] as string
      } else {
        // 如果产品不一致，清空选择
        selectedProductName.value = ''
      }
    } else {
      // 如果有视频没有产品，清空选择
      selectedProductName.value = ''
    }
  },
  { immediate: true }
)

const openSelector = async (): Promise<void> => {
  searchKeyword.value = '' // Clear search keyword when opening
  tempSelectedIds.value = [...selectedVideoIds.value]
  // 重置筛选条件
  activeGroupId.value = null
  activeAnchorId.value = null
  activeProductId.value = null
  await fetchVideos() // Refresh video list
  await fetchGroups() // Refresh groups
  await fetchAnchors() // Refresh anchors
  await fetchProducts() // Refresh products
  showSelector.value = true
}

const confirmSelection = (): void => {
  selectedVideoIds.value = [...tempSelectedIds.value]
  showSelector.value = false
}

const toggleSelection = (id: number): void => {
  const video = allFiles.value.find((v) => v.id === id)
  if (video && video.status !== 4) {
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
  let filtered = videoFiles.value

  // 按分组筛选
  if (activeGroupId.value !== null) {
    filtered = filtered.filter((file) => {
      const group = getFileGroup(file)
      return group?.id === activeGroupId.value
    })
  }

  // 按主播筛选
  if (activeAnchorId.value !== null) {
    filtered = filtered.filter((file) => {
      const anchor = getFileAnchor(file)
      return anchor?.id === activeAnchorId.value
    })
  }

  // 按产品筛选
  if (activeProductId.value !== null) {
    filtered = filtered.filter((file) => {
      const product = getFileProduct(file)
      return product?.id === activeProductId.value
    })
  }

  // 按搜索关键词筛选
  if (searchKeyword.value.trim()) {
    const keyword = searchKeyword.value.toLowerCase()
    filtered = filtered.filter((file) => file.name.toLowerCase().includes(keyword))
  }

  return filtered
})
const goBack = (): void => {
  router.push('/home')
}

const message = useMessage()
const dialog = useDialog()
const isProcessing = ref(false)
const promptText = ref('')
const builtInPrompts = ref<PromptBuiltin[]>([])

const fetchBuiltInPrompts = async (): Promise<void> => {
  const res = await getPromptBuiltinsApi()
  builtInPrompts.value = res.list
}

// Prompt Logic
const selectedSchemeValue = ref<string | null>(null) // Stores either ID or 'custom'

const schemeOptions = computed<SelectOption[]>(() => {
  const options: SelectOption[] = []
  // Add Custom Option first
  options.push({
    label: '自定义方案',
    value: 'custom'
  })

  // Add built-in prompts
  const builtinOptions = builtInPrompts.value.map((item) => ({
    label: item.name,
    value: String(item.id)
  }))
  options.push(...builtinOptions)
  return options
})

const renderSchemeLabel = (option: SelectOption): VNodeChild => {
  if (option.type === 'divider') {
    return h('div', {
      style: {
        height: '1px',
        background: '#444',
        margin: '8px 0'
      }
    })
  }
  if (option.value === 'custom') {
    return h(
      'div',
      {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          color: '#f59e0b'
        }
      },
      [
        h(
          NIcon,
          {
            size: 16,
            color: '#f59e0b'
          },
          {
            default: () => h(CreateOutline)
          }
        ),
        h(
          'span',
          {
            style: {
              color: '#f59e0b',
              fontWeight: 500
            }
          },
          option.label as string
        )
      ]
    )
  }
  return option.label as string
}

const handleSchemeChange = (val: string): void => {
  // Ignore divider selection (should not happen as it's disabled, but just in case)
  if (val === 'divider') {
    return
  }
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

const outputDurationTip = computed(() => {
  if (!maxDuration.value) return ''
  if (maxDuration.value > MAX_OUTPUT_VIDEO_DURATION) {
    return `输出视频最长 ${Math.floor(MAX_OUTPUT_VIDEO_DURATION / 60)} 分钟，您的最大时长设置超过了限制`
  }
  return `输出视频最长 ${Math.floor(MAX_OUTPUT_VIDEO_DURATION / 60)} 分钟`
})

const handleStartSmartCut = async (prompt?: string, min?: number, max?: number): Promise<void> => {
  if (!selectedVideoIds.value.length) {
    message.warning('请先选择要剪辑的视频')
    return
  }

  // 验证源视频总时长
  const total = totalSelectedDuration.value
  const sourceDurationError = checkSourceVideoDuration(Math.floor(total))
  if (sourceDurationError) {
    message.error(sourceDurationError)
    return
  }

  const outMin = min !== undefined ? min : minDuration.value
  const outMax = max !== undefined ? max : maxDuration.value

  // Robust validation
  if (!outMin || !outMax) {
    message.error('请输入有效的时长参数')
    return
  }

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

  // 根据选择的方案类型设置 prompt_built_id 和 prompt_text
  // 规则：prompt_built_id 有值时，prompt_text 必须为空
  let promptBuiltId: number | undefined
  let finalPromptText: string | undefined

  if (selectedSchemeValue.value === 'custom') {
    // 自定义方案：prompt_built_id 为 0，prompt_text 为自定义内容
    promptBuiltId = 0
    finalPromptText = prompt || promptText.value || undefined
  } else if (selectedSchemeValue.value) {
    // 内置方案：prompt_built_id 为内置方案 ID，prompt_text 为空
    promptBuiltId = parseInt(selectedSchemeValue.value, 10)
    finalPromptText = undefined
  } else {
    // 未选择方案时，使用 prompt 参数或 promptText，不设置 prompt_built_id
    finalPromptText = prompt || promptText.value || undefined
  }

  try {
    isProcessing.value = true
    message.info('任务提交成功，等待处理...')

    const res = await smartCutApi(
      selectedVideoIds.value,
      finalPromptText,
      outMin,
      outMax,
      selectedProductName.value || undefined,
      promptBuiltId
    )

    message.success(`剪辑完成！`)

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

// Video 状态映射（用于视频选择）
const mapVideoStatus = (status: number): 'processing' | 'completed' | 'failed' => {
  switch (status) {
    case 0:
      return 'processing' // PENDING - 待处理
    case 1:
      return 'processing' // EXTRACTING_COVER - 提取封面中
    case 2:
      return 'processing' // EXTRACTING_AUDIO - 提取音频中
    case 3:
      return 'processing' // TRANSCRIBING - 转录音频中
    case 4:
      return 'completed' // COMPLETED - 处理完成
    case 5:
      return 'failed' // FAILED - 处理失败
    default:
      return 'processing'
  }
}

// AiGenVideo 状态映射（用于剪辑历史）
// status = 0: 待处理
// status = 1: 视频处理成功（最终完成）
// status = 2: ai 剪辑成功
// status = 3: ai 剪辑异常（失败）
// status = 4: 视频处理异常（失败）
// status = 5: ai 剪辑中
const mapAiGenVideoStatus = (status: number): 'processing' | 'completed' | 'failed' => {
  switch (status) {
    case 0:
      return 'processing' // 待处理
    case 1:
      return 'completed' // 视频处理成功（最终完成）
    case 2:
      return 'processing' // ai 剪辑成功（但还没完成视频处理）
    case 3:
      return 'failed' // ai 剪辑异常（失败）
    case 4:
      return 'failed' // 视频处理异常（失败）
    case 5:
      return 'processing' // ai 剪辑中
    default:
      return 'processing'
  }
}

// 兼容旧代码，默认使用 Video 状态映射
const mapStatus = mapVideoStatus

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
      status: mapAiGenVideoStatus(item.status), // 使用 AiGenVideo 状态映射
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
  fetchProducts() // 获取产品列表
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

const handleDelete = async (item: HistoryItem): Promise<void> => {
  dialog.warning({
    title: '确认删除',
    content: `确定要删除剪辑历史 "${item.name}" 吗？此操作将同时删除相关文件，且无法恢复。`,
    positiveText: '确定删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await deleteSmartCutApi(item.id)
        message.success('删除成功')
        // 如果正在播放的是被删除的视频，停止播放
        if (playingVideoId.value === item.id) {
          playingVideoId.value = null
        }
        // 刷新历史列表
        fetchHistory(false)
      } catch (error) {
        console.error('Delete smart cut failed:', error)
        message.error('删除失败，请重试')
      }
    }
  })
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
                <div class="empty-desc">点击选择视频</div>
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
                      (当前总计 {{ Math.floor(totalSelectedDuration) }}s / 最大
                      {{ Math.floor(MAX_SOURCE_VIDEO_DURATION) }}s)
                    </span>
                  </span>
                  <span
                    v-if="checkSourceVideoDuration(Math.floor(totalSelectedDuration))"
                    style="color: #d03050; font-size: 12px; margin-left: 16px"
                  >
                    ⚠️ {{ checkSourceVideoDuration(Math.floor(totalSelectedDuration)) }}
                  </span>
                </div>

                <div class="video-list-compact">
                  <div v-for="video in selectedVideos" :key="video.id" class="compact-video-card">
                    <div class="compact-card-top">
                      <VideoPreviewPlayer
                        :path="video.path"
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
              <!-- Form Layout -->
              <div class="form-wrapper">
                <n-form :model="formData" label-placement="left" label-width="60" size="medium">
                  <!-- Duration Field -->
                  <n-form-item label="时长">
                    <n-space :size="8" align="center">
                      <n-input-number
                        v-model:value="minDuration"
                        :min="1"
                        placeholder="最小时长"
                        size="medium"
                        :show-button="false"
                        style="width: 120px"
                      />
                      <span class="range-separator">-</span>
                      <n-input-number
                        v-model:value="maxDuration"
                        :min="1"
                        :max="Math.floor(totalSelectedDuration) || 300"
                        placeholder="最大时长"
                        size="medium"
                        :show-button="false"
                        style="width: 120px"
                      />
                      <span class="unit">s</span>
                    </n-space>
                    <Transition name="fade">
                      <div v-if="durationError" class="form-error-hint">
                        {{ durationError }}
                      </div>
                    </Transition>
                    <div
                      class="form-info-hint"
                      :class="{ 'form-warning-hint': maxDuration > MAX_OUTPUT_VIDEO_DURATION }"
                    >
                      {{ outputDurationTip }}
                    </div>
                  </n-form-item>

                  <!-- Product Field -->
                  <n-form-item label="产品">
                    <n-input
                      v-model:value="selectedProductName"
                      placeholder="请输入产品名称"
                      clearable
                      size="medium"
                      style="width: 100%"
                    />
                  </n-form-item>

                  <!-- Scheme Field -->
                  <n-form-item label="方案">
                    <div style="width: 100%; display: flex; flex-direction: column">
                      <n-select
                        v-model:value="selectedSchemeValue"
                        :options="schemeOptions"
                        :render-label="renderSchemeLabel"
                        placeholder="请选择方案"
                        size="medium"
                        style="width: 100%"
                        @update:value="handleSchemeChange"
                      />
                      <!-- Custom Prompt Edit Area (Conditional) -->
                      <Transition name="slide-down">
                        <div v-if="selectedSchemeValue === 'custom'" class="custom-edit-area">
                          <n-input
                            v-model:value="promptText"
                            type="textarea"
                            placeholder="请输入您的自定义剪辑方案..."
                            :rows="3"
                            class="custom-textarea"
                            :autosize="{ minRows: 3, maxRows: 8 }"
                            show-count
                            :maxlength="2000"
                          />
                        </div>
                      </Transition>
                    </div>
                  </n-form-item>

                  <!-- Start Action -->
                  <n-form-item>
                    <n-button
                      type="primary"
                      color="#63e2b7"
                      size="medium"
                      :loading="isProcessing"
                      @click="handleStartSmartCut()"
                      style="width: 100%"
                    >
                      <template #icon
                        ><n-icon><Cut /></n-icon
                      ></template>
                      开始剪辑
                    </n-button>
                  </n-form-item>
                </n-form>
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
                @delete="handleDelete"
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
        <n-space vertical :size="12" style="margin-bottom: 16px">
          <n-input v-model:value="searchKeyword" placeholder="搜索视频名称..." clearable>
            <template #prefix>
              <n-icon><SearchOutline /></n-icon>
            </template>
          </n-input>

          <!-- 筛选器 -->
          <n-space :size="8">
            <n-select
              v-model:value="activeGroupId"
              :options="groups.map((g) => ({ label: g.name, value: g.id }))"
              placeholder="分组"
              clearable
              size="small"
              style="width: 120px"
            />
            <n-select
              v-model:value="activeAnchorId"
              :options="anchors.map((a) => ({ label: a.name, value: a.id }))"
              placeholder="主播"
              clearable
              size="small"
              style="width: 120px"
            />
            <n-select
              v-model:value="activeProductId"
              :options="products.map((p) => ({ label: p.name, value: p.id }))"
              placeholder="产品"
              clearable
              size="small"
              style="width: 120px"
            />
          </n-space>
        </n-space>
        <div v-if="filteredVideoFiles.length > 0" class="file-grid-modal">
          <div
            v-for="file in filteredVideoFiles"
            :key="file.id"
            class="file-item-modal"
            :class="{
              selected: tempSelectedIds.includes(file.id),
              disabled: file.status !== 4
            }"
            @click="file.status === 4 && toggleSelection(file.id)"
          >
            <div class="checkbox-overlay" :class="{ is_active: tempSelectedIds.includes(file.id) }">
              <n-checkbox
                :checked="tempSelectedIds.includes(file.id)"
                @update:checked="() => toggleSelection(file.id)"
                @click.stop
              />
            </div>
            <div class="icon-wrapper-modal" style="position: relative">
              <VideoPreviewPlayer
                :path="file.path"
                :cover="file.cover"
                :duration="file.duration"
                :aspect-ratio="getAspectRatio(file)"
                :disabled="mapVideoStatus(file.status || 0) !== 'completed'"
              />
              <VideoStatusOverlay :status="mapVideoStatus(file.status || 0)" />
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
  padding: 16px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.05);
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

.video-list-compact {
  display: flex;
  justify-content: center;
  gap: 12px;
  overflow-x: auto;
  padding: 8px 4px;
  margin-top: 12px;
}

.compact-video-card {
  flex: 1;
  min-width: 80px;
  max-width: 120px;
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

.form-wrapper {
  width: 100%;
  background: #2a2a2a;
  border-radius: 12px;
  padding: 20px;
  border: 1px solid #3a3a3a;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.range-separator {
  color: #666;
  font-size: 14px;
}

.unit {
  font-size: 13px;
  color: #666;
}

.form-error-hint {
  font-size: 12px;
  color: #ff6b6b;
  margin-top: 4px;
}

.form-info-hint {
  font-size: 12px;
  color: #ff9800;
  margin-top: 4px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 4px;
}

.form-info-hint::before {
  content: '⚠️';
  font-size: 14px;
}

.form-warning-hint {
  color: #d03050 !important;
  font-weight: 600;
}

.custom-edit-area {
  margin-top: 12px;
  width: 100%;
}

.custom-textarea {
  width: 100%;
}

.custom-textarea :deep(textarea) {
  user-select: text !important;
  -webkit-user-select: text !important;
  -moz-user-select: text !important;
  -ms-user-select: text !important;
  resize: vertical;
}

/* Ensure all inputs can receive paste */
:deep(input),
:deep(textarea) {
  user-select: text !important;
  -webkit-user-select: text !important;
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

.file-item-modal.disabled {
  opacity: 0.5;
  cursor: not-allowed;
  filter: grayscale(0.5);
}

.file-item-modal.disabled:hover .icon-wrapper-modal {
  border-color: #333;
}
</style>
