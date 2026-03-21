import * as esbuild from 'esbuild'
import * as path from 'path'
import * as fs from 'fs'
import * as http from 'http'
import { execSync } from 'child_process'

const slug = process.argv[2]
if (!slug) {
  console.error('Usage: npx tsx scripts/pick-audio.ts <slug>')
  process.exit(1)
}

const gameDir = path.resolve('games', slug)
const eventsFile = path.join(gameDir, 'audio-events.json')
if (!fs.existsSync(eventsFile)) {
  console.error(`Missing ${eventsFile}`)
  process.exit(1)
}

const eventsConfig = JSON.parse(fs.readFileSync(eventsFile, 'utf-8'))
console.log(`Events: ${Object.keys(eventsConfig.events).join(', ')}`)

const toolDir = path.resolve('tools', 'audio-sfx')
const distDir = path.join(toolDir, 'dist')
const staticDir = path.join(toolDir, 'static')

fs.mkdirSync(distDir, { recursive: true })

function copyDir(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name)
    const d = path.join(dest, entry.name)
    if (entry.isDirectory()) copyDir(s, d)
    else fs.copyFileSync(s, d)
  }
}

copyDir(staticDir, distDir)
fs.writeFileSync(path.join(distDir, 'audio-config.json'), JSON.stringify(eventsConfig))

await esbuild.build({
  entryPoints: [path.join(toolDir, 'src', 'main.tsx')],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  jsx: 'automatic',
  outdir: distDir,
  entryNames: 'app',
  sourcemap: true,
  define: { 'process.env.NODE_ENV': '"development"' },
  logLevel: 'info',
})

const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Audio Picker — ${slug}</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/app.js"></script>
</body>
</html>`
fs.writeFileSync(path.join(distDir, 'index.html'), html)

let port: number
try {
  port = parseInt(execSync('get-free-port', { encoding: 'utf-8' }).trim())
} catch {
  port = 0
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/api/save') {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk as Buffer)
    const mapping: Record<string, string> = JSON.parse(Buffer.concat(chunks).toString())

    const sfxDir = path.join(gameDir, 'static', 'audio', 'sfx')
    fs.mkdirSync(sfxDir, { recursive: true })

    const manifest: Record<string, string> = {}

    for (const [event, soundPath] of Object.entries(mapping)) {
      const ext = path.extname(soundPath)
      const src = path.join(distDir, soundPath)
      const destName = `${event}${ext}`
      const dest = path.join(sfxDir, destName)

      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest)
        manifest[event] = `audio/sfx/${destName}`
      } else {
        console.warn(`Not found: ${src}`)
      }
    }

    const manifestPath = path.join(gameDir, 'src', 'audio-manifest.json')
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')

    const outputDir = path.relative(process.cwd(), sfxDir)
    console.log(`Saved ${Object.keys(manifest).length} sounds to ${outputDir}`)
    console.log(`Manifest: ${path.relative(process.cwd(), manifestPath)}`)

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ outputDir, manifest }))
    return
  }

  const urlPath = req.url === '/' ? '/index.html' : req.url!
  const filePath = path.join(distDir, urlPath)

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404)
    res.end('Not found')
    return
  }

  const ext = path.extname(filePath)
  const mimeTypes: Record<string, string> = {
    '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
    '.json': 'application/json', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg', '.map': 'application/json',
  }

  res.writeHead(200, {
    'Content-Type': mimeTypes[ext] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
  })
  fs.createReadStream(filePath).pipe(res)
})

server.listen(port, () => {
  const addr = server.address() as { port: number }
  console.log(`\nAudio picker for "${slug}": http://localhost:${addr.port}`)
  console.log(`Output: games/${slug}/static/audio/sfx/`)
  console.log(`Manifest: games/${slug}/src/audio-manifest.json`)
})
