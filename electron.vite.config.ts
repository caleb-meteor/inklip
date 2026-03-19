import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [vue()],
    // 开发模式预构建依赖，加快首屏加载
    optimizeDeps: {
      include: ['vue', 'vue-router', 'pinia', 'naive-ui', 'axios']
    }
  }
})
