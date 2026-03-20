import { defineStore } from 'pinia'
import { computed, reactive, ref } from 'vue'
import { SSEClient } from '../utils/sse-client'
import { RealtimeMessageHandler } from '../utils/realtime-message-handler'
import { aiChatStore } from '../services/aiChatStore'

export interface VideoParseProgress {
  videoId: number
  percentage: number
  status?: 'parsing' | 'transcribing' | 'completed' | 'failed'
  error?: string
}

export interface UsageInfo {
  usageSeconds: number
  dailyLimit: number
  totalSeconds: number
  remainingSeconds: number
  isVip: boolean
  /** 过期日期（云端下发的过期时间） */
  expiredAt?: string
  /** 用户状态：1=启用，非 1（如 0）= 封禁（仅在与云端同步后由后端下发） */
  status?: number
  /** 与 inklip-base-go 对齐：true 表示用量来自「本地 Go ← 云端 SSE」 */
  syncedFromCloud?: boolean
}

/** 版本更新信息（SSE type=version_update）；force_update 为 true 时弹窗不可关闭 */
export interface VersionUpdateInfo {
  version: string
  force_update: boolean
  changelog: string
}

/** 批量导出拼接进度（SSE type=export_segments_progress） */
export interface ExportSegmentsProgressEvent {
  export_request_id: string
  percentage: number
}

/** 判断余量是否可用：是 VIP、未过期、且有剩余额度 */
export function isUsageAvailable(info: UsageInfo | null | undefined): boolean {
  if (!info?.isVip) return false
  if (info.expiredAt && new Date(info.expiredAt) <= new Date()) return false
  // dailyLimit > 0 时需检查剩余额度；dailyLimit === 0 表示无限制
  if (info.dailyLimit > 0 && (info.remainingSeconds ?? 0) <= 0) return false
  return true
}

const normalizeBaseUrl = (url: string): string => url.replace(/\/+$/, '')

export const useRealtimeStore = defineStore('realtime', () => {
  const connected = ref(false)
  const smartCutUpdated = ref(0)
  const videoUploaded = ref(0)
  /** 工作空间入库或监听处理完成时更新，前端监听后刷新工作区/视频列表 */
  const workspaceUpdated = ref(0)
  /** 正在选择/切换工作目录时为 true，用于抑制 QuickClip 等组件的重复视频请求 */
  const workspaceSelecting = ref(false)

  /** 最近一次导出进度（按 export_request_id 由 QuickClip 自行比对） */
  const exportSegmentsProgress = ref<ExportSegmentsProgressEvent | null>(null)

  /** 后端 HTTP 基地址，例如 http://127.0.0.1:12698 */
  const baseUrl = ref<string>(import.meta.env.VITE_API_URL || '')

  const videoParseProgress = reactive<Record<number, VideoParseProgress>>({})

  const usageInfo = ref<UsageInfo>({
    usageSeconds: 0,
    dailyLimit: 0,
    totalSeconds: 0,
    remainingSeconds: 0,
    isVip: false,
    expiredAt: undefined,
    status: undefined,
    syncedFromCloud: false
  })

  /** 新版本信息（后端 SSE 推送）；有值时显示更新弹窗，force_update 时不可关闭 */
  const versionUpdateInfo = ref<VersionUpdateInfo | null>(null)

  /** API Key 异常（如设备超限）；有值时弹窗不可关闭，提示用户更换 API Key */
  const apiKeyExceptionInfo = ref<{ message: string } | null>(null)

  /**
   * 是否已从云端拿到当前 API Key 对应用户信息（完全由 usageInfo 推导，避免与 ref 双写不同步）。
   * - syncedFromCloud === true → 已同步
   * - syncedFromCloud === false → 本地占位，未同步
   * - syncedFromCloud 缺省（旧后端）→ 有 status 则视为已同步
   */
  const userInfoReceivedFromCloud = computed(() => {
    const u = usageInfo.value
    if (u.syncedFromCloud === true) return true
    if (u.syncedFromCloud === false) return false
    return u.status !== undefined
  })

  const isVipAvailable = computed(() => isUsageAvailable(usageInfo.value))

  /**
   * 尚未收到云端 usage_info（启动后 SSE 首次同步前）。
   * 与「封禁」区分：未拿到信息时展示「待激活」，不视为已封禁。
   */
  const isAwaitingCloudActivation = computed(() => !userInfoReceivedFromCloud.value)

  /** 用户是否被封禁：仅在与云端已同步且明确下发 status !== 1 时为 true */
  const isUserBanned = computed(
    () =>
      userInfoReceivedFromCloud.value &&
      usageInfo.value.status !== undefined &&
      usageInfo.value.status !== 1
  )

  /** 会员是否已到期：已下发过期时间且当前时间超过 expiredAt */
  const isMembershipExpired = computed(() => {
    const at = usageInfo.value?.expiredAt
    if (!at) return false
    return new Date(at) <= new Date()
  })

  let sseClient: SSEClient | null = null
  let messageHandler: RealtimeMessageHandler | null = null

  const setBaseUrl = (url: string): void => {
    baseUrl.value = url
  }

  const updateVideoProgress = (data: {
    video_id: number | string
    percentage?: number
    status?: 'completed' | 'failed' | 'parsing' | 'transcribing' | number | string
    error?: string
  }): void => {
    const videoId = Number(data.video_id)
    const existing = videoParseProgress[videoId]

    let status: 'parsing' | 'transcribing' | 'completed' | 'failed' = 'parsing'
    if (data.status === 'completed' || data.status === 4) {
      status = 'completed'
    } else if (data.status === 'failed' || data.status === 5) {
      status = 'failed'
    } else if (data.status === 'transcribing' || data.status === 3 || data.status === 'running') {
      status = 'transcribing'
    } else if (data.status === 'parsing') {
      status = 'parsing'
    } else if (data.percentage !== undefined && data.percentage < 100) {
      status = 'transcribing'
    }

    videoParseProgress[videoId] = {
      videoId,
      percentage: data.percentage ?? existing?.percentage ?? 0,
      status,
      error: data.error
    }
  }

  const clearVideoProgress = (videoId: number): void => {
    delete videoParseProgress[videoId]
  }

  const getVideoProgress = (videoId: number): VideoParseProgress | undefined => {
    return videoParseProgress[videoId]
  }

  const connect = (url?: string): void => {
    const targetBaseUrl = normalizeBaseUrl(url || baseUrl.value)
    if (!targetBaseUrl) {
      console.warn('[SSE] connection aborted: no baseUrl provided')
      return
    }

    disconnect()

    messageHandler = new RealtimeMessageHandler({
      onVideoProgress: (data) => {
        updateVideoProgress(data)
      },
      onVideoCompleted: () => {
        window.api.showNotification('视频解析完成', '字幕已成功提取', '/home')
        videoUploaded.value = Date.now()
      },
      onVideoFailed: (_videoId, error) => {
        window.api.showNotification('视频解析失败', error, '/home')
      },
      onVideoStatus: (data) => {
        const videoId = Number(data.video_id)
        const status = Number(data.status)
        if (status === 4) {
          updateVideoProgress({ video_id: videoId, status: 'completed', percentage: 100 })
        } else if (status === 5) {
          updateVideoProgress({
            video_id: videoId,
            status: 'failed',
            error: data.error || '处理失败'
          })
        } else if (status === 3) {
          updateVideoProgress({ video_id: videoId, status: 'transcribing' })
        } else if (status === 1 || status === 2) {
          updateVideoProgress({ video_id: videoId, status: 'parsing' })
        } else if (status === 0) {
          updateVideoProgress({ video_id: videoId, status: 'parsing', percentage: 0 })
        }
      },
      onVideoUploadBatch: (data) => {
        window.api.showNotification(
          '批量上传完成',
          data.error_count > 0
            ? `成功: ${data.success_count}, 失败: ${data.error_count}`
            : `成功上传 ${data.success_count} 个视频`,
          '/home'
        )
        videoUploaded.value = Date.now()
      },
      onSmartCutUpdated: (data) => {
        smartCutUpdated.value = Date.now()
        const isDone =
          data.task_status === 2 ||
          data.task_status === 3 ||
          data.ai_gen_video_status === 1 ||
          data.ai_gen_video_status === 3 ||
          data.ai_gen_video_status === 4
        if (isDone && data.ai_chat_id != null) {
          aiChatStore.incrementUnreadCountForChat(data.ai_chat_id)
        }
        if (data.task_status === 2 || data.ai_gen_video_status === 1) {
          const chatRoute = data.ai_chat_id != null ? `/home?chatId=${data.ai_chat_id}` : '/home'
          window.api.showNotification('智能剪辑完成', '点击查看最新剪辑结果', chatRoute)
        } else if (
          data.task_status === 3 ||
          data.ai_gen_video_status === 3 ||
          data.ai_gen_video_status === 4
        ) {
          const chatRoute = data.ai_chat_id != null ? `/home?chatId=${data.ai_chat_id}` : '/home'
          window.api.showNotification('智能剪辑失败', '请检查任务详情', chatRoute)
        }
      },
      onVideoUploaded: () => {
        videoUploaded.value = Date.now()
      },
      onUsageInfo: (data) => {
        const rawSync = data.syncedFromCloud as boolean | string | undefined
        const syncedFromCloud: boolean | undefined =
          rawSync === true || (typeof rawSync === 'string' && rawSync.toLowerCase() === 'true')
            ? true
            : rawSync === false || (typeof rawSync === 'string' && rawSync.toLowerCase() === 'false')
              ? false
              : undefined
        const usageSeconds = Number(data.usageSeconds)
        const dailyLimit = Number(data.dailyLimit)
        const totalSeconds = Number(data.totalSeconds)
        const remainingSeconds = Number(data.remainingSeconds)
        const statusNum =
          data.status === undefined || data.status === null ? undefined : Number(data.status)
        usageInfo.value = {
          usageSeconds: Number.isFinite(usageSeconds) ? usageSeconds : 0,
          dailyLimit: Number.isFinite(dailyLimit) ? dailyLimit : 0,
          totalSeconds: Number.isFinite(totalSeconds) ? totalSeconds : 0,
          remainingSeconds: Number.isFinite(remainingSeconds) ? remainingSeconds : 0,
          isVip: Boolean(data.isVip),
          expiredAt: data.expiredAt,
          status: statusNum,
          syncedFromCloud
        }
        // 已能拿到云端用量时清除 API Key 异常，否则弹窗会因 apiKeyExceptionInfo 一直显示
        const syncedNow =
          syncedFromCloud === true ||
          (syncedFromCloud === undefined && statusNum !== undefined)
        if (syncedNow) {
          apiKeyExceptionInfo.value = null
        }
      },
      onVersionUpdate: (data) => {
        versionUpdateInfo.value = data
      },
      onApiKeyException: (data) => {
        apiKeyExceptionInfo.value = { message: data.message ?? 'API Key 异常，请更换 API Key 后重试' }
      },
      onWorkspaceUpdated: () => {
        workspaceUpdated.value = Date.now()
      },
      onExportSegmentsProgress: (data) => {
        exportSegmentsProgress.value = {
          export_request_id: data.export_request_id,
          percentage: data.percentage
        }
      }
    })

    const sseUrl = `${targetBaseUrl}/api/sse`
    sseClient = new SSEClient(sseUrl, {
      onOpen: () => {
        connected.value = true
      },
      onClose: () => {
        connected.value = false
      },
      onError: () => {
        connected.value = false
      },
      onMessage: (data) => {
        messageHandler?.handle(data)
      }
    })
    sseClient.connect()
  }

  const disconnect = (): void => {
    if (sseClient) {
      sseClient.disconnect()
      sseClient = null
    }
    messageHandler = null
    connected.value = false
    usageInfo.value = {
      usageSeconds: 0,
      dailyLimit: 0,
      totalSeconds: 0,
      remainingSeconds: 0,
      isVip: false,
      expiredAt: undefined,
      status: undefined,
      syncedFromCloud: false
    }
  }

  const reauthenticate = (): void => {
    connect()
  }

  const clearVersionUpdate = (): void => {
    versionUpdateInfo.value = null
  }

  const clearApiKeyException = (): void => {
    apiKeyExceptionInfo.value = null
  }

  const setWorkspaceSelecting = (v: boolean): void => {
    workspaceSelecting.value = v
  }

  const clearExportSegmentsProgress = (): void => {
    exportSegmentsProgress.value = null
  }

  return {
    connected,
    smartCutUpdated,
    videoUploaded,
    workspaceUpdated,
    workspaceSelecting,
    exportSegmentsProgress,
    clearExportSegmentsProgress,
    baseUrl,
    videoParseProgress,
    setBaseUrl,
    connect,
    disconnect,
    reauthenticate,
    updateVideoProgress,
    usageInfo,
    userInfoReceivedFromCloud,
    isVipAvailable,
    isAwaitingCloudActivation,
    isUserBanned,
    isMembershipExpired,
    versionUpdateInfo,
    clearVersionUpdate,
    apiKeyExceptionInfo,
    clearApiKeyException,
    clearVideoProgress,
    getVideoProgress,
    setWorkspaceSelecting
  }
})
