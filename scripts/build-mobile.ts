import { execSync } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'

const args = process.argv.slice(2)
const slug = args.find(a => !a.startsWith('--'))
const platform = args.includes('--android') ? 'android' : 'ios'
const open = args.includes('--open')

if (!slug) {
  console.error('Usage: npx tsx scripts/build-mobile.ts <slug> [--android] [--open]')
  process.exit(1)
}

const gameDir = path.resolve('games', slug)
const distDir = path.join(gameDir, 'dist')
const entry = path.join(gameDir, 'src', 'main.tsx')

if (!fs.existsSync(entry)) {
  console.error(`No game found at ${gameDir}`)
  process.exit(1)
}

const env = { ...process.env, GAME_SLUG: slug }
const run = (cmd: string) => execSync(cmd, { stdio: 'inherit', env, cwd: process.cwd() })

// 1. Build the web bundle
console.log(`\n=== Building ${slug} ===`)
run(`npx tsx scripts/build.ts ${slug}`)

// 2. Patch index.html for mobile: safe areas, viewport-fit, status bar
const htmlPath = path.join(distDir, 'index.html')
let html = fs.readFileSync(htmlPath, 'utf-8')

html = html.replace(
  '<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">',
  '<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no, viewport-fit=cover">'
)

html = html.replace(
  '</head>',
  `  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
</head>`
)

fs.writeFileSync(htmlPath, html)
console.log('Patched index.html for mobile')

// 3. Cap sync
console.log(`\n=== Syncing ${platform} ===`)
run(`npx cap sync ${platform}`)

// 4. Optionally open IDE
if (open) {
  console.log(`\n=== Opening ${platform} ===`)
  run(`npx cap open ${platform}`)
}

console.log(`\nDone! ${platform} project ready.`)
if (!open) {
  console.log(`Run with --open to launch ${platform === 'ios' ? 'Xcode' : 'Android Studio'}`)
}
