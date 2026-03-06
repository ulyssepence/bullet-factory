import * as fs from 'fs'
import * as path from 'path'
import { execSync, spawn } from 'child_process'

const files = process.argv.slice(2).filter(a => !a.startsWith('--'))

if (files.length === 0) {
  console.error('Usage: npx tsx scripts/view-mesh.ts <file.glb> [file2.glb ...]')
  console.error('')
  console.error('Pass any GLB — rigged, unrigged, or animation clip.')
  console.error('Siblings (*-rigged, *-walk, *-run) are auto-discovered.')
  process.exit(1)
}

interface ModelGroup {
  name: string
  base?: string
  rigged?: string
  walk?: string
  run?: string
  zones?: object
}

const modelsDir = path.resolve('tools/mesh-generation/static/models')
fs.mkdirSync(modelsDir, { recursive: true })
for (const existing of fs.readdirSync(modelsDir)) {
  fs.rmSync(path.join(modelsDir, existing), { force: true })
}

const copied = new Set<string>()
function copyFile(abs: string) {
  const name = path.basename(abs)
  if (copied.has(name)) return name
  fs.writeFileSync(path.join(modelsDir, name), fs.readFileSync(abs))
  copied.add(name)
  return name
}

function tryDiscover(dir: string, base: string, suffix: string): string | undefined {
  const p = path.join(dir, `${base}${suffix}.glb`)
  return fs.existsSync(p) ? p : undefined
}

const groups: ModelGroup[] = []
const seen = new Set<string>()

for (const file of files) {
  const abs = path.resolve(file)
  if (!fs.existsSync(abs)) {
    console.error(`File not found: ${file}`)
    process.exit(1)
  }

  const dir = path.dirname(abs)
  const filename = path.basename(abs, '.glb')
  const baseName = filename.replace(/-(rigged|walk|run)$/, '')

  if (seen.has(baseName)) continue
  seen.add(baseName)

  const group: ModelGroup = { name: baseName }

  const baseFile = tryDiscover(dir, baseName, '')
  const riggedFile = tryDiscover(dir, baseName, '-rigged')
  const walkFile = tryDiscover(dir, baseName, '-walk')
  const runFile = tryDiscover(dir, baseName, '-run')

  if (baseFile) group.base = copyFile(baseFile)
  if (riggedFile) group.rigged = copyFile(riggedFile)
  if (walkFile) group.walk = copyFile(walkFile)
  if (runFile) group.run = copyFile(runFile)

  if (!group.base && !group.rigged) {
    group.base = copyFile(abs)
  }

  let zoneConfig: object | undefined
  let searchDir = dir
  const projectRoot = path.resolve('.')
  while (searchDir.length >= projectRoot.length) {
    const zonesDir = path.join(searchDir, 'material-zones')
    if (fs.existsSync(zonesDir)) {
      const zoneFile = path.join(zonesDir, `${baseName}.json`)
      if (fs.existsSync(zoneFile)) {
        zoneConfig = JSON.parse(fs.readFileSync(zoneFile, 'utf-8'))
        console.log(`  Found zone config: ${baseName}.json`)
      }
      break
    }
    const parent = path.dirname(searchDir)
    if (parent === searchDir) break
    searchDir = parent
  }
  if (zoneConfig) group.zones = zoneConfig

  console.log(`  ${baseName}: ${[group.base && 'base', group.rigged && 'rigged', group.walk && 'walk', group.run && 'run'].filter(Boolean).join(', ')}`)
  groups.push(group)
}

fs.writeFileSync(path.join(modelsDir, 'manifest.json'), JSON.stringify(groups, null, 2))

const port = parseInt(execSync(path.join(process.env.HOME!, 'bin/get-free-port')).toString().trim())
console.log(`\nViewer: http://localhost:${port}`)

const child = spawn('npx', ['tsx', 'scripts/build.ts', 'mesh-generation', '--watch', '--serve', `--port=${port}`], {
  stdio: 'inherit',
  cwd: path.resolve('.'),
})

child.on('exit', code => process.exit(code ?? 0))
process.on('SIGINT', () => child.kill('SIGINT'))
