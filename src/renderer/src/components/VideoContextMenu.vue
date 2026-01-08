<script setup lang="ts">
import { NIcon } from 'naive-ui'
import { CreateOutline, FolderOutline, TrashOutline } from '@vicons/ionicons5'
import type { FileItem } from '../types/video'

interface Props {
  file: FileItem | null
  position: { x: number; y: number }
}

const props = defineProps<Props>()

const emit = defineEmits<{
  rename: []
  group: []
  removeGroup: []
  anchor: []
  removeAnchor: []
  product: []
  removeProduct: []
  delete: []
}>()
</script>

<template>
  <div
    v-if="props.file"
    class="context-menu"
    :style="{
      position: 'fixed',
      left: props.position.x + 'px',
      top: props.position.y + 'px',
      zIndex: 1000
    }"
    @click.stop
  >
    <div class="context-menu-content">
      <div class="context-menu-item" @click="emit('rename')">
        <n-icon><CreateOutline /></n-icon>
        <span>重命名</span>
      </div>
      <div 
        v-if="props.file.categories?.find(c => c.type === 'video_group')" 
        class="context-menu-item" 
        @click="emit('removeGroup')"
      >
        <n-icon><FolderOutline /></n-icon>
        <span>移除分组</span>
      </div>
      <div 
        v-else 
        class="context-menu-item" 
        @click="emit('group')"
      >
        <n-icon><FolderOutline /></n-icon>
        <span>设置分组</span>
      </div>
      <div 
        v-if="props.file.categories?.find(c => c.type === 'video_anchor')" 
        class="context-menu-item" 
        @click="emit('removeAnchor')"
      >
        <n-icon><FolderOutline /></n-icon>
        <span>移除主播</span>
      </div>
      <div 
        v-else 
        class="context-menu-item" 
        @click="emit('anchor')"
      >
        <n-icon><FolderOutline /></n-icon>
        <span>设置主播</span>
      </div>
      <div 
        v-if="props.file.categories?.find(c => c.type === 'video_product')" 
        class="context-menu-item" 
        @click="emit('removeProduct')"
      >
        <n-icon><FolderOutline /></n-icon>
        <span>移除产品</span>
      </div>
      <div 
        v-else 
        class="context-menu-item" 
        @click="emit('product')"
      >
        <n-icon><FolderOutline /></n-icon>
        <span>设置产品</span>
      </div>
      <div class="context-menu-divider"></div>
      <div class="context-menu-item context-menu-item-danger" @click="emit('delete')">
        <n-icon><TrashOutline /></n-icon>
        <span>删除</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.context-menu {
  background: #2d2d2d;
  border: 1px solid #444;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  min-width: 150px;
  overflow: hidden;
}

.context-menu-content {
  padding: 4px 0;
}

.context-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  cursor: pointer;
  color: #e0e0e0;
  font-size: 14px;
  transition: background-color 0.2s;
}

.context-menu-item:hover {
  background: rgba(99, 226, 183, 0.15);
  color: #63e2b7;
}

.context-menu-item-danger {
  color: #d03050;
}

.context-menu-item-danger:hover {
  background: rgba(208, 48, 80, 0.15);
  color: #d03050;
}

.context-menu-divider {
  height: 1px;
  background: #444;
  margin: 4px 0;
}

.context-menu-item .n-icon {
  font-size: 16px;
}
</style>

