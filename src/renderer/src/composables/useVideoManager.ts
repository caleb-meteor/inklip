import { ref, computed } from 'vue'
import { useMessage } from 'naive-ui'
import { getVideosApi, uploadVideosBatchApi, renameVideoApi, deleteVideoApi } from '../api/video'
import { useWebsocketStore, type VideoParseProgress } from '../stores/websocket'
import type { FileItem } from '../types/video'

export function useVideoManager() {
  const message = useMessage()
  const wsStore = useWebsocketStore()
  const allFiles = ref<FileItem[]>([])
  const isRefreshing = ref(false)
  const isUploading = ref(false)
  const selectedFileId = ref<number | null>(null)

  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

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
        task_status: item.task_status,
        parse_percentage: item.parse_percentage,
        group_id: item.group_id,
        categories: item.categories || [],
        created_at: item.created_at,
        updated_at: item.updated_at
      }))
    } catch (error) {
      console.error('Failed to fetch videos', error)
    } finally {
      isRefreshing.value = false
    }
  }

  const uploadFilesBatch = async (paths: string[], categoryIds?: number[]): Promise<void> => {
    if (isUploading.value) return
    if (paths.length === 0) return

    // 统一使用批量上传，单个文件也作为数组处理
    const countText = paths.length === 1 ? '1 个视频' : `${paths.length} 个视频`
    const messageReactive = message.loading(`正在上传 ${countText}...`, { duration: 0 })
    try {
      isUploading.value = true
      const res = await uploadVideosBatchApi(paths, categoryIds)

      messageReactive.destroy()
      // 兼容两种返回格式：
      // 1. Python 后端：直接返回数组
      // 2. Go 后端：返回对象 {videos: [...], task_ids: [...], status: "queued"}
      const videos = Array.isArray(res) ? res : (res?.videos || [])
      const successCount = videos.length
      const successText = successCount === 1 
        ? '视频已上传，正在处理中...' 
        : `成功上传 ${successCount} 个视频，正在处理中...`
      message.success(successText)
      
      // 刷新列表以获取最新状态（避免重复添加，因为fetchVideos会获取所有视频）
      await fetchVideos()
    } catch (err: any) {
      console.error('Batch upload error', err)
      const errorMsg = err?.response?.data?.message || err?.message || '批量上传失败'
      message.error(errorMsg)
    } finally {
      isUploading.value = false
    }
  }

  const renameVideo = async (videoId: number, newName: string): Promise<void> => {
    try {
      await renameVideoApi(videoId, newName)
      await fetchVideos()
    } catch (error) {
      console.error('重命名失败', error)
      message.error('重命名失败，请重试')
      throw error
    }
  }

  const deleteVideo = async (videoId: number): Promise<void> => {
    try {
      await deleteVideoApi(videoId)
      await fetchVideos()
    } catch (error) {
      console.error('删除失败', error)
      message.error('删除失败，请重试')
      throw error
    }
  }

  const getAspectRatio = (file: FileItem): string => {
    if (file.width && file.height) {
      return `${file.width} / ${file.height}`
    }
    return '9 / 16'
  }

  // 视频状态映射（细化状态）
  // 0: PENDING - 待处理
  // 1: EXTRACTING_COVER - 提取封面中
  // 2: EXTRACTING_AUDIO - 提取音频中
  // 3: TRANSCRIBING - 转录音频中
  // 4: COMPLETED - 处理完成
  // 5: FAILED - 处理失败
  const mapStatus = (status?: number): 'processing' | 'completed' | 'failed' | 'pending' | undefined => {
    if (status === undefined) return undefined
    switch (status) {
      case 0: // PENDING
        return 'pending'
      case 1: // EXTRACTING_COVER
      case 2: // EXTRACTING_AUDIO
      case 3: // TRANSCRIBING
        return 'processing'
      case 4: // COMPLETED
        return 'completed'
      case 5: // FAILED
        return 'failed'
      default:
        return 'processing'
    }
  }

  const getStatusText = (status?: number): string => {
    if (status === undefined) return '未知'
    switch (status) {
      case 0:
        return '待处理'
      case 1:
        return '提取封面中'
      case 2:
        return '提取音频中'
      case 3:
        return '转录音频中'
      case 4:
        return '已完成'
      case 5:
        return '处理失败'
      default:
        return '处理中'
    }
  }

  const videoProgressMap = computed(() => {
    const progressObj = wsStore.videoParseProgress
    Object.keys(progressObj).forEach(key => {
      const _ = progressObj[Number(key)]
    })
    return progressObj
  })

  const getVideoProgress = (videoId: number, file?: FileItem): VideoParseProgress | undefined => {
    const wsProgress = videoProgressMap.value[videoId]
    if (wsProgress) {
      return wsProgress
    }
    
    // 如果文件状态为3（转录中）且有进度百分比，从数据库获取进度
    if (file?.status === 3 && file?.parse_percentage !== undefined && file.parse_percentage >= 0) {
      return {
        videoId,
        percentage: file.parse_percentage,
        status: 'transcribing'  // 转录中状态
      }
    }
    
    // 如果状态是处理中（1或2）且有进度，也返回进度
    if ((file?.status === 1 || file?.status === 2) && file?.parse_percentage !== undefined && file.parse_percentage >= 0) {
      return {
        videoId,
        percentage: file.parse_percentage,
        status: 'parsing'
      }
    }
    
    return undefined
  }

  const getVideoStatus = (file: FileItem): 'processing' | 'completed' | 'failed' | 'pending' | undefined => {
    // 优先检查完成和失败状态
    if (file.status === 4) { // COMPLETED
      return 'completed'
    }
    if (file.status === 5) { // FAILED
      return 'failed'
    }
    
    // 对于转录中状态，检查进度和完成情况
    if (file.status === 3) { // TRANSCRIBING
      const progress = getVideoProgress(file.id, file)
      // 如果进度显示已完成，返回 completed
      if (progress?.status === 'completed' || (file.parse_percentage !== undefined && file.parse_percentage >= 100)) {
        return 'completed'
      }
      // 如果进度显示失败，返回 failed
      if (progress?.status === 'failed') {
        return 'failed'
      }
      // 否则返回处理中
      return 'processing'
    }
    
    // 使用状态映射
    const mapped = mapStatus(file.status)
    return mapped || 'processing'
  }

  // 更新视频状态（从 WebSocket 消息）
  const updateVideoStatus = (videoId: number, status: number, parsePercentage?: number): void => {
    const fileIndex = allFiles.value.findIndex(f => f.id === videoId)
    if (fileIndex !== -1) {
      allFiles.value[fileIndex].status = status
      if (parsePercentage !== undefined) {
        allFiles.value[fileIndex].parse_percentage = parsePercentage
      }
      // 强制触发响应式更新
      allFiles.value = [...allFiles.value]
    }
  }

  return {
    allFiles,
    isRefreshing,
    isUploading,
    selectedFileId,
    fetchVideos,
    uploadFilesBatch,
    renameVideo,
    deleteVideo,
    getAspectRatio,
    getVideoStatus,
    getVideoProgress,
    getStatusText,
    updateVideoStatus
  }
}

