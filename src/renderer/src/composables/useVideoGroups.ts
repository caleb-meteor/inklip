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

export function useVideoGroups(): {
  groups: import('vue').Ref<DictItem[]>
  activeGroupId: import('vue').Ref<number | null>
  currentGroup: import('vue').ComputedRef<DictItem | null>
  fetchGroups: () => Promise<void>
  createGroup: (name: string) => Promise<DictItem>
  renameGroup: (groupId: number, newName: string) => Promise<void>
  deleteGroup: (groupId: number) => Promise<void>
  updateVideoGroup: (
    videoId: number,
    groupId: number | null,
    currentGroupId?: number | null
  ) => Promise<void>
  getFileGroup: (file: {
    categories?: Array<{ id: number; name: string; type: string }>
  }) => DictItem | null
} {
  const message = useMessage()
  const groups = ref<DictItem[]>([])
  const activeGroupId = ref<number | null>(null)

  const fetchGroups = async (): Promise<void> => {
    try {
      groups.value = await getDictsByTypeApi('video_group')
    } catch (error) {
      console.error('Failed to fetch groups', error)
    }
  }

  const createGroup = async (name: string): Promise<DictItem> => {
    try {
      const newGroup = await createDictApi(name, 'video_group')
      await fetchGroups()
      return newGroup
    } catch (error) {
      console.error('创建分组失败', error)
      message.error('创建分组失败，请重试')
      throw error
    }
  }

  const renameGroup = async (groupId: number, newName: string): Promise<void> => {
    try {
      await updateDictApi(groupId, newName)
      await fetchGroups()
    } catch (error) {
      console.error('重命名分组失败', error)
      message.error('重命名分组失败，请重试')
      throw error
    }
  }

  const deleteGroup = async (groupId: number): Promise<void> => {
    try {
      await deleteDictApi(groupId)
      await fetchGroups()
      if (activeGroupId.value === groupId) {
        activeGroupId.value = null
      }
    } catch (error) {
      console.error('删除分组失败', error)
      message.error('删除分组失败，请重试')
      throw error
    }
  }

  const updateVideoGroup = async (
    videoId: number,
    groupId: number | null,
    currentGroupId?: number | null
  ): Promise<void> => {
    try {
      // 如果已有分组，先删除
      if (currentGroupId !== null && currentGroupId !== undefined) {
        await removeVideoCategoryApi(videoId, currentGroupId)
      }

      // 如果设置了新分组，添加
      if (groupId !== null) {
        await addVideoCategoryApi(videoId, groupId)
      }
    } catch (error) {
      console.error('设置分组失败', error)
      message.error('设置分组失败，请重试')
      throw error
    }
  }

  const getFileGroup = (file: {
    categories?: Array<{ id: number; name: string; type: string }>
  }): DictItem | null => {
    if (!file.categories) {
      return null
    }
    const groupCategory = file.categories.find((cat) => cat.type === 'video_group')
    if (!groupCategory) {
      return null
    }
    return groups.value.find((group) => group.id === groupCategory.id) || null
  }

  const currentGroup = computed(() => {
    if (activeGroupId.value === null) {
      return null
    }
    return groups.value.find((group) => group.id === activeGroupId.value) || null
  })

  return {
    groups,
    activeGroupId,
    currentGroup,
    fetchGroups,
    createGroup,
    renameGroup,
    deleteGroup,
    updateVideoGroup,
    getFileGroup
  }
}
