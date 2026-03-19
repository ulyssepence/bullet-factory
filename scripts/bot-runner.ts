// Headless bot runner for balance tuning
// Usage: npx tsx scripts/bot-runner.ts <slug>

const args = process.argv.slice(2)
const slug = args.find(a => !a.startsWith('--'))
const enableModifiers = args.includes('--modifiers')
const stationaryMode = args.includes('--stationary')
if (!slug) {
  console.error('Usage: npx tsx scripts/bot-runner.ts <slug> [--modifiers] [--stationary]')
  process.exit(1)
}

// Mock browser globals before any game imports
const _storage = new Map<string, string>()
globalThis.localStorage = { getItem: (k: string) => _storage.get(k) ?? null, setItem: (k: string, v: string) => { _storage.set(k, v) }, removeItem: (k: string) => { _storage.delete(k) } } as any
globalThis.window = { addEventListener: () => {}, removeEventListener: () => {}, localStorage: globalThis.localStorage } as any
globalThis.document = { addEventListener: () => {}, createElement: () => ({ getContext: () => null, style: {}, offsetHeight: 0 }), body: { appendChild: () => {} } } as any
globalThis.AudioContext = class {
  createBufferSource() { return { connect: () => ({ connect: () => {} }), start: () => {}, stop: () => {}, buffer: null, loop: false } }
  createGain() { return { gain: { value: 1 }, connect: () => ({ connect: () => {} }) } }
  get currentTime() { return 0 }
  get destination() { return {} }
  decodeAudioData() { return Promise.resolve({}) }
} as any

if (enableModifiers) {
  const specMod = await import(`../games/${slug}/src/spec`)
  const modIds = (specMod.spec ?? specMod.default?.spec)?.metaProgression?.difficultyModifiers?.map((m: any) => m.id) ?? []
  _storage.set('meta', JSON.stringify({ currency: 0, upgradeRanks: {}, unlockIds: [], firstClear: false, activeModifiers: modIds }))
}

const { gameStore, restart, tick } = await import(`../games/${slug}/src/store`)
const input = await import(`../games/${slug}/src/input`)
const progression = await import(`../games/${slug}/src/progression`)
const objects = await import(`../games/${slug}/src/objects`)

const DT = 1 / 60
const MAX_TICKS = stationaryMode ? 7_200 : 36_000
const NUM_RUNS = stationaryMode ? 3 : 10
const PASS_THRESHOLD = 0.8

interface RunStats {
  survived: boolean
  timeOfDeath: number
  minHealthPercent: number
  levelAt120s: number
  peakEnemyCount: number
  peakTickMs: number
}

function runBot(): RunStats {
  restart()
  input.setTouchMovement(0, 0)

  let minHealthPercent = 1
  let levelAt120s = 1
  let peakEnemyCount = 0
  let peakTickMs = 0

  let moveDirX = 0, moveDirZ = 0
  let moveTimer = 0

  for (let i = 0; i < MAX_TICKS; i++) {
    const state = gameStore.getState()

    if (state.progression.pendingChoices) {
      progression.applyChoice(state, 0, gameStore)
      continue
    }

    if (state.shrineActive) {
      const lastIdx = state.shrineActive.choices.length - 1
      objects.applyShrineChoice(state, lastIdx, gameStore)
      continue
    }

    if (state.gameOver || state.won) {
      return {
        survived: state.won || !state.gameOver,
        timeOfDeath: state.run.elapsed,
        minHealthPercent,
        levelAt120s,
        peakEnemyCount,
        peakTickMs,
      }
    }

    if (!stationaryMode) {
      moveTimer -= DT
      if (moveTimer <= 0) {
        const angle = Math.random() * Math.PI * 2
        moveDirX = Math.cos(angle)
        moveDirZ = Math.sin(angle)
        moveTimer = 1 + Math.random() * 2
      }
      input.setTouchMovement(moveDirX, moveDirZ)
    }

    const t0 = performance.now()
    tick(DT)
    const elapsed = performance.now() - t0

    const postState = gameStore.getState()
    peakTickMs = Math.max(peakTickMs, elapsed)
    peakEnemyCount = Math.max(peakEnemyCount, postState.enemies.size)
    const hp = postState.player.maxHealth > 0
      ? postState.player.health / postState.player.maxHealth
      : 0
    minHealthPercent = Math.min(minHealthPercent, hp)
    if (Math.abs(postState.run.elapsed - 120) < DT * 1.5) {
      levelAt120s = postState.player.level
    }
  }

  const final = gameStore.getState()
  return {
    survived: !final.gameOver,
    timeOfDeath: final.run.elapsed,
    minHealthPercent,
    levelAt120s,
    peakEnemyCount,
    peakTickMs,
  }
}

const results: RunStats[] = []

for (let r = 0; r < NUM_RUNS; r++) {
  const stats = runBot()
  results.push(stats)
  const status = stats.survived ? 'SURVIVED' : `DIED@${stats.timeOfDeath.toFixed(1)}s`
  console.log(
    `Run ${r + 1}: ${status}  minHP=${(stats.minHealthPercent * 100).toFixed(0)}%  ` +
    `lvl@120s=${stats.levelAt120s}  enemies=${stats.peakEnemyCount}  tick=${stats.peakTickMs.toFixed(2)}ms`
  )
}

if (stationaryMode) {
  console.log('\n--- Stationary Check ---')
  const allDied = results.every(r => !r.survived)
  console.log(`  ${allDied ? 'PASS' : 'FAIL'}  player dies when stationary: ${results.filter(r => !r.survived).length}/${NUM_RUNS}`)
  if (!allDied) {
    console.log('         → Increase enemy damage or contact damage')
  }
  process.exit(allDied ? 0 : 1)
}

console.log('\n--- Balance Checks ---')

const checks: { name: string; test: (s: RunStats) => boolean; fix: string; skipModifiers?: boolean }[] = [
  { name: 'survive >30s',     test: s => s.timeOfDeath > 30,      fix: 'Increase player.maxHealth or decrease enemy damage' },
  { name: 'takes damage',     test: s => s.minHealthPercent < 0.8, fix: 'Increase enemy damage or spawn density' },
  { name: 'level ≥3 by 120s', test: s => s.levelAt120s >= 3,      fix: 'Decrease xpToNextBase or increase enemy xpValue', skipModifiers: true },
  { name: 'enemy cap <300',   test: s => s.peakEnemyCount < 300,  fix: 'Reduce wave counts or increase player damage' },
  { name: 'fps budget <16ms', test: s => s.peakTickMs < 16,       fix: 'Reduce enemy counts or simplify tick logic' },
]

let allPass = true
for (const check of checks) {
  if (enableModifiers && check.skipModifiers) {
    const passing = results.filter(r => check.test(r)).length
    console.log(`  SKIP  ${check.name}: ${passing}/${NUM_RUNS} (expected with modifiers)`)
    continue
  }
  const passing = results.filter(r => check.test(r)).length
  const ok = passing >= NUM_RUNS * PASS_THRESHOLD
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${check.name}: ${passing}/${NUM_RUNS}`)
  if (!ok) {
    console.log(`         → ${check.fix}`)
    allPass = false
  }
}

process.exit(allPass ? 0 : 1)
