import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'

const slug = process.argv[2]
const prompt = process.argv.slice(3).join(' ')

if (!slug) {
  console.error('Usage: npm run new <slug> [game prompt...]')
  console.error('Example: npm run new ocean-depths underwater survival with bioluminescent creatures')
  process.exit(1)
}

const templateDir = path.resolve('template')
const gameDir = path.resolve('games', slug)

if (fs.existsSync(gameDir)) {
  console.error(`Game "${slug}" already exists at ${gameDir}`)
  process.exit(1)
}

const SKIP = new Set(['node_modules', 'dist', '.DS_Store'])

function copyDir(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

copyDir(templateDir, gameDir)
fs.mkdirSync(path.join(gameDir, 'docs'), { recursive: true })

console.log(`Created game "${slug}" at ${gameDir}`)

const sopPath = path.join(gameDir, 'SOP.md')
const claudePrompt = [
  `New game: "${slug}". The game has already been scaffolded at ${gameDir} — do NOT run npm run new or create any files that already exist.`,
  prompt ? `User's prompt: "${prompt}"` : '',
  '',
  `Work through ${sopPath} top to bottom.`,
  'Read the SOP now and work through it autonomously.',
  'For each phase (pre-production, graybox), complete ALL steps without stopping for user input.',
  'Only pause at the "User review" gates — present the complete work and wait for approval before continuing to the next phase.',
].filter(Boolean).join(' ')

const tmpFile = `/tmp/game-factory-${slug}-${Date.now()}.txt`
fs.writeFileSync(tmpFile, claudePrompt)

try {
  execSync('which claude', { stdio: 'ignore' })
} catch {
  console.error('Error: `claude` CLI not found on PATH. Install it: https://docs.anthropic.com/en/docs/claude-code')
  process.exit(1)
}

console.log(`Starting Claude session...`)
execSync(`claude "$(cat ${tmpFile})"`, { stdio: 'inherit' })
