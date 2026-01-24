import { createRouter, createWebHashHistory } from 'vue-router'
import Splash from '../views/Splash.vue'
import Home from '../views/Home.vue'
import VideoManager from '../views/VideoManager.vue'
import Settings from '../views/Settings.vue'
import { useWebsocketStore } from '../stores/websocket'

const routes = [
  {
    path: '/',
    name: 'Splash',
    component: Splash
  },
  {
    path: '/home',
    name: 'Home',
    component: Home
  },
  {
    path: '/video-manager',
    name: 'VideoManager',
    component: VideoManager
  },
  {
    path: '/smart-editor',
    name: 'SmartEditing',
    component: () => import('../views/SmartEditing.vue')
  },
  {
    path: '/settings',
    name: 'Settings',
    component: Settings
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

// 路由守卫：检查智能剪辑页面是否需要 apiKey
router.beforeEach((to, _from, next) => {
  // 如果访问智能剪辑页面但没有 apiKey，重定向到首页
  if (to.path === '/smart-editor' && !localStorage.getItem('apiKey')) {
    next({ path: '/home' })
    return
  }
  next()
})

export default router
