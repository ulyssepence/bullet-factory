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
const SKIP_PATHS = new Set(['src/level', 'src/systems'])

function copyDir(src: string, dest: string, relPath: string = '') {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue
    const childRel = relPath ? `${relPath}/${entry.name}` : entry.name
    if (SKIP_PATHS.has(childRel)) continue
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath, childRel)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

copyDir(templateDir, gameDir)
fs.mkdirSync(path.join(gameDir, 'docs'), { recursive: true })

console.log(`Created game "${slug}" at ${gameDir}`)

const sopPath = path.join(gameDir, 'SOP.md')

if (prompt) {
  const sop = fs.readFileSync(sopPath, 'utf-8')
  fs.writeFileSync(sopPath, sop.replace('> Prompt:', `> Prompt: ${prompt}`))
}

const orchestrator = path.join(process.env.HOME!, 'Source/pinocchio/src/markdown/skills/sop/orchestrator.py')

console.log(`Running SOP orchestrator on ${sopPath}...`)
execSync(`uv run ${orchestrator} ${sopPath} --allow-permissions`, { stdio: 'inherit' })
