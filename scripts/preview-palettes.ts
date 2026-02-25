import * as palette from '../template/src/palette'

const enemyCount = parseInt(process.argv[2] || '3')
const target = 8

console.log(`\nGenerating ${target} high-contrast palettes (${enemyCount} enemies each):\n`)

const results: palette.Palette[] = []
let seed = 0.5
while (results.length < target && seed < 10000) {
  const p = palette.generateValid(seed, enemyCount)
  if (p) {
    results.push(p)
    seed = p.seed + 10
  } else {
    seed += 300
  }
}

for (let i = 0; i < results.length; i++) {
  console.log(`  [${i + 1}]`)
  console.log(palette.preview(results[i]))
  console.log()
}

console.log(`Pick a number (1-${results.length}):`)
