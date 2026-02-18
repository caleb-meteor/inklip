import { ref, type Ref } from 'vue'
import { getMediaUrl } from '../utils/media'

// Global state - shared across all VideoPreviewPlayer instances
const currentVideoPath: Ref<string | null> = ref(null)
const videoElement: Ref<HTMLVideoElement | null> = ref(null)
const targetContainer: Ref<HTMLElement | null> = ref(null)
const isLoading: Ref<boolean> = ref(false)
const hasError: Ref<boolean> = ref(false)
let cleanupTimer: ReturnType<typeof setTimeout> | null = null
let currentEndTime: number | null = null

/**
 * Global video preview composable
 * Ensures only one video preview exists at a time across the entire app
 */
export function useGlobalVideoPreview(): {
  currentVideoPath: Ref<string | null>
  isLoading: Ref<boolean>
  hasError: Ref<boolean>
  showPreview: (
    path: string,
    container: HTMLElement,
    startTime?: number,
    muted?: boolean,
    endTime?: number
  ) => void
  hidePreview: () => void
  isCurrentlyPreviewing: (path: string) => boolean
} {
  /**
   * Show video preview in the specified container
   * @param path Original video path (not converted)
   * @param container HTML element to render the video in
   * @param startTime Optional start time in seconds
   * @param muted Whether the video should be muted (default: true)
   * @param endTime Optional end time in seconds to pause the video
   */
  const showPreview = (
    path: string,
    container: HTMLElement,
    startTime?: number,
    muted: boolean = true,
    endTime?: number
  ): void => {
    const timestamp = new Date().toISOString().split('T')[1]

    // Cancel any pending cleanup
    if (cleanupTimer) {
      console.log(`[${timestamp}] [GlobalVideoPreview] Cancelling pending cleanup`)
      clearTimeout(cleanupTimer)
      cleanupTimer = null
    }

    // Update current path
    const isSameVideo = currentVideoPath.value === path
    currentVideoPath.value = path
    targetContainer.value = container

    console.log(
      `[${timestamp}] [GlobalVideoPreview] Showing preview for:`,
      path,
      isSameVideo ? '(same video)' : '',
      muted ? 'muted' : 'unmuted'
    )

    // Create video element if it doesn't exist
    if (!videoElement.value) {
      console.log(`[${timestamp}] [GlobalVideoPreview] Creating global video element`)
      videoElement.value = document.createElement('video')
      videoElement.value.autoplay = true
      videoElement.value.loop = true
      videoElement.value.muted = muted
      videoElement.value.preload = 'metadata'
      videoElement.value.className = 'v-inline-video'

      // Set inline styles to ensure proper sizing
      videoElement.value.style.width = '100%'
      videoElement.value.style.height = '100%'
      videoElement.value.style.objectFit = 'cover'
      videoElement.value.style.display = 'block'

      // Event listeners
      videoElement.value.addEventListener('timeupdate', () => {
        if (
          currentEndTime != null &&
          videoElement.value &&
          videoElement.value.currentTime >= currentEndTime
        ) {
          console.log(`[GlobalVideoPreview] Auto-pausing at ${currentEndTime}`)
          videoElement.value.pause()
          currentEndTime = null // Reset after pausing
        }
      })

      videoElement.value.addEventListener('loadeddata', () => {
        isLoading.value = false
        const loadTimestamp = new Date().toISOString().split('T')[1]
        console.log(`[${loadTimestamp}] [GlobalVideoPreview] Video loaded`)

        // Apply start time if provided
        if (startTime != null && videoElement.value) {
          videoElement.value.currentTime = startTime
        }
      })

      videoElement.value.addEventListener('error', (e) => {
        hasError.value = true
        isLoading.value = false
        const errorTimestamp = new Date().toISOString().split('T')[1]
        const target = e.target as HTMLVideoElement
        console.warn(`[${errorTimestamp}] [GlobalVideoPreview] Video load error:`, {
          path,
          convertedUrl: getMediaUrl(path),
          error: target.error,
          networkState: target.networkState,
          readyState: target.readyState
        })
      })
    }

    // Set end time for auto-pause AFTER ensuring it won't be triggered by old position
    // We update currentEndTime first, then currentTime.
    currentEndTime = endTime ?? null

    // Ensure correct mute state
    videoElement.value.muted = muted

    // Update src only if different video
    if (!isSameVideo) {
      hasError.value = false
      isLoading.value = true
      const convertedUrl = getMediaUrl(path)
      console.log(`[${timestamp}] [GlobalVideoPreview] Updating video src to:`, convertedUrl)
      videoElement.value.src = convertedUrl
    } else {
      // If same video, just seek if startTime provided
      if (startTime != null) {
        // Move to the new start time BEFORE it has a chance to hit the new currentEndTime
        // In the same tick, we update currentEndTime and currentTime, so timeupdate won't fire between them.
        videoElement.value.currentTime = startTime
      }

      // If it's already playing but paused
      if (videoElement.value.paused) {
        console.log(`[${timestamp}] [GlobalVideoPreview] Resuming paused video`)
        videoElement.value.play().catch((err) => {
          console.warn('[GlobalVideoPreview] Play error:', err)
        })
      }
    }

    // Move video element to target container
    if (container && videoElement.value.parentElement !== container) {
      container.appendChild(videoElement.value)
    }
  }

  /**
   * Hide the current video preview
   * Pauses immediately but delays src cleanup by 5 seconds
   */
  const hidePreview = (): void => {
    const timestamp = new Date().toISOString().split('T')[1]
    console.log(`[${timestamp}] [GlobalVideoPreview] Hiding preview`)

    if (videoElement.value) {
      videoElement.value.pause()
      videoElement.value.currentTime = 0

      // Remove from DOM immediately
      if (videoElement.value.parentElement) {
        videoElement.value.parentElement.removeChild(videoElement.value)
      }
    }

    currentVideoPath.value = null
    targetContainer.value = null

    // Schedule src cleanup after 5 seconds
    // This prevents reloading if user quickly hovers over another video
    if (cleanupTimer) {
      clearTimeout(cleanupTimer)
    }

    cleanupTimer = setTimeout(() => {
      const cleanupTimestamp = new Date().toISOString().split('T')[1]
      console.log(`[${cleanupTimestamp}] [GlobalVideoPreview] Cleaning up video src after 5s delay`)

      if (videoElement.value) {
        videoElement.value.removeAttribute('src')
        // calling load() on empty src causes error code 4, so we just remove the attribute
        // leaving it paused and src-less stops the download/buffering
      }

      cleanupTimer = null
    }, 5000)
  }

  /**
   * Check if a specific video is currently being previewed
   */
  const isCurrentlyPreviewing = (path: string): boolean => {
    return currentVideoPath.value === path
  }

  return {
    currentVideoPath,
    isLoading,
    hasError,
    showPreview,
    hidePreview,
    isCurrentlyPreviewing
  }
}
