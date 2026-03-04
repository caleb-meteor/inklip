import path from 'path'
import { execSync } from 'child_process'

/**
 * 检测路径是否包含非 ASCII 字符（如中文）
 */
export function hasNonAscii(p: string): boolean {
  return /[^\x00-\x7F]/.test(p)
}

/**
 * Windows 下将路径转为 8.3 短路径，避免中文路径导致文件读写、spawn 等异常。
 * 支持文件和目录；路径不存在时对父目录取短路径再拼接 basename。
 */
export function getShortPathWin(longPath: string): string {
  if (process.platform !== 'win32') return longPath
  if (!longPath || !longPath.trim()) return longPath
  const normalized = path.normalize(longPath)
  try {
    const escaped = normalized.replace(/'/g, "''")
    const script =
      `$fso=New-Object -ComObject Scripting.FileSystemObject;$p='${escaped}';` +
      `if(Test-Path -LiteralPath $p -PathType Leaf){$fso.GetFile($p).ShortPath}` +
      `elseif(Test-Path -LiteralPath $p -PathType Container){$fso.GetFolder($p).ShortPath}` +
      `else{$dir=Split-Path -Parent $p;$name=Split-Path -Leaf $p;if($dir -and (Test-Path -LiteralPath $dir -PathType Container)){Join-Path ($fso.GetFolder($dir).ShortPath) $name}else{$p}}`
    const result = execSync(`powershell -NoProfile -NonInteractive -Command "${script.replace(/"/g, '\\"')}"`, {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 5000
    })
    const short = result.trim()
    return short || normalized
  } catch {
    return normalized
  }
}

/**
 * 在 Windows 且路径含非 ASCII 时返回短路径，否则返回原路径。
 */
export function toShortPathIfNeeded(fileOrDirPath: string): string {
  if (process.platform !== 'win32') return fileOrDirPath
  if (!hasNonAscii(fileOrDirPath)) return fileOrDirPath
  return getShortPathWin(fileOrDirPath)
}
