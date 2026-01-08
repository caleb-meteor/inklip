<script setup lang="ts">
import { computed, h, ref, watch } from 'vue'
import { NTree, NIcon, NDivider } from 'naive-ui'
import { FilmOutline, ChevronDownOutline, ChevronForwardOutline } from '@vicons/ionicons5'
import type { DictItem } from '../api/dict'
import type { TreeOption } from 'naive-ui'

interface Props {
  groups: DictItem[]
  anchors: DictItem[]
  products: DictItem[]
  activeKey: string | null
  activeGroupId?: number | null
  activeAnchorId?: number | null
  activeProductId?: number | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  menuSelect: [key: string]
  groupContextMenu: [event: MouseEvent, groupId: number]
  anchorContextMenu: [event: MouseEvent, anchorId: number]
  productContextMenu: [event: MouseEvent, productId: number]
}>()

const expandedKeys = ref<string[]>([])

// 折叠状态
const isGroupsExpanded = ref(true)
const isAnchorsExpanded = ref(true)
const isProductsExpanded = ref(true)

// 分组树形数据
const groupsTreeData = computed<TreeOption[]>(() => {
  return props.groups.map(group => ({
    label: group.name,
    key: `group-${group.id}`,
    groupId: group.id,
    isLeaf: true
  }))
})

// 主播树形数据
const anchorsTreeData = computed<TreeOption[]>(() => {
  return props.anchors.map(anchor => ({
    label: anchor.name,
    key: `anchor-${anchor.id}`,
    anchorId: anchor.id,
    isLeaf: true
  }))
})

// 产品树形数据
const productsTreeData = computed<TreeOption[]>(() => {
  return props.products.map(product => ({
    label: product.name,
    key: `product-${product.id}`,
    productId: product.id,
    isLeaf: true
  }))
})

// 分组选中keys
const groupsSelectedKeys = computed(() => {
  if (props.activeGroupId !== null && props.activeGroupId !== undefined) {
    return [`group-${props.activeGroupId}`]
  }
  return []
})

// 主播选中keys
const anchorsSelectedKeys = computed(() => {
  if (props.activeAnchorId !== null && props.activeAnchorId !== undefined) {
    return [`anchor-${props.activeAnchorId}`]
  }
  return []
})

// 产品选中keys
const productsSelectedKeys = computed(() => {
  if (props.activeProductId !== null && props.activeProductId !== undefined) {
    return [`product-${props.activeProductId}`]
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

const handleAnchorsSelect = (keys: Array<string | number>) => {
  if (keys.length > 0) {
    const key = String(keys[0])
    emit('menuSelect', key)
  }
}

const handleProductsSelect = (keys: Array<string | number>) => {
  if (keys.length > 0) {
    const key = String(keys[0])
    emit('menuSelect', key)
  }
}

// 使用 node-props 处理右键菜单
function groupNodeProps({ option }: { option: TreeOption }) {
  return {
    onContextmenu(e: MouseEvent): void {
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

function anchorNodeProps({ option }: { option: TreeOption }) {
  return {
    onContextmenu(e: MouseEvent): void {
      const key = String(option.key || '')
      if (key.startsWith('anchor-')) {
        e.preventDefault()
        e.stopPropagation()
        const anchorId = parseInt(key.replace('anchor-', ''))
        if (!isNaN(anchorId)) {
          emit('anchorContextMenu', e, anchorId)
        }
      }
    },
    class: 'anchor-node'
  }
}

function productNodeProps({ option }: { option: TreeOption }) {
  return {
    onContextmenu(e: MouseEvent): void {
      const key = String(option.key || '')
      if (key.startsWith('product-')) {
        e.preventDefault()
        e.stopPropagation()
        const productId = parseInt(key.replace('product-', ''))
        if (!isNaN(productId)) {
          emit('productContextMenu', e, productId)
        }
      }
    },
    class: 'product-node'
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
        
        <!-- 分组标题（可折叠） -->
        <div class="section-header" @click="isGroupsExpanded = !isGroupsExpanded">
          <n-icon class="collapse-icon" :class="{ 'is-expanded': isGroupsExpanded }">
            <ChevronDownOutline v-if="isGroupsExpanded" />
            <ChevronForwardOutline v-else />
          </n-icon>
          <n-divider dashed style="margin: 10px 0;font-size: 12px; flex: 1;">
            <span class="section-title section-title-group">分组</span>
          </n-divider>
        </div>
        <!-- 分组列表 -->
        <div v-show="isGroupsExpanded">
          <n-tree
            v-if="groups.length > 0"
            :data="groupsTreeData"
            :selected-keys="groupsSelectedKeys"
            :expanded-keys="expandedKeys"
            :default-expand-all="true"
            selectable
            block-line
            :node-props="groupNodeProps"
            @update:selected-keys="handleGroupsSelect"
            @update:expanded-keys="(keys) => expandedKeys = keys as string[]"
          >
          </n-tree>
        </div>

        <!-- 主播标题（可折叠） -->
        <div class="section-header" @click="isAnchorsExpanded = !isAnchorsExpanded">
          <n-icon class="collapse-icon" :class="{ 'is-expanded': isAnchorsExpanded }">
            <ChevronDownOutline v-if="isAnchorsExpanded" />
            <ChevronForwardOutline v-else />
          </n-icon>
          <n-divider dashed style="margin: 10px 0;font-size: 12px; flex: 1;">
            <span class="section-title section-title-anchor">主播</span>
          </n-divider>
        </div>
        <!-- 主播列表 -->
        <div v-show="isAnchorsExpanded">
          <n-tree
            v-if="anchors.length > 0"
            :data="anchorsTreeData"
            :selected-keys="anchorsSelectedKeys"
            :expanded-keys="expandedKeys"
            :default-expand-all="true"
            selectable
            block-line
            :node-props="anchorNodeProps"
            @update:selected-keys="handleAnchorsSelect"
            @update:expanded-keys="(keys) => expandedKeys = keys as string[]"
          >
          </n-tree>
        </div>

        <!-- 产品标题（可折叠） -->
        <div class="section-header" @click="isProductsExpanded = !isProductsExpanded">
          <n-icon class="collapse-icon" :class="{ 'is-expanded': isProductsExpanded }">
            <ChevronDownOutline v-if="isProductsExpanded" />
            <ChevronForwardOutline v-else />
          </n-icon>
          <n-divider dashed style="margin: 10px 0;font-size: 12px; flex: 1;">
            <span class="section-title section-title-product">产品</span>
          </n-divider>
        </div>
        <!-- 产品列表 -->
        <div v-show="isProductsExpanded">
          <n-tree
            v-if="products.length > 0"
            :data="productsTreeData"
            :selected-keys="productsSelectedKeys"
            :expanded-keys="expandedKeys"
            :default-expand-all="true"
            selectable
            block-line
            :node-props="productNodeProps"
            @update:selected-keys="handleProductsSelect"
            @update:expanded-keys="(keys) => expandedKeys = keys as string[]"
          >
          </n-tree>
        </div>
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

/* 可折叠标题样式 */
.section-header {
  display: flex;
  align-items: center;
  cursor: pointer;
  user-select: none;
  padding: 0 8px;
  margin: 8px 0 0 0;
  transition: background-color 0.15s ease;
}

.section-header:hover {
  background-color: rgba(255, 255, 255, 0.05);
}

.collapse-icon {
  font-size: 14px;
  width: 16px;
  height: 16px;
  color: #888;
  transition: transform 0.2s ease, color 0.15s ease;
  margin-right: 4px;
  flex-shrink: 0;
}

.collapse-icon.is-expanded {
  color: #e0e0e0;
}

.section-header:hover .collapse-icon {
  color: #e0e0e0;
}

/* 标题颜色，与封面标签颜色保持一致 */
.section-title {
  font-size: 12px;
  font-weight: 500;
}

.section-title-group {
  color: #63e2b7;
}

.section-title-anchor {
  color: #5dade2;
}

.section-title-product {
  color: #f39c12;
}

</style>

