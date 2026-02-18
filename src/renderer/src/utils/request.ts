import axios, { type AxiosInstance, type AxiosResponse } from 'axios'
import { createDiscreteApi, darkTheme } from 'naive-ui'

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

    // Check if code is 0 (success)
    if (res.code !== 0) {
      // Show error message using standard naive-ui message (top banner)
      message.error(res.message || 'Error occurred')
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
