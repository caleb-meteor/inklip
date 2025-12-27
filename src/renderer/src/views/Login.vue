<script setup lang="ts">
import { ref } from 'vue'
import { PersonOutline, LockClosedOutline } from '@vicons/ionicons5'
import {
  NCard,
  NForm,
  NFormItem,
  NInput,
  NButton,
  NIcon,
  NH1,
  NText,
  useMessage,
  type FormInst
} from 'naive-ui'

import { useRouter } from 'vue-router'
import { login } from '../router'
import { loginApi } from '../api/login'
import { useWebsocketStore } from '../stores/websocket'

const wsStore = useWebsocketStore()

const router = useRouter()
const formRef = ref<FormInst | null>(null)
const message = useMessage()
const loading = ref(false)
const formValue = ref({
  username: '',
  password: ''
})

const handleLogin = (e: MouseEvent): void => {
  e.preventDefault()
  formRef.value?.validate((errors): void => {
    if (!errors) {
      loading.value = true
      loginApi(formValue.value)
        .then((data) => {
          message.success('登录成功')
          // Save token and user info
          localStorage.setItem('token', data.token)
          localStorage.setItem('userInfo', JSON.stringify(data.user))

          login() // Update auth state
          wsStore.connect()
          router.push('/home')
        })
        .finally(() => {
          loading.value = false
        })
    } else {
      message.error('输入无效')
    }
  })
}
</script>

<template>
  <div class="login-container">
    <div class="login-content">
      <div class="brand-section">
        <n-h1 class="app-title"> <n-text type="primary">影氪</n-text> 剪辑 </n-h1>
        <p class="app-subtitle">专业级视频创作平台</p>
      </div>

      <n-card class="login-card" :bordered="false" size="large">
        <n-form ref="formRef" :model="formValue" size="large">
          <n-form-item path="username" :show-label="false">
            <n-input v-model:value="formValue.username" placeholder="用户名" class="custom-input">
              <template #prefix>
                <n-icon :component="PersonOutline" />
              </template>
            </n-input>
          </n-form-item>

          <n-form-item path="password" :show-label="false">
            <n-input
              v-model:value="formValue.password"
              type="password"
              show-password-on="click"
              placeholder="密码"
              class="custom-input"
            >
              <template #prefix>
                <n-icon :component="LockClosedOutline" />
              </template>
            </n-input>
          </n-form-item>

          <div class="actions">
            <n-button
              type="primary"
              block
              size="large"
              class="login-btn"
              :loading="loading"
              @click="handleLogin"
            >
              登录
            </n-button>
          </div>
        </n-form>
      </n-card>

      <div class="footer-links">
        <n-text depth="3">忘记密码？</n-text>
        <n-text depth="3">注册新账号</n-text>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-container {
  height: 100vh;
  width: 100vw;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #0f0f13; /* Very dark background */
  background-image: radial-gradient(circle at 50% 0%, #2a2a35 0%, #0f0f13 75%);
  color: #fff;
}

.login-content {
  width: 100%;
  max-width: 400px;
  padding: 20px;
  animation: fadeIn 0.8s ease-out;
}

.brand-section {
  text-align: center;
  margin-bottom: 2rem;
}

.app-title {
  margin: 0;
  font-weight: 800;
  letter-spacing: -0.5px;
  background: linear-gradient(120deg, #fff, #888);
  -webkit-background-clip: text;
  background-clip: text;
}

.app-subtitle {
  margin-top: 0.5rem;
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.9rem;
  letter-spacing: 0.5px;
}

.login-card {
  background: rgba(30, 30, 35, 0.6);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
}

.custom-input {
  background-color: rgba(0, 0, 0, 0.2) !important;
  border-radius: 8px;
}

/* Override naive-ui input styles for a darker feel */
:deep(.n-input) {
  background-color: rgba(0, 0, 0, 0.2);
}
:deep(.n-input:hover),
:deep(.n-input:focus-within) {
  background-color: rgba(0, 0, 0, 0.3);
}

.login-btn {
  margin-top: 1rem;
  font-weight: 600;
  letter-spacing: 0.5px;
  height: 48px;
  border-radius: 8px;
  background: linear-gradient(90deg, #63e2b7 0%, #42ca9f 100%);
  border: none;
  color: #000;
  transition:
    transform 0.2s,
    box-shadow 0.2s;
}

.login-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(99, 226, 183, 0.3);
}

.login-btn:active {
  transform: translateY(1px);
}

.footer-links {
  margin-top: 1.5rem;
  display: flex;
  justify-content: space-between;
  font-size: 0.85rem;
  padding: 0 10px;
}

.footer-links .n-text {
  cursor: pointer;
  transition: color 0.2s;
}

.footer-links .n-text:hover {
  color: #63e2b7;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
