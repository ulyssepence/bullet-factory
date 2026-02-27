#!/usr/bin/env node
import { chromium } from 'playwright'
import http from 'http'
import fs from 'fs'
import path from 'path'

const FONTS_DIR = path.resolve('fonts')
const LIBRARY_PATH = path.join(FONTS_DIR, 'library.json')

const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

interface FontEntry {
  family: string
  category: 'display' | 'handwriting' | 'monospace'
}

interface LibraryEntry {
  family: string
  category: string
  tags: string[]
  woff2File: string
  baseSizePx: number
}

const FONT_LIST: FontEntry[] = [
  // Display (~120)
  ...[
    'Bungee', 'Bungee Shade', 'Bungee Inline', 'Bungee Outline', 'Creepster',
    'Press Start 2P', 'Silkscreen', 'Pixelify Sans', 'Metal Mania', 'Nosifer',
    'Eater', 'Rubik Glitch', 'Rubik Wet Paint', 'Rubik Burned', 'Rubik Maze',
    'Rubik Vinyl', 'Rubik Moonrocks', 'Rubik Puddles', 'Rubik Microbe',
    'Fredoka', 'Bangers', 'Freckle Face', 'Henny Penny',
    'Bungee Spice', 'Monoton', 'Butcherman', 'Kranky', 'Ewert',
    'Faster One', 'Plaster', 'Srisakdi', 'Shojumaru', 'Emblema One',
    'Flavors', 'Rammetto One', 'Sancreek', 'Trade Winds', 'Uncial Antiqua',
    'Vast Shadow', 'Frijole', 'Jacques Francois Shadow', 'Jolly Lodger',
    'Kablammo', 'Lacquer', 'Limelight', 'Londrina Shadow', 'Londrina Outline',
    'Londrina Sketch', 'Londrina Solid', 'Mystery Quest', 'New Rocker',
    'Piedra', 'Pirata One', 'Reggae One', 'Risque', 'Rubik Iso',
    'Rubik Marker Hatch', 'Rubik Storm', 'Rubik Doodle Shadow',
    'Rubik Spray Paint', 'Stalinist One', 'Train One', 'Unifraktur Cook',
    'Unifraktur Maguntia', 'Warnes', 'Yatra One',
    'Alfa Slab One', 'Anton', 'Black Ops One', 'Bowlby One SC',
    'Bungee Hairline', 'Cabin Sketch', 'Caesar Dressing', 'Chela One',
    'Cinzel Decorative', 'Coiny', 'Concert One', 'Codystar', 'Fascinate',
    'Fascinate Inline', 'Finger Paint', 'Fontdiner Swanky', 'Fredericka the Great',
    'Fugaz One', 'Gravitas One', 'Iceland', 'Irish Grover', 'Keania One',
    'Kenia', 'Kumar One', 'Kumar One Outline', 'Lemon', 'Lily Script One',
    'Lobster', 'Lobster Two', 'Megrim', 'Modak', 'Moul',
    'Mountains of Christmas', 'Nabla', 'Orbitron', 'Outrun Future',
    'Pacifico', 'Passero One', 'Passion One', 'Patua One', 'Permanent Marker',
    'Poller One', 'Porcelain', 'Righteous', 'Rubik 80s Fade',
    'Rubik Broken Fax', 'Rubik Lines', 'Rubik Maps', 'Rubik Pixels',
    'Ruslan Display', 'Rye', 'Safer', 'Saira Stencil One',
    'Smokum', 'Special Elite', 'Spicy Rice', 'Squada One',
    'Tilt Neon', 'Tilt Prism', 'Tilt Warp', 'Ultra',
  ].map(f => ({ family: f, category: 'display' as const })),

  // Handwriting (~50)
  ...[
    'Caveat', 'Indie Flower', 'Rock Salt', 'Satisfy', 'Shadows Into Light',
    'Amatic SC', 'Architects Daughter', 'Bad Script', 'Barrio', 'Beth Ellen',
    'Bilbo Swash Caps', 'Bonheur Royale', 'Butterfly Kids', 'Calligraffitti',
    'Cedarville Cursive', 'Condiment', 'Covered By Your Grace', 'Crafty Girls',
    'Dawning of a New Day', 'Delius', 'Delius Swash Caps', 'Delius Unicase',
    'Dr Sugiyama', 'Engagement', 'Fondamento', 'Give You Glory', 'Gloria Hallelujah',
    'Gochi Hand', 'Grand Hotel', 'Handlee', 'Herr Von Muellerhoff',
    'Homemade Apple', 'Just Another Hand', 'Kalam', 'Kaushan Script',
    'La Belle Aurore', 'League Script', 'Liu Jian Mao Cao', 'Long Cang',
    'Loved by the King', 'Marck Script', 'Meddon', 'Merienda', 'Mr Dafoe',
    'Mrs Saint Delafield', 'Nanum Pen Script', 'Nothing You Could Do',
    'Over the Rainbow', 'Patrick Hand', 'Pinyon Script', 'Reenie Beanie',
    'Rochester', 'Sacramento', 'Sedgwick Ave', 'Sedgwick Ave Display',
    'Shadows Into Light Two', 'Short Stack', 'Sue Ellen Francisco',
    'Sunshiney', 'Swanky and Moo Moo', 'The Girl Next Door', 'Tillana',
    'Waiting for the Sunrise', 'Yellowtail', 'Zeyada',
  ].map(f => ({ family: f, category: 'handwriting' as const })),

  // Monospace (~30)
  ...[
    'Space Mono', 'VT323', 'Share Tech Mono', 'Fira Code', 'JetBrains Mono',
    'Source Code Pro', 'IBM Plex Mono', 'Roboto Mono', 'Ubuntu Mono',
    'Inconsolata', 'Cousine', 'Anonymous Pro', 'Overpass Mono',
    'Cutive Mono', 'Nova Mono', 'Xanh Mono', 'Major Mono Display',
    'Syne Mono', 'B612 Mono', 'Azeret Mono', 'Martian Mono',
    'Red Hat Mono', 'Nanum Gothic Coding', 'DM Mono', 'PT Mono',
    'Oxygen Mono', 'Courier Prime', 'Fragment Mono',
    'Sometype Mono', 'Geist Mono',
  ].map(f => ({ family: f, category: 'monospace' as const })),
].filter((f, i, arr) => arr.findIndex(g => g.family === f.family) === i)

function slugify(family: string): string {
  return family.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

async function downloadFonts(): Promise<Map<string, string>> {
  fs.mkdirSync(FONTS_DIR, { recursive: true })
  const fileMap = new Map<string, string>()
  const batches: FontEntry[][] = []
  for (let i = 0; i < FONT_LIST.length; i += 10) {
    batches.push(FONT_LIST.slice(i, i + 10))
  }

  let done = 0
  for (const batch of batches) {
    await Promise.all(batch.map(async (font) => {
      const slug = slugify(font.family)
      const woff2Path = path.join(FONTS_DIR, `${slug}.woff2`)
      done++

      if (fs.existsSync(woff2Path)) {
        process.stdout.write(`[${done}/${FONT_LIST.length}] Skipping "${font.family}" (exists)\n`)
        fileMap.set(font.family, `${slug}.woff2`)
        return
      }

      try {
        const encoded = encodeURIComponent(font.family)
        const textChars = encodeURIComponent('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;\':",./<>?~ ')
        const cssUrl = `https://fonts.googleapis.com/css2?family=${encoded}&text=${textChars}&display=swap`
        const cssResp = await fetch(cssUrl, { headers: { 'User-Agent': CHROME_UA } })
        if (!cssResp.ok) {
          process.stdout.write(`[${done}/${FONT_LIST.length}] FAILED "${font.family}" (CSS ${cssResp.status})\n`)
          return
        }
        const css = await cssResp.text()
        const urlMatch = css.match(/url\((https:\/\/fonts\.gstatic\.com\/[^\)]+?)\)\s*format\('woff2'\)/)
        if (!urlMatch) {
          process.stdout.write(`[${done}/${FONT_LIST.length}] FAILED "${font.family}" (no woff2 URL in CSS)\n`)
          return
        }
        const woff2Resp = await fetch(urlMatch[1])
        if (!woff2Resp.ok) {
          process.stdout.write(`[${done}/${FONT_LIST.length}] FAILED "${font.family}" (woff2 ${woff2Resp.status})\n`)
          return
        }
        const buf = Buffer.from(await woff2Resp.arrayBuffer())
        fs.writeFileSync(woff2Path, buf)
        fileMap.set(font.family, `${slug}.woff2`)
        process.stdout.write(`[${done}/${FONT_LIST.length}] Downloaded "${font.family}"\n`)
      } catch (e: any) {
        process.stdout.write(`[${done}/${FONT_LIST.length}] ERROR "${font.family}": ${e.message}\n`)
      }
    }))
  }

  return fileMap
}

function buildHtml(fileMap: Map<string, string>, existing: LibraryEntry[]): string {
  const existingMap = new Map(existing.map(e => [e.family, e]))
  const fontData = FONT_LIST
    .filter(f => fileMap.has(f.family))
    .map(f => {
      const ex = existingMap.get(f.family)
      return {
        family: f.family,
        category: f.category,
        woff2File: fileMap.get(f.family)!,
        approved: ex ? true : false,
        tags: ex?.tags?.join(', ') ?? '',
        baseSizePx: ex?.baseSizePx ?? 16,
      }
    })

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Font Library Curator</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #1a1a2e; color: #e0e0e0; font-family: system-ui, sans-serif; padding-bottom: 80px; }
  ${fontData.map(f => `@font-face { font-family: '${f.family}'; src: url('/fonts/${f.woff2File}') format('woff2'); font-weight: 400; font-display: swap; }`).join('\n  ')}

  .header { position: sticky; top: 0; z-index: 100; background: #16213e; padding: 12px 20px; border-bottom: 1px solid #0f3460; }
  .header h1 { font-size: 20px; margin-bottom: 8px; color: #e94560; }
  .controls { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .tab { padding: 6px 14px; border-radius: 4px; border: 1px solid #0f3460; background: transparent; color: #e0e0e0; cursor: pointer; font-size: 13px; }
  .tab.active { background: #e94560; border-color: #e94560; color: white; }
  .search { padding: 6px 12px; border-radius: 4px; border: 1px solid #0f3460; background: #0a0a1a; color: #e0e0e0; font-size: 13px; width: 200px; }
  .btn { padding: 6px 14px; border-radius: 4px; border: none; cursor: pointer; font-size: 13px; }
  .btn-select { background: #533483; color: white; }
  .btn-deselect { background: #444; color: white; }

  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 12px; padding: 16px 20px; }
  .card { background: #16213e; border-radius: 8px; padding: 16px; border: 2px solid transparent; transition: border-color 0.15s; }
  .card.approved { border-color: #e94560; }
  .card.hidden { display: none; }
  .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
  .card-name { font-size: 14px; font-weight: 600; }
  .badge { font-size: 10px; padding: 2px 8px; border-radius: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
  .badge-display { background: #533483; }
  .badge-handwriting { background: #0f3460; }
  .badge-monospace { background: #1a5653; }
  .sample-title { font-size: 36px; line-height: 1.2; margin-bottom: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sample-menu { font-size: 24px; line-height: 1.2; margin-bottom: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #b0b0b0; }
  .sample-hud { font-size: 16px; line-height: 1.2; margin-bottom: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #808080; }
  .card-controls { display: flex; gap: 8px; align-items: center; }
  .card-controls label { font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 4px; }
  .card-controls input[type=checkbox] { width: 18px; height: 18px; accent-color: #e94560; }
  .tags-input { flex: 1; padding: 4px 8px; border-radius: 4px; border: 1px solid #0f3460; background: #0a0a1a; color: #e0e0e0; font-size: 12px; }
  .tags-input::placeholder { color: #555; }
  .base-size { font-size: 11px; color: #666; margin-left: auto; }

  .bottom-bar { position: fixed; bottom: 0; left: 0; right: 0; background: #16213e; border-top: 2px solid #e94560; padding: 12px 20px; display: flex; justify-content: space-between; align-items: center; z-index: 100; }
  .count { font-size: 14px; }
  .save-btn { padding: 10px 24px; border-radius: 6px; border: none; background: #e94560; color: white; font-size: 15px; font-weight: 600; cursor: pointer; }
  .save-btn:hover { background: #c73850; }
</style>
</head>
<body>

<div class="header">
  <h1>Font Library Curator</h1>
  <div class="controls">
    <button class="tab active" data-filter="all">All</button>
    <button class="tab" data-filter="display">Display</button>
    <button class="tab" data-filter="handwriting">Handwriting</button>
    <button class="tab" data-filter="monospace">Monospace</button>
    <input class="search" type="text" placeholder="Search fonts..." id="search">
    <button class="btn btn-select" id="selectAllDisplay">Select All Display</button>
    <button class="btn btn-deselect" id="deselectAll">Deselect All</button>
  </div>
</div>

<div class="grid" id="grid"></div>

<div class="bottom-bar">
  <span class="count" id="count">0 fonts selected</span>
  <button class="save-btn" id="saveBtn">Save Library</button>
</div>

<canvas id="measureCanvas" style="display:none"></canvas>

<script>
const FONTS = ${JSON.stringify(fontData)};

const grid = document.getElementById('grid');
const countEl = document.getElementById('count');
const searchEl = document.getElementById('search');
const canvas = document.getElementById('measureCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 800; canvas.height = 200;

const cards = [];

function measureBaseSize(family) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = '100px "' + family + '"';
  const m = ctx.measureText('Hxpd');
  const asc = m.actualBoundingBoxAscent || 80;
  const desc = m.actualBoundingBoxDescent || 20;
  const h = asc + desc;
  if (h < 10) return 16;
  const ratio = 0.72;
  return Math.round(16 * (100 / h) * ratio);
}

for (const f of FONTS) {
  const card = document.createElement('div');
  card.className = 'card' + (f.approved ? ' approved' : '');
  card.dataset.category = f.category;
  card.dataset.family = f.family.toLowerCase();
  card.innerHTML = \`
    <div class="card-header">
      <span class="card-name">\${f.family}</span>
      <span class="badge badge-\${f.category}">\${f.category}</span>
    </div>
    <div class="sample-title" style="font-family: '\${f.family}', cursive">ZOMBIE ARENA</div>
    <div class="sample-menu" style="font-family: '\${f.family}', cursive">New Game \\u2022 Continue \\u2022 Settings</div>
    <div class="sample-hud" style="font-family: '\${f.family}', monospace">HP: 100/100  LVL 5  KILLS: 1,234  03:45</div>
    <div class="card-controls">
      <label><input type="checkbox" class="approve-cb" \${f.approved ? 'checked' : ''}> Approve</label>
      <input type="text" class="tags-input" placeholder="horror, pixel, sci-fi..." value="\${f.tags}">
      <span class="base-size">base: <span class="base-val">\${f.baseSizePx}</span>px</span>
    </div>
  \`;
  grid.appendChild(card);
  cards.push({ el: card, data: f });
}

setTimeout(() => {
  for (const c of cards) {
    const bs = measureBaseSize(c.data.family);
    c.data.baseSizePx = bs;
    c.el.querySelector('.base-val').textContent = bs;
  }
}, 500);

function updateCount() {
  const n = cards.filter(c => c.el.querySelector('.approve-cb').checked).length;
  countEl.textContent = n + ' font' + (n !== 1 ? 's' : '') + ' selected';
}

grid.addEventListener('change', (e) => {
  if (e.target.classList.contains('approve-cb')) {
    e.target.closest('.card').classList.toggle('approved', e.target.checked);
    updateCount();
  }
});

let activeFilter = 'all';
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    activeFilter = tab.dataset.filter;
    applyFilters();
  });
});

searchEl.addEventListener('input', applyFilters);

function applyFilters() {
  const q = searchEl.value.toLowerCase();
  for (const c of cards) {
    const catMatch = activeFilter === 'all' || c.data.category === activeFilter;
    const searchMatch = !q || c.data.family.toLowerCase().includes(q);
    c.el.classList.toggle('hidden', !(catMatch && searchMatch));
  }
}

document.getElementById('selectAllDisplay').addEventListener('click', () => {
  for (const c of cards) {
    if (c.data.category === 'display') {
      c.el.querySelector('.approve-cb').checked = true;
      c.el.classList.add('approved');
    }
  }
  updateCount();
});

document.getElementById('deselectAll').addEventListener('click', () => {
  for (const c of cards) {
    c.el.querySelector('.approve-cb').checked = false;
    c.el.classList.remove('approved');
  }
  updateCount();
});

document.getElementById('saveBtn').addEventListener('click', async () => {
  const approved = [];
  for (const c of cards) {
    if (c.el.querySelector('.approve-cb').checked) {
      const tags = c.el.querySelector('.tags-input').value
        .split(',').map(t => t.trim()).filter(Boolean);
      approved.push({
        family: c.data.family,
        category: c.data.category,
        tags,
        woff2File: c.data.woff2File,
        baseSizePx: c.data.baseSizePx,
      });
    }
  }
  const resp = await fetch('/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approved }),
  });
  const result = await resp.json();
  if (result.ok) {
    document.querySelector('.save-btn').textContent = 'Saved ' + approved.length + ' fonts!';
    setTimeout(() => { document.querySelector('.save-btn').textContent = 'Save Library'; }, 2000);
  }
});

updateCount();
</script>
</body>
</html>`
}

async function main() {
  console.log('Font Library Curator')
  console.log('====================\n')

  const fileMap = await downloadFonts()
  console.log(`\nDownloaded ${fileMap.size}/${FONT_LIST.length} fonts.\n`)

  let existing: LibraryEntry[] = []
  if (fs.existsSync(LIBRARY_PATH)) {
    try {
      existing = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf-8'))
      console.log(`Loaded ${existing.length} previously approved fonts from library.json`)
    } catch {}
  }

  const html = buildHtml(fileMap, existing)

  const server = http.createServer((req, res) => {
    const url = new URL(req.url!, 'http://localhost')

    if (url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(html)
      return
    }

    if (url.pathname.startsWith('/fonts/')) {
      const filePath = path.join(FONTS_DIR, url.pathname.slice(7))
      if (fs.existsSync(filePath)) {
        res.writeHead(200, { 'Content-Type': 'font/woff2' })
        res.end(fs.readFileSync(filePath))
        return
      }
    }

    if (req.method === 'POST' && url.pathname === '/save') {
      let body = ''
      req.on('data', (chunk: Buffer) => { body += chunk })
      req.on('end', () => {
        try {
          const { approved } = JSON.parse(body) as { approved: LibraryEntry[] }
          const approvedFiles = new Set(approved.map(a => a.woff2File))

          const allWoff2 = fs.readdirSync(FONTS_DIR).filter(f => f.endsWith('.woff2'))
          let removed = 0
          for (const f of allWoff2) {
            if (!approvedFiles.has(f)) {
              fs.unlinkSync(path.join(FONTS_DIR, f))
              removed++
            }
          }

          fs.writeFileSync(LIBRARY_PATH, JSON.stringify(approved, null, 2))
          console.log(`\nSaved ${approved.length} fonts to fonts/library.json (removed ${removed} unapproved woff2 files)`)

          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true }))

          setTimeout(() => {
            console.log('Closing browser...')
            browser.close().then(() => {
              server.close()
              process.exit(0)
            })
          }, 500)
        } catch (e: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: e.message }))
        }
      })
      return
    }

    res.writeHead(404)
    res.end('Not found')
  })

  const port = 9876 + Math.floor(Math.random() * 100)
  await new Promise<void>((resolve) => server.listen(port, resolve))
  console.log(`Server: http://localhost:${port}`)
  console.log('Opening browser...\n')

  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome',
    args: ['--no-sandbox'],
  })

  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  await page.goto(`http://localhost:${port}/`)

  browser.on('disconnected', () => {
    server.close()
    process.exit(0)
  })
}

main().catch(e => { console.error(e); process.exit(1) })
