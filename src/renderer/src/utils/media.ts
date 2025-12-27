/**
 * Media utilities for handling different types of media sources
 */

/**
 * Convert a media path to a displayable URL
 * Supports:
 * - Remote URLs (http://, https://)
 * - Local file paths (file:///)
 * - Data URIs (data:)
 * - Blob URLs (blob:)
 * - Relative paths (will be resolved against API base URL)
 *
 * @param path The media path from backend
 * @returns A URL that can be used in img/video src attributes
 */
export function getMediaUrl(path: string | undefined | null): string {
  if (!path) return ''

  // Already a complete URL protocol
  if (path.includes('://') || path.startsWith('data:') || path.startsWith('blob:')) {
    if (path.startsWith('file://')) {
      // Normalize file:// to media:// for Electron
      // Keep the slashes: file:///path -> media:///path
      return path.replace(/^file:\/\//, 'media://')
    }
    return path
  }

  // Handle local absolute paths (starts with / or C:\ etc.)
  if (path.startsWith('/') || (path.length > 2 && path[1] === ':' && path[2] === '\\')) {
    // Convert to media:// protocol, stripping extra leading slashes to prevent hostname issues
    return 'media://' + path.replace(/^\/+/, '')
  }

  // Fallback: return as-is
  return path
}

/**
 * Get the appropriate protocol for local file access
 * In Electron, we use custom 'media://' protocol
 * In browser, we might use different approaches
 *
 * @param filePath Local file path
 * @returns Protocol-prefixed path
 */
export function getLocalFileUrl(filePath: string): string {
  if (!filePath) return ''

  // Already has a protocol
  if (filePath.includes('://')) {
    return getMediaUrl(filePath)
  }

  // Assume it's a local absolute path, add file:// then convert
  return getMediaUrl(`file:///${filePath.replace(/^\/+/, '')}`)
}

/**
 * Check if a path is a remote URL
 */
export function isRemoteUrl(path: string | undefined | null): boolean {
  if (!path) return false
  return path.startsWith('http://') || path.startsWith('https://')
}

/**
 * Check if a path is a local file
 */
export function isLocalFile(path: string | undefined | null): boolean {
  if (!path) return false
  return path.startsWith('file://') || path.startsWith('media://')
}
