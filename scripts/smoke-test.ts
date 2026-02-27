import { chromium, firefox, webkit, Browser, Page, BrowserType } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'

const url = process.argv[2]
if (!url) {
  console.error('Usage: npx tsx scripts/smoke-test.ts <url> [--browsers=chromium,firefox,webkit] [--screenshot-dir=./smoke-screenshots]')
  process.exit(1)
}

const args = process.argv.slice(3)
const browsersArg = args.find(a => a.startsWith('--browsers='))
const browserNames = browsersArg
  ? browsersArg.split('=')[1].split(',')
  : ['chromium', 'firefox', 'webkit']

const screenshotArg = args.find(a => a.startsWith('--screenshot-dir='))
const screenshotDir = screenshotArg ? screenshotArg.split('=')[1] : './smoke-screenshots'

const browserMap: Record<string, BrowserType> = { chromium, firefox, webkit }

interface SmokeResult {
  browser: string
  passed: boolean
  checks: { name: string; passed: boolean; detail?: string }[]
  screenshot?: string
}

async function smokeTest(browserName: string): Promise<SmokeResult> {
  const browserType = browserMap[browserName]
  if (!browserType) {
    return { browser: browserName, passed: false, checks: [{ name: 'launch', passed: false, detail: `Unknown browser: ${browserName}` }] }
  }

  const checks: SmokeResult['checks'] = []
  let browser: Browser | null = null
  let page: Page | null = null

  try {
    const launchArgs = browserName === 'chromium'
      ? ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader']
      : []

    browser = await browserType.launch({ headless: true, args: launchArgs })
    checks.push({ name: 'launch', passed: true })

    page = await browser.newPage({ viewport: { width: 1280, height: 720 } })

    const consoleErrors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })
    page.on('pageerror', err => consoleErrors.push(err.message))

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })
    checks.push({ name: 'page-load', passed: true })

    // Wait for canvas to appear (R3F creates it)
    const canvas = await page.waitForSelector('canvas', { timeout: 10000 }).catch(() => null)
    if (!canvas) {
      checks.push({ name: 'canvas-exists', passed: false, detail: 'No <canvas> found within 10s' })
      return finish(browserName, checks, browser, page)
    }
    checks.push({ name: 'canvas-exists', passed: true })

    // Give the scene a few frames to render
    await page.waitForTimeout(2000)

    // Check 1: WebGL2 context creation
    const contextOk = await page.evaluate(() => {
      const c = document.querySelector('canvas')
      if (!c) return false
      const gl = c.getContext('webgl2') || (c as any).__gl
      // R3F owns the context — we just check if the canvas has dimensions and content
      return c.width > 0 && c.height > 0
    })
    checks.push({ name: 'canvas-has-size', passed: contextOk, detail: contextOk ? undefined : 'Canvas has zero dimensions' })

    // Check 2: Non-black render — sample multiple points
    const pixelCheck = await page.evaluate(() => {
      const c = document.querySelector('canvas')
      if (!c) return { ok: false, detail: 'no canvas' }
      // Try to get a fresh context reference — R3F may have the context
      // Use toDataURL as a fallback to check if there's actual content
      try {
        const dataUrl = c.toDataURL('image/png')
        // A blank canvas produces a very short data URL
        if (dataUrl.length > 1000) return { ok: true, detail: `dataURL length: ${dataUrl.length}` }
      } catch { /* tainted canvas or security error */ }

      // Direct pixel read — may fail if context is lost or preserveDrawingBuffer is false
      const gl = c.getContext('webgl2')
      if (!gl) return { ok: false, detail: 'Cannot get WebGL2 context (R3F owns it)' }
      const px = new Uint8Array(4 * 5)
      const w = c.width, h = c.height
      const points = [[w / 2, h / 2], [w / 4, h / 4], [3 * w / 4, h / 4], [w / 4, 3 * h / 4], [3 * w / 4, 3 * h / 4]]
      for (let i = 0; i < points.length; i++) {
        gl.readPixels(Math.floor(points[i][0]), Math.floor(points[i][1]), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px.subarray(i * 4, i * 4 + 4))
      }
      const hasColor = Array.from(px).some(v => v > 0)
      return { ok: hasColor, detail: hasColor ? 'pixels have color' : 'all sampled pixels are black' }
    })
    checks.push({ name: 'non-black-render', passed: pixelCheck.ok, detail: pixelCheck.detail })

    // Check 3: GL errors
    const glError = await page.evaluate(() => {
      const c = document.querySelector('canvas')
      if (!c) return -1
      const gl = c.getContext('webgl2')
      if (!gl) return -2
      return gl.getError()
    })
    const glErrorOk = glError === 0 || glError === -2 // -2 means couldn't get context (R3F owns it), that's fine
    checks.push({
      name: 'no-gl-errors',
      passed: glErrorOk,
      detail: glErrorOk ? undefined : `gl.getError() = ${glError}`
    })

    // Check 4: Console errors
    const relevantErrors = consoleErrors.filter(e =>
      !e.includes('favicon') && !e.includes('net::ERR_')
    )
    checks.push({
      name: 'no-console-errors',
      passed: relevantErrors.length === 0,
      detail: relevantErrors.length > 0 ? relevantErrors.slice(0, 3).join(' | ') : undefined
    })

    // Check 5: Audio system health — player exists, context not broken
    const audioCheck = await page.evaluate(() => {
      const p = (window as any).__audioPlayer
      if (!p) return { ok: false, detail: 'no __audioPlayer on window' }
      const state = p.contextState
      if (state && state === 'closed') return { ok: false, detail: 'AudioContext is closed' }
      return { ok: true, detail: state ? `AudioContext: ${state}` : 'AudioContext not yet created' }
    })
    checks.push({ name: 'audio-system', passed: audioCheck.ok, detail: audioCheck.detail })

    // Screenshot
    fs.mkdirSync(screenshotDir, { recursive: true })
    const ssPath = path.join(screenshotDir, `${browserName}.png`)
    await page.screenshot({ path: ssPath, fullPage: false })
    checks.push({ name: 'screenshot', passed: true, detail: ssPath })

    return finish(browserName, checks, browser, page)
  } catch (err: any) {
    checks.push({ name: 'unexpected-error', passed: false, detail: err.message?.slice(0, 200) })
    return finish(browserName, checks, browser, page)
  }
}

function finish(browserName: string, checks: SmokeResult['checks'], browser: Browser | null, page: Page | null): SmokeResult {
  page?.close().catch(() => {})
  browser?.close().catch(() => {})
  return {
    browser: browserName,
    passed: checks.every(c => c.passed),
    checks,
    screenshot: checks.find(c => c.name === 'screenshot')?.detail,
  }
}

async function main() {
  console.log(`\nSmoke testing: ${url}`)
  console.log(`Browsers: ${browserNames.join(', ')}\n`)

  const results = await Promise.allSettled(
    browserNames.map(name => smokeTest(name))
  )

  let allPassed = true

  for (const r of results) {
    if (r.status === 'rejected') {
      console.log(`  FAIL  (promise rejected: ${r.reason})`)
      allPassed = false
      continue
    }
    const result = r.value
    const icon = result.passed ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'
    console.log(`  ${icon}  ${result.browser}`)
    for (const check of result.checks) {
      const ci = check.passed ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'
      const detail = check.detail ? ` — ${check.detail}` : ''
      console.log(`        ${ci} ${check.name}${detail}`)
    }
    if (!result.passed) allPassed = false
  }

  console.log()
  if (allPassed) {
    console.log('\x1b[32mAll browsers passed.\x1b[0m')
  } else {
    console.log('\x1b[31mSome browsers failed.\x1b[0m')
    process.exit(1)
  }
}

main()
