import axios, { type AxiosInstance, type AxiosResponse } from 'axios'
import { createDiscreteApi, darkTheme } from 'naive-ui'
import { useWebsocketStore } from '../stores/websocket'

// Define the API Response structure
export interface ApiResponse<T = any> {
  code: number
  message: string
  data: T
}

// Create discrete API for using message outside of components
const { message } = createDiscreteApi(['message'], {
  configProviderProps: {
    theme: darkTheme
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
    // Add token if available
    const token = localStorage.getItem('token')
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor
service.interceptors.response.use(
  (response: AxiosResponse<ApiResponse>) => {
    const res = response.data

    // 检查是否有 x-refresh-token，如果有则更新本地 token
    const refreshToken = response.headers['x-refresh-token']
    if (refreshToken) {
      const oldToken = localStorage.getItem('token')
      localStorage.setItem('token', refreshToken)
      // 如果 token 发生变化且 WebSocket 已连接，重新发送认证信息
      if (oldToken !== refreshToken) {
        // 在函数内部获取 store 实例，避免在模块级别调用
        try {
          const wsStore = useWebsocketStore()
          wsStore.reauthenticate()
        } catch (error) {
          // Pinia 未初始化时忽略错误（在应用启动前可能发生）
          console.debug('WebSocket store not available:', error)
        }
      }
    }

    // Check if code is 0 (success)
    if (res.code !== 0) {
      // Show error message using standard naive-ui message (top banner)
      message.error(res.message || 'Error occurred')

      // Handle specifically 50008: Illegal token; 50012: Other clients logged in; 50014: Token expired;
      if (res.code === 50008 || res.code === 50012 || res.code === 50014) {
        // Clear token and disconnect WebSocket
        localStorage.removeItem('token')
        localStorage.removeItem('userInfo')
        // 在函数内部获取 store 实例，避免在模块级别调用
        try {
          const wsStore = useWebsocketStore()
          wsStore.disconnect()
        } catch (error) {
          // Pinia 未初始化时忽略错误（在应用启动前可能发生）
          console.debug('WebSocket store not available:', error)
        }
        // Redirect to login page
        if (window.location.hash !== '#/login') {
          window.location.hash = '/login'
        }
      }
      return Promise.reject(new Error(res.message || 'Error'))
    } else {
      return res.data
    }
  },
  (error) => {
    console.error('err' + error) // for debug
    message.error(error.message || 'Request Failed')
    return Promise.reject(error)
  }
)

export const setBaseUrl = (url: string): void => {
  service.defaults.baseURL = url
}

export default service
