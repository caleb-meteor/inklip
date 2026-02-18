import { watch, unref } from 'vue'
import { useWebsocketStore } from '../stores/websocket'
import { aiChatStore } from '../services/aiChatStore'
import { getVideosApi, getSmartCutApi } from '../api/video'
import { updateAiChatMessageApi } from '../api/aiChat'

export function useWebSocketSync() {
  const wsStore = useWebsocketStore()

  // 监听 WebSocket 的 videoUploaded 消息
  watch(
    () => wsStore.videoUploaded,
    async (newValue) => {
      if (!newValue) return

      // 查找需要更新的视频上传消息
      const currentMessages = unref(aiChatStore.getMessages())
      const videoUploadMessages = currentMessages.filter(
        (msg) =>
          (msg.payload as any)?.type === 'video_upload' &&
          (msg.payload as any)?.videos &&
          (msg.payload as any).videos.length > 0
      )

      if (videoUploadMessages.length === 0) return

      try {
        // 收集所有需要查询的视频 ID
        const allVideoIds = new Set<number>()
        videoUploadMessages.forEach((msg) => {
          const payload = msg.payload as any
          if (payload?.videos) {
            payload.videos.forEach((v) => allVideoIds.add(v.id))
          }
        })

        if (allVideoIds.size === 0) return

        // 批量查询最新状态
        const latestVideos = await getVideosApi({ ids: Array.from(allVideoIds) })
        const videoMap = new Map(latestVideos.map((v) => [v.id, v]))

        for (const msg of videoUploadMessages) {
          let hasUpdates = false
          const payload = msg.payload as any
          if (!payload?.videos) continue

          const updatedVideos = payload.videos.map((v) => {
            const latestInfo = videoMap.get(v.id)
            if (latestInfo) {
              // 检查关键信息是否有变化（如封面、时长）
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

            // 更新内存
            aiChatStore.updateMessage(msg.id, { payload: updatedPayload })

            // 更新数据库
            try {
              const msgIdNum = Number(msg.id)
              if (!isNaN(msgIdNum)) {
                await updateAiChatMessageApi(msgIdNum, { payload: updatedPayload })
              }
            } catch (error) {
              console.error('[WebSocket] Failed to update video upload message in DB:', error)
            }

            console.log(`[WebSocket] Updated video info for message ${msg.id}`)
          }
        }
      } catch (error) {
        console.error('[WebSocket] Failed to process video update:', error)
      }
    }
  )

  // 监听 WebSocket 的 smart_cut 消息更新
  watch(
    () => wsStore.smartCutUpdated,
    async (newValue) => {
      if (!newValue) return

      // 遍历当前聊天的所有消息，找到包含 aiGenVideoId 的消息
      const currentMessages = unref(aiChatStore.getMessages())
      for (const msg of currentMessages) {
        if (msg.payload?.smartCutTask?.aiGenVideoId) {
          const aiGenVideoId = msg.payload.smartCutTask.aiGenVideoId

          try {
            // 调用 API 获取最新状态
            const latestData = await getSmartCutApi(aiGenVideoId)

            // 更新消息的 payload
            const updatedPayload = {
              ...msg.payload,
              smartCutTask: {
                ...msg.payload.smartCutTask,
                status: latestData.status,
                fileUrl: latestData.file_url,
                duration: latestData.duration
              }
            }

            // 更新内存中的消息
            aiChatStore.updateMessage(msg.id, { payload: updatedPayload })

            // 更新数据库中的消息
            try {
              await updateAiChatMessageApi(Number(msg.id), {
                payload: updatedPayload
              })
            } catch (error) {
              console.error('[WebSocket] Failed to update message in database:', error)
            }

            console.log(
              `[WebSocket] Updated AI gen video ${aiGenVideoId} status to ${latestData.status}`
            )
          } catch (error) {
            console.error(`[WebSocket] Failed to update AI gen video ${aiGenVideoId}:`, error)
          }
        }
      }
    }
  )
}
