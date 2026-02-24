import { aiChatStore } from '../services/aiChatStore'
import { addAiChatMessageApi } from '../api/aiChat'

export function useVideoUpload() {
  const handleUploadSuccess = async (
    uploadedVideos: any[],
    metadata?: { anchor?: string; product?: string }
  ): Promise<void> => {
    if (!uploadedVideos || uploadedVideos.length === 0) return

    let chatId = aiChatStore.getCurrentAiChatId().value
    if (!chatId) {
      let topic = `导入 ${uploadedVideos.length} 个视频`
      if (metadata?.anchor && metadata?.product) {
        topic = `导入「${metadata.anchor}」的「${metadata.product}」${uploadedVideos.length}个视频`
      }
      const newChat = await aiChatStore.createAiChat(topic)
      chatId = newChat.id
    }

    let userContent = `导入了 ${uploadedVideos.length} 个本地视频`
    if (metadata?.anchor && metadata?.product) {
      userContent = `导入了「${metadata.anchor}」的「${metadata.product}」共 ${uploadedVideos.length} 个本地视频`
    }
    const userMsg = await addAiChatMessageApi({
      ai_chat_id: chatId,
      role: 'user',
      content: userContent
    })
    aiChatStore.addMessage({
      id: userMsg.id.toString(),
      role: 'user',
      content: userContent,
      timestamp: new Date()
    })

    const displayVideos = uploadedVideos.map((v) => ({
      id: v.id,
      name: v.name || v.filename,
      path: v.path,
      cover: v.cover,
      duration: v.duration,
      status: v.status
    }))
    const assistantContent = '视频导入成功，已添加到素材库。'
    const payload = {
      type: 'video_upload',
      videos: displayVideos,
      isInteractive: false,
      awaitingConfirmation: false
    }
    const assistantMsg = await addAiChatMessageApi({
      ai_chat_id: chatId,
      role: 'assistant',
      content: assistantContent,
      payload
    })
    aiChatStore.addMessage({
      id: assistantMsg.id.toString(),
      role: 'assistant',
      content: assistantContent,
      timestamp: new Date(),
      payload
    })
  }

  return {
    handleUploadSuccess
  }
}
