import fs from 'fs'
import path from 'path'
import { downloadFile } from './download'

/**
 * 固定的模型文件名
 */
const MODEL_FILE_NAME = 'ggml-silero-v6.2.0.bin'

/**
 * 下载源配置 - 使用 HF Mirror 镜像站点
 * 参考: https://hf-mirror.com/
 * 模型仓库: https://hf-mirror.com/ggml-org/whisper-vad
 * 
 * Shell 脚本中的 URL 构建逻辑：
 * src="https://huggingface.co/ggerganov/whisper.cpp"
 * pfx="resolve/main/ggml"
 * URL = $src/$pfx-"$model".bin
 * 结果: https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-{model}.bin
 */
const DOWNLOAD_SOURCE = {
  src: 'https://hf-mirror.com/ggml-org/whisper-vad',
  pfx: 'resolve/main'
}

/**
 * 将 HuggingFace 浏览 URL 转换为真实下载链接
 * 
 * 浏览 URL 格式: https://hf-mirror.com/ggml-org/whisper-vad/tree/main/ggml-silero-v6.2.0.bin
 * 下载 URL 格式: https://hf-mirror.com/ggml-org/whisper-vad/resolve/main/ggml-silero-v6.2.0.bin
 * 
 * 关键转换：将 /tree/ 替换为 /resolve/
 * 
 * @param browseUrl HuggingFace 浏览页面的 URL
 * @returns 真实的下载链接
 */
export function convertToDownloadUrl(browseUrl: string): string {
  return browseUrl.replace(/\/tree\//, '/resolve/')
}

/**
 * 按照 shell 脚本的方式构建下载 URL
 * 
 * Shell 脚本逻辑：
 * 1. 定义源仓库: src="https://huggingface.co/ggerganov/whisper.cpp"
 * 2. 定义路径前缀: pfx="resolve/main/ggml"
 * 3. 构建 URL: $src/$pfx-"$model".bin
 * 
 * @param repoUrl 仓库 URL (例如: https://hf-mirror.com/ggerganov/whisper.cpp)
 * @param branch 分支名称 (例如: main)
 * @param fileName 文件名 (例如: ggml-large-v3-turbo-q5_0.bin)
 * @returns 完整的下载 URL
 */
export function buildDownloadUrlFromRepo(
  repoUrl: string,
  branch: string = 'main',
  fileName: string
): string {
  // 按照 shell 脚本的逻辑：src/pfx-filename
  // pfx = resolve/{branch}/ggml (对于 whisper.cpp)
  // 但对于其他仓库，可能直接是 resolve/{branch}
  return `${repoUrl}/resolve/${branch}/${fileName}`
}

/**
 * 构建下载 URL
 * 使用 HF Mirror 镜像站点加速下载
 * URL 格式: https://hf-mirror.com/ggml-org/whisper-vad/resolve/main/ggml-silero-v6.2.0.bin
 * 
 * 参照 shell 脚本的构建方式：
 * src = "https://hf-mirror.com/ggml-org/whisper-vad"
 * pfx = "resolve/main"
 * URL = src/pfx/filename
 */
function buildDownloadUrl(): string {
  return `${DOWNLOAD_SOURCE.src}/${DOWNLOAD_SOURCE.pfx}/${MODEL_FILE_NAME}`
}

/**
 * 格式化字节数为可读格式
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

/**
 * 下载模型的选项
 */
export interface DownloadModelOptions {
  /** 下载目录路径（可选，默认使用当前目录） */
  modelsPath?: string
  /** 进度回调函数 */
  onProgress?: (progress: {
    percentage: number
    current: number
    total: number
    speed: number
  }) => void
  /** 应用是否正在退出（用于取消下载） */
  isQuitting?: () => boolean
  /** 预期的 SHA256 校验和（可选） */
  expectedSha256?: string
}

/**
 * 下载模型 (ggml-silero-v6.2.0.bin)
 * 使用 HF Mirror 镜像站点进行下载，提升国内下载速度
 * 
 * 下载逻辑参照 download.ts：
 * - 检查文件是否已存在，存在则跳过
 * - 使用 Electron net 模块进行下载（支持多线程断点续传）
 * - 支持进度回调和 SHA256 校验
 * - 自动处理并发下载和重试机制
 * 
 * @param options 下载选项
 * @returns 下载的文件路径
 * @throws 如果下载失败
 */
export async function downloadModel(
  options: DownloadModelOptions = {}
): Promise<string> {
  const { modelsPath, onProgress, isQuitting, expectedSha256 } = options

  // 确定下载目录
  const downloadDir = modelsPath || process.cwd()
  
  // 确保目录存在
  if (!fs.existsSync(downloadDir)) {
    fs.mkdirSync(downloadDir, { recursive: true })
  }

  // 构建文件路径
  const targetPath = path.join(downloadDir, MODEL_FILE_NAME)

  // 检查文件是否已存在
  if (fs.existsSync(targetPath)) {
    console.log(`[Model Downloader] Model ${MODEL_FILE_NAME} already exists at ${targetPath}. Skipping download.`)
    return targetPath
  }

  // 构建下载 URL（使用 HF Mirror 镜像）
  const downloadUrl = buildDownloadUrl()
  console.log(`[Model Downloader] Downloading model ${MODEL_FILE_NAME} from '${downloadUrl}' ...`)

  // 默认进度回调
  const defaultProgress = onProgress || ((progress) => {
    console.log(
      `[Model Downloader] Progress: ${progress.percentage.toFixed(1)}% ` +
      `(${formatBytes(progress.current)}/${formatBytes(progress.total)}) ` +
      `Speed: ${formatBytes(progress.speed)}/s`
    )
  })

  // 默认退出检查
  const defaultIsQuitting = isQuitting || (() => false)

  try {
    // 使用现有的 downloadFile 函数进行下载
    // downloadFile 内部使用 Electron net 模块，支持多线程断点续传
    // 参照 download.ts 的下载逻辑，自动处理并发、重试、SHA256 校验等
    await downloadFile(
      downloadUrl,
      targetPath,
      defaultProgress,
      defaultIsQuitting,
      expectedSha256
    )

    console.log(`[Model Downloader] Done! Model '${MODEL_FILE_NAME}' saved in '${targetPath}'`)
    return targetPath
  } catch (error) {
    console.error(`[Model Downloader] Failed to download model ${MODEL_FILE_NAME}:`, error)
    throw new Error(
      `Failed to download model ${MODEL_FILE_NAME}. ` +
      `Please try again later or download the model files manually.`
    )
  }
}

/**
 * 兼容旧接口，重定向到新的 downloadModel 函数
 * @deprecated 使用 downloadModel 代替
 */
export async function downloadWhisperModel(
  options: DownloadModelOptions = {}
): Promise<string> {
  return downloadModel(options)
}

/**
 * 获取模型文件的完整路径（不下载）
 */
export function getModelPath(modelsPath?: string): string {
  const downloadDir = modelsPath || process.cwd()
  return path.join(downloadDir, MODEL_FILE_NAME)
}

/**
 * 检查模型文件是否存在
 */
export function modelExists(modelsPath?: string): boolean {
  const modelPath = getModelPath(modelsPath)
  return fs.existsSync(modelPath)
}

/**
 * 获取模型文件名
 */
export function getModelFileName(): string {
  return MODEL_FILE_NAME
}
