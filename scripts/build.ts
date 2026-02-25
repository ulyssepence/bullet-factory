import * as esbuild from 'esbuild'
import * as path from 'path'
import * as fs from 'fs'
import * as crypto from 'crypto'

const args = process.argv.slice(2)
const slug = args.find(a => !a.startsWith('--'))
const watch = args.includes('--watch')
const serve = args.includes('--serve')
const portArg = args.find(a => a.startsWith('--port='))
const port = portArg ? parseInt(portArg.split('=')[1]) : 3000

if (!slug) {
  console.error('Usage: npx tsx scripts/build.ts <slug> [--watch] [--serve]')
  process.exit(1)
}

const gameDir = path.resolve('games', slug)
const srcDir = path.join(gameDir, 'src')
const distDir = path.join(gameDir, 'dist')
const entry = path.join(srcDir, 'main.tsx')

if (!fs.existsSync(entry)) {
  console.error(`No entry found at ${entry}`)
  process.exit(1)
}

const staticDir = path.join(gameDir, 'static')

fs.mkdirSync(distDir, { recursive: true })

function copyStatic() {
  if (!fs.existsSync(staticDir)) return
  function copy(src: string, dest: string) {
    fs.mkdirSync(dest, { recursive: true })
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const s = path.join(src, entry.name)
      const d = path.join(dest, entry.name)
      if (entry.isDirectory()) copy(s, d)
      else fs.copyFileSync(s, d)
    }
  }
  copy(staticDir, distDir)
}

function writeHtml(jsFile: string) {
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <title>${slug}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #root { width: 100%; height: 100%; overflow: hidden; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script src="/${jsFile}"></script>
</body>
</html>`
  fs.writeFileSync(path.join(distDir, 'index.html'), html)
}

const buildOptions: esbuild.BuildOptions = {
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  jsx: 'automatic',
  outdir: distDir,
  entryNames: watch ? 'app' : 'app.[hash]',
  metafile: true,
  sourcemap: true,
  define: {
    'process.env.NODE_ENV': watch ? '"development"' : '"production"',
  },
  minify: !watch,
  logLevel: 'info',
}

async function build() {
  copyStatic()
  const result = await esbuild.build(buildOptions)
  const outputs = Object.keys(result.metafile!.outputs)
  const jsFile = outputs.find(f => f.endsWith('.js'))!
  writeHtml(path.basename(jsFile))
}

async function dev() {
  const ctx = await esbuild.context(buildOptions)

  if (serve) {
    const srv = await ctx.serve({ servedir: distDir, port })
    writeHtml('app.js')
    console.log(`Serving ${slug} at http://localhost:${srv.port}`)
  }

  copyStatic()
  await ctx.watch()
  writeHtml('app.js')
  console.log(`Watching ${srcDir}...`)
}

if (watch || serve) {
  dev()
} else {
  build()
}
