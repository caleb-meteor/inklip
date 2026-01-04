<script setup lang="ts">
import { computed, h, ref, watch } from 'vue'
import { NTree, NIcon, NDivider } from 'naive-ui'
import { FilmOutline } from '@vicons/ionicons5'
import type { DictItem } from '../api/dict'
import type { TreeOption } from 'naive-ui'

interface Props {
  groups: DictItem[]
  activeKey: string | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  menuSelect: [key: string]
  groupContextMenu: [event: MouseEvent, groupId: number]
}>()

const expandedKeys = ref<string[]>([])

// 分组树形数据
const groupsTreeData = computed<TreeOption[]>(() => {
  return props.groups.map(group => ({
    label: group.name,
    key: `group-${group.id}`,
    groupId: group.id,
    isLeaf: true
  }))
})

// 分组选中keys
const groupsSelectedKeys = computed(() => {
  if (props.activeKey && props.activeKey.startsWith('group-')) {
    return [props.activeKey]
  }
  return []
})

const handleAllVideosClick = () => {
  emit('menuSelect', 'all')
}

const handleGroupsSelect = (keys: Array<string | number>) => {
  if (keys.length > 0) {
    const key = String(keys[0])
    emit('menuSelect', key)
  }
}

// 使用 node-props 处理右键菜单
function nodeProps({ option }: { option: TreeOption }) {
  return {
    onContextmenu(e: MouseEvent): void {
      // 检查是否是分组节点（key 以 group- 开头）
      const key = String(option.key || '')
      if (key.startsWith('group-')) {
        e.preventDefault()
        e.stopPropagation()
        const groupId = parseInt(key.replace('group-', ''))
        if (!isNaN(groupId)) {
          emit('groupContextMenu', e, groupId)
        }
      }
    },
    class: 'group-node'
  }
}
</script>

<template>
  <div class="sidebar">
        <!-- 全部视频 -->
        <div 
          class="all-videos-item"
          :class="{ 'is-selected': activeKey === 'all' }"
          @click="handleAllVideosClick"
        >
          <n-icon class="item-icon"><FilmOutline /></n-icon>
          <span class="item-label">全部视频</span>
        </div>
        
        <!-- 分割线 -->
        <n-divider dashed style="margin: 10px 0;font-size: 12px;"> 分组 </n-divider>
        <!-- 分组列表 -->
        <n-tree
          v-if="groups.length > 0"
          :data="groupsTreeData"
          :selected-keys="groupsSelectedKeys"
          :expanded-keys="expandedKeys"
          :default-expand-all="true"
          selectable
          block-line
          :node-props="nodeProps"
          @update:selected-keys="handleGroupsSelect"
          @update:expanded-keys="(keys) => expandedKeys = keys as string[]"
        >
        </n-tree>
  </div>
</template>

<style scoped>
.sidebar {
  background: #252526;
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.tree-wrapper {
  padding: 8px 0;
  flex: 1;
  overflow-y: auto;
}

/* 全部视频项样式 */
.all-videos-item {
  display: flex;
  align-items: center;
  padding: 4px 12px;
  margin: 8px 8px 0 8px;
  border-radius: 6px;
  min-height: 28px;
  cursor: pointer;
  transition: all 0.15s ease;
  color: #e0e0e0;
  font-size: 15px;
}

.all-videos-item:hover {
  background-color: rgba(255, 255, 255, 0.08);
}

.all-videos-item.is-selected {
  background-color: #007AFF !important;
  color: #ffffff !important;
}

.all-videos-item.is-selected .item-icon {
  color: #ffffff !important;
}

.item-icon {
  margin-right: 6px;
  font-size: 16px;
  width: 16px;
  height: 16px;
  color: #e0e0e0;
  display: flex;
  align-items: center;
}

.item-label {
  flex: 1;
  line-height: 20px;
  user-select: none;
}

/* Tree 组件样式，与全部视频对齐 */
:deep(.n-tree.n-tree--block-line .n-tree-node-content) {
  padding: 6px 8px 4px 0;
  margin: 0;
}


/* Tree 组件选中状态样式，与全部视频保持一致 */
:deep(.n-tree.n-tree--block-line .n-tree-node:not(.n-tree-node--disabled).n-tree-node--selected .n-tree-node-content) {
  color: #ffffff !important;
}

:deep(.n-tree.n-tree--block-line .n-tree-node:not(.n-tree-node--disabled).n-tree-node--selected .n-tree-node-content .n-icon) {
  color: #ffffff !important;
}

</style>

