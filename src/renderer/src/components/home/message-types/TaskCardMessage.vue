<script setup lang="ts">
import { computed, type PropType } from 'vue'

export interface TaskStep {
  label: string
  status: 'pending' | 'processing' | 'completed' | 'error'
  detail?: string // 例如：匹配到的字典名称
}

const props = defineProps({
  steps: {
    type: Array as PropType<TaskStep[]>,
    required: true
  }
})

const allCompleted = computed(() => {
  return props.steps.every(step => step.status === 'completed')
})
</script>

<template>
  <div class="task-card" :class="{ completed: allCompleted }">
    <div class="task-steps">
      <div
        v-for="(step, index) in steps"
        :key="index"
        class="task-step"
        :class="step.status"
      >
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
.task-card {
  margin-top: 16px;
  padding: 20px;
  background: rgba(24, 24, 27, 0.4);
  backdrop-filter: blur(10px);
  border-radius: 16px;
  border: 1px solid rgba(79, 172, 254, 0.15);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.task-card.completed {
  border-color: rgba(0, 242, 254, 0.3);
  background: rgba(24, 24, 27, 0.6);
  box-shadow: 0 4px 20px rgba(0, 242, 254, 0.1);
}

.task-steps {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.task-step {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  transition: all 0.3s ease;
}

.task-step.pending {
  opacity: 0.4;
}

.task-step.processing {
  opacity: 1;
  background: rgba(79, 172, 254, 0.05);
  margin: -8px;
  padding: 8px;
  border-radius: 10px;
  box-shadow: inset 0 0 10px rgba(79, 172, 254, 0.1);
}

.task-step.completed {
  opacity: 1;
}

.step-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  margin-top: 2px;
}

.step-check {
  width: 20px;
  height: 20px;
  background: linear-gradient(135deg, #4facfe, #00f2fe);
  color: #000;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 800;
  box-shadow: 0 0 10px rgba(0, 242, 254, 0.5);
  animation: scaleIn 0.3s ease;
}

@keyframes scaleIn {
  from { transform: scale(0); }
  to { transform: scale(1); }
}

.step-error {
  width: 20px;
  height: 20px;
  background: linear-gradient(135deg, #ef4444, #dc2626);
  color: #fff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 800;
  box-shadow: 0 0 10px rgba(239, 68, 68, 0.5);
  animation: scaleIn 0.3s ease;
}

.step-loading {
  display: flex;
  gap: 4px;
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

.step-loading .dot:nth-child(1) { animation-delay: 0s; }
.step-loading .dot:nth-child(2) { animation-delay: 0.2s; }
.step-loading .dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes loading {
  0%, 100% { opacity: 0.3; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.2); }
}

.step-pending {
  width: 10px;
  height: 10px;
  background: #3f3f46;
  border-radius: 50%;
  margin: 7px;
}

.step-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.step-label {
  font-size: 15px;
  font-weight: 600;
  color: #efeff1;
  line-height: 1.5;
}

.task-step.pending .step-label {
  color: #71717a;
}

.task-step.processing .step-label {
  color: #4facfe;
  font-weight: 700;
}

.task-step.completed .step-label {
  color: #efeff1;
}

.task-step.error .step-label {
  color: #ef4444;
}

.step-detail {
  font-size: 13px;
  color: #71717a;
  line-height: 1.4;
  margin-top: 2px;
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 4px;
}
</style>
