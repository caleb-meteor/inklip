import { createRouter, createWebHashHistory } from 'vue-router'
import Splash from '../views/Splash.vue'
import Login from '../views/Login.vue'
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
    component: Home,
    meta: { requiresAuth: true }
  },
  {
    path: '/login',
    name: 'Login',
    component: Login
  },
  {
    path: '/video-manager',
    name: 'VideoManager',
    component: VideoManager,
    meta: { requiresAuth: true }
  },
  {
    path: '/smart-editor',
    name: 'SmartEditing',
    component: () => import('../views/SmartEditing.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/settings',
    name: 'Settings',
    component: Settings,
    meta: { requiresAuth: true }
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

// Simple auth check simulation
// The state is persisted in localStorage
router.beforeEach((to, _from, next) => {
  const isAuth = !!localStorage.getItem('token')

  // Allow Splash and Login pages
  if (to.path === '/' || to.path === '/login') {
    if (to.path === '/login' && isAuth) {
      // Optionally redirect to Home if already logged in,
      // BUT since Splash handles the initial check, let Login be just Login.
      // If user manually goes to /login, let them.
      // Or redirect to home:
      next({ path: '/home' })
      return
    }
    next()
    return
  }

  if (to.matched.some((record) => record.meta.requiresAuth)) {
    if (!isAuth) {
      next({
        path: '/login',
        query: { redirect: to.fullPath }
      })
    } else {
      next()
    }
  } else {
    next()
  }
})

// Export a method to simulate login for now
export const login = (): void => {
  // Persistence is handled in Login.vue by setting localStorage
}

export const logout = (): void => {
  localStorage.removeItem('token')
  localStorage.removeItem('userInfo')
  const wsStore = useWebsocketStore()
  wsStore.disconnect()
}

export default router
