import type { Platform } from 'node:os'

/** 与给定 Chromium 版本、平台对齐的桌面 Chrome User-Agent（不含 Electron 字样） */
export function buildChromeLikeUserAgent(chromeVersion: string, platform: Platform): string {
  const chrome = chromeVersion || '132.0.0.0'
  let platformPart: string
  if (platform === 'win32') {
    platformPart = 'Windows NT 10.0; Win64; x64'
  } else if (platform === 'darwin') {
    platformPart = 'Macintosh; Intel Mac OS X 10_15_7'
  } else {
    platformPart = 'X11; Linux x86_64'
  }
  return `Mozilla/5.0 (${platformPart}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome} Safari/537.36`
}
