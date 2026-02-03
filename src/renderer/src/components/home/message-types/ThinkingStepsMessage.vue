<script setup lang="ts">
import type { PropType } from 'vue'

defineProps({
  steps: {
    type: Array as PropType<Array<{ label: string; state: 'wait' | 'process' | 'finish' | 'error' }>>,
    required: true
  }
})
</script>

<template>
  <div class="thinking-container">
    <div class="thinking-header">💭 思考过程</div>
    <div class="thinking-content">
      <div
        v-for="(step, index) in steps"
        :key="index"
        class="thinking-step"
        :class="step.state"
      >
        <div class="step-indicator">
          <div v-if="step.state === 'finish'" class="step-complete">✓</div>
          <div v-else-if="step.state === 'process'" class="step-loading">
            <span class="dot"></span><span class="dot"></span><span class="dot"></span>
          </div>
          <div v-else-if="step.state === 'error'" class="step-error">✕</div>
          <div v-else class="step-wait"></div>
        </div>
        <span class="step-text">{{ step.label }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.thinking-container {
  margin-top: 16px;
  padding: 16px;
  background: rgba(24, 24, 27, 0.4);
  backdrop-filter: blur(10px);
  border-radius: 16px;
  border: 1px solid rgba(79, 172, 254, 0.15);
}

.thinking-header {
  font-size: 14px;
  font-weight: 700;
  background: linear-gradient(to right, #4facfe, #00f2fe);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.thinking-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.thinking-step {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: #71717a;
  transition: all 0.3s ease;
}

.thinking-step.finish {
  color: #efeff1;
}

.thinking-step.process {
  color: #4facfe;
  font-weight: 600;
}

.thinking-step.error {
  color: #fca5a5;
}

.step-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.step-complete {
  width: 18px;
  height: 18px;
  background: linear-gradient(135deg, #4facfe, #00f2fe);
  color: #000;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 800;
  box-shadow: 0 0 8px rgba(0, 242, 254, 0.4);
}

.step-loading {
  display: flex;
  gap: 3px;
  align-items: center;
}

.step-loading .dot {
  width: 5px;
  height: 5px;
  background: #00f2fe;
  border-radius: 50%;
  animation: loading 1.4s infinite;
  box-shadow: 0 0 5px rgba(0, 242, 254, 0.6);
}

.step-loading .dot:nth-child(1) {
  animation-delay: 0s;
}

.step-loading .dot:nth-child(2) {
  animation-delay: 0.2s;
}

.step-loading .dot:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes loading {
  0%, 100% {
    opacity: 0.4;
    transform: scale(0.8);
  }
  50% {
    opacity: 1;
    transform: scale(1.2);
  }
}

.step-error {
  width: 18px;
  height: 18px;
  background: rgba(239, 68, 68, 0.1);
  color: #fca5a5;
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: bold;
}

.step-wait {
  width: 8px;
  height: 8px;
  background: #555;
  border-radius: 50%;
}

.step-text {
  flex: 1;
}
</style>
