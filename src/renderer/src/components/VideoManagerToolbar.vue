<script setup lang="ts">
import { ref, watch } from 'vue'
import { NButton, NSpace, NInput, NIcon } from 'naive-ui'
import { SearchOutline, HomeOutline } from '@vicons/ionicons5'
import type { DictItem } from '../api/dict'

interface Props {
  isRefreshing: boolean
  currentGroup: DictItem | null
}

const props = defineProps<Props>()

const searchKeyword = ref('')

const emit = defineEmits<{
  refresh: []
  goHome: []
  search: [keyword: string]
}>()

// 防抖函数
const debounce = <T extends (...args: any[]) => void>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: ReturnType<typeof setTimeout> | null = null
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null
      func(...args)
    }
    if (timeout) {
      clearTimeout(timeout)
    }
    timeout = setTimeout(later, wait)
  }
}

// 防抖的搜索函数
const debouncedSearch = debounce((keyword: string) => {
  emit('search', keyword)
}, 300)

// 监听搜索关键词变化（带防抖）
watch(searchKeyword, (newKeyword) => {
  debouncedSearch(newKeyword)
})
</script>

<template>
  <div class="toolbar">
    <n-space justify="space-between" align="center" style="height: 100%">
      <div>
        <n-button text size="small" @click="emit('goHome')">
          <template #icon>
            <n-icon><HomeOutline /></n-icon>
          </template>
          <span>返回首页</span>
        </n-button>
      </div>

      <n-space>
        <n-input 
          v-model:value="searchKeyword"
          size="small" 
          placeholder="搜索视频名称"
          clearable
        >
          <template #prefix>
            <n-icon :component="SearchOutline" />
          </template>
        </n-input>
      </n-space>
    </n-space>
  </div>
</template>

<style scoped>
.toolbar {
  width: 100%;
  height: 100%;
  padding: 0 16px;
  background: #2d2d2d;
  border-bottom: 1px solid #1e1e1e;
  /* display: flex; */
  /* align-items: center; */
}

.group-info {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  background: rgba(99, 226, 183, 0.1);
  border: 1px solid rgba(99, 226, 183, 0.3);
  border-radius: 4px;
  color: #63e2b7;
  font-size: 13px;
}

.group-info .n-icon {
  font-size: 16px;
}
</style>

