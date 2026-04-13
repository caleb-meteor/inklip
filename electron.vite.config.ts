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
      externalizeDeps: false,
      rollupOptions: {
        input: {
          index: resolve('src/preload/index.ts'),
          'douyin-webview': resolve('src/preload/douyin-webview.ts')
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [
      vue({
        template: {
          compilerOptions: {
            // Electron <webview> 为原生标签，勿当 Vue 组件解析
            isCustomElement: (tag) => tag === 'webview'
          }
        }
      })
    ],
    // 开发模式预构建依赖，加快首屏加载
    optimizeDeps: {
      include: ['vue', 'vue-router', 'pinia', 'naive-ui', 'axios']
    }
  }
})
