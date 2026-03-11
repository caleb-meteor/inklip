import type { ForgeConfig } from '@electron-forge/shared-types'
import { MakerDMG } from '@electron-forge/maker-dmg'
import { MakerZIP } from '@electron-forge/maker-zip'
import { MakerAppX, type MakerAppXConfig } from '@electron-forge/maker-appx'
import path from 'path'
import fs from 'fs-extra'

// 动态生成 APPX manifest（默认模板与 SDK 10.0.26100+ 不兼容）
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'))
const appxVersion = `${pkg.version}.0`
const appxManifestDir = path.join(__dirname, 'out', '.appx-manifest')
const appxManifestPath = path.join(appxManifestDir, 'AppxManifest.xml')
fs.ensureDirSync(appxManifestDir)
fs.writeFileSync(
  appxManifestPath,
  `<?xml version="1.0" encoding="utf-8"?>
<Package
  xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
  xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
  xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities">
  <Identity Name="calebMeteor.414460B6D09AC"
    ProcessorArchitecture="x64"
    Publisher="CN=36150C96-6074-4814-8057-59B6580F873A"
    Version="${appxVersion}" />
  <Properties>
    <DisplayName>影氪</DisplayName>
    <PublisherDisplayName>calebMeteor</PublisherDisplayName>
    <Description>智能视频剪辑工具</Description>
    <Logo>assets\\Square50x50.png</Logo>
  </Properties>
  <Resources>
    <Resource Language="zh-CN" />
  </Resources>
  <Dependencies>
    <TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.17763.0" MaxVersionTested="10.0.26100.0" />
  </Dependencies>
  <Capabilities>
    <rescap:Capability Name="runFullTrust"/>
  </Capabilities>
  <Applications>
    <Application Id="Inklip" Executable="app\\inklip.exe" EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements
        BackgroundColor="#464646"
        DisplayName="影氪"
        Square150x150Logo="assets\\Square150x150.png"
        Square44x44Logo="assets\\Square44x44.png"
        Description="智能视频剪辑工具">
        <uap:DefaultTile Wide310x150Logo="assets\\Square310x150.png" />
      </uap:VisualElements>
    </Application>
  </Applications>
</Package>
`,
  'utf-8'
)

const config: ForgeConfig = {
  packagerConfig: {
    name: '影氪',
    executableName: 'inklip',
    asar: true,
    // 不写扩展名：Windows 用 icon.ico（任务栏/窗口），macOS 用 icon.icns
    icon: './resources/icon',
    extraResource: [
      path.join(
        __dirname,
        'resources',
        `${process.platform}-${process.env.TARGET_ARCH || process.arch}`
      ),
      path.join(__dirname, 'resources', 'icon.ico')
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
      /^\/resources\/(?!([a-z0-9]+-[a-z0-9]+|icon\.icns|icon\.ico|icon\.png))/, // Allow platform-arch folders and icons
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
    new MakerDMG({}, ['darwin']),
    new MakerZIP({}, ['win32']),
    new MakerAppX(
      {
        publisher: 'CN=36150C96-6074-4814-8057-59B6580F873A',
        packageDisplayName: '影氪',
        packageDescription: '智能视频剪辑工具',
        packageName: 'Inklip',
        packageExecutable: 'app\\inklip.exe',
        makeVersionWinStoreCompatible: true,
        manifest: appxManifestPath,
        identityName: 'calebMeteor.414460B6D09AC',
        publisherDisplayName: 'calebMeteor',
        // 使用产品图标作为 APPX 瓷砖，满足微软认证 10.1.1.11（瓷砖须唯一代表产品）
        assets: path.join(__dirname, 'resources', 'appx-assets'),
        ...(process.env.APPX_DEV_CERT
          ? { devCert: process.env.APPX_DEV_CERT, certPass: process.env.APPX_CERT_PASS }
          : {})
      } as MakerAppXConfig & {
        identityName: string
        publisherDisplayName: string
      },
      ['win32']
    )
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
