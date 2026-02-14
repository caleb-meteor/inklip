import { aiChatStore } from '../services/aiChatStore'
import { addAiChatMessageApi } from '../api/aiChat'

export function useVideoUpload() {
  const handleUploadSuccess = async (
    uploadedVideos: any[], 
    metadata?: { anchor?: string; product?: string }
  ): Promise<void> => {
    if (!uploadedVideos || uploadedVideos.length === 0) return

    try {
      // 1. 确保有会话，如果没有则创建
      let chatId = aiChatStore.getCurrentAiChatId().value
      if (!chatId) {
        let topic = `导入 ${uploadedVideos.length} 个视频`
        // 如果有元数据，构造更具体的主题
        if (metadata?.anchor && metadata?.product) {
          topic = `导入「${metadata.anchor}」的「${metadata.product}」${uploadedVideos.length}个视频`
        }
        
        const newChat = await aiChatStore.createAiChat(topic)
        chatId = newChat.id
      }

      // 2. 添加用户消息
      let userContent = `导入了 ${uploadedVideos.length} 个本地视频`
      if (metadata?.anchor && metadata?.product) {
        userContent = `导入了「${metadata.anchor}」的「${metadata.product}」共 ${uploadedVideos.length} 个本地视频`
      }
      
      // 保存到数据库
      const userMsg = await addAiChatMessageApi({
        ai_chat_id: chatId,
        role: 'user',
        content: userContent
      })
      
      // 添加到本地显示 (使用真实ID)
      aiChatStore.addMessage({
        id: userMsg.id.toString(),
        role: 'user',
        content: userContent,
        timestamp: new Date()
      })

      // 3. 添加助手消息（带视频卡片）
      const displayVideos = uploadedVideos.map(v => ({
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

      // 保存到数据库
      const assistantMsg = await addAiChatMessageApi({
        ai_chat_id: chatId,
        role: 'assistant',
        content: assistantContent,
        payload
      })

      // 添加到本地显示 (使用真实ID)
      aiChatStore.addMessage({
        id: assistantMsg.id.toString(),
        role: 'assistant',
        content: assistantContent,
        timestamp: new Date(),
        payload
      })
    } catch (error) {
      console.error('Failed to update chat with uploaded videos', error)
    }
  }

  return {
    handleUploadSuccess
  }
}
