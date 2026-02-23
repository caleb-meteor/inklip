import { unref, watch } from 'vue'
import { useRealtimeStore } from '../stores/realtime'
import { aiChatStore } from '../services/aiChatStore'
import { getSmartCutApi, getVideosApi } from '../api/video'
import { updateAiChatMessageApi } from '../api/aiChat'

export function useRealtimeSync() {
  const rtStore = useRealtimeStore()

  // 监听实时推送的 videoUploaded 消息
  watch(
    () => rtStore.videoUploaded,
    async (newValue) => {
      if (!newValue) return

      const currentMessages = unref(aiChatStore.getMessages())
      const videoUploadMessages = currentMessages.filter(
        (msg) =>
          (msg.payload as any)?.type === 'video_upload' &&
          (msg.payload as any)?.videos &&
          (msg.payload as any).videos.length > 0
      )

      if (videoUploadMessages.length === 0) return

      const allVideoIds = new Set<number>()
      videoUploadMessages.forEach((msg) => {
        const payload = msg.payload as any
        if (payload?.videos) payload.videos.forEach((v) => allVideoIds.add(v.id))
      })
      if (allVideoIds.size === 0) return

      const latestVideos = await getVideosApi({ ids: Array.from(allVideoIds) })
      const videoMap = new Map(latestVideos.map((v) => [v.id, v]))

      for (const msg of videoUploadMessages) {
        let hasUpdates = false
        const payload = msg.payload as any
        if (!payload?.videos) continue

        const updatedVideos = payload.videos.map((v) => {
          const latestInfo = videoMap.get(v.id)
          if (latestInfo) {
            if (latestInfo.cover !== v.cover || latestInfo.duration !== v.duration) {
              hasUpdates = true
              return {
                ...v,
                cover: latestInfo.cover,
                duration: latestInfo.duration,
                status: latestInfo.status
              }
            }
          }
          return v
        })

        if (hasUpdates) {
          const updatedPayload = { ...payload, videos: updatedVideos }
          aiChatStore.updateMessage(msg.id, { payload: updatedPayload })
          const msgIdNum = Number(msg.id)
          if (!isNaN(msgIdNum))
            await updateAiChatMessageApi(msgIdNum, { payload: updatedPayload })
        }
      }
    }
  )

  // 监听实时推送的 smart_cut 更新
  watch(
    () => rtStore.smartCutUpdated,
    async (newValue) => {
      if (!newValue) return

      const currentMessages = unref(aiChatStore.getMessages())
      for (const msg of currentMessages) {
        if (msg.payload?.smartCutTask?.aiGenVideoId) {
          const aiGenVideoId = msg.payload.smartCutTask.aiGenVideoId
          const latestData = await getSmartCutApi(aiGenVideoId)
          const updatedPayload = {
            ...msg.payload,
            smartCutTask: {
              ...msg.payload.smartCutTask,
              status: latestData.status,
              fileUrl: latestData.file_url,
              duration: latestData.duration
            }
          }
          aiChatStore.updateMessage(msg.id, { payload: updatedPayload })
          await updateAiChatMessageApi(Number(msg.id), { payload: updatedPayload })
        }
      }
    }
  )
}
