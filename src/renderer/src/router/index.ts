import { createRouter, createWebHashHistory } from 'vue-router'
import Splash from '../views/Splash.vue'
import Home from '../views/Home.vue'
import Settings from '../views/Settings.vue'

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
    path: '/settings',
    name: 'Settings',
    component: Settings
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
