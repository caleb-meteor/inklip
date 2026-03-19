import { ref, shallowRef, computed, watch, onMounted, onUnmounted, nextTick, type Ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useMessage } from 'naive-ui'
import { getVideosApi, type VideoItem, exportSegmentsApi, getExportHistoryApi, getExportHistorySubtitlesApi, deleteExportHistoryApi, type ExportHistoryItem, searchSubtitlesApi, replicateHitApi, type ReplicateHitMatchItem } from '../api/video'
import { parseSubtitleToSegments } from '../utils/subtitle'
import { getMediaUrl } from '../utils/media'
import type { SegmentWithVideo, VideoSegmentGroup, VirtualListItem } from '../views/quick-clip/types'
import { useRealtimeStore } from '../stores/realtime'

export function useQuickClip(selectedWorkspaceId: Ref<number | null>, options?: { videosProvidedByParent?: boolean }) {
  const videosProvidedByParent = options?.videosProvidedByParent ?? false
  const message = useMessage()
  const { workspaceSelecting } = storeToRefs(useRealtimeStore())

  const sourceVideos = shallowRef<VideoItem[]>([])
  const loadingVideos = ref(false)
  const sourceSegmentVideoRef = ref<HTMLVideoElement | null>(null)
  const playingSourceSegment = ref(false)

  const allSegments = shallowRef<SegmentWithVideo[]>([])
  const subtitleSearch = ref('')
  const searchResults = shallowRef<SegmentWithVideo[]>([])
  const searchLoading = ref(false)
  /** 字幕搜索总条数（来自接口 total），用于「共 x 条」与是否显示查看更多 */
  const searchTotal = ref(0)
  const SEARCH_PAGE_SIZE = 20
  const collapsedGroups = ref<Set<number>>(new Set())
  const locatedContexts = ref<Set<number>>(new Set())
  /** 是否显示全部字幕区域（仅在通过搜索结果「定位上下文」后显示） */
  const showSubtitleContext = ref(false)

  /** 视频字幕区 Tab：subtitles=视频字幕 replicate=爆款复刻 */
  const subtitleTab = ref<'subtitles' | 'replicate'>('subtitles')
  const replicateText = ref('')
  const replicateLoading = ref(false)
  const replicateResults = ref<ReplicateHitMatchItem[]>([])

  /** 懒解析字幕缓存：只有展开视频组时才解析该视频的字幕 */
  const subtitleCache = new Map<number, SegmentWithVideo[]>()
  function getVideoSegments(v: VideoItem): SegmentWithVideo[] {
    const cached = subtitleCache.get(v.id)
    if (cached) return cached
    const path = v.path ? getMediaUrl(v.path) : ''
    const segs = parseSubtitleToSegments(v.subtitle).map((item, idx) => ({
      ...item, videoId: v.id, videoName: v.name, videoPath: path, segmentIndex: idx
    }))
    subtitleCache.set(v.id, segs)
    return segs
  }

  const filteredSegmentGroups = computed(() => {
    // 只有在搜索且未点击定位时，才不渲染数据；无搜索词时默认显示
    if (subtitleSearch.value && !showSubtitleContext.value) return []
    const result: VideoSegmentGroup[] = []
    sourceVideos.value.forEach(v => {
      const segments = getVideoSegments(v)
      if (segments.length > 0) {
        result.push({ videoId: v.id, videoName: v.name, segments })
      }
    })
    return result
  })

  /** 片段唯一键：video_id + start_s + end_s（与后端一致，用于定位与选中） */
  function getSegmentKey(seg: SegmentWithVideo): string {
    const from = Number(seg.fromS).toFixed(3)
    const to = Number(seg.toS).toFixed(3)
    return `${seg.videoId}-${from}-${to}`
  }

  const flatVirtualList = computed(() => {
    if (subtitleSearch.value && !showSubtitleContext.value) return []
    const list: VirtualListItem[] = []
    filteredSegmentGroups.value.forEach(group => {
      list.push({ type: 'header', key: `header-${group.videoId}`, videoId: group.videoId, videoName: group.videoName })
      if (!collapsedGroups.value.has(group.videoId)) {
        group.segments.forEach(seg => {
          const segKey = getSegmentKey(seg)
          list.push({ type: 'segment', key: `seg-${segKey}`, segment: seg, segmentKey: segKey })
        })
      }
    })
    return list
  })

  const selectedSegments = ref<SegmentWithVideo[]>([])
  const selectedSourceKeys = ref<Set<string>>(new Set())
  const lastSelectedSourceKey = ref<string | null>(null)
  const selectedSegmentIndexes = ref<Set<number>>(new Set())
  const lastSelectedSegmentIndex = ref<number | null>(null)

  const previewVideoRef = ref<HTMLVideoElement | null>(null)
  const isPreviewPlaying = ref(false)
  const currentPreviewIndex = ref(-1)
  /** 预加载下一段视频（不同文件时），减少切换间隙 */
  let preloadVideoEl: HTMLVideoElement | null = null
  function preloadNextSegmentVideo(path: string) {
    if (!path) return
    if (!preloadVideoEl) {
      preloadVideoEl = document.createElement('video')
      preloadVideoEl.preload = 'auto'
    }
    if (preloadVideoEl.src !== path) {
      preloadVideoEl.src = path
      preloadVideoEl.load()
    }
  }

  const draggedIndexes = ref<number[]>([])
  const dragOverIndex = ref<number | null>(null)
  const dropPosition = ref<'top' | 'bottom'>('top')
  /** 是否正在从视频字幕区拖入 */
  const isSourceDragging = ref(false)

  const SOURCE_DRAG_TYPE = 'application/x-inklip-source-segment'
  const SOURCE_DRAG_PREFIX = 'inklip-source-segment:'

  function onSourceSegmentDragStart(event: DragEvent, seg: SegmentWithVideo) {
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copy'
      event.dataTransfer.setData(SOURCE_DRAG_TYPE, '1')
      event.dataTransfer.setData('text/plain', SOURCE_DRAG_PREFIX + JSON.stringify(seg))
    }
  }

  function isSourceSegmentDrag(event: DragEvent | undefined): boolean {
    return Boolean(event?.dataTransfer?.types?.includes(SOURCE_DRAG_TYPE))
  }

  function getSourceSegmentFromDrop(event: DragEvent | undefined): SegmentWithVideo | null {
    const raw = event?.dataTransfer?.getData('text/plain')
    if (!raw || !raw.startsWith(SOURCE_DRAG_PREFIX)) return null
    try { return JSON.parse(raw.slice(SOURCE_DRAG_PREFIX.length)) as SegmentWithVideo } catch { return null }
  }

  /** 按选择顺序播放时使用的合并区间：同视频且首尾相接的连续段合并为一段（如 0.2~0.5 + 0.5~1.5 → 0.2~1.5），避免衔接点重复播 */
  const previewPlaybackRanges = computed(() => {
    const segs = selectedSegments.value
    if (segs.length === 0) return []
    const ranges: { fromS: number; toS: number; videoPath: string }[] = []
    let fromS = segs[0].fromS
    let toS = segs[0].toS
    let videoPath = segs[0].videoPath
    const eps = 0.02
    for (let i = 1; i < segs.length; i++) {
      const seg = segs[i]
      const isSameVideo = seg.videoPath === videoPath
      const isAdjacent = Math.abs(seg.fromS - toS) < eps
      if (isSameVideo && isAdjacent) {
        toS = seg.toS
      } else {
        ranges.push({ fromS, toS, videoPath })
        fromS = seg.fromS
        toS = seg.toS
        videoPath = seg.videoPath
      }
    }
    ranges.push({ fromS, toS, videoPath })
    return ranges
  })

  /** 选择字幕列表的展示行（拖拽时在插入位置插入占位条） */
  type SelectedDisplayRow =
    | { type: 'segment'; index: number; seg: SegmentWithVideo }
    | { type: 'placeholder'; insertIndex: number }
  const displayRowsForSelected = computed(() => {
    const segments = selectedSegments.value
    const hasDrag = (draggedIndexes.value.length > 0 || isSourceDragging.value) && dragOverIndex.value !== null
    if (!hasDrag) {
      return segments.map((seg, i) => ({ type: 'segment' as const, index: i, seg }) as SelectedDisplayRow)
    }
    const insertIndex = dropPosition.value === 'top' ? dragOverIndex.value! : dragOverIndex.value! + 1
    const before = segments.slice(0, insertIndex).map((seg, i) => ({ type: 'segment' as const, index: i, seg }) as SelectedDisplayRow)
    const after = segments.slice(insertIndex).map((seg, i) => ({ type: 'segment' as const, index: insertIndex + i, seg }) as SelectedDisplayRow)
    return [...before, { type: 'placeholder' as const, insertIndex }, ...after] as SelectedDisplayRow[]
  })

  const subtitleScrollbarRef = ref<any>(null)
  const isExporting = ref(false)

  const exportHistoryList = ref<ExportHistoryItem[]>([])
  const showExportHistoryModal = ref(false)
  const loadingExportHistory = ref(false)
  /** 清空选择字幕区 */
  function clearSelectedSegments() {
    selectedSegments.value = []
    selectedSegmentIndexes.value.clear()
    lastSelectedSegmentIndex.value = null
    selectedSourceKeys.value.clear()
    lastSelectedSourceKey.value = null
  }

  /** 仅拉取当前工作区的导出历史列表（不打开弹窗） */
  async function fetchExportHistoryList() {
    if (!selectedWorkspaceId.value) {
      exportHistoryList.value = []
      return
    }
    try {
      const res = await getExportHistoryApi({ workspace_id: selectedWorkspaceId.value })
      exportHistoryList.value = res.list || []
    } catch {
      exportHistoryList.value = []
    }
  }

  async function loadExportHistory() {
    if (!selectedWorkspaceId.value) {
      message.warning('请先选择工作空间')
      return
    }
    loadingExportHistory.value = true
    try {
      await fetchExportHistoryList()
      showExportHistoryModal.value = true
    } catch {
      message.error('加载导出历史失败')
    } finally {
      loadingExportHistory.value = false
    }
  }

  /** 删除一条导出历史记录并刷新列表 */
  async function deleteExportHistory(exportVideoId: number) {
    try {
      await deleteExportHistoryApi(exportVideoId)
      await loadExportHistory()
    } catch (err: any) {
      message.error(err?.message || '删除失败')
    }
  }

  /** 加载某次导出视频的字幕片段并填入选择字幕区；视频路径与名称优先从当前主播下的 sourceVideos 解析，保证可正常播放 */
  async function loadExportHistorySubtitles(exportVideoId: number) {
    try {
      const res = await getExportHistorySubtitlesApi(exportVideoId)
      const list = res.list || []
      const videoById = new Map(sourceVideos.value.map(v => [v.id, v]))
      const segments: SegmentWithVideo[] = list.map((item) => {
        const srcVideo = videoById.get(item.video_id)
        const videoPath = srcVideo?.path != null ? getMediaUrl(srcVideo.path) : getMediaUrl(item.path)
        const videoName = srcVideo?.name ?? item.video_name
        let segmentIndex = 0
        if (srcVideo) {
          const cachedSegs = getVideoSegments(srcVideo)
          const found = cachedSegs.find(
            s => s.videoId === item.video_id && Math.abs(s.fromS - item.start_s) < 0.01 && Math.abs(s.toS - item.end_s) < 0.01
          )
          if (found) segmentIndex = found.segmentIndex
        }
        return {
          text: item.subtitle_text,
          fromS: item.start_s,
          toS: item.end_s,
          fromMs: item.start_s * 1000,
          toMs: item.end_s * 1000,
          videoId: item.video_id,
          videoName,
          videoPath,
          segmentIndex
        }
      })
      selectedSegments.value = segments
      selectedSegmentIndexes.value.clear()
      lastSelectedSegmentIndex.value = null
      selectedSourceKeys.value.clear()
      lastSelectedSourceKey.value = null
    } catch {
      message.error('加载导出字幕失败')
    }
  }

  const currentStickyHeader = ref<{ videoId: number; videoName: string } | null>(null)
  const stickyHeaderOffset = ref(0)

  function onSubtitleScroll(e: Event) {
    const target = e.target as HTMLElement
    const scrollTop = target.scrollTop
    const itemHeight = 34
    
    const currentIndex = Math.floor(scrollTop / itemHeight)
    
    if (currentIndex >= 0 && currentIndex < flatVirtualList.value.length) {
      let header: VirtualListItem | null = null
      let nextHeaderIndex = -1

      for (let i = currentIndex; i >= 0; i--) {
        const item = flatVirtualList.value[i]
        if (item.type === 'header') {
          header = item
          break
        }
      }

      for (let i = currentIndex + 1; i < flatVirtualList.value.length; i++) {
        const item = flatVirtualList.value[i]
        if (item.type === 'header') {
          nextHeaderIndex = i
          break
        }
      }

      if (header && header.type === 'header') {
        currentStickyHeader.value = { videoId: header.videoId!, videoName: header.videoName! }
        
        if (nextHeaderIndex !== -1) {
          const distanceToNextHeader = (nextHeaderIndex * itemHeight) - scrollTop
          if (distanceToNextHeader < itemHeight) {
            stickyHeaderOffset.value = distanceToNextHeader - itemHeight
          } else {
            stickyHeaderOffset.value = 0
          }
        } else {
          stickyHeaderOffset.value = 0
        }
      } else {
        currentStickyHeader.value = null
        stickyHeaderOffset.value = 0
      }
    }
  }

  watch(subtitleSearch, () => {
    locatedContexts.value.clear()
    showSubtitleContext.value = false
  })

  /** 是否显示「查看更多」（已展示条数小于接口返回的 total 时可能还有更多） */
  const searchHasMore = computed(() => searchResults.value.length < searchTotal.value && searchTotal.value > 0)

  function mapSubtitleItemToSegment(item: { video: any; segment: any }): SegmentWithVideo {
    const video = item.video
    const path = video?.path ? getMediaUrl(video.path) : ''
    const videoName = video?.name ?? ''
    const videoId = video?.id ?? 0
    const seg = item.segment
    return {
      videoId,
      videoName,
      videoPath: path,
      segmentIndex: 0,
      text: seg?.text ?? '',
      fromS: seg?.start_s ?? (seg?.start_ms ?? 0) / 1000,
      toS: seg?.end_s ?? (seg?.end_ms ?? 0) / 1000,
      fromMs: seg?.start_ms ?? (seg?.start_s ?? 0) * 1000,
      toMs: seg?.end_ms ?? (seg?.end_s ?? 0) * 1000
    }
  }

  /** 请求字幕搜索（仅字幕全文检索，GET 翻页）；append 为 true 时追加到当前列表 */
  async function fetchSearchResults(append = false) {
    const q = subtitleSearch.value.trim()
    const workspaceId = selectedWorkspaceId.value ?? undefined
    if (!q) {
      searchResults.value = []
      searchTotal.value = 0
      return
    }
    const offset = append ? searchResults.value.length : 0
    searchLoading.value = true
    try {
      const res = await searchSubtitlesApi(q, SEARCH_PAGE_SIZE, offset, workspaceId ?? null)
      const list = (res.results || []).map(mapSubtitleItemToSegment)
      if (append) {
        searchResults.value = [...searchResults.value, ...list]
      } else {
        searchResults.value = list
      }
      searchTotal.value = res.total ?? 0
    } catch {
      if (!append) {
        searchResults.value = []
        searchTotal.value = 0
      }
    } finally {
      searchLoading.value = false
    }
  }

  function loadMoreSearchResults() {
    fetchSearchResults(true)
  }

  let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null
  watch(
    [subtitleSearch, selectedWorkspaceId],
    () => {
      const q = subtitleSearch.value.trim()
      if (!q) {
        searchResults.value = []
        searchTotal.value = 0
        return
      }
      if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
      searchDebounceTimer = setTimeout(() => {
        searchDebounceTimer = null
        fetchSearchResults(false)
      }, 300)
    },
    { immediate: true }
  )

  function formatTime(s: number) {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  /** 所选字幕总时长（秒） */
  const selectedTotalDurationSeconds = computed(() =>
    selectedSegments.value.reduce((sum, seg) => sum + (seg.toS - seg.fromS), 0)
  )

  /** 已加入「所选字幕」的 segment 的 key 集合，用于在视频字幕列表中高亮 */
  const selectedSegmentKeys = computed(() =>
    new Set(selectedSegments.value.map(seg => getSegmentKey(seg)))
  )

  /**
   * 加载当前工作区的视频字幕。若传入全量列表则按 workspace_id 过滤复用，否则请求接口。
   * @param allVideos 可选，左侧已拉取的全量视频列表，传入则不再发请求
   */
  function loadVideos(allVideos?: VideoItem[]) {
    if (!selectedWorkspaceId.value) {
      sourceVideos.value = []
      allSegments.value = []
      subtitleCache.clear()
      return
    }
    if (allVideos !== undefined) {
      // 父级传入的视频列表已是当前工作区的，直接使用；后端 VideoResponse 未返回 workspace_id，无法按此过滤
      const list = videosProvidedByParent
        ? allVideos
        : allVideos.filter(v => (v as any).workspace_id === selectedWorkspaceId.value)
      subtitleCache.clear()
      sourceVideos.value = list
      collapsedGroups.value = new Set(list.map(v => v.id))
      showSubtitleContext.value = false
      allSegments.value = []
      return
    }
    loadingVideos.value = true
    getVideosApi({ workspace_id: selectedWorkspaceId.value })
      .then(list => {
        subtitleCache.clear()
        sourceVideos.value = list
        collapsedGroups.value = new Set(list.map(v => v.id))
        showSubtitleContext.value = false
        allSegments.value = []
      })
      .finally(() => { loadingVideos.value = false })
  }

  watch(selectedWorkspaceId, () => {
    if (workspaceSelecting.value) return
    if (videosProvidedByParent) return
    loadVideos()
  }, { immediate: true })


  // 切换工作区时：清空选择字幕、重新请求导出历史
  watch(
    selectedWorkspaceId,
    () => {
      clearSelectedSegments()
      fetchExportHistoryList()
    },
    { immediate: true }
  )

  function toggleGroup(videoId: number) {
    if (collapsedGroups.value.has(videoId)) collapsedGroups.value.delete(videoId)
    else collapsedGroups.value.add(videoId)
  }

  function toggleSourceSelection(seg: SegmentWithVideo, event?: MouseEvent) {
    const key = getSegmentKey(seg)
    if (event?.shiftKey && lastSelectedSourceKey.value) {
      const flatList = filteredSegmentGroups.value.flatMap(g => g.segments)
      const flatKeys = flatList.map(s => getSegmentKey(s))
      const startIndex = flatKeys.indexOf(lastSelectedSourceKey.value)
      const endIndex = flatKeys.indexOf(key)
      if (startIndex !== -1 && endIndex !== -1) {
        const start = Math.min(startIndex, endIndex)
        const end = Math.max(startIndex, endIndex)
        for (let i = start; i <= end; i++) selectedSourceKeys.value.add(flatKeys[i])
      }
      lastSelectedSourceKey.value = key
      return
    }
    if (event?.ctrlKey || event?.metaKey) {
      if (selectedSourceKeys.value.has(key)) {
        selectedSourceKeys.value.delete(key)
        lastSelectedSourceKey.value = Array.from(selectedSourceKeys.value)[0] ?? null
      } else {
        selectedSourceKeys.value.add(key)
        lastSelectedSourceKey.value = key
      }
      return
    }
    selectedSourceKeys.value = new Set([key])
    lastSelectedSourceKey.value = key
  }

  function addSelectedSegments() {
    if (selectedSourceKeys.value.size === 0) return
    const flatList = filteredSegmentGroups.value.flatMap(g => g.segments)
    const toAdd = flatList.filter(seg => selectedSourceKeys.value.has(getSegmentKey(seg)))
    toAdd.forEach(seg => {
      if (!selectedSegments.value.some(s => getSegmentKey(s) === getSegmentKey(seg))) {
        selectedSegments.value.push(seg)
      }
    })
    selectedSourceKeys.value.clear()
    lastSelectedSourceKey.value = null
  }

  /** 取消全选（清除字幕来源侧的勾选） */
  function clearSourceSelection() {
    selectedSourceKeys.value.clear()
    lastSelectedSourceKey.value = null
  }

  function addSegment(seg: SegmentWithVideo) {
    const key = getSegmentKey(seg)
    if (selectedSourceKeys.value.has(key) && selectedSourceKeys.value.size > 1) {
      addSelectedSegments()
      return
    }
    if (selectedSegments.value.some(s => getSegmentKey(s) === key)) return
    selectedSegments.value.push(seg)
  }

  function removeSelectedSegments() {
    if (selectedSegmentIndexes.value.size > 0 && !isPreviewPlaying.value) {
      const indexesToDelete = Array.from(selectedSegmentIndexes.value).sort((a, b) => b - a)
      indexesToDelete.forEach(idx => selectedSegments.value.splice(idx, 1))
      selectedSegmentIndexes.value.clear()
      lastSelectedSegmentIndex.value = null
    }
  }

  function removeSegment(index: number) {
    if (selectedSegmentIndexes.value.has(index) && selectedSegmentIndexes.value.size > 1) {
      removeSelectedSegments()
      return
    }
    selectedSegments.value.splice(index, 1)
    selectedSegmentIndexes.value.clear()
    lastSelectedSegmentIndex.value = null
  }

  function toggleSegmentSelection(index: number, event?: MouseEvent) {
    if (event?.shiftKey && lastSelectedSegmentIndex.value !== null) {
      const start = Math.min(lastSelectedSegmentIndex.value, index)
      const end = Math.max(lastSelectedSegmentIndex.value, index)
      for (let i = start; i <= end; i++) selectedSegmentIndexes.value.add(i)
      lastSelectedSegmentIndex.value = index
      return
    }
    if (event?.ctrlKey || event?.metaKey) {
      if (selectedSegmentIndexes.value.has(index)) {
        selectedSegmentIndexes.value.delete(index)
        lastSelectedSegmentIndex.value = selectedSegmentIndexes.value.size > 0 ? Math.max(...selectedSegmentIndexes.value) : null
      } else {
        selectedSegmentIndexes.value.add(index)
        lastSelectedSegmentIndex.value = index
      }
      return
    }
    selectedSegmentIndexes.value = new Set([index])
    lastSelectedSegmentIndex.value = index
  }

  function onDragStart(event: DragEvent, index: number) {
    if (!selectedSegmentIndexes.value.has(index)) {
      selectedSegmentIndexes.value.clear()
      selectedSegmentIndexes.value.add(index)
      lastSelectedSegmentIndex.value = index
    }
    draggedIndexes.value = Array.from(selectedSegmentIndexes.value).sort((a, b) => a - b)
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', draggedIndexes.value.join(','))
      if (draggedIndexes.value.length > 1) {
        const dragBadge = document.createElement('div')
        dragBadge.textContent = `移动 ${draggedIndexes.value.length} 项`
        Object.assign(dragBadge.style, { background: '#4facfe', color: '#fff', padding: '4px 8px', borderRadius: '4px', position: 'absolute', top: '-1000px' })
        document.body.appendChild(dragBadge)
        event.dataTransfer.setDragImage(dragBadge, 0, 0)
        setTimeout(() => document.body.removeChild(dragBadge), 0)
      }
    }
  }

  function onDragOver(event: DragEvent, index: number) {
    if (isSourceSegmentDrag(event)) {
      isSourceDragging.value = true
      const target = event.currentTarget as HTMLElement
      const rect = target.getBoundingClientRect()
      const position: 'top' | 'bottom' = event.clientY - rect.top < rect.height / 2 ? 'top' : 'bottom'
      if (dragOverIndex.value !== index || dropPosition.value !== position) {
        dropPosition.value = position
        dragOverIndex.value = index
      }
      return
    }
    if (draggedIndexes.value.length === 0) return
    if (draggedIndexes.value.includes(index)) {
      if (dragOverIndex.value !== null) { dragOverIndex.value = null }
      return
    }
    const target = event.currentTarget as HTMLElement
    const rect = target.getBoundingClientRect()
    const position: 'top' | 'bottom' = event.clientY - rect.top < rect.height / 2 ? 'top' : 'bottom'
    if (dragOverIndex.value !== index || dropPosition.value !== position) {
      dropPosition.value = position
      dragOverIndex.value = index
    }
  }

  function onDrop(event: DragEvent, index: number) {
    const sourceSeg = getSourceSegmentFromDrop(event)
    if (sourceSeg) {
      const key = getSegmentKey(sourceSeg)
      if (!selectedSegments.value.some(s => getSegmentKey(s) === key)) {
        const insertIdx = dropPosition.value === 'top' ? index : index + 1
        selectedSegments.value.splice(Math.min(insertIdx, selectedSegments.value.length), 0, sourceSeg)
      }
      resetDragState()
      return
    }
    if (draggedIndexes.value.length === 0 || draggedIndexes.value.includes(index)) return
    const itemsToMove: SegmentWithVideo[] = []
    for (let i = draggedIndexes.value.length - 1; i >= 0; i--) {
      itemsToMove.unshift(selectedSegments.value.splice(draggedIndexes.value[i], 1)[0])
    }
    let insertIndex = index - draggedIndexes.value.filter(idx => idx < index).length
    if (dropPosition.value === 'bottom') insertIndex++
    selectedSegments.value.splice(insertIndex, 0, ...itemsToMove)
    selectedSegmentIndexes.value.clear()
    lastSelectedSegmentIndex.value = null
    for (let i = 0; i < itemsToMove.length; i++) selectedSegmentIndexes.value.add(insertIndex + i)
    resetDragState()
  }

  function onDropAtInsertIndex(insertIndex: number, event?: DragEvent) {
    const sourceSeg = event ? getSourceSegmentFromDrop(event) : null
    if (sourceSeg) {
      const key = getSegmentKey(sourceSeg)
      if (!selectedSegments.value.some(s => getSegmentKey(s) === key)) {
        selectedSegments.value.splice(Math.min(insertIndex, selectedSegments.value.length), 0, sourceSeg)
      }
      resetDragState()
      return
    }
    if (draggedIndexes.value.length === 0) return
    const itemsToMove: SegmentWithVideo[] = []
    for (let i = draggedIndexes.value.length - 1; i >= 0; i--) {
      itemsToMove.unshift(selectedSegments.value.splice(draggedIndexes.value[i], 1)[0])
    }
    const adjust = draggedIndexes.value.filter(i => i < insertIndex).length
    selectedSegments.value.splice(insertIndex - adjust, 0, ...itemsToMove)
    selectedSegmentIndexes.value.clear()
    lastSelectedSegmentIndex.value = null
    for (let i = 0; i < itemsToMove.length; i++) selectedSegmentIndexes.value.add(insertIndex - adjust + i)
    resetDragState()
  }

  function onDragOverPlaceholder(insertIndex: number, event?: DragEvent) {
    if (isSourceSegmentDrag(event)) { isSourceDragging.value = true }
    if (draggedIndexes.value.length === 0 && !isSourceDragging.value) return
    if (dragOverIndex.value !== insertIndex - 1 || dropPosition.value !== 'bottom') {
      dragOverIndex.value = insertIndex - 1
      dropPosition.value = 'bottom'
    }
  }

  function onListDragOver(event?: DragEvent) {
    if (isSourceSegmentDrag(event)) {
      isSourceDragging.value = true
      const lastIdx = selectedSegments.value.length - 1
      if (lastIdx >= 0 && (dragOverIndex.value !== lastIdx || dropPosition.value !== 'bottom')) {
        dragOverIndex.value = lastIdx
        dropPosition.value = 'bottom'
      }
      return
    }
    if (draggedIndexes.value.length === 0) return
    const lastIdx = selectedSegments.value.length - 1
    if (dragOverIndex.value !== lastIdx || dropPosition.value !== 'bottom') {
      dragOverIndex.value = lastIdx
      dropPosition.value = 'bottom'
    }
  }

  function onListDrop(event?: DragEvent) {
    const sourceSeg = event ? getSourceSegmentFromDrop(event) : null
    if (sourceSeg) {
      const key = getSegmentKey(sourceSeg)
      if (!selectedSegments.value.some(s => getSegmentKey(s) === key)) {
        selectedSegments.value.push(sourceSeg)
      }
      resetDragState()
      return
    }
    if (draggedIndexes.value.length === 0) return
    const itemsToMove: SegmentWithVideo[] = []
    for (let i = draggedIndexes.value.length - 1; i >= 0; i--) {
      itemsToMove.unshift(selectedSegments.value.splice(draggedIndexes.value[i], 1)[0])
    }
    const insertIndex = selectedSegments.value.length
    selectedSegments.value.push(...itemsToMove)
    selectedSegmentIndexes.value.clear()
    lastSelectedSegmentIndex.value = null
    for (let i = 0; i < itemsToMove.length; i++) selectedSegmentIndexes.value.add(insertIndex + i)
    resetDragState()
  }

  function resetDragState() {
    draggedIndexes.value = []
    dragOverIndex.value = null
    isSourceDragging.value = false
  }

  function onDragEnd() {
    resetDragState()
  }

  function playNextSegment() {
    const ranges = previewPlaybackRanges.value
    currentPreviewIndex.value++
    if (currentPreviewIndex.value >= ranges.length) {
      isPreviewPlaying.value = false
      currentPreviewIndex.value = -1
      previewVideoRef.value?.pause()
      return
    }
    const range = ranges[currentPreviewIndex.value]
    const video = previewVideoRef.value
    if (!video) return
    const currentSrc = video.getAttribute('src')
    if (currentSrc !== range.videoPath) {
      video.src = range.videoPath
      video.load()
      const onLoaded = () => {
        video.removeEventListener('loadedmetadata', onLoaded)
        video.currentTime = range.fromS
        video.play().catch(() => { isPreviewPlaying.value = false })
      }
      video.addEventListener('loadedmetadata', onLoaded)
    } else {
      video.currentTime = range.fromS
      video.play().catch(() => { isPreviewPlaying.value = false })
    }
    const nextIdx = currentPreviewIndex.value + 1
    if (nextIdx < ranges.length) {
      const nextRange = ranges[nextIdx]
      if (nextRange.videoPath !== range.videoPath) preloadNextSegmentVideo(nextRange.videoPath)
    }
  }

  function playSourceSegment(seg: SegmentWithVideo) {
    if (isPreviewPlaying.value) {
      stopPreview()
    }
    const video = sourceSegmentVideoRef.value
    if (!video) return
    if ((video as any)._segmentTimeUpdate) {
      video.removeEventListener('timeupdate', (video as any)._segmentTimeUpdate)
    }
    const doPlay = () => {
      video.currentTime = seg.fromS
      video.muted = false
      video.play().catch(() => { playingSourceSegment.value = false })
    }
    const onTimeUpdate = () => {
      if (video.currentTime >= seg.toS) {
        video.pause()
        video.removeEventListener('timeupdate', onTimeUpdate)
      }
    }
    ;(video as any)._segmentTimeUpdate = onTimeUpdate
    video.addEventListener('timeupdate', onTimeUpdate)
    playingSourceSegment.value = true
    video.src = seg.videoPath
    const onCanPlay = () => {
      video.removeEventListener('canplay', onCanPlay)
      doPlay()
    }
    video.addEventListener('canplay', onCanPlay)
    if (video.readyState >= 2) {
      video.removeEventListener('canplay', onCanPlay)
      doPlay()
    }
  }

  function onPreviewTimeUpdate() {
    const video = previewVideoRef.value
    const ranges = previewPlaybackRanges.value
    const idx = currentPreviewIndex.value
    if (!video || idx < 0 || idx >= ranges.length) return
    const range = ranges[idx]
    if (video.currentTime >= range.toS) {
      playNextSegment()
    }
  }

  function stopPreview() {
    isPreviewPlaying.value = false
    currentPreviewIndex.value = -1
    previewVideoRef.value?.pause()
  }

  function startPreview() {
    if (selectedSegments.value.length === 0) {
      message.warning('请先选择要预览的字幕')
      return
    }
    playingSourceSegment.value = false
    if (isPreviewPlaying.value) { stopPreview(); return }
    currentPreviewIndex.value = -1
    isPreviewPlaying.value = true
    playNextSegment()
  }

  function flashItem(key: string) {
    setTimeout(() => {
      const id = `subtitle-${key}`
      const el = document.getElementById(id)
      if (!el) return
      const origBg = el.style.backgroundColor
      const origBorder = el.style.borderColor
      const origTransition = el.style.transition
      el.style.transition = 'none'
      el.style.backgroundColor = '#ffeb3b'
      el.style.borderColor = '#ffc107'
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.style.transition = 'background-color 1.5s ease-out, border-color 1.5s ease-out'
          el.style.backgroundColor = origBg || ''
          el.style.borderColor = origBorder || ''
          setTimeout(() => { el.style.transition = origTransition || '' }, 1600)
        })
      })
    }, 100)
  }

  function scrollToVideoSubtitles(videoId: number) {
    const allIds = sourceVideos.value.map(v => v.id)
    collapsedGroups.value = new Set(allIds.filter(id => id !== videoId))
    showSubtitleContext.value = true
    nextTick(() => {
      const group = filteredSegmentGroups.value.find(g => g.videoId === videoId)
      if (!group || group.segments.length === 0) {
        message.info('该视频暂无字幕')
        return
      }
      const doScroll = (retryCount = 0) => {
        const headerKey = `header-${videoId}`
        const firstSegment = group.segments[0]
        const key = `seg-${getSegmentKey(firstSegment)}`
        const index = flatVirtualList.value.findIndex(item => item.key === headerKey)
        const containerEl = document.querySelector('.subtitle-virtual-list')
        
        if (index !== -1 && containerEl && containerEl.clientHeight > 0) {
          const topOffset = index * 34
          subtitleScrollbarRef.value?.scrollTo({ top: topOffset, behavior: 'auto' })
          setTimeout(() => flashItem(key), 200)
        } else if (retryCount < 20) {
          setTimeout(() => doScroll(retryCount + 1), 50)
        }
      }
      doScroll()
    })
  }

  function locateContext(seg: SegmentWithVideo) {
    clearSourceSelection()
    const allIds = sourceVideos.value.map(v => v.id)
    collapsedGroups.value = new Set(allIds.filter(id => id !== seg.videoId))
    showSubtitleContext.value = true
    const virtualKey = `seg-${getSegmentKey(seg)}`
    const doScroll = (retryCount = 0) => {
      const index = flatVirtualList.value.findIndex(item => item.key === virtualKey)
      const containerEl = document.querySelector('.subtitle-virtual-list')
      
      if (index !== -1 && containerEl && containerEl.clientHeight > 0) {
        const topOffset = index * 34
        const containerHeight = containerEl.clientHeight
        const centerTop = Math.max(0, topOffset - containerHeight / 2 + 17)
        subtitleScrollbarRef.value?.scrollTo({ top: centerTop, behavior: 'auto' })
        setTimeout(() => flashItem(virtualKey), 200)
      } else if (retryCount < 20) {
        setTimeout(() => doScroll(retryCount + 1), 50)
      }
    }
    nextTick(() => doScroll())
  }

  /** 按 videoId + fromS + toS 检测重复，返回重复组（同一时间段被选了多次） */
  async function startReplicate() {
    const text = replicateText.value.trim()
    if (!text) {
      message.warning('请输入爆款文案')
      return
    }
    replicateLoading.value = true
    replicateResults.value = []
    try {
      const res = await replicateHitApi(text, selectedWorkspaceId.value ?? null)
      replicateResults.value = res.results || []
    } catch {
      message.error('爆款复刻匹配失败')
    } finally {
      replicateLoading.value = false
    }
  }

  function applyReplicateResults() {
    const matched = replicateResults.value.filter(r => r.match !== null)
    if (matched.length === 0) {
      message.warning('没有可添加的匹配结果')
      return
    }
    const existingKeys = new Set(selectedSegments.value.map(s => getSegmentKey(s)))
    let addedCount = 0
    for (const item of matched) {
      const m = item.match!
      const seg: SegmentWithVideo = {
        videoId: m.video.id,
        videoName: m.video.name,
        videoPath: m.video.path ? getMediaUrl(m.video.path) : '',
        segmentIndex: 0,
        text: m.segment.text,
        fromS: m.segment.start_s,
        toS: m.segment.end_s,
        fromMs: m.segment.start_ms,
        toMs: m.segment.end_ms
      }
      const key = getSegmentKey(seg)
      if (!existingKeys.has(key)) {
        selectedSegments.value.push(seg)
        existingKeys.add(key)
        addedCount++
      }
    }
    if (addedCount > 0) {
      message.success(`已添加 ${addedCount} 条匹配字幕`)
    } else {
      message.info('所有匹配字幕已存在')
    }
  }

  function checkDuplicateByVideoSegment(): { videoId: number; fromS: number; toS: number; videoName: string; selectedPositions: number[] }[] {
    const list = selectedSegments.value
    const map = new Map<string, { seg: SegmentWithVideo; positions: number[] }>()
    list.forEach((seg, i) => {
      const key = `${seg.videoId}-${seg.fromS}-${seg.toS}`
      const one = map.get(key)
      if (!one) map.set(key, { seg, positions: [i + 1] })
      else one.positions.push(i + 1)
    })
    const result: { videoId: number; fromS: number; toS: number; videoName: string; selectedPositions: number[] }[] = []
    map.forEach(({ seg, positions }) => {
      if (positions.length > 1) result.push({ videoId: seg.videoId, fromS: seg.fromS, toS: seg.toS, videoName: seg.videoName, selectedPositions: positions })
    })
    return result
  }

  async function handleExportSegments(suggestedName?: string) {
    if (selectedSegments.value.length === 0) {
      message.warning('请先选择要导出的字幕片段')
      return
    }
    const name = suggestedName?.trim() || `inklip_merged_${Date.now()}.mp4`
    const dialogResult = await window.api?.showExportSaveDialog(name)
    if (dialogResult?.canceled || !dialogResult?.filePath) {
      return
    }
    const userChosenPath = dialogResult.filePath
    isExporting.value = true
    try {
      const requestSegments = selectedSegments.value.map(seg => ({
        video_id: seg.videoId,
        start_s: seg.fromS,
        end_s: seg.toS,
        subtitle_text: seg.text || ''
      }))
      const res = await exportSegmentsApi(
        requestSegments,
        { workspaceId: selectedWorkspaceId.value },
        name,
        userChosenPath
      )
      if (res?.path && res?.suggested_name) {
        message.success('导出成功，可在导出历史中打开所在文件夹')
        if (showExportHistoryModal.value) {
          loadExportHistory()
        }
      }
    } catch (error: any) {
      message.error(error?.message || '导出视频失败')
    } finally {
      isExporting.value = false
    }
  }

  function handleGlobalKeydown(e: KeyboardEvent) {
    if (e.key !== 'Delete' && e.key !== 'Backspace') return
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
    removeSelectedSegments()
  }

  onMounted(() => window.addEventListener('keydown', handleGlobalKeydown))
  onUnmounted(() => window.removeEventListener('keydown', handleGlobalKeydown))

  return {
    selectedWorkspaceId,
    sourceVideos,
    loadingVideos,
    sourceSegmentVideoRef,
    playingSourceSegment,
    allSegments,
    subtitleSearch,
    searchLoading,
    collapsedGroups,
    showSubtitleContext,
    subtitleTab,
    replicateText,
    replicateLoading,
    replicateResults,
    filteredSegmentGroups,
    searchResults,
    searchTotal,
    searchHasMore,
    loadMoreSearchResults,
    flatVirtualList,
    selectedSegments,
    selectedSegmentKeys,
    selectedSourceKeys,
    lastSelectedSourceKey,
    selectedSegmentIndexes,
    lastSelectedSegmentIndex,
    previewVideoRef,
    isPreviewPlaying,
    currentPreviewIndex,
    draggedIndexes,
    dragOverIndex,
    dropPosition,
    displayRowsForSelected,
    selectedTotalDurationSeconds,
    subtitleScrollbarRef,
    currentStickyHeader,
    stickyHeaderOffset,
    onSubtitleScroll,
    isExporting,
    exportHistoryList,
    showExportHistoryModal,
    loadExportHistory,
    deleteExportHistory,
    loadExportHistorySubtitles,
    loadingExportHistory,
    formatTime,
    getSegmentKey,
    loadVideos,
    toggleGroup,
    toggleSourceSelection,
    addSelectedSegments,
    clearSourceSelection,
    addSegment,
    removeSelectedSegments,
    removeSegment,
    toggleSegmentSelection,
    onDragStart,
    onDragOver,
    onDrop,
    onDropAtInsertIndex,
    onDragOverPlaceholder,
    onListDragOver,
    onListDrop,
    onDragEnd,
    onSourceSegmentDragStart,
    isSourceSegmentDrag,
    playSourceSegment,
    playNextSegment,
    onPreviewTimeUpdate,
    stopPreview,
    startPreview,
    flashItem,
    scrollToVideoSubtitles,
    locateContext,
    handleExportSegments,
    startReplicate,
    applyReplicateResults,
    checkDuplicateByVideoSegment,
    getMediaUrl
  }
}
