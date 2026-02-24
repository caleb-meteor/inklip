#!/usr/bin/env node
/**
 * 版本更新与打 Tag 脚本
 * 用法: pnpm run release [patch|minor|major]
 * 默认: patch (最小版本更新)
 * - patch: 0.0.45 -> 0.0.46
 * - minor: 0.0.45 -> 0.1.0
 * - major: 0.0.45 -> 1.0.0
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const packagePath = path.join(__dirname, '../package.json')
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf-8'))

const args = process.argv.slice(2)
const noCommit = args.includes('--no-commit')
const type = (args.find(a => !a.startsWith('--')) || 'patch').toLowerCase()
const validTypes = ['patch', 'minor', 'major']
if (!validTypes.includes(type)) {
  console.error(`无效的版本类型: ${type}`)
  console.error(`用法: pnpm run release [patch|minor|major]`)
  process.exit(1)
}

function bumpVersion(version, type) {
  const [major = 0, minor = 0, patch = 0] = version.split('.').map(Number)
  switch (type) {
    case 'major':
      return `${major + 1}.0.0`
    case 'minor':
      return `${major}.${minor + 1}.0`
    case 'patch':
    default:
      return `${major}.${minor}.${patch + 1}`
  }
}

const oldVersion = pkg.version
const newVersion = bumpVersion(oldVersion, type)

pkg.version = newVersion
fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n')

console.log(`版本已更新: ${oldVersion} -> ${newVersion}`)

if (noCommit) {
  console.log('\n✅ 仅更新了 package.json (--no-commit)')
  process.exit(0)
}

try {
  execSync(`git add package.json`, { stdio: 'inherit' })
  execSync(`git commit -m "chore: release v${newVersion}"`, { stdio: 'inherit' })
  execSync(`git tag v${newVersion}`, { stdio: 'inherit' })
  execSync(`git push`, { stdio: 'inherit' })
  execSync(`git push origin v${newVersion}`, { stdio: 'inherit' })
  console.log(`\n✅ 已完成:`)
  console.log(`   - package.json 已更新并提交`)
  console.log(`   - 已创建 tag: v${newVersion}`)
  console.log(`   - 已推送到远程`)
} catch (e) {
  console.error('\n⚠️  Git 操作失败，可能工作区有未提交的更改')
  console.error('   版本已更新，请手动执行:')
  console.error(`   git add package.json`)
  console.error(`   git commit -m "chore: release v${newVersion}"`)
  console.error(`   git tag v${newVersion}`)
  console.error(`   git push && git push origin v${newVersion}`)
  process.exit(1)
}
