import axios, { type AxiosInstance, type AxiosResponse } from 'axios'
import { createDiscreteApi, darkTheme } from 'naive-ui'
import { isDevRenderer } from './isDevRenderer'

// Define the API Response structure
export interface ApiResponse<T = any> {
  code: number
  message: string
  data: T
}

/** 根据异常类型返回统一文案，供拦截器与业务层复用 */
export function getNetworkErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') return '网络异常，请稍后重试'
  const err = error as Record<string, unknown>
  const msg = typeof err.message === 'string' ? err.message : ''
  if (err.code === 'ECONNABORTED' || msg.includes('timeout')) return '请求超时，请检查网络后重试'
  if (err.code === 'ERR_NETWORK' || msg.includes('Network Error')) return '网络连接失败，请检查网络'
  if (msg) return msg
  return '网络异常，请稍后重试'
}

// Create discrete API for using message outside of components
const { message } = createDiscreteApi(['message'], {
  configProviderProps: {
    theme: darkTheme
  },
  messageProviderProps: {
    duration: 5000,
    keepAliveOnHover: true,
    closable: true
  }
})

// Create Axios instance
const service: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api', // Use environment variable or default
  timeout: 10000
})

// Request interceptor
service.interceptors.request.use(
  (config) => {
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor：业务错误与网络异常均在此统一弹窗提示，页面层无需 try-catch
service.interceptors.response.use(
  (response: AxiosResponse<ApiResponse>) => {
    const res = response.data
    // 兼容 JSON 里 code 被序列化为字符串等情况
    const ok = Number(res.code) === 0
    if (!ok) {
      message.error(res.message || '请求失败')
      return Promise.reject(new Error(res.message || '请求失败'))
    }
    return res.data
  },
  (error) => {
    // silent 为 true 时不弹窗（如上报设备版本等后台请求）
    const silent = (error.config as { silent?: boolean })?.silent
    if (!silent) {
      const text = getNetworkErrorMessage(error)
      message.error(text)
    }
    if (isDevRenderer) {
      console.error('[request]', error)
    }
    return Promise.reject(error)
  }
)

export const setBaseUrl = (url: string): void => {
  service.defaults.baseURL = url
}

export default service
