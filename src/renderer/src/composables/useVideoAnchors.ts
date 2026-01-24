import { ref, computed } from 'vue'
import { useMessage } from 'naive-ui'
import {
  getDictsByTypeApi,
  createDictApi,
  deleteDictApi,
  updateDictApi,
  type DictItem
} from '../api/dict'
import { addVideoCategoryApi, removeVideoCategoryApi } from '../api/video'

export function useVideoAnchors(): {
  anchors: import('vue').Ref<DictItem[]>
  activeAnchorId: import('vue').Ref<number | null>
  currentAnchor: import('vue').ComputedRef<DictItem | null>
  fetchAnchors: () => Promise<void>
  createAnchor: (name: string) => Promise<DictItem>
  renameAnchor: (anchorId: number, newName: string) => Promise<void>
  deleteAnchor: (anchorId: number) => Promise<void>
  updateVideoAnchor: (
    videoId: number,
    anchorId: number | null,
    currentAnchorId?: number | null
  ) => Promise<void>
  getFileAnchor: (file: {
    categories?: Array<{ id: number; name: string; type: string }>
  }) => DictItem | null
} {
  const message = useMessage()
  const anchors = ref<DictItem[]>([])
  const activeAnchorId = ref<number | null>(null)

  const fetchAnchors = async (): Promise<void> => {
    try {
      anchors.value = await getDictsByTypeApi('video_anchor')
    } catch (error) {
      console.error('Failed to fetch anchors', error)
    }
  }

  const createAnchor = async (name: string): Promise<DictItem> => {
    try {
      const newAnchor = await createDictApi(name, 'video_anchor')
      await fetchAnchors()
      return newAnchor
    } catch (error) {
      console.error('创建主播失败', error)
      message.error('创建主播失败，请重试')
      throw error
    }
  }

  const renameAnchor = async (anchorId: number, newName: string): Promise<void> => {
    try {
      await updateDictApi(anchorId, newName)
      await fetchAnchors()
    } catch (error) {
      console.error('重命名主播失败', error)
      message.error('重命名主播失败，请重试')
      throw error
    }
  }

  const deleteAnchor = async (anchorId: number): Promise<void> => {
    try {
      await deleteDictApi(anchorId)
      await fetchAnchors()
      if (activeAnchorId.value === anchorId) {
        activeAnchorId.value = null
      }
    } catch (error) {
      console.error('删除主播失败', error)
      message.error('删除主播失败，请重试')
      throw error
    }
  }

  const updateVideoAnchor = async (
    videoId: number,
    anchorId: number | null,
    currentAnchorId?: number | null
  ): Promise<void> => {
    try {
      // 如果已有主播，先删除
      if (currentAnchorId !== null && currentAnchorId !== undefined) {
        await removeVideoCategoryApi(videoId, currentAnchorId)
      }

      // 如果设置了新主播，添加
      if (anchorId !== null) {
        await addVideoCategoryApi(videoId, anchorId)
      }
    } catch (error) {
      console.error('设置主播失败', error)
      message.error('设置主播失败，请重试')
      throw error
    }
  }

  const getFileAnchor = (file: {
    categories?: Array<{ id: number; name: string; type: string }>
  }): DictItem | null => {
    if (!file.categories) {
      return null
    }
    const anchorCategory = file.categories.find((cat) => cat.type === 'video_anchor')
    if (!anchorCategory) {
      return null
    }
    return anchors.value.find((anchor) => anchor.id === anchorCategory.id) || null
  }

  const currentAnchor = computed(() => {
    if (activeAnchorId.value === null) {
      return null
    }
    return anchors.value.find((anchor) => anchor.id === activeAnchorId.value) || null
  })

  return {
    anchors,
    activeAnchorId,
    currentAnchor,
    fetchAnchors,
    createAnchor,
    renameAnchor,
    deleteAnchor,
    updateVideoAnchor,
    getFileAnchor
  }
}
