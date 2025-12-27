import { net } from 'electron'
import fs from 'fs'

export const activeDownloadRequests = new Set<Electron.ClientRequest>()

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
 */
export function downloadFile(
  url: string,
  targetPath: string,
  onProgress: (progress: {
    percentage: number
    current: number
    total: number
    speed: number
  }) => void,
  isQuitting: () => boolean
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (isQuitting()) {
      reject(new Error('App is quitting'))
      return
    }

    const MAX_RETRIES = 10
    const REQUEST_TIMEOUT = 30000
    const THREAD_COUNT = 2

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

      // Check if file is already complete
      if (fs.existsSync(targetPath)) {
        const stats = fs.statSync(targetPath)
        if (stats.size === totalSize) {
          console.log(`[Download Utils] File ${targetPath} already complete.`)
          onProgress({ percentage: 100, current: totalSize, total: totalSize, speed: 0 })
          resolve()
          return
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
            finalStream.end(() => {
              console.log(`[Download Utils] ${targetPath} complete.`)
              emitProgress(true)
              resolve()
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
