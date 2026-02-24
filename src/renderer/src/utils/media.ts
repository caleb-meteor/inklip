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
      // file:///E:/path -> media://E%3A/path (Windows, encode colon to prevent protocol parsing)
      // file:///path -> media://path (Unix)
      let filePath = path.replace(/^file:\/\/+/, '')
      // Remove leading slash if present, but preserve Windows drive letter format
      // For Windows: /E:/path -> E:/path
      // For Unix: /path -> path
      if (filePath.match(/^\/[A-Za-z]:\//)) {
        // /E:/path -> E:/path (remove leading slash before drive letter)
        filePath = filePath.substring(1)
        // Encode the colon in Windows drive letter to prevent browser from treating it as protocol
        // E:/path -> E%3A/path
        filePath = filePath.replace(/^([A-Za-z]):/, '$1%3A')
      } else {
        // Remove leading slashes for Unix paths
        filePath = filePath.replace(/^\/+/, '')
      }
      // For Windows paths (E%3A/path), browser will decode it back to E:/path
      // For Unix paths (path), keep as is
      return 'media://' + filePath
    }
    return path
  }

  // Handle local absolute paths (starts with / or C:\ or C:/ etc.)
  // Windows paths: C:\path or C:/path or E:/path
  // Unix paths: /path
  const isWindowsPath = path.length > 2 && path[1] === ':' && (path[2] === '\\' || path[2] === '/')
  if (path.startsWith('/') || isWindowsPath) {
    // Normalize Windows paths: convert backslashes to forward slashes
    let normalizedPath = path
    if (isWindowsPath) {
      normalizedPath = path.replace(/\\/g, '/')
      // Encode the colon in Windows drive letter to prevent browser from treating it as protocol
      // E:/path -> E%3A/path
      normalizedPath = normalizedPath.replace(/^([A-Za-z]):/, '$1%3A')
    }
    // Convert to media:// protocol, stripping extra leading slashes to prevent hostname issues
    // For Windows paths like E%3A/path, browser will decode it back to E:/path
    // For Unix paths like /path, remove leading slash
    if (isWindowsPath) {
      return 'media://' + normalizedPath
    } else {
      return 'media://' + normalizedPath.replace(/^\/+/, '')
    }
  }

  // Fallback: return as-is
  return path
}
