#!/usr/bin/env node
import { chromium } from 'playwright'
import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const glbPath = process.argv[2]

if (!glbPath) {
  console.error('Usage: npx tsx scripts/preview-animation.ts <path-to-glb>')
  console.error('')
  console.error('  Opens an interactive browser preview of a rigged GLB with walk/run animations.')
  console.error('  Auto-discovers <name>-walk.glb and <name>-run.glb alongside the input file.')
  console.error('')
  console.error('Example:')
  console.error('  npx tsx scripts/preview-animation.ts games/crazy-west/static/models/bandit-runner-rigged.glb')
  process.exit(1)
}

const resolved = path.resolve(glbPath)
if (!fs.existsSync(resolved)) {
  console.error(`File not found: ${resolved}`)
  process.exit(1)
}

const modelDir = path.dirname(resolved)
const modelFilename = path.basename(resolved)
const previewHtml = path.join(__dirname, 'animation-preview.html')

const mimeTypes: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url!, `http://localhost`)

  if (url.pathname === '/') {
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

console.log(`Model: ${modelFilename}`)
console.log(`Dir:   ${modelDir}`)
console.log(`URL:   http://localhost:${port}/?model=/models/${modelFilename}`)
console.log(`\nPreview open. Close browser to exit.`)

const browser = await chromium.launch({
  headless: false,
  channel: 'chrome',
  args: ['--no-sandbox'],
})

const page = await browser.newPage({ viewport: { width: 900, height: 700 } })

page.on('console', (msg) => {
  const text = msg.text()
  if (text.startsWith('[skeleton]')) console.log(text)
})

await page.goto(`http://localhost:${port}/?model=/models/${modelFilename}`)

browser.on('disconnected', () => {
  server.close()
  process.exit(0)
})
