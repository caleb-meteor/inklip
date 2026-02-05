<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, computed, watch } from 'vue'
import type { PropType } from 'vue'
import { NButton, useMessage } from 'naive-ui'
import { Download } from '@vicons/ionicons5'
import { NIcon } from 'naive-ui'
import { aiChatStore } from '../../../services/aiChatStore'
import { getSmartCutApi } from '../../../api/video'
import { updateAiChatMessageApi } from '../../../api/aiChat'
import VideoCard from '../../VideoCard.vue' // Import VideoCard
import TaskCardMessage from './TaskCardMessage.vue' // Import TaskCardMessage
import type { FileItem } from '../../../types/video' // Import FileItem type
import { useWebsocketStore } from '../../../stores/websocket'

interface SmartCutTask {
  taskId?: string
  aiGenVideoId?: number
  videoCount?: number
  durationMin?: number
  durationMax?: number
  status: number
  fileUrl?: string
  duration?: number
  cover?: string
  name?: string
  taskCard?: {
    steps: Array<{ label: string; status: 'pending' | 'processing' | 'completed' | 'error'; detail?: string }>
  }
}

const props = defineProps({
  msgId: {
    type: String,
    required: true
  },
  task: {
    type: Object as PropType<SmartCutTask>,
    required: true
  }
})

const message = useMessage()
const isExporting = ref(false)
const websocketStore = useWebsocketStore()

const taskStatus = ref(props.task.status)
watch(
  () => props.task.status,
  (newStatus) => {
    taskStatus.value = newStatus
  }
)

// 监听 WebSocket 智能剪辑状态更新
watch(
  () => websocketStore.smartCutUpdated,
  async () => {
    // 只有当 WebSocket 消息的 ID 与当前组件的 ID 匹配时，才更新
    if (props.task.aiGenVideoId) {
      // 获取最新的 WebSocket 消息（需要从 store 中获取）
      // 此处直接请求后端接口，与点开逻辑保持一致
      console.log('[SmartCutResultMessage] WebSocket notified update for ID:', props.task.aiGenVideoId, 'fetching latest status')
      try {
        const latestData = await getSmartCutApi(props.task.aiGenVideoId)
        console.log('[SmartCutResultMessage] Received latest data from API:', latestData)
        await updateMessageStatus(latestData)
      } catch (error) {
        console.error('[SmartCutResultMessage] Failed to fetch latest status on WebSocket update:', error)
      }
    }
  }
)

// 定义清理变量（作用域在组件级别）
let tipInterval: ReturnType<typeof setInterval> | null = null
let dotInterval: ReturnType<typeof setInterval> | null = null

// 清理函数
const clearIntervals = () => {
  if (tipInterval) {
    clearInterval(tipInterval)
    tipInterval = null
  }
  if (dotInterval) {
    clearInterval(dotInterval)
    dotInterval = null
  }
}

// 处理导出/下载 - 复用剪辑历史的导出功能
const handleExport = async () => {
  if (!completedVideoFileItem.value?.path) {
    message.error('视频文件不存在，无法导出')
    return
  }

  isExporting.value = true
  try {
    const filePath = completedVideoFileItem.value.path
    const fileName = completedVideoFileItem.value.name.endsWith('.mp4')
      ? completedVideoFileItem.value.name
      : `${completedVideoFileItem.value.name}.mp4`
    
    const loadingMsg = message.loading('正在准备...', { duration: 0 })
    console.log('[SmartCutResultMessage] Starting export:', { filePath, fileName })
    
    // 使用与剪辑历史相同的导出方法
    const result = await window.api.downloadVideo(filePath, fileName)
    loadingMsg.destroy()
    
    if (result.success) {
      message.success(`已保存至: ${result.path}`)
    } else if (result.canceled) {
      message.info('已取消导出')
    } else {
      message.error(result.error || '导出失败')
    }
  } catch (error) {
    console.error('[SmartCutResultMessage] Export failed:', error)
    message.error('导出过程中发生错误')
  } finally {
    isExporting.value = false
  }
}

// Status 1 is Completed. Status 3, 4 are Errors.
// We consider it processing if it's not 1, 3, or 4.
const isProcessing = computed(() => {
  const s = taskStatus.value
  return s !== 1 && s !== 3 && s !== 4
})

const isFailed = computed(() => {
  const s = taskStatus.value
  return s === 3 || s === 4
})

const failureMessage = computed(() => {
  if (taskStatus.value === 3) {
    return 'AI 分析失败，请检查视频内容或重新尝试'
  } else if (taskStatus.value === 4) {
    return '视频处理异常，请检查视频格式或重新上传'
  }
  return '处理失败，请重新尝试'
})

const dotAnimation = ref('.')

// Computed property to transform completed task into a FileItem for VideoCard
const completedVideoFileItem = computed<FileItem | undefined>(() => {
  // 检查是否处理完成
  const isCompleted = taskStatus.value === 1
  
  console.log('[SmartCutResultMessage] completedVideoFileItem check:', {
    isCompleted,
    status: taskStatus.value,
    fileUrl: props.task.fileUrl,
    aiGenVideoId: props.task.aiGenVideoId,
    hasFileUrl: !!props.task.fileUrl,
    taskDetails: {
      name: props.task.name,
      cover: props.task.cover,
      duration: props.task.duration
    }
  })
  
  if (isCompleted && props.task.fileUrl) {
    const item: FileItem = {
      id: props.task.aiGenVideoId || 0,
      name: props.task.name || `智能剪辑_${props.task.aiGenVideoId}.mp4`,
      type: 'video',
      size: '',
      modified: new Date().toISOString(),
      path: props.task.fileUrl,
      cover: props.task.cover || '',
      duration: props.task.duration,
      parentId: null,
      status: 4
    }
    console.log('[SmartCutResultMessage] Created FileItem:', item)
    return item
  }
  
  return undefined
})

// 处理中的友好提示
const processingTips = [
  '⏳ 正在分析视频内容...',
  '🎬 正在提取关键帧...',
  '🎵 正在分析音频...',
  '✂️ 正在智能剪辑...',
]
const currentTipIndex = ref(0)

// 统一的消息状态更新函数
const updateMessageStatus = async (latestData: any) => {
  console.log(`[SmartCutResultMessage] Updating message status:`, latestData)
  
  // 更新本地状态
  taskStatus.value = latestData.status
  
  // 更新消息的 payload
  const currentMsg = aiChatStore.getMessages().value.find(m => m.id === props.msgId)
  if (currentMsg?.payload) {
    const isNested = !!currentMsg.payload.smartCutTask
    const targetPayload = isNested ? currentMsg.payload.smartCutTask : currentMsg.payload
    
    const updatedPayload: any = { ...currentMsg.payload }
    if (isNested) {
      updatedPayload.smartCutTask = {
        ...targetPayload,
        status: latestData.status,
        fileUrl: latestData.path,
        duration: latestData.duration,
        cover: latestData.cover,
        name: latestData.name
      }
    } else {
      updatedPayload.status = latestData.status
      updatedPayload.fileUrl = latestData.path
      updatedPayload.duration = latestData.duration
      updatedPayload.cover = latestData.cover
      updatedPayload.name = latestData.name
    }
    
    // 确保 aiGenVideoId 总是存在
    if (latestData.id && !updatedPayload.aiGenVideoId) {
      updatedPayload.aiGenVideoId = latestData.id
    }
     
    // 根据状态更新任务卡片
    if (updatedPayload.taskCard) {
      // task_status: 0=待执行, 1=执行中, 2=已完成, 3=失败
      // status (ai_gen_video_status): 0=待处理, 1=已完成, 2=处理中, 3=AI异常, 4=视频异常, 5=AI剪辑中
      
      // 判断是否完成: status=1(已完成)
      const isCompleted = latestData.status === 1
      // 判断是否失败：status=3/4(异常)
      const isFailed = latestData.status === 3 || latestData.status === 4
      // 判断AI是否已返回结果：status=2(处理中)
      const isAiReturned = latestData.status === 2
      // 判断是否在等待AI分析：status=5
      const isWaitingAi = latestData.status === 5
      
      if (isCompleted) {
        // 已完成
        updatedPayload.taskCard.steps = [
          { label: '正在请求视频解析', status: 'completed' as const, detail: '请求已接收' },
          { label: '正在解析视频', status: 'completed' as const, detail: '解析完成' },
          { label: '正在智能剪辑', status: 'completed' as const, detail: '智能剪辑已完成' }
        ]
      } else if (isFailed) {
        // 失败
        updatedPayload.taskCard.steps = [
          { label: '正在请求视频解析', status: 'completed' as const, detail: '请求已接收' },
          { label: '正在解析视频', status: latestData.status === 3 ? 'error' as const : 'completed' as const, detail: latestData.status === 3 ? 'AI分析失败' : '解析完成' },
          { label: '正在智能剪辑', status: 'error' as const, detail: '处理失败' }
        ]
      } else if (isAiReturned) {
        // AI已返回结果，正在实际剪辑
        updatedPayload.taskCard.steps = [
          { label: '正在请求视频解析', status: 'completed' as const, detail: '请求已接收' },
          { label: '正在解析视频', status: 'completed' as const, detail: 'AI分析完成' },
          { label: '正在智能剪辑', status: 'processing' as const, detail: '正在处理视频' }
        ]
      } else if (isWaitingAi) {
        // 等待AI分析
        updatedPayload.taskCard.steps = [
          { label: '正在请求视频解析', status: 'completed' as const, detail: '请求已接收' },
          { label: '正在解析视频', status: 'processing' as const, detail: '影氪正在分析' },
          { label: '正在智能剪辑', status: 'pending' as const }
        ]
      }
    }


    // 更新数据库中的消息
    try {
      await updateAiChatMessageApi(Number(props.msgId), {
        payload: updatedPayload
      })
      // 更新内存中的消息
    aiChatStore.updateMessage(props.msgId, { payload: updatedPayload })
    } catch (error) {
      console.error('[SmartCutResultMessage] Failed to update message in database:', error)
    }
  }
  
  console.log(`[SmartCutResultMessage] Updated AI gen video status to ${latestData.status}`)
  
  // 如果已完成，清除定时器
  if (latestData.status === 1 || latestData.status === 3 || latestData.status === 4) {
    clearIntervals()
  }
}

// 在组件挂载时检查处理中的 AI 视频
onMounted(() => {
  console.log('[SmartCutResultMessage] Mounted with task:', props.task)
  
  // 检查是否有 aiGenVideoId 且状态是处理中 (非 1, 3, 4)
  if (
    props.task?.aiGenVideoId &&
    (props.task.status === undefined || (props.task.status !== 1 && props.task.status !== 3 && props.task.status !== 4))
  ) {
    console.log('[SmartCutResultMessage] Task is processing, starting monitoring')
    
    // 启动提示循环动画（只有提示，不查询）
    tipInterval = setInterval(() => {
      currentTipIndex.value = (currentTipIndex.value + 1) % processingTips.length
    }, 8000) // 每 8 秒切换一次提示

    dotInterval = setInterval(() => {
      dotAnimation.value = dotAnimation.value === '...' ? '.' : dotAnimation.value + '.'
    }, 400) // 点动画



    // 初始时立即查询一次当前状态
    ;(async () => {
      try {
        const aiGenVideoId = props.task.aiGenVideoId!
        const latestData = await getSmartCutApi(aiGenVideoId)
        
        console.log(`[SmartCutResultMessage] Initial fetch:`, latestData)
        
        await updateMessageStatus(latestData)
      } catch (error) {
        console.error(`[SmartCutResultMessage] Failed to fetch initial status:`, error)
      }
    })()
  }
})

// 组件卸载前清理定时器
onBeforeUnmount(() => {
  console.log('[SmartCutResultMessage] Unmounting, clearing intervals')
  clearIntervals()
})
</script>

<template>
  <div class="smartcut-result">
    <!-- 处理中的提示 -->
    <div v-if="isProcessing" class="processing-section">
      <div class="processing-header">
        <div class="spinner-wrapper">
          <div class="dual-ring"></div>
          <span class="spinner-icon">⚙️</span>
        </div>
        <div class="header-info">
          <span class="processing-title">正在处理视频{{ dotAnimation }}</span>
          <span class="processing-subtitle">AI 正在为您精心剪辑</span>
        </div>
      </div>
      
      <div class="processing-content">
        <!-- 集成任务卡片步骤 -->
        <div v-if="task.taskCard" class="integrated-task-card">
          <TaskCardMessage :steps="task.taskCard.steps" />
        </div>

        <div v-else class="tip-card">
          <div class="tip-icon">💡</div>
          <div class="tip-text">{{ processingTips[currentTipIndex] }}</div>
        </div>

        <div class="progress-details">
          <div class="wait-banner">
            <span class="clock-icon">⏱️</span>
            <span>预计耗时 3～5 分钟，请耐心等待...</span>
          </div>
          
          <div class="task-grid">
            <div class="grid-item">
              <span class="item-label">素材数量</span>
              <span class="item-value">{{ task.videoCount }} 个</span>
            </div>
            <div class="grid-item">
              <span class="item-label">目标时长</span>
              <span class="item-value">{{ task.durationMin }}s - {{ task.durationMax }}s</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 失败状态 -->
    <div v-else-if="isFailed" class="failure-section">
      <div class="failure-header">
        <div class="failure-icon-wrapper">
          <span class="failure-icon">❌</span>
        </div>
        <div class="header-info">
          <span class="failure-title">剪辑失败</span>
          <span class="failure-subtitle">{{ failureMessage }}</span>
        </div>
      </div>
      
      <div class="failure-content">
        <div class="failure-details">
          <div class="task-grid">
            <div class="grid-item">
              <span class="item-label">视频 ID</span>
              <span class="item-value">#{{ task.aiGenVideoId }}</span>
            </div>
            <div class="grid-item">
              <span class="item-label">错误类型</span>
              <span class="item-value">{{ taskStatus === 3 ? 'AI分析失败' : '视频处理异常' }}</span>
            </div>
            <div class="grid-item">
              <span class="item-label">状态码</span>
              <span class="item-value">{{ taskStatus }}</span>
            </div>
          </div>
          
          <div class="retry-banner">
            <span class="info-icon">💡</span>
            <span>建议检查视频内容和格式，或联系技术支持</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 完成后的结果 -->
    <div v-else class="result-section">
      <div v-if="completedVideoFileItem" class="result-content">
        <!-- 即使完成后也保留任务卡片 -->
        <div v-if="task.taskCard" class="integrated-task-card" style="margin-bottom: 12px;">
          <TaskCardMessage :steps="task.taskCard.steps" />
        </div>

        <!-- 操作按钮放置在最上边 -->
        <div class="top-action-bar">
          <div class="result-status">
            <span class="status-dot"></span>
            <span class="status-text">智能剪辑已完成</span>
          </div>
          <n-button
            type="primary"
            round
            size="small"
            :loading="isExporting"
            @click="handleExport"
            class="export-button"
          >
            <template #icon>
              <n-icon>
                <Download />
              </n-icon>
            </template>
            {{ isExporting ? '导出中...' : '保存视频' }}
          </n-button>
        </div>

        <div class="main-display-area">
          <!-- 视频显示区域 -->
          <div class="video-preview-container">
            <div class="videos-grid">
              <div class="video-card-wrapper">
                <VideoCard
                  :file="completedVideoFileItem"
                  :aspect-ratio="'9/16'"
                  :video-status="'completed'"
                  video-type="edited"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.smartcut-result {
  margin-top: 16px;
  width: 100%;
}

/* 处理中的样式 */
.processing-section {
  background: rgba(30, 30, 32, 0.6);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 16px;
  padding: 24px;
  position: relative;
  overflow: hidden;
}

/* 扫描线动画 */
.processing-section::after {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 50%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(79, 172, 254, 0.1),
    transparent
  );
  animation: scan 3s infinite linear;
}

@keyframes scan {
  to { left: 200%; }
}

.processing-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}

.spinner-wrapper {
  position: relative;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dual-ring {
  content: '';
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 3px solid transparent;
  border-top-color: #4facfe;
  border-bottom-color: #00f2fe;
  animation: spin-dual 1.5s ease-in-out infinite;
}

@keyframes spin-dual {
  to { transform: rotate(360deg); }
}

.spinner-icon {
  position: absolute;
  font-size: 20px;
  color: #4facfe;
  animation: spin-gear 3s linear infinite;
}

@keyframes spin-gear {
  to { transform: rotate(-360deg); }
}

.header-info {
  display: flex;
  flex-direction: column;
}

.processing-title {
  font-size: 17px;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(to right, #4facfe, #00f2fe);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.processing-subtitle {
  font-size: 13px;
  color: #94a3b8;
}

.processing-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.integrated-task-card {
  margin: -4px 0;
}

.integrated-task-card :deep(.task-card) {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(79, 172, 254, 0.1);
  padding: 16px;
  /* Ensure it looks good in result section too, or overriding specific styles if needed */
}

/* Ensure clean display in result section */
.result-content .integrated-task-card :deep(.task-card) {
   background: transparent;
   border: none;
   padding: 0;
   margin-top: 0;
}

.tip-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  background: rgba(79, 172, 254, 0.08);
  border: 1px solid rgba(79, 172, 254, 0.15);
  border-radius: 12px;
}

.tip-icon {
  font-size: 18px;
  color: #00f2fe;
}

.tip-text {
  font-size: 14px;
  color: #bfdbfe;
  line-height: 1.5;
}

.progress-details {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.wait-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
  font-size: 13px;
  color: #94a3b8;
  font-weight: 500;
}

.task-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.grid-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.item-label {
  font-size: 11px;
  color: #71717a;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.item-value {
  font-size: 14px;
  font-weight: 600;
  color: #e2e8f0;
}

/* 失败状态的样式 */
.failure-section {
  background: rgba(40, 30, 30, 0.6);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 16px;
  padding: 24px;
  position: relative;
  overflow: hidden;
}

.failure-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}

.failure-icon-wrapper {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(239, 68, 68, 0.1);
  border-radius: 50%;
  border: 2px solid rgba(239, 68, 68, 0.3);
}

.failure-icon {
  font-size: 20px;
}

.failure-title {
  font-size: 17px;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(to right, #ef4444, #dc2626);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.failure-subtitle {
  font-size: 13px;
  color: #fca5a5;
}

.failure-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.failure-details {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.retry-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.15);
  border-radius: 8px;
  font-size: 13px;
  color: #fca5a5;
  font-weight: 500;
}

.info-icon {
  font-size: 16px;
}

/* 完成后的样式 */
.result-section {
  background: rgba(24, 24, 27, 0.4);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(79, 172, 254, 0.2); /* Use theme blue */
  border-radius: 16px;
  display: flex;
  padding: 16px;
  margin-top: 12px;
  transition: all 0.3s ease;
  width: 100%;
}

.result-section:hover {
  border-color: rgba(79, 172, 254, 0.4);
  background: rgba(24, 24, 27, 0.6);
}

.result-content {
  display: flex;
  flex-direction: column;
  width: 100%;
  gap: 16px;
}

.top-action-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  gap: 24px;
}

.result-status {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-dot {
  width: 8px;
  height: 8px;
  background: #00f2fe;
  border-radius: 50%;
  box-shadow: 0 0 10px rgba(0, 242, 254, 0.5);
}

.status-text {
  font-size: 12px;
  font-weight: 600;
  background: linear-gradient(to right, #4facfe 0%, #00f2fe 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.main-display-area {
  display: flex;
  width: 100%;
}

.video-preview-container {
  padding: 8px;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.videos-grid {
  display: flex;
}

.video-card-wrapper {
  width: 140px;
  flex-shrink: 0;
  transition: all 0.3s ease;
}

.video-card-wrapper:hover {
  transform: translateY(-4px);
}

.export-button {
  background: linear-gradient(to right, #4facfe 0%, #00f2fe 100%);
  border: none;
  font-weight: 600;
  height: 28px;
  padding: 0 12px;
  transition: all 0.3s ease;
  color: #000;
  font-size: 12px;
}

.export-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 15px rgba(79, 172, 254, 0.4);
  filter: brightness(1.1);
}
</style>
