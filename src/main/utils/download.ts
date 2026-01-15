import { net } from 'electron'
import fs from 'fs'
import { createHash } from 'crypto'

export const activeDownloadRequests = new Set<Electron.ClientRequest>()

// Track active downloads by file path to prevent concurrent downloads of the same file
const activeDownloads = new Map<string, Promise<void>>()

/**
 * Get the path for storing SHA256 checksum
 */
function getSha256Path(filePath: string): string {
  return `${filePath}.sha256`
}

/**
 * Read cached SHA256 from file
 */
function readCachedSha256(filePath: string): string | null {
  const sha256Path = getSha256Path(filePath)
  if (!fs.existsSync(sha256Path)) {
    return null
  }
  try {
    const content = fs.readFileSync(sha256Path, 'utf-8').trim()
    return content || null
  } catch (e) {
    console.warn(`[Download Utils] Failed to read SHA256 cache from ${sha256Path}:`, e)
    return null
  }
}

/**
 * Write SHA256 to cache file
 */
function writeCachedSha256(filePath: string, sha256: string): void {
  const sha256Path = getSha256Path(filePath)
  try {
    fs.writeFileSync(sha256Path, sha256, 'utf-8')
    console.log(`[Download Utils] Cached SHA256 to ${sha256Path}`)
  } catch (e) {
    console.warn(`[Download Utils] Failed to write SHA256 cache to ${sha256Path}:`, e)
  }
}

/**
 * Calculate SHA256 hash of a file (streaming for large files)
 */
async function calculateFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = fs.createReadStream(filePath)
    
    stream.on('data', (data) => {
      hash.update(data)
    })
    
    stream.on('end', () => {
      const sha256 = hash.digest('hex')
      resolve(sha256)
    })
    
    stream.on('error', (err) => {
      reject(err)
    })
  })
}

/**
 * Verify file SHA256, using cache if available
 */
async function verifyFileSha256(
  filePath: string,
  expectedSha256?: string
): Promise<{ isValid: boolean; sha256: string; fromCache: boolean }> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File does not exist: ${filePath}`)
  }

  // Try to read from cache first
  const cachedSha256 = readCachedSha256(filePath)
  if (cachedSha256) {
    console.log(`[Download Utils] Using cached SHA256 for ${filePath}`)
    if (expectedSha256) {
      const isValid = cachedSha256.toLowerCase() === expectedSha256.toLowerCase()
      return { isValid, sha256: cachedSha256, fromCache: true }
    }
    // If no expected SHA256 provided, assume cached value is valid
    return { isValid: true, sha256: cachedSha256, fromCache: true }
  }

  // Calculate SHA256 if not cached
  console.log(`[Download Utils] Calculating SHA256 for ${filePath}...`)
  const startTime = Date.now()
  const sha256 = await calculateFileSha256(filePath)
  const elapsed = Date.now() - startTime
  console.log(`[Download Utils] SHA256 calculated in ${elapsed}ms: ${sha256}`)

  // Cache the result
  writeCachedSha256(filePath, sha256)

  // Verify if expected SHA256 is provided
  if (expectedSha256) {
    const isValid = sha256.toLowerCase() === expectedSha256.toLowerCase()
    return { isValid, sha256, fromCache: false }
  }

  return { isValid: true, sha256, fromCache: false }
}

export function abortAllDownloads(): void {
  console.log('[Download Utils] Aborting active downloads...')
  activeDownloadRequests.forEach((req) => {
    try {
      req.abort()
    } catch (e) {
      console.error('[Download Utils] Error aborting request:', e)
    }
  })
  activeDownloadRequests.clear()
  activeDownloads.clear()
}

/**
 * Common interface for download progress callback
 */
export interface DownloadProgress {
  percentage: number
  current: number
  total: number
  speed: number
}

/**
 * Common interface for download options
 */
export interface DownloadOptions {
  url: string
  targetPath: string
  onProgress: (progress: DownloadProgress) => void
  isQuitting: () => boolean
  expectedSha256?: string
}

/**
 * Check if there's an existing download in progress and wait for it
 */
async function checkExistingDownload(
  targetPath: string,
  onProgress: (progress: DownloadProgress) => void
): Promise<boolean> {
  const existingDownload = activeDownloads.get(targetPath)
  if (existingDownload) {
    console.log(`[Download Utils] Download already in progress for ${targetPath}, waiting...`)
    try {
      await existingDownload
      if (fs.existsSync(targetPath)) {
        const stats = fs.statSync(targetPath)
        onProgress({ percentage: 100, current: stats.size, total: stats.size, speed: 0 })
      }
      return true
    } catch (err) {
      console.warn(`[Download Utils] Previous download failed, starting new one:`, err)
      activeDownloads.delete(targetPath)
    }
  }
  return false
}

/**
 * Check if file already exists and verify SHA256 if provided
 * Returns true if file exists and is valid (should skip download)
 */
async function checkExistingFile(
  targetPath: string,
  expectedSha256: string | undefined,
  onProgress: (progress: DownloadProgress) => void
): Promise<boolean> {
  if (!fs.existsSync(targetPath)) {
    return false
  }

  console.log(`[Download Utils] File ${targetPath} exists, verifying...`)
  
  if (expectedSha256) {
    try {
      const { isValid } = await verifyFileSha256(targetPath, expectedSha256)
      if (isValid) {
        console.log(`[Download Utils] File exists and SHA256 matches, skipping download`)
        const stats = fs.statSync(targetPath)
        onProgress({ percentage: 100, current: stats.size, total: stats.size, speed: 0 })
        return true
      } else {
        console.log(`[Download Utils] File exists but SHA256 doesn't match, re-downloading`)
        try {
          fs.unlinkSync(targetPath)
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    } catch (error) {
      console.warn(`[Download Utils] Failed to verify existing file, re-downloading:`, error)
      try {
        fs.unlinkSync(targetPath)
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  } else {
    // No expected SHA256, assume file is valid
    const stats = fs.statSync(targetPath)
    onProgress({ percentage: 100, current: stats.size, total: stats.size, speed: 0 })
    return true
  }
  
  return false
}

/**
 * Handle download completion and SHA256 verification for simple download
 */
async function handleSimpleDownloadComplete(
  targetPath: string,
  downloadedBytes: number,
  totalSize: number,
  expectedSha256: string | undefined,
  onProgress: (progress: DownloadProgress) => void,
  resolve: () => void,
  reject: (error: Error) => void
): Promise<void> {
  // Verify SHA256 if provided
  if (expectedSha256) {
    try {
      const { isValid } = await verifyFileSha256(targetPath, expectedSha256)
      if (!isValid) {
        reject(new Error('SHA256 verification failed'))
        return
      }
    } catch (error) {
      reject(new Error(`SHA256 verification error: ${error}`))
      return
    }
  }

  onProgress({
    percentage: 100,
    current: downloadedBytes,
    total: totalSize,
    speed: 0
  })

  console.log(`[Download Utils] Download completed: ${targetPath}`)
  resolve()
}

/**
 * Check if any part files exist
 */
function hasPartFiles(targetPath: string, threadCount: number): boolean {
  for (let i = 0; i < threadCount; i++) {
    if (fs.existsSync(`${targetPath}.part${i}`)) {
      return true
    }
  }
  return false
}

/**
 * Clean up part files
 */
function cleanupPartFiles(targetPath: string, threadCount: number): void {
  for (let i = 0; i < threadCount; i++) {
    const partPath = `${targetPath}.part${i}`
    if (fs.existsSync(partPath)) {
      try {
        fs.unlinkSync(partPath)
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Verify part files before merging
 */
function verifyPartFiles(
  targetPath: string,
  threadCount: number,
  chunkSize: number,
  totalSize: number
): string[] {
  const partPaths: string[] = []
  for (let i = 0; i < threadCount; i++) {
    const partPath = `${targetPath}.part${i}`
    const start = i * chunkSize
    const end = Math.min((i + 1) * chunkSize - 1, totalSize - 1)
    const expectedSize = end - start + 1

    if (!fs.existsSync(partPath)) {
      throw new Error(`Part ${i} missing: ${partPath}`)
    }

    const actualSize = fs.statSync(partPath).size
    if (actualSize !== expectedSize) {
      throw new Error(`Part ${i} size mismatch: expected ${expectedSize}, got ${actualSize}`)
    }

    partPaths.push(partPath)
  }
  return partPaths
}

/**
 * Merge part files into target file
 */
async function mergePartFiles(
  targetPath: string,
  partPaths: string[],
  totalSize: number,
  expectedSha256: string | undefined,
  onProgress: (progress: DownloadProgress) => void,
  emitProgress: (force?: boolean) => void,
  resolve: () => void,
  reject: (error: Error) => void
): Promise<void> {
  // Merge part files atomically
  const tempTargetPath = `${targetPath}.tmp`
  const finalStream = fs.createWriteStream(tempTargetPath)

  try {
    for (const partPath of partPaths) {
      const data = fs.readFileSync(partPath)
      finalStream.write(data)
    }

    finalStream.end(async () => {
      // Verify merged file size
      const mergedStats = fs.statSync(tempTargetPath)
      if (mergedStats.size !== totalSize) {
        fs.unlinkSync(tempTargetPath)
        reject(new Error(`Merged file size mismatch: expected ${totalSize}, got ${mergedStats.size}`))
        return
      }

      // Atomically rename temp file to target
      fs.renameSync(tempTargetPath, targetPath)
      console.log(`[Download Utils] ${targetPath} merged successfully.`)

      // Clean up part files after successful merge
      for (const partPath of partPaths) {
        try {
          fs.unlinkSync(partPath)
        } catch (e) {
          console.warn(`[Download Utils] Failed to clean up part file ${partPath}:`, e)
        }
      }

      emitProgress(true)

      // Calculate and verify SHA256 after download completes
      try {
        console.log(`[Download Utils] Calculating SHA256 for ${targetPath}...`)
        const sha256 = await calculateFileSha256(targetPath)
        console.log(`[Download Utils] SHA256 calculated: ${sha256}`)

        // Cache the SHA256
        writeCachedSha256(targetPath, sha256)

        // Verify if expected SHA256 is provided
        if (expectedSha256) {
          if (sha256.toLowerCase() !== expectedSha256.toLowerCase()) {
            // Remove invalid file
            try {
              fs.unlinkSync(targetPath)
              const sha256Path = getSha256Path(targetPath)
              if (fs.existsSync(sha256Path)) {
                fs.unlinkSync(sha256Path)
              }
            } catch (e) {
              // Ignore cleanup errors
            }
            reject(
              new Error(`SHA256 mismatch: expected ${expectedSha256}, got ${sha256}`)
            )
            return
          } else {
            console.log(`[Download Utils] SHA256 verification passed: ${sha256}`)
          }
        }

        resolve()
      } catch (err) {
        console.error(`[Download Utils] SHA256 calculation failed:`, err)
        // If SHA256 calculation fails but file is downloaded, still resolve
        // (user can manually verify later)
        resolve()
      }
    })
  } catch (mergeErr) {
    finalStream.close()
    // Clean up on error
    try {
      if (fs.existsSync(tempTargetPath)) {
        fs.unlinkSync(tempTargetPath)
      }
    } catch (e) {
      // Ignore cleanup errors
    }
    reject(new Error(`Failed to merge part files: ${mergeErr}`))
  }
}

/**
 * Setup data and error handlers for simple download response
 */
function setupSimpleDownloadResponse(
  response: Electron.IncomingMessage,
  totalSize: number,
  downloadedBytes: { value: number },
  progressState: {
    lastProgressTime: number
    lastProgressBytes: number
  },
  fileStream: fs.WriteStream | null,
  onProgress: (progress: DownloadProgress) => void,
  isQuitting: () => boolean,
  handleError: (error: string) => void
): void {
  response.on('data', (chunk: Buffer) => {
    if (isQuitting() || !fileStream) return

    try {
      fileStream.write(chunk)
      downloadedBytes.value += chunk.length

      const now = Date.now()
      const elapsed = (now - progressState.lastProgressTime) / 1000
      if (elapsed >= 0.1) {
        // Update progress every 100ms
        const speed = (downloadedBytes.value - progressState.lastProgressBytes) / elapsed
        const percentage = totalSize > 0 ? (downloadedBytes.value / totalSize) * 100 : 0

        onProgress({
          percentage,
          current: downloadedBytes.value,
          total: totalSize,
          speed
        })

        progressState.lastProgressTime = now
        progressState.lastProgressBytes = downloadedBytes.value
      }
    } catch (error) {
      handleError(`Failed to write data: ${error}`)
    }
  })

  response.on('error', (error) => {
    handleError(`Response error: ${error}`)
  })
}

/**
 * Simple single-threaded download helper.
 * Suitable for mirror downloads (e.g., HF Mirror).
 * Supports SHA256 verification with caching.
 * 
 * This is a simplified version that doesn't use multi-threading,
 * making it more suitable for mirror sites that may not support range requests well.
 */
export async function downloadFileSimple(
  url: string,
  targetPath: string,
  onProgress: (progress: DownloadProgress) => void,
  isQuitting: () => boolean,
  expectedSha256?: string
): Promise<void> {
  if (isQuitting()) {
    throw new Error('App is quitting')
  }

  // Check if there's already an active download for this file
  if (await checkExistingDownload(targetPath, onProgress)) {
    return
  }

  // Check if file already exists
  if (await checkExistingFile(targetPath, expectedSha256, onProgress)) {
    return
  }

  const MAX_RETRIES = 3
  const REQUEST_TIMEOUT = 60000

  const downloadPromise = new Promise<void>((resolve, reject) => {
    let attempt = 1
    let totalSize = 0

    const performDownload = (): void => {
      if (isQuitting()) {
        reject(new Error('App is quitting'))
        return
      }

      console.log(`[Download Utils] Starting simple download (attempt ${attempt}/${MAX_RETRIES}): ${url}`)

      const req = net.request({ method: 'GET', url })
      activeDownloadRequests.add(req)

      let fileStream: fs.WriteStream | null = null
      let timeout: NodeJS.Timeout | null = null

      const cleanup = (): void => {
        activeDownloadRequests.delete(req)
        if (timeout) clearTimeout(timeout)
        if (fileStream) {
          fileStream.end()
          fileStream = null
        }
      }

      const handleError = (error: string): void => {
        cleanup()
        if (attempt < MAX_RETRIES) {
          attempt++
          console.log(`[Download Utils] Retrying download (attempt ${attempt}/${MAX_RETRIES})...`)
          setTimeout(performDownload, 1000 * attempt)
        } else {
          reject(new Error(`Failed to download after ${MAX_RETRIES} attempts: ${error}`))
        }
      }

      timeout = setTimeout(() => {
        req.abort()
        handleError('Request timeout')
      }, REQUEST_TIMEOUT)

      req.on('response', (response) => {
        if (timeout) clearTimeout(timeout)

        if (response.statusCode !== 200) {
          handleError(`HTTP ${response.statusCode}`)
          return
        }

        totalSize = parseInt(response.headers['content-length'] as string, 10) || 0

        try {
          fileStream = fs.createWriteStream(targetPath)
        } catch (error) {
          handleError(`Failed to create file stream: ${error}`)
          return
        }

        const progressState = {
          lastProgressTime: Date.now(),
          lastProgressBytes: 0
        }
        const downloadedBytesRef = { value: 0 }

        setupSimpleDownloadResponse(
          response,
          totalSize,
          downloadedBytesRef,
          progressState,
          fileStream,
          onProgress,
          isQuitting,
          handleError
        )

        response.on('end', async () => {
          cleanup()

          if (isQuitting()) {
            reject(new Error('App is quitting'))
            return
          }

          if (fileStream) {
            fileStream.end()
            fileStream = null
          }

          await handleSimpleDownloadComplete(
            targetPath,
            downloadedBytesRef.value,
            totalSize,
            expectedSha256,
            onProgress,
            resolve,
            reject
          )
        })
      })

      req.on('error', (error) => {
        handleError(`Request error: ${error}`)
      })

      req.end()
    }

    performDownload()
  })

  // Store the download promise and clean up when done
  activeDownloads.set(targetPath, downloadPromise)

  downloadPromise
    .then(() => {
      activeDownloads.delete(targetPath)
    })
    .catch((err) => {
      activeDownloads.delete(targetPath)
      throw err
    })

  return downloadPromise
}

/**
 * Multi-threaded resumable download helper.
 * Uses persistent .part files to resume across app restarts.
 * Supports SHA256 verification with caching to avoid repeated calculations.
 * 
 * This function uses multiple threads for faster downloads, suitable for
 * direct downloads from original sources. For mirror sites, consider using
 * downloadFileSimple instead.
 */
export async function downloadFile(
  url: string,
  targetPath: string,
  onProgress: (progress: DownloadProgress) => void,
  isQuitting: () => boolean,
  expectedSha256?: string
): Promise<void> {
  if (isQuitting()) {
    throw new Error('App is quitting')
  }

  // Check if there's already an active download for this file
  if (await checkExistingDownload(targetPath, onProgress)) {
    return
  }

  const MAX_RETRIES = 10
  const REQUEST_TIMEOUT = 30000
  const THREAD_COUNT = 2

  // Create download promise and store it to prevent concurrent downloads
  const downloadPromise = new Promise<void>((resolve, reject) => {
    // 0. Check if file already exists and verify SHA256 if available
    const checkExistingFile = async (): Promise<boolean> => {
      if (fs.existsSync(targetPath)) {
        console.log(`[Download Utils] File ${targetPath} exists, verifying...`)
        
        // If expected SHA256 is provided, verify it first (using cache if available)
        if (expectedSha256) {
          try {
            const { isValid, sha256, fromCache } = await verifyFileSha256(targetPath, expectedSha256)
            if (isValid) {
              console.log(
                `[Download Utils] File ${targetPath} SHA256 verified${fromCache ? ' (from cache)' : ''}: ${sha256}`
              )
              // Clean up any leftover part files
              cleanupPartFiles(targetPath, THREAD_COUNT)
              const stats = fs.statSync(targetPath)
              onProgress({ percentage: 100, current: stats.size, total: stats.size, speed: 0 })
              return true // File is valid, skip download
            } else {
              console.log(
                `[Download Utils] File ${targetPath} SHA256 mismatch (expected: ${expectedSha256}, got: ${sha256}). Re-downloading.`
              )
              // Remove invalid file and continue with download
              try {
                fs.unlinkSync(targetPath)
                // Also remove cached SHA256 if it exists
                const sha256Path = getSha256Path(targetPath)
                if (fs.existsSync(sha256Path)) {
                  fs.unlinkSync(sha256Path)
                }
              } catch (e) {
                console.warn(`[Download Utils] Failed to remove invalid file:`, e)
              }
            }
          } catch (err) {
            console.warn(`[Download Utils] SHA256 verification failed:`, err)
            // Continue with download if verification fails
          }
        } else {
          // If no expected SHA256 but file exists, check cached SHA256
          const cachedSha256 = readCachedSha256(targetPath)
          if (cachedSha256) {
            console.log(`[Download Utils] File exists with cached SHA256, will verify size only`)
          }
        }
      } else {
        // Check if any part files exist (resume scenario)
        if (!hasPartFiles(targetPath, THREAD_COUNT)) {
          console.log(`[Download Utils] Starting fresh download for ${targetPath}`)
        }
      }
      return false // Need to download
    }

    // Check existing file first
    checkExistingFile().then((shouldSkip) => {
      if (shouldSkip) {
        resolve()
        return
      }

      // Continue with download process

    // 1. Get total file size
    const request = net.request({ method: 'HEAD', url })
    activeDownloadRequests.add(request)

    let headTimeout: NodeJS.Timeout | null = null
    const cleanupRequest = (): void => {
      if (headTimeout) clearTimeout(headTimeout)
      activeDownloadRequests.delete(request)
    }

    headTimeout = setTimeout(() => {
      cleanupRequest()
      reject(new Error('HEAD request timeout after 30s'))
    }, REQUEST_TIMEOUT)

    request.on('response', (response) => {
      cleanupRequest()
      if (response.statusCode !== 200) {
        reject(new Error(`HEAD request failed with status ${response.statusCode}`))
        return
      }

      const lengthHeader = response.headers['content-length']
      const totalSize = parseInt(
        Array.isArray(lengthHeader) ? lengthHeader[0] : (lengthHeader as string) || '0',
        10
      )

      if (!totalSize || totalSize === 0) {
        reject(new Error('Remote file has 0 size or content-length missing'))
        return
      }

      // Double-check if file was completed between initial check and HEAD response
      // This prevents race conditions where file might be created by another process
      if (fs.existsSync(targetPath)) {
        const stats = fs.statSync(targetPath)
        if (stats.size === totalSize) {
          // If expected SHA256 is provided, verify it (edge case: file created between checks)
          if (expectedSha256) {
            verifyFileSha256(targetPath, expectedSha256)
              .then(({ isValid, sha256, fromCache }) => {
                if (isValid) {
                  console.log(
                    `[Download Utils] File ${targetPath} already complete and SHA256 verified${fromCache ? ' (from cache)' : ''}: ${sha256}`
                  )
                  // Clean up any leftover part files
                  cleanupPartFiles(targetPath, THREAD_COUNT)
                  onProgress({ percentage: 100, current: totalSize, total: totalSize, speed: 0 })
                  resolve()
                } else {
                  console.log(
                    `[Download Utils] File ${targetPath} size matches but SHA256 mismatch (expected: ${expectedSha256}, got: ${sha256}). Re-downloading.`
                  )
                  // Remove invalid file
                  try {
                    fs.unlinkSync(targetPath)
                    const sha256Path = getSha256Path(targetPath)
                    if (fs.existsSync(sha256Path)) {
                      fs.unlinkSync(sha256Path)
                    }
                  } catch (e) {
                    console.warn(`[Download Utils] Failed to remove invalid file:`, e)
                  }
                  // Continue with download - don't return here
                }
              })
              .catch((err) => {
                console.warn(`[Download Utils] SHA256 verification failed:`, err)
                // If verification fails, continue with download to be safe
              })
            return // Don't continue until SHA256 verification completes
          } else {
            // No expected SHA256, just check size
            console.log(`[Download Utils] File ${targetPath} already complete (${totalSize} bytes). Skipping download.`)
            
            // Clean up any leftover part files
            cleanupPartFiles(targetPath, THREAD_COUNT)
            
            onProgress({ percentage: 100, current: totalSize, total: totalSize, speed: 0 })
            resolve()
            return
          }
        } else {
          console.log(`[Download Utils] File ${targetPath} exists but size mismatch (local: ${stats.size}, remote: ${totalSize}). Will resume or re-download.`)
          // Don't remove the file here - let the download logic handle it based on part files
          // If part files exist, we'll resume; otherwise, we'll start fresh
        }
      }

      // 2. Prepare Chunks
      const chunkSize = Math.ceil(totalSize / THREAD_COUNT)
      const threadDownloaded: number[] = new Array(THREAD_COUNT).fill(0)
      let activeThreads = 0
      let hasError = false

      // Speed calculation
      let lastEmitTime = Date.now()
      let lastEmitBytes = 0

      const emitProgress = (force = false): void => {
        const currentTotal = threadDownloaded.reduce((a, b) => a + b, 0)
        const now = Date.now()
        const timeDiff = now - lastEmitTime

        if (force || timeDiff >= 500 || currentTotal === totalSize) {
          let speed = 0
          if (timeDiff > 0) {
            const bytesDiff = currentTotal - lastEmitBytes
            speed = (bytesDiff / timeDiff) * 1000
          }

          onProgress({
            percentage: Math.min(100, Math.round((currentTotal / totalSize) * 100)),
            current: currentTotal,
            total: totalSize,
            speed
          })

          lastEmitTime = now
          lastEmitBytes = currentTotal
        }
      }

      const getRetryDelay = (attempt: number): number => {
        return Math.min(1000 * Math.pow(2, attempt - 1), 30000)
      }

      // Function to handle a single thread download
      const downloadThread = (index: number, attempt = 1): void => {
        if (hasError || isQuitting()) return

        const startOriginal = index * chunkSize
        const endOriginal = Math.min((index + 1) * chunkSize - 1, totalSize - 1)
        const partPath = `${targetPath}.part${index}`

        // Check existing part - use atomic file operations to prevent race conditions
        let existingSize = 0
        let partExists = false
        try {
          if (fs.existsSync(partPath)) {
            const partStats = fs.statSync(partPath)
            existingSize = partStats.size
            partExists = true
          }
        } catch (e) {
          console.warn(`[Download Utils] Failed to check part file ${partPath}:`, e)
          existingSize = 0
          partExists = false
        }

        const expectedPartSize = endOriginal - startOriginal + 1
        threadDownloaded[index] = existingSize
        emitProgress()

        // Check if this part is already complete
        if (partExists && existingSize >= expectedPartSize) {
          console.log(`[Download Utils] Thread ${index} already finished (${existingSize}/${expectedPartSize} bytes).`)
          activeThreads--
          checkAllFinished()
          return
        }

        // If part exists but is incomplete, resume from where we left off
        // If part doesn't exist, start from the beginning of the chunk
        const currentStart = startOriginal + existingSize
        console.log(
          `[Download Utils] Thread ${index} (Attempt ${attempt}/${MAX_RETRIES}): Requesting bytes=${currentStart}-${endOriginal}`
        )

        const chunkReq = net.request({ method: 'GET', url })
        activeDownloadRequests.add(chunkReq)
        chunkReq.setHeader('Range', `bytes=${currentStart}-${endOriginal}`)

        let chunkTimeout: NodeJS.Timeout | null = null
        let isTimedOut = false

        const handleRetry = (error: string): void => {
          if (chunkTimeout) clearTimeout(chunkTimeout)
          activeDownloadRequests.delete(chunkReq)
          if (isQuitting()) return

          if (attempt < MAX_RETRIES) {
            const delay = getRetryDelay(attempt)
            console.log(
              `[Download Utils] Thread ${index} failed: ${error}. Retrying in ${delay}ms...`
            )
            setTimeout(() => downloadThread(index, attempt + 1), delay)
          } else {
            hasError = true
            reject(new Error(`Thread ${index} failed after ${MAX_RETRIES} attempts: ${error}`))
          }
        }

        chunkTimeout = setTimeout(() => {
          isTimedOut = true
          chunkReq.abort()
          handleRetry('Timeout')
        }, REQUEST_TIMEOUT)

        chunkReq.on('response', (chunkRes) => {
          if (chunkRes.statusCode !== 200 && chunkRes.statusCode !== 206) {
            handleRetry(`Status ${chunkRes.statusCode}`)
            return
          }

          // Use append mode if part file exists, otherwise create new
          const fileStream = fs.createWriteStream(partPath, { flags: 'a' })

          chunkRes.on('data', (data) => {
            if (isQuitting()) {
              chunkReq.abort()
              fileStream.close()
              return
            }
            if (hasError) {
              fileStream.close()
              return
            }
            try {
              fileStream.write(data)
              threadDownloaded[index] += data.length
              emitProgress()
            } catch (writeErr) {
              console.error(`[Download Utils] Write error in thread ${index}:`, writeErr)
              fileStream.close()
              handleRetry(`Write error: ${writeErr}`)
            }
          })

          chunkRes.on('end', () => {
            if (chunkTimeout) clearTimeout(chunkTimeout)
            activeDownloadRequests.delete(chunkReq)
            fileStream.end(() => {
              console.log(`[Download Utils] Thread ${index} segment finished.`)
              activeThreads--
              checkAllFinished()
            })
          })

          chunkRes.on('error', (err) => {
            fileStream.close()
            if (!isTimedOut) handleRetry(err.message)
          })
        })

        chunkReq.on('error', (err) => {
          if (!isTimedOut && !isQuitting()) handleRetry(err.message)
        })

        chunkReq.end()
      }

      const checkAllFinished = async (): Promise<void> => {
        if (activeThreads === 0 && !hasError) {
          try {
            console.log(`[Download Utils] All threads finished for ${targetPath}. Verifying and merging...`)

            // Verify part files
            const partPaths = verifyPartFiles(targetPath, THREAD_COUNT, chunkSize, totalSize)

            // Check if target file already exists (might have been created by another process)
            if (fs.existsSync(targetPath)) {
              const existingStats = fs.statSync(targetPath)
              if (existingStats.size === totalSize) {
                console.log(`[Download Utils] Target file already exists with correct size, cleaning up part files...`)
                cleanupPartFiles(targetPath, THREAD_COUNT)

                // Verify SHA256 if provided
                if (expectedSha256) {
                  try {
                    const { isValid, sha256 } = await verifyFileSha256(targetPath, expectedSha256)
                    if (isValid) {
                      console.log(`[Download Utils] Existing file SHA256 verified: ${sha256}`)
                      emitProgress(true)
                      resolve()
                      return
                    } else {
                      console.log(`[Download Utils] Existing file SHA256 mismatch, will overwrite`)
                      fs.unlinkSync(targetPath)
                    }
                  } catch (err) {
                    console.warn(`[Download Utils] SHA256 verification failed:`, err)
                    // Continue with merge
                  }
                } else {
                  emitProgress(true)
                  resolve()
                  return
                }
              } else {
                // Remove incomplete target file
                try {
                  fs.unlinkSync(targetPath)
                } catch (e) {
                  console.warn(`[Download Utils] Failed to remove incomplete target file:`, e)
                }
              }
            }

            // Merge part files
            await mergePartFiles(
              targetPath,
              partPaths,
              totalSize,
              expectedSha256,
              onProgress,
              emitProgress,
              resolve,
              reject
            )
          } catch (err) {
            reject(err)
          }
        }
      }

      activeThreads = THREAD_COUNT
      lastEmitBytes = threadDownloaded.reduce((a, b) => a + b, 0)
      for (let i = 0; i < THREAD_COUNT; i++) {
        downloadThread(i)
      }
    })

    request.on('error', (err) => {
      cleanupRequest()
      if (!isQuitting()) reject(err)
    })
    request.end()
    })
  })

  // Store the download promise and clean up when done
  activeDownloads.set(targetPath, downloadPromise)
  
  downloadPromise
    .then(() => {
      activeDownloads.delete(targetPath)
    })
    .catch((err) => {
      activeDownloads.delete(targetPath)
      throw err
    })
  
  return downloadPromise
}
