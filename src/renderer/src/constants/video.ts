/**
 * 视频时长限制常量（单位：秒）
 */

// 源视频总时长限制（30分钟）
export const MAX_SOURCE_VIDEO_DURATION = 30 * 60 // 1800 秒

// 输出视频时长限制（3分钟）
export const MAX_OUTPUT_VIDEO_DURATION = 3 * 60 // 180 秒

/**
 * 格式化秒数为分秒显示
 * @param seconds 秒数
 * @returns 格式化字符串 (e.g., "1分30秒")
 */
export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (minutes === 0) {
    return `${secs}秒`
  }
  return `${minutes}分${secs}秒`
}

/**
 * 检查源视频总时长是否超过限制
 * @param totalDuration 总时长（秒）
 * @returns 如果超过限制则返回错误消息，否则返回 null
 */
export function checkSourceVideoDuration(totalDuration: number): string | null {
  if (totalDuration > MAX_SOURCE_VIDEO_DURATION) {
    return `源视频总时长(${formatDuration(totalDuration)})不能超过${Math.floor(MAX_SOURCE_VIDEO_DURATION / 60)}分钟`
  }
  return null
}

/**
 * 检查输出视频时长是否超过限制
 * @param duration 输出视频时长（秒）
 * @returns 如果超过限制则返回错误消息，否则返回 null
 */
export function checkOutputVideoDuration(duration: number): string | null {
  if (duration > MAX_OUTPUT_VIDEO_DURATION) {
    return `输出视频时长(${formatDuration(duration)})不能超过${Math.floor(MAX_OUTPUT_VIDEO_DURATION / 60)}分钟`
  }
  return null
}
