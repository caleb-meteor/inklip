import type { ForgeConfig } from '@electron-forge/shared-types'
import { MakerZIP } from '@electron-forge/maker-zip'
import { MakerSquirrel } from '@electron-forge/maker-squirrel'
import path from 'path'
import fs from 'fs-extra'

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
    ...(process.platform === 'darwin'
      ? {
          // macOS 本地化设置，确保系统对话框显示中文
          extendInfo: {
            CFBundleLocalizations: ['zh_CN', 'zh-Hans'],
            CFBundleDevelopmentRegion: 'zh_CN'
          }
        }
      : {}),
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
    ]
  },
  rebuildConfig: {},
  makers: [
    new MakerZIP({}, ['darwin', 'win32']),
    new MakerSquirrel({
      // name: 'Inklip', // Squirrel defaults to packagerConfig.name
      setupIcon: './resources/icon.ico',
      exe: 'inklip.exe'
    })
  ],
  hooks: {
    postPackage: async (forgeConfig, options) => {
      console.log('开始清理语言包文件...')

      for (const outputPath of options.outputPaths) {
        let resourcesPath: string

        // 根据不同平台确定资源文件夹的位置
        if (options.platform === 'darwin') {
          // macOS: .lproj 文件夹在 Contents/Resources 下
          resourcesPath = path.join(outputPath, '影氪.app', 'Contents', 'Resources')
        } else if (options.platform === 'win32') {
          // Windows: locales 文件夹在应用根目录
          resourcesPath = outputPath
        } else {
          // Linux
          resourcesPath = outputPath
        }

        console.log(`检查路径: ${resourcesPath}`)

        if (options.platform === 'darwin') {
          // macOS: 删除 .lproj 文件夹
          if (await fs.pathExists(resourcesPath)) {
            const files = await fs.readdir(resourcesPath)
            let removedCount = 0

            for (const file of files) {
              // 只保留简体中文 (zh_CN.lproj)
              if (file.endsWith('.lproj') && file !== 'zh_CN.lproj') {
                const filePath = path.join(resourcesPath, file)
                await fs.remove(filePath)
                console.log(`  ✓ 已删除: ${file}`)
                removedCount++
              }
            }

            console.log(`✓ 清理完成! 共删除 ${removedCount} 个语言包文件夹`)
            console.log(`✓ 保留: zh_CN.lproj`)
          }
        } else {
          // Windows/Linux: 删除 .pak 文件
          const localesPath = path.join(resourcesPath, 'locales')

          if (await fs.pathExists(localesPath)) {
            const files = await fs.readdir(localesPath)
            let removedCount = 0

            for (const file of files) {
              // 只保留简体中文
              if (file !== 'zh-CN.pak') {
                const filePath = path.join(localesPath, file)
                await fs.remove(filePath)
                console.log(`  ✓ 已删除: ${file}`)
                removedCount++
              }
            }

            console.log(`✓ 清理完成! 共删除 ${removedCount} 个语言包文件`)
            console.log(`✓ 保留: zh-CN.pak`)
          } else {
            console.log(`⚠ 未找到 locales 文件夹: ${localesPath}`)
          }
        }
      }

      console.log('语言包清理流程结束\n')
    }
  }
}

export default config
