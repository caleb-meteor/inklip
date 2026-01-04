import type { ForgeConfig } from '@electron-forge/shared-types'
import { MakerZIP } from '@electron-forge/maker-zip'
import path from 'path'
import fs from 'fs'

const config: ForgeConfig = {
  packagerConfig: {
    name: '影氪',
    executableName: 'inklip',
    asar: true,
    icon: './resources/icon.icns',
    extraResource: [
      path.join(
        __dirname,
        'resources',
        `${process.platform}-${process.env.TARGET_ARCH || process.arch}`
      )
    ],
    ignore: [
      /^\/src/,
      /^\/resources\/(?!([a-z0-9]+-[a-z0-9]+|icon\.icns|icon\.png))/, // Allow platform-arch folders and icons
      /^\/assets/,
      /^\/build/,
      /^\/website/,
      /^\/\.vscode/,
      /^\/\.github/,
      /^\/\.git/,
      /^\/out/,
      /(.eslintrc.json)|(.gitignore)|(electron.vite.config.ts)|(forge.config.ts)|(tsconfig.*)/
    ],
    // 只保留简体中文语言包（zh-CN）
    afterCopy: [
      async (buildPath, electronVersion, platform, arch) => {
        const localesPath = path.join(buildPath, 'locales')
        const resourcesLocalesPath = path.join(buildPath, 'Resources', 'locales')
        
        // 处理 Windows/Linux 的 locales 目录
        if (fs.existsSync(localesPath)) {
          try {
            const files = fs.readdirSync(localesPath)
            for (const file of files) {
              // 只保留简体中文语言包 (zh-CN.pak)，删除其他所有语言包包括繁体中文
              if (!file.startsWith('zh-CN')) {
                const filePath = path.join(localesPath, file)
                if (fs.statSync(filePath).isFile()) {
                  fs.unlinkSync(filePath)
                  console.log(`[Forge] Removed locale file: ${file}`)
                }
              }
            }
          } catch (error) {
            console.warn(`[Forge] Error processing locales directory:`, error)
          }
        }
        
        // 处理 macOS 的 Resources/locales 目录
        if (fs.existsSync(resourcesLocalesPath)) {
          try {
            const files = fs.readdirSync(resourcesLocalesPath)
            for (const file of files) {
              // 只保留简体中文语言包 (zh-CN.lproj)，删除其他所有语言包包括繁体中文
              if (!file.startsWith('zh-CN')) {
                const itemPath = path.join(resourcesLocalesPath, file)
                const stats = fs.statSync(itemPath)
                if (stats.isDirectory()) {
                  fs.rmSync(itemPath, { recursive: true, force: true })
                  console.log(`[Forge] Removed locale directory: ${file}`)
                } else if (stats.isFile()) {
                  fs.unlinkSync(itemPath)
                  console.log(`[Forge] Removed locale file: ${file}`)
                }
              }
            }
          } catch (error) {
            console.warn(`[Forge] Error processing Resources/locales directory:`, error)
          }
        }
      }
    ]
  },
  rebuildConfig: {},
  makers: [new MakerZIP({}, ['darwin', 'win32'])]
}

export default config
