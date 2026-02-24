<script setup lang="ts">
import { computed, type PropType } from 'vue'

export interface TaskStep {
  label: string
  status: 'pending' | 'processing' | 'completed' | 'error'
  detail?: string
}

const props = defineProps({
  steps: {
    type: Array as PropType<TaskStep[]>,
    required: true
  },
  title: {
    type: String,
    default: '视频筛选分析'
  }
})

const allCompleted = computed(() => {
  return props.steps.every((step) => step.status === 'completed')
})
</script>

<template>
  <div class="filter-task-card" :class="{ completed: allCompleted }">
    <div class="card-header">
      <div class="header-icon">🔍</div>
      <div class="header-title">{{ title }}</div>
    </div>

    <div class="task-steps">
      <div v-for="(step, index) in steps" :key="index" class="task-step" :class="step.status">
        <div class="step-indicator">
          <div v-if="step.status === 'completed'" class="step-check">✓</div>
          <div v-else-if="step.status === 'error'" class="step-error">!</div>
          <div v-else-if="step.status === 'processing'" class="step-loading">
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="dot"></span>
          </div>
          <div v-else class="step-pending"></div>
        </div>
        <div class="step-content">
          <div class="step-label">{{ step.label }}</div>
          <div v-if="step.detail" class="step-detail">{{ step.detail }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.filter-task-card {
  margin-top: 12px;
  padding: 16px;
  background: rgba(32, 32, 35, 0.6);
  backdrop-filter: blur(20px);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  transition: all 0.3s ease;
}

.filter-task-card.completed {
  border-color: rgba(79, 172, 254, 0.3);
  background: rgba(24, 24, 27, 0.8);
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.header-icon {
  font-size: 16px;
}

.header-title {
  font-size: 14px;
  font-weight: 600;
  color: #efeff1;
  letter-spacing: 0.5px;
}

.task-steps {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.task-step {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  transition: all 0.3s ease;
}

.task-step.pending {
  opacity: 0.3;
}

.task-step.processing {
  opacity: 1;
}

.step-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  margin-top: 2px;
  flex-shrink: 0;
}

.step-check {
  color: #4facfe;
  font-weight: bold;
}

.step-error {
  color: #ff4d4f;
  font-weight: bold;
}

.step-pending {
  width: 6px;
  height: 6px;
  background: #3f3f46;
  border-radius: 50%;
}

.step-loading {
  display: flex;
  gap: 2px;
}

.step-loading .dot {
  width: 3px;
  height: 3px;
  background: #4facfe;
  border-radius: 50%;
  animation: dot-pulse 1.5s infinite ease-in-out;
}

.step-loading .dot:nth-child(2) {
  animation-delay: 0.2s;
}
.step-loading .dot:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes dot-pulse {
  0%,
  80%,
  100% {
    transform: scale(0);
    opacity: 0;
  }
  40% {
    transform: scale(1);
    opacity: 1;
  }
}

.step-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.step-label {
  font-size: 13px;
  color: #d1d1d6;
}

.task-step.processing .step-label {
  color: #4facfe;
  font-weight: 500;
}

.step-detail {
  font-size: 11px;
  color: #71717a;
}
</style>
