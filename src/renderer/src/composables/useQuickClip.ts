import { ref, computed, watch, onMounted, onUnmounted, nextTick, type Ref } from 'vue'
import { useMessage } from 'naive-ui'
import { getVideosApi, type VideoItem, exportSegmentsApi, getExportHistoryApi, getExportHistorySubtitlesApi, type ExportHistoryItem } from '../api/video'
import { parseSubtitleToSegments } from '../utils/subtitle'
import { getMediaUrl } from '../utils/media'
import type { SegmentWithVideo, VideoSegmentGroup, VirtualListItem } from '../views/quick-clip/types'

export function useQuickClip(selectedAnchorId: Ref<number | null>) {
  const message = useMessage()

  const sourceVideos = ref<VideoItem[]>([])
  const loadingVideos = ref(false)
  const sourceSegmentVideoRef = ref<HTMLVideoElement | null>(null)
  const playingSourceSegment = ref(false)

  const allSegments = ref<SegmentWithVideo[]>([])
  const subtitleSearch = ref('')
  const collapsedGroups = ref<Set<number>>(new Set())
  const locatedContexts = ref<Set<number>>(new Set())

  const filteredSegmentGroups = computed(() => {
    const groupsMap: Record<number, VideoSegmentGroup> = {}
    allSegments.value.forEach(seg => {
      if (!groupsMap[seg.videoId]) {
        groupsMap[seg.videoId] = { videoId: seg.videoId, videoName: seg.videoName, segments: [] }
      }
      groupsMap[seg.videoId].segments.push(seg)
    })
    const result: VideoSegmentGroup[] = []
    sourceVideos.value.forEach(v => {
      if (groupsMap[v.id]) result.push(groupsMap[v.id])
    })
    return result
  })

  const searchResults = computed(() => {
    const q = subtitleSearch.value.trim().toLowerCase()
    if (!q) return []
    return allSegments.value.filter(seg => seg.text.toLowerCase().includes(q))
  })

  const flatVirtualList = computed(() => {
    const list: VirtualListItem[] = []
    filteredSegmentGroups.value.forEach(group => {
      list.push({ type: 'header', key: `header-${group.videoId}`, videoId: group.videoId, videoName: group.videoName })
      if (!collapsedGroups.value.has(group.videoId)) {
        group.segments.forEach(seg => {
          list.push({ type: 'segment', key: `seg-${seg.videoId}-${seg.segmentIndex}`, segment: seg })
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

  const draggedIndexes = ref<number[]>([])
  const dragOverIndex = ref<number | null>(null)
  const dropPosition = ref<'top' | 'bottom'>('top')

  /** 选择字幕列表的展示行（拖拽时在插入位置插入占位条） */
  type SelectedDisplayRow =
    | { type: 'segment'; index: number; seg: SegmentWithVideo }
    | { type: 'placeholder'; insertIndex: number }
  const displayRowsForSelected = computed(() => {
    const segments = selectedSegments.value
    if (draggedIndexes.value.length === 0 || dragOverIndex.value === null) {
      return segments.map((seg, i) => ({ type: 'segment' as const, index: i, seg }) as SelectedDisplayRow)
    }
    const insertIndex = dropPosition.value === 'top' ? dragOverIndex.value : dragOverIndex.value + 1
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

  /** 仅拉取当前主播的导出历史列表（不打开弹窗） */
  async function fetchExportHistoryList() {
    if (!selectedAnchorId.value) {
      exportHistoryList.value = []
      return
    }
    try {
      const res = await getExportHistoryApi(selectedAnchorId.value)
      exportHistoryList.value = res.list || []
    } catch {
      exportHistoryList.value = []
    }
  }

  async function loadExportHistory() {
    if (!selectedAnchorId.value) {
      message.warning('请先选择主播')
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
        if (srcVideo && allSegments.value.length > 0) {
          const found = allSegments.value.find(
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

      // Find the active header
      for (let i = currentIndex; i >= 0; i--) {
        const item = flatVirtualList.value[i]
        if (item.type === 'header') {
          header = item
          break
        }
      }

      // Find the next header to calculate push-up effect
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

  watch(subtitleSearch, () => locatedContexts.value.clear())

  function formatTime(s: number) {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  function loadVideos() {
    if (!selectedAnchorId.value) {
      sourceVideos.value = []
      allSegments.value = []
      return
    }
    loadingVideos.value = true
    getVideosApi({ anchor_id: selectedAnchorId.value })
      .then(list => {
        sourceVideos.value = list
        const segs: SegmentWithVideo[] = []
        list.forEach(v => {
          const path = v.path ? getMediaUrl(v.path) : ''
          parseSubtitleToSegments(v.subtitle).forEach((item, idx) => {
            segs.push({ ...item, videoId: v.id, videoName: v.name, videoPath: path, segmentIndex: idx })
          })
        })
        allSegments.value = segs
      })
      .finally(() => { loadingVideos.value = false })
  }

  watch(selectedAnchorId, loadVideos, { immediate: true })

  // 切换主播时：清空选择字幕、重新请求导出历史
  watch(
    selectedAnchorId,
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
    const key = `${seg.videoId}-${seg.segmentIndex}`
    if (event?.shiftKey && lastSelectedSourceKey.value) {
      const flatList = filteredSegmentGroups.value.flatMap(g => g.segments)
      const flatKeys = flatList.map(s => `${s.videoId}-${s.segmentIndex}`)
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
    if (selectedSourceKeys.value.has(key)) {
      selectedSourceKeys.value.delete(key)
      lastSelectedSourceKey.value = Array.from(selectedSourceKeys.value)[0] ?? null
    } else {
      selectedSourceKeys.value.add(key)
      lastSelectedSourceKey.value = key
    }
  }

  function addSelectedSegments() {
    if (selectedSourceKeys.value.size === 0) return
    const flatList = filteredSegmentGroups.value.flatMap(g => g.segments)
    const toAdd = flatList.filter(seg => selectedSourceKeys.value.has(`${seg.videoId}-${seg.segmentIndex}`))
    toAdd.forEach(seg => {
      if (!selectedSegments.value.some(s => s.videoId === seg.videoId && s.segmentIndex === seg.segmentIndex)) {
        selectedSegments.value.push(seg)
      }
    })
    selectedSourceKeys.value.clear()
    lastSelectedSourceKey.value = null
  }

  function addSegment(seg: SegmentWithVideo) {
    const key = `${seg.videoId}-${seg.segmentIndex}`
    if (selectedSourceKeys.value.has(key) && selectedSourceKeys.value.size > 1) {
      addSelectedSegments()
      return
    }
    if (selectedSegments.value.some(s => s.videoId === seg.videoId && s.segmentIndex === seg.segmentIndex)) return
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
    if (selectedSegmentIndexes.value.has(index)) {
      selectedSegmentIndexes.value.delete(index)
      lastSelectedSegmentIndex.value = selectedSegmentIndexes.value.size > 0 ? Math.max(...selectedSegmentIndexes.value) : null
    } else {
      selectedSegmentIndexes.value.add(index)
      lastSelectedSegmentIndex.value = index
    }
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
    if (draggedIndexes.value.length === 0) return
    if (draggedIndexes.value.includes(index)) {
      if (dragOverIndex.value !== null) { dragOverIndex.value = null }
      return
    }
    const target = event.currentTarget as HTMLElement
    const rect = target.getBoundingClientRect()
    const position: 'top' | 'bottom' = event.clientY - rect.top < rect.height / 2 ? 'top' : 'bottom'
    // 仅在实际变化时更新状态，避免 dragover 高频触发导致卡顿
    if (dragOverIndex.value !== index || dropPosition.value !== position) {
      dropPosition.value = position
      dragOverIndex.value = index
    }
  }

  function onDrop(_event: DragEvent, index: number) {
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
    draggedIndexes.value = []
    dragOverIndex.value = null
  }

  /** 拖放到虚拟占位条时调用，直接按插入下标放置 */
  function onDropAtInsertIndex(insertIndex: number) {
    if (draggedIndexes.value.length === 0) return
    const itemsToMove: SegmentWithVideo[] = []
    for (let i = draggedIndexes.value.length - 1; i >= 0; i--) {
      itemsToMove.unshift(selectedSegments.value.splice(draggedIndexes.value[i], 1)[0])
    }
    // 移除项后，插入位置需减去“在它前面的被移除数量”
    const adjust = draggedIndexes.value.filter(i => i < insertIndex).length
    selectedSegments.value.splice(insertIndex - adjust, 0, ...itemsToMove)
    selectedSegmentIndexes.value.clear()
    lastSelectedSegmentIndex.value = null
    for (let i = 0; i < itemsToMove.length; i++) selectedSegmentIndexes.value.add(insertIndex - adjust + i)
    draggedIndexes.value = []
    dragOverIndex.value = null
  }

  /** 拖过虚拟占位条时更新为“放到此处” */
  function onDragOverPlaceholder(insertIndex: number) {
    if (draggedIndexes.value.length === 0) return
    if (dragOverIndex.value !== insertIndex - 1 || dropPosition.value !== 'bottom') {
      dragOverIndex.value = insertIndex - 1
      dropPosition.value = 'bottom'
    }
  }

  function onListDragOver() {
    if (draggedIndexes.value.length === 0) return
    const lastIdx = selectedSegments.value.length - 1
    if (dragOverIndex.value !== lastIdx || dropPosition.value !== 'bottom') {
      dragOverIndex.value = lastIdx
      dropPosition.value = 'bottom'
    }
  }

  function onListDrop() {
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
    draggedIndexes.value = []
    dragOverIndex.value = null
  }

  function onDragEnd() {
    draggedIndexes.value = []
    dragOverIndex.value = null
  }

  function playNextSegment() {
    currentPreviewIndex.value++
    if (currentPreviewIndex.value >= selectedSegments.value.length) {
      isPreviewPlaying.value = false
      currentPreviewIndex.value = -1
      return
    }
    const seg = selectedSegments.value[currentPreviewIndex.value]
    const video = previewVideoRef.value
    if (!video) return
    const currentSrc = video.getAttribute('src')
    if (currentSrc !== seg.videoPath) {
      video.src = seg.videoPath
      video.load()
      const onLoaded = () => {
        video.removeEventListener('loadedmetadata', onLoaded)
        video.currentTime = seg.fromS
        video.play().catch(() => { isPreviewPlaying.value = false })
      }
      video.addEventListener('loadedmetadata', onLoaded)
    } else {
      video.currentTime = seg.fromS
      video.play().catch(() => { isPreviewPlaying.value = false })
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
        playingSourceSegment.value = false
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
    const idx = currentPreviewIndex.value
    if (!video || idx < 0 || idx >= selectedSegments.value.length) return
    const seg = selectedSegments.value[idx]
    if (video.currentTime >= seg.toS) {
      video.pause()
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
    nextTick(() => {
      const group = filteredSegmentGroups.value.find(g => g.videoId === videoId)
      if (!group || group.segments.length === 0) {
        message.info('该视频暂无字幕')
        return
      }
      if (collapsedGroups.value.has(videoId)) collapsedGroups.value.delete(videoId)
      const doScroll = (retryCount = 0) => {
        const headerKey = `header-${videoId}`
        const firstSegment = group.segments[0]
        const key = `seg-${videoId}-${firstSegment.segmentIndex}`
        const index = flatVirtualList.value.findIndex(item => item.key === headerKey)
        if (index !== -1) {
          const topOffset = index * 34
          subtitleScrollbarRef.value?.scrollTo({ top: topOffset, behavior: 'auto' })
          setTimeout(() => flashItem(key), 200)
        } else if (retryCount < 20) setTimeout(() => doScroll(retryCount + 1), 50)
      }
      doScroll()
    })
  }

  function locateContext(seg: SegmentWithVideo) {
    if (collapsedGroups.value.has(seg.videoId)) collapsedGroups.value.delete(seg.videoId)
    const doScroll = (retryCount = 0) => {
      const virtualKey = `seg-${seg.videoId}-${seg.segmentIndex}`
      const index = flatVirtualList.value.findIndex(item => item.key === virtualKey)
      if (index !== -1) {
        const topOffset = index * 34
        const containerEl = document.querySelector('.subtitle-virtual-list')
        const containerHeight = containerEl?.clientHeight || 600
        const centerTop = Math.max(0, topOffset - containerHeight / 2 + 17)
        subtitleScrollbarRef.value?.scrollTo({ top: centerTop, behavior: 'auto' })
        setTimeout(() => flashItem(virtualKey), 200)
      } else if (retryCount < 20) setTimeout(() => doScroll(retryCount + 1), 50)
    }
    nextTick(() => doScroll())
  }

  /** 按 videoId + fromS + toS 检测重复，返回重复组（同一时间段被选了多次） */
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
    isExporting.value = true
    try {
      const requestSegments = selectedSegments.value.map(seg => ({
        video_id: seg.videoId,
        start_s: seg.fromS,
        end_s: seg.toS,
        subtitle_text: seg.text || ''
      }))
      const res = await exportSegmentsApi(requestSegments, selectedAnchorId.value, name)
      if (res?.path && res?.suggested_name) {
        if (window.api?.downloadVideo) {
          await window.api.downloadVideo(res.path, res.suggested_name)
        } else {
          message.warning('当前环境不支持下载视频')
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
    selectedAnchorId,
    sourceVideos,
    loadingVideos,
    sourceSegmentVideoRef,
    playingSourceSegment,
    allSegments,
    subtitleSearch,
    collapsedGroups,
    filteredSegmentGroups,
    searchResults,
    flatVirtualList,
    selectedSegments,
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
    subtitleScrollbarRef,
    currentStickyHeader,
    stickyHeaderOffset,
    onSubtitleScroll,
    isExporting,
    exportHistoryList,
    showExportHistoryModal,
    loadExportHistory,
    loadExportHistorySubtitles,
    loadingExportHistory,
    formatTime,
    loadVideos,
    toggleGroup,
    toggleSourceSelection,
    addSelectedSegments,
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
    playSourceSegment,
    playNextSegment,
    onPreviewTimeUpdate,
    stopPreview,
    startPreview,
    flashItem,
    scrollToVideoSubtitles,
    locateContext,
    handleExportSegments,
    checkDuplicateByVideoSegment,
    getMediaUrl
  }
}
