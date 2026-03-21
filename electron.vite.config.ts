import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  main: {
    build: {
      // 默认会 externalize 全部 dependencies，asar 里被迫带整棵 node_modules；关闭后仅打进实际 import 的代码（含 @electron-toolkit/utils）
      externalizeDeps: false
    }
  },
  preload: {
    build: {
      externalizeDeps: false
    }
  },
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
