import { ref, computed } from 'vue'
import { useMessage } from 'naive-ui'
import { getVideosApi, uploadVideoApi, renameVideoApi, deleteVideoApi, type VideoUploadResponse } from '../api/video'
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

  const uploadFile = async (path: string, categoryIds?: number[]): Promise<void> => {
    if (isUploading.value) return

    const messageReactive = message.loading('视频上传分析中...', { duration: 0 })
    try {
      isUploading.value = true
      const res = (await uploadVideoApi(path, categoryIds)) as VideoUploadResponse

      allFiles.value.push({
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
      // Refresh list immediately
      await fetchVideos()
    } catch (err) {
      console.error('API Error', err)
      message.error('上传失败，请重试')
    } finally {
      isUploading.value = false
      messageReactive.destroy()
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

  const mapStatus = (status?: number): 'processing' | 'completed' | 'failed' | undefined => {
    if (status === undefined) return undefined
    switch (status) {
      case 0:
        return 'processing'
      case 1:
        return 'completed'
      case 2:
        return 'processing'
      case 3:
        return 'failed'
      default:
        return 'processing'
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
    
    if (file?.parse_percentage !== undefined && (file.status === 0 || file.status === 2)) {
      return {
        videoId,
        percentage: file.parse_percentage,
        status: 'parsing'
      }
    }
    
    return undefined
  }

  const getVideoStatus = (file: FileItem): 'processing' | 'completed' | 'failed' | undefined => {
    if (file.status === 1) {
      return 'completed'
    }
    
    if (file.status === 3) {
      return 'failed'
    }
    
    if (file.status === 0 || file.status === 2) {
      const progress = getVideoProgress(file.id, file)
      if (progress?.status === 'parsing' || (file.parse_percentage !== undefined && file.parse_percentage < 100)) {
        return 'processing'
      }
      return 'processing'
    }
    
    return mapStatus(file.status)
  }

  return {
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
  }
}

