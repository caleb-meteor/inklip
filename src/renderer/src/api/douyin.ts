import request from '../utils/request'

/** 抖音素材屏外下载：向本地 Go 申请云端 task_id（与 export-segments 同源中间件） */
export function prepareDouyinOffscreenDownloadApi(awemeId: string): Promise<{ task_id: string }> {
  return request({
    url: '/api/douyin/offscreen-download',
    method: 'post',
    data: { aweme_id: awemeId },
    timeout: 60_000
  })
}

/** 屏外下载结束后回写云端任务状态；成功时可写入 export_videos（无字幕行） */
export function finishDouyinOffscreenDownloadApi(payload: {
  task_id: string
  success: boolean
  error?: string
  /** 当前工作区 id，与 output_path 同时提供时写入本地导出表 */
  workspace_id?: number
  suggested_name?: string
  output_path?: string
}): Promise<void> {
  return request({
    url: '/api/douyin/offscreen-download/complete',
    method: 'post',
    data: {
      task_id: payload.task_id,
      success: payload.success,
      error: payload.error ?? '',
      workspace_id: payload.workspace_id ?? 0,
      suggested_name: payload.suggested_name ?? '',
      output_path: payload.output_path ?? ''
    },
    timeout: 30_000
  })
}
