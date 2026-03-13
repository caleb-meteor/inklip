<script setup lang="ts">
import { NIcon, NInput, NButton, NScrollbar, NVirtualList } from 'naive-ui'
import {
  DocumentTextOutline,
  VideocamOutline,
  ChevronForwardOutline,
  ChevronDownOutline,
  PlayOutline,
  AddOutline,
  LocateOutline
} from '@vicons/ionicons5'
import { inject } from 'vue'

const qc = inject('quickClip') as any
</script>

<template>
  <div class="panel panel-subtitles">
    <div class="panel-header" style="justify-content: space-between;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <n-icon size="18"><DocumentTextOutline /></n-icon>
        <span>视频字幕</span>
      </div>
      <n-button
        v-show="qc.selectedSourceKeys.size > 0"
        size="tiny"
        type="primary"
        @click="qc.addSelectedSegments"
      >
        添加选中 ({{ qc.selectedSourceKeys.size }})
      </n-button>
    </div>
    <div class="panel-search">
      <n-input
        v-model:value="qc.subtitleSearch"
        placeholder="搜索字幕..."
        size="small"
        clearable
      />
    </div>

    <div v-if="qc.subtitleSearch" class="search-results-panel">
      <div class="search-results-header">搜索结果 ({{ qc.searchResults.length }})</div>
      <div class="search-results-body">
        <n-scrollbar>
          <div class="segment-list">
            <div
              v-for="seg in qc.searchResults"
              :key="`search-${seg.videoId}-${seg.segmentIndex}`"
              class="segment-row"
              :class="{ 'is-selected': qc.selectedSourceKeys.has(`${seg.videoId}-${seg.segmentIndex}`) }"
              @click="qc.toggleSourceSelection(seg, $event)"
            >
              <span class="segment-time">
                {{ qc.formatTime(seg.fromS) }}
              </span>
              <span class="segment-text" :title="seg.text" style="flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                {{ seg.text }}
              </span>
              <n-button quaternary size="tiny" type="warning" class="segment-action" title="定位上下文" @click.stop="qc.locateContext(seg)">
                <n-icon><LocateOutline /></n-icon>
              </n-button>
              <n-button quaternary size="tiny" type="info" class="segment-action" title="播放" @click.stop="qc.playSourceSegment(seg)">
                <n-icon><PlayOutline /></n-icon>
              </n-button>
              <n-button quaternary size="tiny" type="primary" class="segment-action" title="添加" @click.stop="qc.addSegment(seg)">
                <n-icon><AddOutline /></n-icon>
              </n-button>
            </div>
          </div>
        </n-scrollbar>
      </div>
    </div>

    <div class="subtitle-panel-body" :style="qc.subtitleSearch ? 'border-top: 1px solid rgba(255,255,255,0.06);' : ''">
      <div v-if="qc.subtitleSearch" class="full-list-header">全部字幕</div>
      <n-virtual-list
        :ref="(el) => { if (el) qc.subtitleScrollbarRef = el }"
        :items="qc.flatVirtualList"
        :item-size="34"
        class="subtitle-virtual-list"
      >
        <template #default="{ item }">
          <div
            v-if="item.type === 'header'"
            class="segment-group-header"
            @click="qc.toggleGroup(item.videoId!)"
            style="cursor: pointer;"
          >
            <n-icon size="14">
              <ChevronForwardOutline v-if="qc.collapsedGroups.has(item.videoId!)" />
              <ChevronDownOutline v-else />
            </n-icon>
            <n-icon size="14"><VideocamOutline /></n-icon>
            <span class="segment-group-title" :title="item.videoName">{{ item.videoName }}</span>
          </div>
          <div
            v-else
            :id="`subtitle-seg-${item.segment!.videoId}-${item.segment!.segmentIndex}`"
            class="segment-row"
            :class="{ 'is-selected': qc.selectedSourceKeys.has(`${item.segment!.videoId}-${item.segment!.segmentIndex}`) }"
            @click="qc.toggleSourceSelection(item.segment!, $event)"
          >
            <span class="segment-time">{{ qc.formatTime(item.segment!.fromS) }}</span>
            <span class="segment-text" :title="item.segment!.text">{{ item.segment!.text }}</span>
            <n-button quaternary size="tiny" type="info" class="segment-action" title="播放" @click.stop="qc.playSourceSegment(item.segment!)">
              <n-icon><PlayOutline /></n-icon>
            </n-button>
            <n-button quaternary size="tiny" type="primary" class="segment-action" title="添加" @click.stop="qc.addSegment(item.segment!)">
              <n-icon><AddOutline /></n-icon>
            </n-button>
          </div>
        </template>
      </n-virtual-list>
    </div>
  </div>
</template>

<style scoped>
.panel {
  background: rgba(24, 24, 28, 0.95);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}
.panel-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  font-weight: 600;
  font-size: 13px;
  color: #f5f5f7;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.panel-search {
  flex-shrink: 0;
  padding: 8px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}
.search-results-panel {
  flex: 0 0 35%;
  display: flex;
  flex-direction: column;
  background: rgba(0, 0, 0, 0.2);
  min-height: 0;
}
.search-results-header {
  padding: 4px 10px;
  font-size: 12px;
  color: #4facfe;
  background: rgba(255, 255, 255, 0.02);
  flex-shrink: 0;
}
.search-results-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.search-results-body :deep(.n-scrollbar-content) {
  padding-bottom: 8px;
}
.subtitle-panel-body {
  flex: 1;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.full-list-header {
  padding: 4px 10px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  background: rgba(255, 255, 255, 0.02);
  flex-shrink: 0;
}
.subtitle-virtual-list {
  flex: 1;
  min-height: 0;
  height: 100%;
}
.subtitle-panel-body :deep(.v-vl) {
  height: 100% !important;
}
.segment-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
}
.segment-group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  height: 34px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  color: #4facfe;
  font-size: 12px;
  font-weight: 600;
  box-sizing: border-box;
}
.segment-group-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.segment-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  height: 30px;
  margin: 2px 0 2px 8px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.04);
  cursor: pointer;
  transition: background 0.2s;
  user-select: none;
  box-sizing: border-box;
}
.segment-row:hover {
  background: rgba(255, 255, 255, 0.06);
}
.segment-row.is-selected {
  background: rgba(79, 172, 254, 0.2);
  border-color: rgba(79, 172, 254, 0.5);
}
.segment-time {
  flex-shrink: 0;
  font-size: 11px;
  color: #4facfe;
  font-family: monospace;
  width: 36px;
  text-align: right;
}
.segment-text {
  flex: 1;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.segment-action {
  flex-shrink: 0;
}
.subtitle-panel-body :deep(.n-scrollbar) {
  height: 100%;
}
.subtitle-panel-body :deep(.n-scrollbar-content) {
  min-height: 100%;
  display: flex;
  flex-direction: column;
}
</style>
