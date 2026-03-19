import { execSync } from 'child_process'

const slug = process.argv[2]
if (!slug) {
  console.error('Usage: npx tsx scripts/regression.ts <slug>')
  process.exit(1)
}

const suites = [
  { name: 'bot-runner (default)', cmd: `npx tsx scripts/bot-runner.ts ${slug}` },
  { name: 'bot-runner (modifiers)', cmd: `npx tsx scripts/bot-runner.ts ${slug} --modifiers` },
  { name: 'bot-runner (stationary)', cmd: `npx tsx scripts/bot-runner.ts ${slug} --stationary` },
]

let allPassed = true

for (const suite of suites) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`  ${suite.name}`)
  console.log('='.repeat(60))
  try {
    execSync(suite.cmd, { stdio: 'inherit', timeout: 600_000 })
    console.log(`\n  ✓ ${suite.name} PASSED`)
  } catch {
    console.log(`\n  ✗ ${suite.name} FAILED`)
    allPassed = false
  }
}

console.log(`\n${'='.repeat(60)}`)
console.log(allPassed ? '  ALL SUITES PASSED' : '  SOME SUITES FAILED')
console.log('='.repeat(60))
process.exit(allPassed ? 0 : 1)
