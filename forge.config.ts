import type { ForgeConfig } from '@electron-forge/shared-types'
import { MakerZIP } from '@electron-forge/maker-zip'
import path from 'path'

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
    ]
  },
  rebuildConfig: {},
  makers: [new MakerZIP({}, ['darwin', 'win32'])]
}

export default config
