import { ref } from 'vue'
import { getDeviceId } from '../api/config'

/** 本机设备标识无法读取（与后端 GetDeviceID 失败一致），需阻断使用并提示 */
export const deviceUnavailable = ref(false)

/** 调用后端 /user/device-id；成功则允许连接 SSE，失败则标记 deviceUnavailable */
export async function runDeviceCheck(): Promise<boolean> {
  try {
    const res = await getDeviceId()
    const id = typeof res?.device_id === 'string' ? res.device_id.trim() : ''
    if (!id) {
      deviceUnavailable.value = true
      return false
    }
    deviceUnavailable.value = false
    return true
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // 后端 FailWithErr 为「获取设备ID失败」等；其它错误（如未连上本地服务）不误判为设备缺失
    if (
      msg.includes('设备ID') ||
      msg.includes('获取设备') ||
      msg.includes('IOPlatformUUID') ||
      msg.includes('MachineGuid')
    ) {
      deviceUnavailable.value = true
      return false
    }
    deviceUnavailable.value = false
    return true
  }
}
