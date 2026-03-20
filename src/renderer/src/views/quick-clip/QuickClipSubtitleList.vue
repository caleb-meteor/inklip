<script setup lang="ts">
import { NIcon, NInput, NButton, NVirtualList, NSpin } from 'naive-ui'
import {
  DocumentTextOutline,
  VideocamOutline,
  ChevronForwardOutline,
  ChevronDownOutline,
  PlayOutline,
  AddOutline,
  LocateOutline,
  FlameOutline,
  CheckmarkCircleOutline,
  CloseCircleOutline
} from '@vicons/ionicons5'
import { inject } from 'vue'

const qc = inject('quickClip') as any

function onSearchResultsScroll(e: Event) {
  const el = e.target as HTMLElement
  if (!el || el !== e.currentTarget) return
  const { scrollTop, clientHeight, scrollHeight } = el
  const threshold = 80
  if (scrollHeight - scrollTop - clientHeight < threshold && qc.searchHasMore && !qc.searchLoading) {
    qc.loadMoreSearchResults()
  }
}
</script>

<template>
  <div class="panel panel-subtitles">
    <div class="panel-header">
      <div class="custom-tabs">
        <div class="tab-item" :class="{ active: qc.subtitleTab === 'subtitles' }" @click="qc.subtitleTab = 'subtitles'">
          <n-icon size="14"><DocumentTextOutline /></n-icon>
          <span>视频字幕</span>
        </div>
        <div class="tab-item" :class="{ active: qc.subtitleTab === 'replicate' }" @click="qc.subtitleTab = 'replicate'">
          <n-icon size="14"><FlameOutline /></n-icon>
          <span>爆款复刻</span>
        </div>
      </div>
    </div>

    <!-- ===== Tab1: 视频字幕（现有功能） ===== -->
    <template v-if="qc.subtitleTab === 'subtitles'">
      <div class="panel-search">
        <n-input
          v-model:value="qc.subtitleSearch"
          placeholder="搜索字幕..."
          size="small"
          clearable
        />
      </div>

      <div v-if="qc.subtitleSearch && String(qc.subtitleSearch).trim()" class="search-results-panel">
        <div class="search-results-header">搜索结果（共 {{ qc.searchLoading ? '...' : qc.searchTotal }} 条）</div>
        <div class="search-results-body">
          <n-spin :show="qc.searchLoading">
            <div class="search-results-inner" @scroll="onSearchResultsScroll">
              <div class="segment-list">
                <div
                  v-for="seg in qc.searchResults"
                  :key="qc.getSegmentKey(seg)"
                  class="segment-row"
                  :class="{
                    'is-selected': qc.selectedSourceKeys.has(qc.getSegmentKey(seg)),
                    'is-in-selected': qc.selectedSegmentKeys.has(qc.getSegmentKey(seg))
                  }"
                  :draggable="!qc.selectedSegmentKeys.has(qc.getSegmentKey(seg))"
                  @dragstart="qc.onSourceSegmentDragStart($event, seg)"
                  @click="qc.toggleSourceSelection(seg, $event)"
                >
                  <span class="segment-time">{{ qc.formatTime(seg.fromS) }}</span>
                  <span class="segment-text" :title="seg.text">{{ seg.text }}</span>
                  <n-button quaternary size="tiny" type="warning" class="segment-action" title="定位上下文" @click.stop="qc.locateContext(seg)">
                    <n-icon><LocateOutline /></n-icon>
                  </n-button>
                  <n-button quaternary size="tiny" type="info" class="segment-action" title="播放" @click.stop="qc.playSourceSegment(seg)">
                    <n-icon><PlayOutline /></n-icon>
                  </n-button>
                  <n-button quaternary size="tiny" type="primary" class="segment-action" title="添加" :disabled="qc.selectedSegmentKeys.has(qc.getSegmentKey(seg))" @click.stop="qc.addSegment(seg)">
                    <n-icon><AddOutline /></n-icon>
                  </n-button>
                </div>
              </div>
            </div>
          </n-spin>
        </div>
      </div>

      <div
        class="subtitle-panel-body"
        :class="{ 'has-search': !!(qc.subtitleSearch && String(qc.subtitleSearch).trim()) }"
      >
        <div v-if="qc.showSubtitleContext || qc.selectedSourceKeys.size > 0" class="context-header">
          <span v-if="qc.showSubtitleContext">字幕上下文</span>
          <span v-else></span>
          <div v-if="qc.selectedSourceKeys.size > 0" class="context-header-actions">
            <n-button size="tiny" quaternary @click="qc.clearSourceSelection">
              取消全选
            </n-button>
            <n-button size="tiny" type="primary" @click="qc.addSelectedSegments">
              添加选中 ({{ qc.selectedSourceKeys.size }})
            </n-button>
          </div>
        </div>
        <div v-else-if="qc.subtitleSearch && String(qc.subtitleSearch).trim()" class="empty-hint">
          在搜索结果中点击「定位」查看完整字幕上下文
        </div>
        <div v-else class="empty-hint">
          请先在上方搜索，再在结果中点击「定位」展开上下文
        </div>

        <n-virtual-list
          v-if="qc.showSubtitleContext"
          :key="qc.subtitleListRenderKey"
          :ref="(el) => { if (el) qc.subtitleScrollbarRef = el }"
          :items="qc.flatVirtualList"
          :item-size="34"
          class="subtitle-virtual-list"
          @scroll="qc.onSubtitleScroll"
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
              :id="`subtitle-${item.key}`"
              class="segment-row"
              :class="{
                'is-selected': qc.selectedSourceKeys.has(item.segmentKey ?? qc.getSegmentKey(item.segment!)),
                'is-in-selected': qc.selectedSegmentKeys.has(item.segmentKey ?? qc.getSegmentKey(item.segment!))
              }"
              :draggable="!qc.selectedSegmentKeys.has(item.segmentKey ?? qc.getSegmentKey(item.segment!))"
              @dragstart="qc.onSourceSegmentDragStart($event, item.segment!)"
              @click="qc.toggleSourceSelection(item.segment!, $event)"
            >
              <span class="segment-time">{{ qc.formatTime(item.segment!.fromS) }}</span>
              <span class="segment-text" :title="item.segment!.text">{{ item.segment!.text }}</span>
              <n-button quaternary size="tiny" type="info" class="segment-action" title="播放" @click.stop="qc.playSourceSegment(item.segment!)">
                <n-icon><PlayOutline /></n-icon>
              </n-button>
              <n-button quaternary size="tiny" type="primary" class="segment-action" title="添加" :disabled="qc.selectedSegmentKeys.has(item.segmentKey ?? qc.getSegmentKey(item.segment!))" @click.stop="qc.addSegment(item.segment!)">
                <n-icon><AddOutline /></n-icon>
              </n-button>
            </div>
          </template>
        </n-virtual-list>
      </div>
    </template>

    <!-- ===== Tab2: 爆款复刻 ===== -->
    <template v-if="qc.subtitleTab === 'replicate'">
      <div class="replicate-panel">
        <div class="replicate-input-area">
          <n-input
            v-model:value="qc.replicateText"
            type="textarea"
            placeholder="粘贴爆款文案，将智能拆句并在工作区内还原为对应字幕片段"
            :rows="5"
            size="small"
          />
          <n-button
            type="primary"
            size="small"
            :loading="qc.replicateLoading"
            :disabled="!qc.replicateText.trim() || qc.replicateLoading"
            style="margin-top: 8px; width: 100%;"
            @click="qc.startReplicate"
          >
            开始复刻
          </n-button>
        </div>

        <!-- 复刻流程动画 -->
        <div v-if="qc.replicateLoading" class="replicate-flow">
          <div
            class="replicate-flow-step"
            :class="{ 'is-active': qc.replicateFlowStep === 0, 'is-done': qc.replicateFlowStep > 0 }"
          >
            <n-icon v-if="qc.replicateFlowStep > 0" size="16" color="#52c41a"><CheckmarkCircleOutline /></n-icon>
            <span v-else class="replicate-flow-spin"><n-spin size="small" :stroke-width="14" /></span>
            <span>开始理解爆款文案</span>
          </div>
          <div
            class="replicate-flow-step"
            :class="{ 'is-active': qc.replicateFlowStep === 1, 'is-done': qc.replicateFlowStep > 1 }"
          >
            <n-icon v-if="qc.replicateFlowStep > 1" size="16" color="#52c41a"><CheckmarkCircleOutline /></n-icon>
            <span v-else-if="qc.replicateFlowStep >= 1" class="replicate-flow-spin"><n-spin size="small" :stroke-width="14" /></span>
            <span>开始匹配视频字幕</span>
          </div>
          <div
            class="replicate-flow-step"
            :class="{ 'is-active': qc.replicateFlowStep === 2 }"
          >
            <span v-if="qc.replicateFlowStep === 2" class="replicate-flow-spin"><n-spin size="small" :stroke-width="14" /></span>
            <span>开始还原视频字幕</span>
          </div>
        </div>

        <div v-else-if="qc.replicateResults.length > 0 && qc.replicateResults.some(r => r.match)" class="replicate-results">
          <div class="replicate-results-header">
            <span>匹配结果（{{ qc.replicateResults.filter(r => r.match).length }} / {{ qc.replicateResults.length }} 句匹配）</span>
            <n-button
              size="tiny"
              type="primary"
              @click="qc.applyReplicateResults"
            >
              一键添加
            </n-button>
          </div>
          <div class="replicate-results-list">
            <div
              v-for="(item, idx) in qc.replicateResults"
              :key="idx"
              class="replicate-row"
              :class="{ 'no-match': !item.match }"
            >
              <div class="replicate-sentence">
                <n-icon size="14" :color="item.match ? '#52c41a' : 'rgba(255,255,255,0.25)'">
                  <CheckmarkCircleOutline v-if="item.match" />
                  <CloseCircleOutline v-else />
                </n-icon>
                <span class="replicate-sentence-text">{{ item.sentence }}</span>
              </div>
              <div v-if="item.match" class="replicate-match">
                <span class="replicate-match-arrow">→</span>
                <span class="replicate-match-text" :title="item.match.segment.text">{{ item.match.segment.text }}</span>
                <span class="replicate-match-video">{{ item.match.video.name }}</span>
              </div>
              <div v-else class="replicate-match replicate-match-empty">
                <span class="replicate-match-arrow">→</span>
                <span class="replicate-match-text">未找到匹配</span>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="qc.replicateResults.length > 0 && !qc.replicateResults.some(r => r.match)" class="empty-hint replicate-no-match">
          <n-icon size="20" color="#ef4444" style="flex-shrink: 0;"><CloseCircleOutline /></n-icon>
          <span>未找到与文案匹配的字幕，可尝试调整文案</span>
        </div>

        <div v-else-if="!qc.replicateLoading" class="empty-hint">
          粘贴文案后点击「开始复刻」，在工作区内还原为对应字幕
        </div>
      </div>
    </template>
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
  padding: 6px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.custom-tabs {
  display: flex;
  gap: 2px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 8px;
  padding: 2px;
}
.tab-item {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 5px 0;
  font-size: 12px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.45);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  user-select: none;
}
.tab-item:hover {
  color: rgba(255, 255, 255, 0.7);
}
.tab-item.active {
  background: rgba(255, 255, 255, 0.1);
  color: #f5f5f7;
  font-weight: 600;
}
.panel-search {
  flex-shrink: 0;
  padding: 8px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}
.search-results-panel {
  flex-shrink: 0;
  background: rgba(0, 0, 0, 0.2);
}
.search-results-header {
  padding: 4px 10px;
  font-size: 12px;
  color: #4facfe;
  background: rgba(255, 255, 255, 0.02);
}
.search-results-body {
  min-height: 0;
}
.search-results-inner {
  max-height: 220px;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.search-results-inner::-webkit-scrollbar {
  display: none;
}
.search-results-inner .segment-list {
  padding: 2px 8px 6px;
  gap: 2px;
}
.search-results-inner .segment-row {
  margin: 1px 0 1px 8px;
  height: 28px;
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
.segment-row.is-in-selected {
  border-left: 3px solid rgba(82, 196, 26, 0.9);
  padding-left: 7px;
}
.panel :deep(.segment-row.is-in-selected) {
  border-left: 3px solid rgba(82, 196, 26, 0.9);
  padding-left: 7px;
}
.segment-time {
  flex-shrink: 0;
  font-size: 11px;
  color: #4facfe;
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
.subtitle-panel-body.has-search {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(0, 0, 0, 0.1);
}
.empty-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: rgba(255, 255, 255, 0.3);
  font-size: 12px;
  padding: 20px;
  text-align: center;
}
.empty-hint.replicate-no-match {
  color: rgba(148, 163, 184, 0.95);
  flex-direction: row;
  gap: 8px;
}
.context-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  color: #f5f5f7;
  background: rgba(255, 255, 255, 0.04);
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  flex-shrink: 0;
}
.context-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* ===== 爆款复刻 ===== */
.replicate-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.replicate-input-area {
  flex-shrink: 0;
  padding: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.replicate-flow {
  flex-shrink: 0;
  padding: 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.replicate-flow-step {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.4);
  transition: color 0.25s ease;
}
.replicate-flow-step.is-active {
  color: rgba(79, 172, 254, 0.95);
}
.replicate-flow-step.is-done {
  color: rgba(82, 196, 26, 0.9);
}
.replicate-flow-spin {
  display: inline-flex;
  transform: scale(0.5);
  transform-origin: center;
}
.replicate-results {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.replicate-results-header {
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  background: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}
.replicate-results-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 6px 10px;
}
.replicate-row {
  padding: 8px 10px;
  margin-bottom: 6px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
}
.replicate-row.no-match {
  opacity: 0.45;
}
.replicate-sentence {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-bottom: 4px;
}
.replicate-sentence-text {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.85);
  line-height: 1.4;
  word-break: break-all;
}
.replicate-match {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding-left: 20px;
}
.replicate-match-arrow {
  flex-shrink: 0;
  color: #4facfe;
  font-size: 12px;
}
.replicate-match-text {
  flex: 1;
  font-size: 11px;
  color: rgba(79, 172, 254, 0.9);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.replicate-match-video {
  flex-shrink: 0;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.3);
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.replicate-match-empty .replicate-match-text {
  color: rgba(255, 255, 255, 0.25);
  font-style: italic;
}
</style>
