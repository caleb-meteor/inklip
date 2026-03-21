<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { NIcon, NPopover, NProgress, useMessage } from 'naive-ui'
import {
  FolderOpenOutline,
  ChevronForwardOutline,
  ChevronDownOutline,
  TrashOutline,
  MenuOutline,
  ChevronBackOutline,
  CutOutline,
  VideocamOutline,
  SparklesOutline
} from '@vicons/ionicons5'
import { getVideosApi, type VideoItem, type HomePlayPayload } from '../../api/video'
import {
  getWorkspacesApi,
  createWorkspaceApi,
  ingestWorkspaceApi,
  switchWorkspaceApi,
  deleteWorkspaceApi,
  type WorkspaceItem
} from '../../api/workspace'
import { parseSubtitleToSegments } from '../../utils/subtitle'
import { storeToRefs } from 'pinia'
import { useRealtimeStore } from '../../stores/realtime'
import VideoOpPanel from './VideoOpPanel.vue'

defineProps<{
  collapsed: boolean
}>()

const emit = defineEmits<{
  (e: 'navigate', path: string): void
  (e: 'toggle-left-collapse'): void
  (e: 'play-video', payload: HomePlayPayload): void
  (e: 'update:selected-workspace', workspace: { id: number; name: string } | null): void
  (e: 'click-video', videoId: number): void
  (e: 'videos-updated', list: VideoItem[]): void
}>()

const message = useMessage()
const route = useRoute()
const wsStore = useRealtimeStore()
const { workspaceSelecting: storeWorkspaceSelecting, workspaceIngestProgress } = storeToRefs(wsStore)
const videos = ref<VideoItem[]>([])
const WORKSPACE_DIR_STORAGE_KEY = 'inklip_workspace_directory'
const LAST_WORKSPACE_ID_KEY = 'home.lastWorkspaceId'

function readStoredLastWorkspaceId(): number | null {
  if (typeof localStorage === 'undefined') return null
  const s = localStorage.getItem(LAST_WORKSPACE_ID_KEY)
  if (!s) return null
  const n = Number(s)
  return Number.isInteger(n) ? n : null
}

// 工作空间列表与选中
const workspaces = ref<WorkspaceItem[]>([])
const selectedWorkspaceId = ref<number | null>(null)
const workspaceVideos = ref<VideoItem[]>([])
const workspaceVideosLoading = ref(false)
async function loadWorkspaces() {
  try {
    const list = await getWorkspacesApi()
    workspaces.value = list
    if (list.length > 0 && !selectedWorkspaceId.value) {
      selectedWorkspaceId.value = list[0].id
    }
    if (selectedWorkspaceId.value && !list.find((w) => w.id === selectedWorkspaceId.value)) {
      selectedWorkspaceId.value = list[0]?.id ?? null
    }
  } catch {
    workspaces.value = []
  }
}
async function loadWorkspaceVideos() {
  const wid = selectedWorkspaceId.value
  if (!wid) {
    workspaceVideos.value = []
    videos.value = []
    emit('videos-updated', [])
    return
  }
  workspaceVideosLoading.value = true
  try {
    const list = await getVideosApi({ workspace_id: wid })
    if (selectedWorkspaceId.value !== wid) return
    workspaceVideos.value = list ?? []
    videos.value = workspaceVideos.value
    emit('videos-updated', videos.value)
  } catch {
    if (selectedWorkspaceId.value !== wid) return
    workspaceVideos.value = []
    videos.value = []
    emit('videos-updated', [])
  } finally {
    if (selectedWorkspaceId.value === wid) {
      workspaceVideosLoading.value = false
    }
  }
}
function selectWorkspace(id: number) {
  selectedWorkspaceId.value = id
}

/** 判断视频是否有有效字幕（与 parseSubtitleToSegments 一致） */
function videoHasSubtitle(video: VideoItem | undefined): boolean {
  return parseSubtitleToSegments(video?.subtitle).length > 0
}

// 工作空间树：根据视频 path 相对工作区根路径构建目录树
interface WorkspaceTreeNode {
  name: string
  pathKey: string // 用于展开/收拢的 key，如 '' | 'a' | 'a/b'
  children?: WorkspaceTreeNode[]
  video?: VideoItem
}

/** 将 Video 的 path 与 other_paths 展开为多条展示项，每条含路径与 name（从路径解析），共用同一 video */
function expandVideoPaths(video: VideoItem): { path: string; name: string; video: VideoItem }[] {
  const paths = [video.path, ...(video.other_paths ?? [])].filter(Boolean)
  return paths.map((p) => ({
    path: p,
    name: p.split(/[/\\]/).filter(Boolean).pop() || video.name,
    video: { ...video, path: p } as VideoItem
  }))
}

function buildWorkspaceTree(rootPath: string, videos: VideoItem[]): WorkspaceTreeNode[] {
  const tree: WorkspaceTreeNode[] = []
  const norm = (p: string) => (p || '').trim().replace(/\\/g, '/').replace(/^file:\/\//, '')
  const rootNorm = norm(rootPath).replace(/\/+$/, '')
  const getOrCreateFolder = (parent: WorkspaceTreeNode[], pathKey: string, name: string): WorkspaceTreeNode => {
    let node = parent.find((n) => n.pathKey === pathKey)
    if (!node) {
      node = { name, pathKey, children: [] }
      parent.push(node)
    }
    return node
  }
  for (const video of videos) {
    const expanded = expandVideoPaths(video)
    for (let idx = 0; idx < expanded.length; idx++) {
      const { path: fullPath, name: displayName, video: videoWithPath } = expanded[idx]
      let rel = norm(fullPath || '')
      if (rootNorm && rel.startsWith(rootNorm) && (rel.length === rootNorm.length || rel[rootNorm.length] === '/')) {
        rel = rel.slice(rootNorm.length).replace(/^\/+/, '')
      }
      const pathKey = `v-${video.id}-${idx}`
      const segments = rel.split('/').filter(Boolean)
      if (segments.length === 0) {
        tree.push({ name: displayName, pathKey, video: videoWithPath })
        continue
      }
      let current = tree
      let folderPathKey = ''
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i]
        if (i === segments.length - 1) {
          current.push({ name: seg, pathKey, video: videoWithPath })
        } else {
          folderPathKey = folderPathKey ? `${folderPathKey}/${seg}` : seg
          const node = getOrCreateFolder(current, folderPathKey, seg)
          if (!node.children) node.children = []
          current = node.children
        }
      }
    }
  }
  const sortNodes = (nodes: WorkspaceTreeNode[]) => {
    nodes.sort((a, b) => {
      const aIsFolder = !!a.children
      const bIsFolder = !!b.children
      if (aIsFolder !== bIsFolder) return aIsFolder ? -1 : 1
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })
    nodes.forEach((n) => n.children && sortNodes(n.children))
  }
  sortNodes(tree)
  return tree
}

const selectedWorkspace = computed(() =>
  workspaces.value.find((w) => w.id === selectedWorkspaceId.value)
)
/** 工作空间树标题：取当前选中工作空间路径的最后一个目录名 */
const selectedWorkspaceTreeTitle = computed(() => {
  const ws = selectedWorkspace.value
  if (!ws?.path) return '文件树'
  const name = ws.path.split(/[/\\]/).filter(Boolean).pop() || ws.name
  return name || '文件树'
})
// 树仅为相对工作空间根目录的层级，不包含工作空间路径本身
const workspaceTree = computed(() => {
  const ws = selectedWorkspace.value
  if (!ws?.path || !workspaceVideos.value.length) return []
  return buildWorkspaceTree(ws.path, workspaceVideos.value)
})

const workspaceTreeExpanded = ref<Set<string>>(new Set())
function toggleWorkspaceTreeFolder(pathKey: string) {
  const next = new Set(workspaceTreeExpanded.value)
  if (next.has(pathKey)) next.delete(pathKey)
  else next.add(pathKey)
  workspaceTreeExpanded.value = next
}

// 将树拍平为带缩进层级的列表（只展开已展开的文件夹）
function flattenWorkspaceTree(
  nodes: WorkspaceTreeNode[],
  depth: number
): { depth: number; node: WorkspaceTreeNode }[] {
  const out: { depth: number; node: WorkspaceTreeNode }[] = []
  for (const node of nodes) {
    if (node.video) {
      out.push({ depth, node })
    } else {
      out.push({ depth, node })
      if (node.children?.length && workspaceTreeExpanded.value.has(node.pathKey)) {
        out.push(...flattenWorkspaceTree(node.children, depth + 1))
      }
    }
  }
  return out
}
const workspaceTreeFlat = computed(() => {
  void workspaceTreeExpanded.value
  return flattenWorkspaceTree(workspaceTree.value, 0)
})

watch(selectedWorkspaceId, async (id) => {
  if (!id) {
    workspaceVideos.value = []
    videos.value = []
    emit('videos-updated', [])
    workspaceVideosLoading.value = false
    return
  }
  workspaceVideos.value = []
  workspaceTreeExpanded.value = new Set()
  workspaceVideosLoading.value = true
  if (workspaceSelecting.value || storeWorkspaceSelecting.value) {
    workspaceVideosLoading.value = false
    return
  }
  try {
    await switchWorkspaceApi(id)
  } catch {
    if (selectedWorkspaceId.value !== id) return
    workspaceVideosLoading.value = false
    return
  } finally {
    wsStore.clearWorkspaceIngestProgress()
  }
  if (selectedWorkspaceId.value !== id) return
  loadWorkspaceVideos()
}, { immediate: true })

// 记住最后选中的工作空间，下次打开可恢复
watch(
  selectedWorkspaceId,
  (id) => {
    if (typeof localStorage !== 'undefined') {
      if (id != null) localStorage.setItem(LAST_WORKSPACE_ID_KEY, String(id))
    }
  },
  { flush: 'post' }
)

// 全局空间：选择目录
const workspaceDirectory = ref<string>(
  typeof localStorage !== 'undefined' ? localStorage.getItem(WORKSPACE_DIR_STORAGE_KEY) ?? '' : ''
)
const workspaceSelecting = ref(false)

function workspaceIngestPhaseText(phase: string): string {
  switch (phase) {
    case 'starting':
      return '正在准备扫描工作空间…'
    case 'listing':
      return '正在枚举视频文件…'
    case 'scanning':
      return '正在扫描…'
    case 'cleanup':
      return '正在清理…'
    case 'done':
      return '即将完成…'
    default:
      return '正在处理工作空间…'
  }
}

/** 路径规范化，用于按路径判断唯一（统一斜杠、去首尾空格） */
function normalizePath(p: string): string {
  return (p || '').trim().replace(/\\/g, '/')
}

const selectWorkspaceDir = async (): Promise<void> => {
  if (!window.api?.selectDirectory) return
  workspaceSelecting.value = true
  wsStore.setWorkspaceSelecting(true)
  try {
    const result = await window.api.selectDirectory({ title: '选择工作空间目录' })
    if (!result.success || !result.directory) return
    const dir = result.directory
    workspaceDirectory.value = dir
    localStorage.setItem(WORKSPACE_DIR_STORAGE_KEY, dir)
    const dirNorm = normalizePath(dir)
    const existing = workspaces.value.find((ws) => normalizePath(ws.path) === dirNorm)
    wsStore.beginWorkspaceIngestProgress()
    if (existing) {
      selectedWorkspaceId.value = existing.id
      await ingestWorkspaceApi(existing.id)
    } else {
      const name = dir.split(/[/\\]/).filter(Boolean).pop() || '工作空间'
      const created = await createWorkspaceApi({ name, path: dir })
      if (created?.id) selectedWorkspaceId.value = created.id
    }
    await loadAll()
  } catch (e) {
    message.error('选择或同步失败')
  } finally {
    workspaceSelecting.value = false
    wsStore.setWorkspaceSelecting(false)
    wsStore.clearWorkspaceIngestProgress()
  }
}
/** 工作空间切换 Popover 显隐 */
const showWorkspacePopover = ref(false)

function onSelectWorkspace(ws: WorkspaceItem) {
  if (ws.id !== selectedWorkspaceId.value) {
    wsStore.beginWorkspaceIngestProgress()
  }
  selectWorkspace(ws.id)
  showWorkspacePopover.value = false
}

async function onSelectWorkspaceDir() {
  showWorkspacePopover.value = false
  await selectWorkspaceDir()
}

async function onDeleteWorkspace(ws: WorkspaceItem) {
  try {
    await deleteWorkspaceApi(ws.id)
    workspaces.value = workspaces.value.filter((w) => w.id !== ws.id)
    if (selectedWorkspaceId.value === ws.id) {
      selectedWorkspaceId.value = workspaces.value[0]?.id ?? null
      if (!selectedWorkspaceId.value) {
        workspaceVideos.value = []
        videos.value = []
        emit('videos-updated', [])
      }
    }
    message.success('工作空间已删除')
    await loadWorkspaces()
  } catch (err) {
    message.error('删除失败')
  }
}

/** 顶部当前工作空间显示名（用于触发条） */
const currentWorkspaceLabel = computed(() => {
  const ws = selectedWorkspace.value
  if (ws?.name) return ws.name.length > 14 ? ws.name.slice(0, 12) + '…' : ws.name
  return '选择工作空间'
})

watch(
  selectedWorkspace,
  (ws) => {
    emit('update:selected-workspace', ws ? { id: ws.id, name: ws.name } : null)
  },
  { immediate: true }
)

// 监听 SSE 推送的视频上传/解析状态：后端推送 video_upload / video_status 后更新左侧视频列表
watch(
  () => wsStore.videoUploaded,
  async (ts) => {
    if (!ts) return
    await refreshVideosFromApi()
  }
)

// 监听工作空间入库/监听处理完成：后端推送 workspace_ingest_done / workspace_files_updated 后刷新工作区与视频
watch(
  () => wsStore.workspaceUpdated,
  async (ts) => {
    if (!ts) return
    await loadAll()
  }
)

const goToQuickClip = () => {
  const query = new URLSearchParams()
  if (selectedWorkspaceId.value) {
    query.append('workspaceId', String(selectedWorkspaceId.value))
  }
  const queryString = query.toString()
  emit('navigate', `/quick-clip${queryString ? '?' + queryString : ''}`)
}

/** 仅加载工作区列表与当前工作空间视频 */
const loadAll = async (): Promise<void> => {
  const workspacesRes = await Promise.allSettled([getWorkspacesApi()]).then(([r]) => r)
  if (workspacesRes.status === 'fulfilled') {
    workspaces.value = Array.isArray(workspacesRes.value) ? workspacesRes.value : []
    if (route.query.workspaceId) {
      const wid = Number(route.query.workspaceId)
      if (workspaces.value.some((w) => w.id === wid)) {
        selectedWorkspaceId.value = wid
      }
    }
    // 无 URL 指定时恢复上次选中的工作空间
    if (workspaces.value.length > 0 && !selectedWorkspaceId.value) {
      const lastId = readStoredLastWorkspaceId()
      if (lastId != null && workspaces.value.some((w) => w.id === lastId)) {
        selectedWorkspaceId.value = lastId
      }
    }
    if (workspaces.value.length > 0 && !selectedWorkspaceId.value) {
      selectedWorkspaceId.value = workspaces.value[0].id
    }
  }
  await loadWorkspaceVideos()
}

onMounted(() => {
  loadAll()
})

defineExpose({ loadAll })

/** 根据实时推送刷新首页左侧视频列表（只刷新当前工作空间视频） */
const refreshVideosFromApi = async () => {
  const wid = selectedWorkspaceId.value
  const list = wid ? await getVideosApi({ workspace_id: wid }) : []
  videos.value = list ?? []
  videos.value.forEach((v) => {
    if (v.task_status === 2) wsStore.clearVideoProgress(v.id)
  })
  if (wid) workspaceVideos.value = videos.value
  emit('videos-updated', videos.value)
}
</script>

<template>
  <div class="chat-sidebar" :class="{ 'sidebar-collapsed': collapsed }">
    <div class="sidebar-content">
      <!-- 折叠时：展开按钮置顶 -->
      <div v-if="collapsed" class="sidebar-toggle-btn-top-wrapper">
        <div
          class="sidebar-toggle-btn-top"
          title="展开侧边栏"
          @click="emit('toggle-left-collapse')"
        >
          <n-icon size="18"><MenuOutline /></n-icon>
        </div>
      </div>

      <!-- 展开时：工作空间 + 折叠按钮 同一行 -->
      <div v-show="!collapsed" class="top-bar-row">
        <div class="top-bar-row-workspace">
          <n-popover
            trigger="click"
            placement="bottom-start"
            :show="showWorkspacePopover"
            :width="360"
            :show-arrow="false"
            content-class="workspace-popover-box"
            :content-style="{ padding: 0 }"
            @update:show="showWorkspacePopover = $event"
          >
            <template #trigger>
              <div
                class="workspace-bar clickable"
                :class="{ selecting: workspaceSelecting }"
              >
                <n-icon size="14" class="workspace-icon"><FolderOpenOutline /></n-icon>
                <span class="workspace-label">工作空间</span>
                <span class="workspace-name" :title="currentWorkspaceLabel">
                  {{ currentWorkspaceLabel }}
                </span>
                <n-icon size="12" class="workspace-chevron"><ChevronDownOutline /></n-icon>
              </div>
            </template>
            <div class="workspace-switcher-popover">
              <div
                v-for="ws in workspaces"
                :key="ws.id"
                class="workspace-switcher-item"
                :class="{ 'is-active': selectedWorkspaceId === ws.id }"
                @click="onSelectWorkspace(ws)"
              >
                <div class="workspace-switcher-item__main">
                  <div class="workspace-switcher-item__name">{{ ws.name }}</div>
                  <div v-if="ws.path" class="workspace-switcher-item__path" :title="ws.path">{{ ws.path }}</div>
                </div>
                <div
                  class="workspace-switcher-item__delete"
                  title="删除工作空间"
                  @click.stop="onDeleteWorkspace(ws)"
                >
                  <n-icon :size="14"><TrashOutline /></n-icon>
                </div>
              </div>
              <div class="workspace-switcher-item workspace-switcher-item--action" @click="onSelectWorkspaceDir">
                选择目录…
              </div>
            </div>
          </n-popover>
        </div>
        <div
          class="sidebar-toggle-btn-inline"
          title="折叠侧边栏"
          @click="emit('toggle-left-collapse')"
        >
          <n-icon size="16"><ChevronBackOutline /></n-icon>
        </div>
      </div>
        <div class="sidebar-group">
          <!-- 顶上工作空间：字幕剪辑 / AI 切换（一体 tab 条） -->
          <div v-show="!collapsed" class="top-workspace-view-tabs">
            <div
              class="top-workspace-view-tab"
              :class="{ active: route.path === '/quick-clip' }"
              @click="goToQuickClip"
            >
              <n-icon size="14"><CutOutline /></n-icon>
              <span>字幕剪辑</span>
            </div>
            <div
              class="top-workspace-view-tab"
              :class="{ active: route.path !== '/quick-clip' }"
              @click="emit('navigate', '/home')"
            >
              <n-icon size="14"><SparklesOutline /></n-icon>
              <span>AI</span>
            </div>
          </div>
          <!-- 折叠状态下的侧边栏 Tab 切换 -->
          <div v-show="collapsed" class="collapsed-icons-list">
            <div
              class="collapsed-icon-item"
              :class="{ active: route.path === '/quick-clip' }"
              @click="goToQuickClip"
              title="字幕剪辑"
            >
              <n-icon size="20"><CutOutline /></n-icon>
            </div>
            <div
              class="collapsed-icon-item"
              :class="{ active: route.path !== '/quick-clip' }"
              @click="emit('navigate', '/home')"
              title="AI"
            >
              <n-icon size="20"><SparklesOutline /></n-icon>
            </div>
          </div>
        </div>

        <!-- 仅保留树形结构 -->
      <template v-if="!collapsed">
        <div class="workspace-section">
          <template v-if="selectedWorkspaceId">
            <div class="section-title workspace-tree-title">
              {{ selectedWorkspaceTreeTitle }}
            </div>
          </template>
          <div v-if="workspaceIngestProgress" class="workspace-ingest-bar">
            <p class="workspace-ingest-desc">
              {{ workspaceIngestPhaseText(workspaceIngestProgress.phase ?? '') }}
            </p>
            <p
              v-if="workspaceIngestProgress.file"
              class="workspace-ingest-file"
              :title="workspaceIngestProgress.file"
            >
              {{ workspaceIngestProgress.file }}
            </p>
            <p
              v-if="(workspaceIngestProgress.total ?? 0) > 0"
              class="workspace-ingest-count"
            >
              {{ workspaceIngestProgress.current ?? 0 }} / {{ workspaceIngestProgress.total ?? 0 }} 个视频文件
            </p>
            <n-progress
              type="line"
              :percentage="Math.round(workspaceIngestProgress.percentage ?? 0)"
              :height="8"
              :border-radius="4"
              indicator-placement="inside"
              processing
            />
          </div>
          <template v-if="selectedWorkspaceId">
            <div v-if="!workspaceIngestProgress && workspaceVideosLoading" class="workspace-videos-loading">
              加载中...
            </div>
            <div v-else-if="!workspaceIngestProgress" class="workspace-tree">
              <template v-if="workspaceTreeFlat.length > 0">
                <template v-for="item in workspaceTreeFlat" :key="item.node.pathKey">
                  <n-popover
                    v-if="item.node.video"
                    trigger="click"
                    placement="right-start"
                    :width="videoHasSubtitle(item.node.video) ? 700 : 480"
                    :show-arrow="true"
                    class="video-op-popover"
                    content-class="video-op-popover-content"
                  >
                    <template #trigger>
                      <div
                        class="workspace-tree-row is-video"
                        :style="{ paddingLeft: 12 + item.depth * 16 + 'px' }"
                      >
                        <n-icon size="14" class="tree-icon">
                          <VideocamOutline />
                        </n-icon>
                        <span class="tree-label-wrap">
                          <span class="tree-label" :title="item.node.name">{{ item.node.name }}</span>
                          <span v-if="!videoHasSubtitle(item.node.video)" class="tree-label-no-sub" title="该视频暂无字幕">缺少字幕</span>
                        </span>
                      </div>
                    </template>
                    <VideoOpPanel :video="item.node.video" />
                  </n-popover>
                  <div
                    v-else
                    class="workspace-tree-row is-folder"
                    :style="{ paddingLeft: 12 + item.depth * 16 + 'px' }"
                    @click="toggleWorkspaceTreeFolder(item.node.pathKey)"
                  >
                    <n-icon size="14" class="tree-icon">
                      <ChevronDownOutline v-if="workspaceTreeExpanded.has(item.node.pathKey)" />
                      <ChevronForwardOutline v-else />
                    </n-icon>
                    <span class="tree-label-wrap">
                      <span class="tree-label" :title="item.node.name">{{ item.node.name }}</span>
                    </span>
                  </div>
                </template>
              </template>
              <div v-else class="empty-state" style="margin-top: 8px">
                <span>该工作区暂无视频</span>
              </div>
            </div>
          </template>
          <div v-else-if="!workspaceIngestProgress" class="empty-state" style="margin-top: 12px">
            <span>请在上方选择工作空间</span>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.workspace-ingest-bar {
  margin-top: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.workspace-ingest-desc {
  margin: 0 0 6px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.88);
  line-height: 1.4;
}
.workspace-ingest-file {
  margin: 0 0 6px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.workspace-ingest-count {
  margin: 0 0 8px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.45);
}

.chat-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px;
  box-sizing: border-box;
  color: #e5e5e5;
  font-family:
    'Inter',
    system-ui,
    -apple-system,
    sans-serif;
  overflow: hidden;
}

/* 隐藏工作空间树形菜单滚动条 */
.workspace-tree::-webkit-scrollbar {
  display: none;
}

.chat-sidebar.sidebar-collapsed {
  padding: 16px 8px; /* Give some horizontal padding when collapsed */
}

.sidebar-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: hidden; /* Ensure content doesn't overflow parent */
}

.sidebar-collapsed .sidebar-content {
  align-items: center;
}

.sidebar-group {
  width: 100%;
  flex-shrink: 0;
}

.top-bar-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.top-bar-row-workspace {
  flex: 1;
  min-width: 0;
  display: flex;
  overflow: hidden;
}
/* NPopover 根节点 */
.top-bar-row-workspace > * {
  flex: 1;
  min-width: 0;
  display: block;
}
.top-bar-row-workspace .workspace-bar {
  margin-bottom: 0;
  width: 100%;
  box-sizing: border-box;
}

.sidebar-toggle-btn-inline {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #71717a;
  cursor: pointer;
  transition: all 0.2s ease;
}
.sidebar-toggle-btn-inline:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #e4e4e7;
}

.sidebar-toggle-btn-top-wrapper {
  display: flex;
  justify-content: center;
  margin-bottom: 12px;
  width: 100%;
}
.sidebar-toggle-btn-top {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #d4d4d8;
  cursor: pointer;
  transition: all 0.2s ease;
}
.sidebar-toggle-btn-top:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.15);
  color: #fff;
}

.workspace-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
  border: 1px solid transparent;
  transition: all 0.2s ease;
}

.workspace-bar.clickable:hover {
  background: rgba(255, 255, 255, 0.06);
}

.workspace-bar.selecting {
  opacity: 0.8;
  pointer-events: none;
}

.workspace-bar .workspace-icon {
  color: #a1a1aa;
  flex-shrink: 0;
}

.workspace-bar .workspace-chevron {
  color: #71717a;
  flex-shrink: 0;
  margin-left: auto;
}

.workspace-label {
  font-size: 11px;
  color: #71717a;
  flex-shrink: 0;
  display: none; /* Hide label to save space and make it cleaner */
}

.workspace-name {
  font-size: 13px;
  font-weight: 500;
  color: #e4e4e7;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

/* 顶上工作空间：字幕剪辑 / AI 切换（一体 segmented 风格） */
.top-workspace-view-tabs {
  display: flex;
  flex-wrap: nowrap;
  padding: 4px;
  gap: 4px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 8px;
  margin: 0 0 12px 0;
  min-width: 0;
}
.top-workspace-view-tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 0;
  font-size: 12px;
  color: #71717a;
  cursor: pointer;
  transition: all 0.2s ease;
  border-radius: 6px;
  white-space: nowrap;
  min-width: 0;
}
.top-workspace-view-tab span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.top-workspace-view-tab:hover {
  color: #a1a1aa;
}
.top-workspace-view-tab.active {
  background: rgba(255, 255, 255, 0.1);
  color: #e4e4e7;
  font-weight: 500;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.top-workspace-view-tab.active:nth-child(1) {
  /* 手动剪辑颜色特色 */
  color: #6ee7b7; /* 绿感 */
  background: rgba(16, 185, 129, 0.15);
}

.top-workspace-view-tab.active:nth-child(2) {
  /* AI颜色特色：使用“你好，创作者”渐变色相关的蓝色系 */
  background: rgba(79, 172, 254, 0.15);
  color: #4facfe;
}

/* 工作空间切换 Popover：紧凑高度，柔和配色 */
.workspace-switcher-popover {
  padding: 6px;
  max-height: 260px;
  overflow-y: auto;
  background: #1c1c1e;
  border-radius: 8px;
}
.workspace-switcher-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  border-radius: 6px;
  transition: background 0.15s;
  margin-bottom: 2px;
}
.workspace-switcher-item__main {
  flex: 1;
  min-width: 0;
}
.workspace-switcher-item:last-child {
  margin-bottom: 0;
}
.workspace-switcher-item:hover {
  background: rgba(255, 255, 255, 0.05);
}
.workspace-switcher-item.is-active {
  background: rgba(99, 102, 241, 0.12);
}
.workspace-switcher-item__name {
  font-size: 13px;
  font-weight: 500;
  color: #e4e4e7;
  margin-bottom: 4px;
  line-height: 1.2;
}
.workspace-switcher-item__path {
  font-size: 11px;
  color: #a1a1aa;
  line-height: 1.35;
  word-break: break-all;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
}
.workspace-switcher-item__delete {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  color: #a1a1aa;
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
}
.workspace-switcher-item__delete:hover {
  color: #f87171;
  background: rgba(248, 113, 113, 0.1);
}
.workspace-switcher-item--action {
  color: #818cf8;
  font-size: 12px;
}
.workspace-switcher-item--action .workspace-switcher-item__main,
.workspace-switcher-item--action .workspace-switcher-item__delete {
  display: none;
}


.workspace-section {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.workspace-videos-loading {
  font-size: 12px;
  color: #71717a;
  padding: 12px;
  text-align: center;
}

.workspace-tree {
  overflow-y: auto;
  min-height: 120px;
  flex: 1;
  padding: 4px 0;
}

.workspace-tree-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  margin-bottom: 2px;
  font-size: 13px;
  color: #d4d4d8;
  cursor: pointer;
  border-radius: 6px;
  transition: background 0.15s ease;
}

.workspace-tree-row:hover {
  background: rgba(255, 255, 255, 0.06);
}

.workspace-tree-row .tree-icon {
  color: #71717a;
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.workspace-tree-row.is-folder .tree-icon {
  color: #fbbf24;
}

.workspace-tree-row.is-video {
  cursor: pointer;
}

.workspace-tree-row.is-video .tree-icon {
  color: #60a5fa; /* Use a nicer blue for video files instead of green */
}

.workspace-tree-row .tree-label-wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  overflow: hidden;
}

.workspace-tree-row .tree-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-tree-row .tree-label-no-sub {
  flex-shrink: 0;
  font-size: 10px;
  padding: 2px 6px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  color: #a1a1aa;
}

.section-title-wrapper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 2px;
  height: 24px;
}

.sidebar-collapsed .section-title-wrapper {
  justify-content: center;
  width: 100%;
  margin-bottom: 0;
}

.section-title {
  font-size: 11px;
  font-weight: 600;
  color: #71717a;
  text-transform: capitalize;
  letter-spacing: 0.05em;
  margin-bottom: 0;
}

.workspace-tree-title {
  font-size: 12px;
  color: #a1a1aa;
  margin: 8px 0 4px 4px;
}

.sidebar-toggle-btn {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  cursor: pointer;
  color: #71717a;
  transition: all 0.2s;
  background: transparent;
}

.sidebar-toggle-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #e4e4e7;
}

.sidebar-collapsed .sidebar-toggle-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #d4d4d8;
  transition: all 0.2s ease;
}

.sidebar-collapsed .sidebar-toggle-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.15);
  color: #fff;
}

.collapsed-icons-list {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
  width: 100%;
}

.collapsed-icon-item {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #71717a;
  transition: all 0.2s ease;
  cursor: pointer;
  margin-bottom: 8px;
}

.collapsed-icon-item:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #e4e4e7;
}

.collapsed-icon-item.active {
  background: rgba(255, 255, 255, 0.1);
  color: #e4e4e7;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.collapsed-icon-item.active:nth-child(1) {
  /* 手动剪辑颜色特色 */
  color: #6ee7b7; /* 绿感 */
  background: rgba(16, 185, 129, 0.15);
}

.collapsed-icon-item.active:nth-child(2) {
  /* AI颜色特色：使用“你好，创作者”渐变色相关的蓝色系 */
  background: rgba(79, 172, 254, 0.15);
  color: #4facfe;
}

.collapsed-icon-item.active-indicator {
  position: relative;
}

.collapsed-icon-item.active-indicator::after {
  content: '';
  position: absolute;
  left: -2px;
  top: 50%;
  transform: translateY(-50%);
  width: 2px;
  height: 16px;
  background: #eab308;
  border-radius: 1px;
}

.collapsed-divider {
  width: 24px;
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
  margin: 4px 0;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 4px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  color: #e4e4e7;
  font-size: 14px;
  font-weight: 500;
  user-select: none;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.nav-item.clickable {
  cursor: pointer;
}

.nav-item.disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none; /* Prevent clicks/hover effects */
}

.pending-tag {
  font-size: 10px;
  background: rgba(255, 255, 255, 0.1);
  padding: 1px 4px;
  border-radius: 4px;
  margin-left: auto;
  color: #a1a1aa;
}

.arrow-icon {
  color: #52525b;
  margin-right: -4px;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 12px;
  color: #71717a;
  font-size: 13px;
  text-align: center;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 8px;
  margin-top: 8px;
  border: 1px dashed rgba(255, 255, 255, 0.05);
}

.empty-area {
  min-height: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-text {
  color: #52525b;
  font-size: 12px;
}
</style>

<!-- 工作空间 Popover 外框（内容 teleport 到 body，用 :has() 选中外框并覆盖主题） -->
<style>
/* 当 popover 内包含我们的内容时，覆盖整个外框 */
.n-popover:has(.workspace-popover-box) {
  background: #1c1c1e !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  border-radius: 12px !important;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4) !important;
  padding: 0 !important;
  overflow: hidden;
}
.n-popover:has(.workspace-popover-box) .n-popover__content,
.workspace-popover-box {
  padding: 0 !important;
  background: transparent !important;
  border: none !important;
}

/* 视频操作面板 Popover - 与内容融为一体 */
.n-popover:has(.video-op-popover-content) {
  background: var(--ev-c-black-soft, #222) !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  border-radius: 12px !important;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35) !important;
  overflow: hidden;
}
.n-popover:has(.video-op-popover-content) .n-popover__content,
.video-op-popover-content {
  padding: 0 !important;
  background: transparent !important;
  border: none !important;
}
</style>
