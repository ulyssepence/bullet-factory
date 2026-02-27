#!/usr/bin/env node
import { chromium } from 'playwright'
import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const args = process.argv.slice(2)
const slug = args[0]
const modelName = args[1]

if (!slug || !modelName) {
  console.error('Usage: npx tsx scripts/preview-material-zones.ts <slug> <model-name>')
  console.error('')
  console.error('  Renders debug screenshots showing material zone boundaries on a 3D model.')
  console.error('  Reads zone config from: games/<slug>/material-zones/<model-name>.json')
  console.error('  Model must exist at:    games/<slug>/static/models/<model-name>.glb')
  console.error('  Screenshots saved to:   games/<slug>/material-previews/<model-name>-<angle>.png')
  process.exit(1)
}

const projectRoot = path.resolve(__dirname, '..')
const gameDir = path.join(projectRoot, 'games', slug)
const zonesPath = path.join(gameDir, 'material-zones', `${modelName}.json`)
const modelDir = path.join(gameDir, 'static', 'models')
const riggedFile = path.join(modelDir, `${modelName}-rigged.glb`)
const plainFile = path.join(modelDir, `${modelName}.glb`)
const useRigged = fs.existsSync(riggedFile)
const modelFile = useRigged ? riggedFile : plainFile
const modelGlbName = useRigged ? `${modelName}-rigged.glb` : `${modelName}.glb`
const outputDir = path.join(gameDir, 'material-previews')
const previewHtml = path.join(__dirname, 'material-preview.html')

if (!fs.existsSync(zonesPath)) {
  console.error(`Zone config not found: ${zonesPath}`)
  process.exit(1)
}
if (!fs.existsSync(modelFile)) {
  console.error(`Model not found: ${modelFile}`)
  process.exit(1)
}

const zoneConfig = JSON.parse(fs.readFileSync(zonesPath, 'utf-8'))
fs.mkdirSync(outputDir, { recursive: true })

// Read game context: spec.ts palette/title, mesh-manifest.json role/prompt
let gameTitle = ''
let palette: Record<string, string> = {}
const specPath = path.join(gameDir, 'src', 'spec.ts')
if (fs.existsSync(specPath)) {
  const specSrc = fs.readFileSync(specPath, 'utf-8')
  const titleMatch = specSrc.match(/title\s*:\s*['"`]([^'"`]+)['"`]/)
  if (titleMatch) gameTitle = titleMatch[1]
  const paletteBlock = specSrc.match(/palette\s*:\s*\{([^}]+)\}/)
  if (paletteBlock) {
    for (const m of paletteBlock[1].matchAll(/(\w+)\s*:\s*['"`](#[0-9a-fA-F]{6})['"`]/g)) {
      palette[m[1]] = m[2]
    }
  }
}

let modelRole = ''
let modelPrompt = ''
const manifestPath = path.join(gameDir, 'mesh-manifest.json')
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
  const allEntries = [...(manifest.characters || []), ...(manifest.props || [])]
  const entry = allEntries.find((e: { name: string }) => e.name === modelName)
  if (entry) {
    modelRole = entry.role || ''
    modelPrompt = entry.prompt || ''
  }
}

const mimeTypes: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.png': 'image/png',
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url!, `http://localhost`)

  if (url.pathname === '/' || url.pathname === '/preview') {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(fs.readFileSync(previewHtml))
    return
  }

  if (url.pathname.startsWith('/models/')) {
    const filePath = path.join(modelDir, url.pathname.slice(8))
    if (fs.existsSync(filePath)) {
      const ext = path.extname(filePath)
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' })
      res.end(fs.readFileSync(filePath))
      return
    }
  }

  res.writeHead(404)
  res.end('Not found')
})

const port = 9876 + Math.floor(Math.random() * 100)
await new Promise<void>((resolve) => server.listen(port, resolve))

if (gameTitle) console.log(`Game:    ${gameTitle}`)
if (Object.keys(palette).length) {
  const paletteStr = Object.entries(palette).map(([k, v]) => `${k}=${v}`).join(' ')
  console.log(`Palette: ${paletteStr}`)
}
console.log(`Model:   ${modelName}${useRigged ? ' (rigged)' : ''}`)
if (modelRole) console.log(`Role:    ${modelRole}`)
if (modelPrompt) console.log(`Prompt:  ${modelPrompt}`)
console.log(`Zones:   ${zoneConfig.zones?.length || 0} defined`)
const zoneNames = (zoneConfig.zones || []).map((z: { name: string; debugColor: string }) => `  ${z.debugColor} = ${z.name}`)
if (zoneNames.length) console.log('Legend:\n' + zoneNames.join('\n'))
console.log()

const angles = [
  { name: 'front', angle: 0, elevation: 15 },
  { name: 'three-quarter', angle: 30, elevation: 25 },
  { name: 'right', angle: 90, elevation: 15 },
  { name: 'back', angle: 180, elevation: 15 },
  { name: 'left', angle: 270, elevation: 15 },
  { name: 'top', angle: 0, elevation: 85 },
]

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 512, height: 512 } })

const seenLogs = new Set<string>()
page.on('console', (msg) => {
  const text = msg.text()
  if (text.startsWith('[bone-zones]') && !seenLogs.has(text)) {
    seenLogs.add(text)
    console.log(text)
  }
})

const modelUrlPath = `/models/${modelGlbName}`
const zonesEncoded = encodeURIComponent(JSON.stringify(zoneConfig))
const paletteEncoded = encodeURIComponent(JSON.stringify(palette))
const contextParams = `&palette=${paletteEncoded}&meshName=${encodeURIComponent(modelName)}&meshRole=${encodeURIComponent(modelRole)}`
const savedPaths: string[] = []

for (const view of angles) {
  const url = `http://localhost:${port}/preview?model=${modelUrlPath}&zones=${zonesEncoded}&angle=${view.angle}&elevation=${view.elevation}&size=512${contextParams}`
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForSelector('[data-ready]', { timeout: 30000 })

  const ready = await page.getAttribute('body', 'data-ready')

  if (ready === 'error') {
    const errorText = await page.textContent('body')
    console.error(`  Error rendering ${view.name}: ${errorText}`)
    continue
  }

  const outPath = path.join(outputDir, `${modelName}-${view.name}.png`)
  await page.locator('canvas').screenshot({ path: outPath })
  savedPaths.push(outPath)
  console.log(`  ${view.name}: ${outPath}`)
}

// Scatter plot diagnostic
const scatterUrl = `http://localhost:${port}/preview?model=${modelUrlPath}&zones=${zonesEncoded}&size=512&mode=scatter${contextParams}`
await page.setViewportSize({ width: 512, height: 700 })
await page.goto(scatterUrl, { waitUntil: 'load' })
await page.waitForSelector('[data-ready]', { timeout: 30000 })

const scatterReady = await page.getAttribute('body', 'data-ready')
if (scatterReady === 'error') {
  const errorText = await page.textContent('body')
  console.error(`  Error rendering scatter: ${errorText}`)
} else {
  const scatterPath = path.join(outputDir, `${modelName}-scatter.png`)
  await page.screenshot({ path: scatterPath, fullPage: true })
  savedPaths.push(scatterPath)
  console.log(`  scatter: ${scatterPath}`)
}

await browser.close()
server.close()

console.log(`\nDone. ${savedPaths.length} screenshots saved to: ${outputDir}`)
console.log('Inspect with the Read tool to verify zone boundaries.')
