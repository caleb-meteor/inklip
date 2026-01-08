import { net } from 'electron'
import fs from 'fs'
import { createHash } from 'crypto'

export const activeDownloadRequests = new Set<Electron.ClientRequest>()

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
}

/**
 * Multi-threaded resumable download helper.
 * Uses persistent .part files to resume across app restarts.
 * Supports SHA256 verification with caching to avoid repeated calculations.
 */
export async function downloadFile(
  url: string,
  targetPath: string,
  onProgress: (progress: {
    percentage: number
    current: number
    total: number
    speed: number
  }) => void,
  isQuitting: () => boolean,
  expectedSha256?: string
): Promise<void> {
  if (isQuitting()) {
    throw new Error('App is quitting')
  }

  const MAX_RETRIES = 10
  const REQUEST_TIMEOUT = 30000
  const THREAD_COUNT = 2

  // 0. Check if file already exists and verify SHA256 if available
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
          for (let i = 0; i < THREAD_COUNT; i++) {
            const partPath = `${targetPath}.part${i}`
            if (fs.existsSync(partPath)) {
              try {
                fs.unlinkSync(partPath)
              } catch (e) {
                // Ignore cleanup errors
              }
            }
          }
          const stats = fs.statSync(targetPath)
          onProgress({ percentage: 100, current: stats.size, total: stats.size, speed: 0 })
          return // File is valid, skip download
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
    let hasPartFiles = false
    for (let i = 0; i < THREAD_COUNT; i++) {
      if (fs.existsSync(`${targetPath}.part${i}`)) {
        hasPartFiles = true
        break
      }
    }
    if (!hasPartFiles) {
      console.log(`[Download Utils] Starting fresh download for ${targetPath}`)
    }
  }

  // Continue with download process
  return new Promise((resolve, reject) => {

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

      // Check if file is already complete (size match)
      // Note: If file exists and expectedSha256 is provided, it should have been verified
      // at the start of the function. This check is mainly for files without expectedSha256
      // or edge cases where file was created between start check and HEAD response.
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
                  for (let i = 0; i < THREAD_COUNT; i++) {
                    const partPath = `${targetPath}.part${i}`
                    if (fs.existsSync(partPath)) {
                      try {
                        fs.unlinkSync(partPath)
                      } catch (e) {
                        // Ignore cleanup errors
                      }
                    }
                  }
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
                  // Continue with download
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
            for (let i = 0; i < THREAD_COUNT; i++) {
              const partPath = `${targetPath}.part${i}`
              if (fs.existsSync(partPath)) {
                try {
                  fs.unlinkSync(partPath)
                  console.log(`[Download Utils] Cleaned up leftover part file: ${partPath}`)
                } catch (e) {
                  console.warn(`[Download Utils] Failed to clean up part file ${partPath}:`, e)
                }
              }
            }
            
            onProgress({ percentage: 100, current: totalSize, total: totalSize, speed: 0 })
            resolve()
            return
          }
        } else {
          console.log(`[Download Utils] File ${targetPath} exists but size mismatch (local: ${stats.size}, remote: ${totalSize}). Re-downloading.`)
          // Remove incomplete file to start fresh
          try {
            fs.unlinkSync(targetPath)
            // Also remove cached SHA256 if it exists
            const sha256Path = getSha256Path(targetPath)
            if (fs.existsSync(sha256Path)) {
              fs.unlinkSync(sha256Path)
            }
          } catch (e) {
            console.warn(`[Download Utils] Failed to remove incomplete file:`, e)
          }
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

        // Check existing part
        let existingSize = 0
        if (fs.existsSync(partPath)) {
          existingSize = fs.statSync(partPath).size
        }

        threadDownloaded[index] = existingSize
        emitProgress()

        if (existingSize >= endOriginal - startOriginal + 1) {
          console.log(`[Download Utils] Thread ${index} already finished.`)
          activeThreads--
          checkAllFinished()
          return
        }

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

          const fileStream = fs.createWriteStream(partPath, { flags: 'a' })

          chunkRes.on('data', (data) => {
            if (isQuitting()) {
              chunkReq.abort()
              fileStream.close()
              return
            }
            fileStream.write(data)
            threadDownloaded[index] += data.length
            emitProgress()
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
            console.log(`[Download Utils] All threads finished for ${targetPath}. Merging...`)

            // Final verification of sizes
            for (let i = 0; i < THREAD_COUNT; i++) {
              const partPath = `${targetPath}.part${i}`
              const start = i * chunkSize
              const end = Math.min((i + 1) * chunkSize - 1, totalSize - 1)
              const expectedSize = end - start + 1
              if (!fs.existsSync(partPath) || fs.statSync(partPath).size !== expectedSize) {
                throw new Error(`Part ${i} size mismatch or missing`)
              }
            }

            // Merge part files
            const finalStream = fs.createWriteStream(targetPath)
            for (let i = 0; i < THREAD_COUNT; i++) {
              const partPath = `${targetPath}.part${i}`
              const data = fs.readFileSync(partPath)
              finalStream.write(data)
              fs.unlinkSync(partPath)
            }
            finalStream.end(async () => {
              console.log(`[Download Utils] ${targetPath} complete.`)
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
                      new Error(
                        `SHA256 mismatch: expected ${expectedSha256}, got ${sha256}`
                      )
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
}
