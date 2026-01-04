import { ref, computed } from 'vue'
import { useMessage } from 'naive-ui'
import { getDictsByTypeApi, createDictApi, deleteDictApi, updateDictApi, type DictItem } from '../api/dict'
import { setVideoGroupApi } from '../api/video'

export function useVideoGroups() {
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

  const updateVideoGroup = async (videoId: number, groupId: number | null): Promise<void> => {
    try {
      await setVideoGroupApi(videoId, groupId)
    } catch (error) {
      console.error('设置分组失败', error)
      message.error('设置分组失败，请重试')
      throw error
    }
  }

  const getFileGroup = (file: { group_id?: number }): DictItem | null => {
    if (!file.group_id) {
      return null
    }
    return groups.value.find(group => group.id === file.group_id) || null
  }

  const currentGroup = computed(() => {
    if (activeGroupId.value === null) {
      return null
    }
    return groups.value.find(group => group.id === activeGroupId.value) || null
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

