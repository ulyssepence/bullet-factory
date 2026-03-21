import * as palette from '../template/src/palette'
import * as esbuild from 'esbuild'
import * as path from 'path'
import * as fs from 'fs'
import * as http from 'http'
import { execSync } from 'child_process'

const arg = process.argv[2]
const isSlug = arg && !/^\d+$/.test(arg)

function generateMany(count: number, startSeed: number, enemyCount: number): palette.Palette[] {
  const results: palette.Palette[] = []
  let seed = startSeed
  while (results.length < count && seed < startSeed + 50000) {
    const p = palette.generateValid(seed, enemyCount)
    if (p) {
      results.push(p)
      seed = p.seed + 10
    } else {
      seed += 300
    }
  }
  return results
}

function previewWithHeader(p: palette.Palette, index: number): string[] {
  return [`  [${index}]`, ...palette.preview(p).split('\n'), '']
}

function gridPrint(blocks: string[][]): void {
  const cols = process.stdout.columns || 80
  // strip ANSI to measure visible width
  const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '')
  const blockWidth = Math.max(...blocks.flatMap(b => b.map(l => strip(l).length))) + 2
  const perRow = Math.max(1, Math.floor(cols / blockWidth))
  const maxLines = Math.max(...blocks.map(b => b.length))

  for (let i = 0; i < blocks.length; i += perRow) {
    const row = blocks.slice(i, i + perRow)
    for (let line = 0; line < maxLines; line++) {
      const parts = row.map(b => {
        const raw = b[line] ?? ''
        const pad = blockWidth - strip(raw).length
        return raw + ' '.repeat(Math.max(0, pad))
      })
      console.log(parts.join(''))
    }
  }
}

if (!isSlug) {
  const enemyCount = parseInt(arg || '3')
  const target = 8

  console.log(`\nGenerating ${target} high-contrast palettes (${enemyCount} enemies each):\n`)

  const results = generateMany(target, 0.5, enemyCount)
  const blocks = results.map((p, i) => previewWithHeader(p, i + 1))
  gridPrint(blocks)

  console.log(`Pick a number (1-${results.length}):`)
} else {
  const slug = arg
  const gameDir = path.resolve('games', slug)
  const specPath = path.join(gameDir, 'src', 'spec.ts')

  if (!fs.existsSync(specPath)) {
    console.error(`Missing ${specPath}`)
    process.exit(1)
  }

  const specText = fs.readFileSync(specPath, 'utf-8')

  const paletteMatch = specText.match(/palette:\s*\{[\s\S]*?enemy:\s*\{[\s\S]*?\}\s*,?\s*\}/)
  if (!paletteMatch) {
    console.error('Could not parse palette block from spec.ts')
    process.exit(1)
  }

  const groundMatch = specText.match(/palette:[\s\S]*?ground:\s*'(#[0-9a-fA-F]+)'/)
  const wallMatch = specText.match(/palette:[\s\S]*?wall:\s*'(#[0-9a-fA-F]+)'/)
  const playerMatch = specText.match(/palette:[\s\S]*?player:\s*'(#[0-9a-fA-F]+)'/)
  const accentMatch = specText.match(/palette:[\s\S]*?accent:\s*'(#[0-9a-fA-F]+)'/)

  const enemyBlock = specText.match(/enemy:\s*\{([\s\S]*?)\}/)
  const enemyEntries: [string, string][] = []
  if (enemyBlock) {
    const re = /(\w+):\s*'(#[0-9a-fA-F]+)'/g
    let m
    while ((m = re.exec(enemyBlock[1])) !== null) {
      enemyEntries.push([m[1], m[2]])
    }
  }

  const currentPalette: palette.Palette = {
    seed: 0,
    ground: groundMatch?.[1] ?? '#333',
    wall: wallMatch?.[1] ?? '#555',
    player: playerMatch?.[1] ?? '#88f',
    accent: accentMatch?.[1] ?? '#ff0',
    enemies: enemyEntries.map(e => e[1]),
  }
  const enemyNames = enemyEntries.map(e => e[0])

  const candidates = generateMany(50, 0.5, enemyNames.length)

  const toolDir = path.resolve('tools', 'palette-picker')
  const distDir = path.join(toolDir, 'dist')
  fs.mkdirSync(distDir, { recursive: true })

  const configData = { slug, currentPalette, candidates, enemyNames }

  await esbuild.build({
    entryPoints: [path.join(toolDir, 'src', 'main.tsx')],
    bundle: true,
    format: 'esm',
    target: 'es2022',
    jsx: 'automatic',
    outdir: distDir,
    entryNames: 'app',
    sourcemap: true,
    define: {
      'process.env.NODE_ENV': '"development"',
      '__CONFIG__': JSON.stringify(configData),
    },
    logLevel: 'info',
  })

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Palette Picker — ${slug}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { overflow-y: scroll; }
    button:hover { filter: brightness(1.2); }
  </style>
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
      const body = JSON.parse(Buffer.concat(chunks).toString()) as {
        palette: palette.Palette
        enemyNames: string[]
      }

      let text = fs.readFileSync(specPath, 'utf-8')

      const enemyStr = body.enemyNames
        .map((name, i) => `      ${name}: '${body.palette.enemies[i]}'`)
        .join(',\n')

      const newBlock = `palette: {
    ground: '${body.palette.ground}',
    wall: '${body.palette.wall}',
    player: '${body.palette.player}',
    accent: '${body.palette.accent}',
    enemy: {\n${enemyStr},\n    },
  }`

      text = text.replace(
        /palette:\s*\{[\s\S]*?enemy:\s*\{[\s\S]*?\}\s*,?\s*\}/,
        newBlock,
      )
      fs.writeFileSync(specPath, text)

      console.log(`Palette saved to ${specPath}`)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
      return
    }

    if (req.method === 'POST' && req.url === '/api/generate') {
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(chunk as Buffer)
      const body = JSON.parse(Buffer.concat(chunks).toString()) as {
        count: number
        startSeed: number
        enemyCount: number
      }

      const newCandidates = generateMany(body.count, body.startSeed, body.enemyCount)

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ candidates: newCandidates }))
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
      '.html': 'text/html', '.js': 'application/javascript',
      '.css': 'text/css', '.json': 'application/json', '.map': 'application/json',
    }

    res.writeHead(200, {
      'Content-Type': mimeTypes[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    })
    fs.createReadStream(filePath).pipe(res)
  })

  server.listen(port, () => {
    const addr = server.address() as { port: number }
    console.log(`\nPalette picker for "${slug}": http://localhost:${addr.port}`)
  })
}
