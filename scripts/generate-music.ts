import "dotenv/config"
import * as fs from "fs"
import * as path from "path"
import { execSync } from "child_process"

const FAL_KEY = process.env.FALAI_API_KEY
const FAL_BASE = "https://queue.fal.run/fal-ai/ace-step/prompt-to-audio"
const LOOP_OVERLAP = 3
const POLL_INTERVAL = 3_000
const POLL_TIMEOUT = 300_000
const DEFAULT_DURATION = 120
const STING_DURATION = 15

interface MusicEntry {
  phase: string
  slug: string
  prompt: string
  loop: boolean
  duration: number
}

function parseSopMusic(sopPath: string): MusicEntry[] {
  const sop = fs.readFileSync(sopPath, "utf-8")

  const musicIdx = sop.indexOf("**Music direction**")
  if (musicIdx === -1) throw new Error("No 'Music direction' section in SOP")

  const after = sop.slice(musicIdx)
  const blockStart = after.indexOf("```")
  if (blockStart === -1) throw new Error("No code block in Music direction section")
  const blockEnd = after.indexOf("```", blockStart + 3)
  if (blockEnd === -1) throw new Error("Unterminated code block in Music direction")

  const block = after.slice(blockStart + 3, blockEnd)
  const lines = block
    .split("\n")
    .map(l => l.replace(/^>\s*/, "").trim())
    .filter(Boolean)

  const stingPattern = /victory|defeat|death|game.over|sting/i
  const entries: MusicEntry[] = []

  for (const line of lines) {
    const match = line.match(/^([^:]+):\s+(.+)$/)
    if (!match) continue

    const [, rawPhase, rawPrompt] = match
    const prompt = rawPrompt.trim()
    if (prompt.startsWith("(e.g.") || !prompt) continue

    const phase = rawPhase.trim()
    const slug = phase
      .replace(/\s*\([^)]*\)\s*/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")

    entries.push({
      phase,
      slug,
      prompt,
      loop: !stingPattern.test(phase),
      duration: stingPattern.test(phase) ? STING_DURATION : DEFAULT_DURATION,
    })
  }

  if (entries.length === 0) throw new Error("No music entries found — are the prompts filled in?")
  return entries
}

const falHeaders = { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" }

async function generate(entry: MusicEntry): Promise<string> {
  console.log(`  Submitting to fal.ai...`)
  const submit = await fetch(FAL_BASE, {
    method: "POST",
    headers: falHeaders,
    body: JSON.stringify({
      prompt: entry.prompt,
      instrumental: true,
      duration: entry.duration,
    }),
  })

  if (!submit.ok) throw new Error(`fal.ai submit failed: ${submit.status} ${await submit.text()}`)
  const { request_id, status_url, response_url } = (await submit.json()) as any
  console.log(`  Request: ${request_id}`)

  const start = Date.now()
  while (Date.now() - start < POLL_TIMEOUT) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL))
    const s = await fetch(status_url, { headers: falHeaders })
    const st = (await s.json()) as any

    if (st.status === "COMPLETED") {
      const result = await fetch(response_url, { headers: falHeaders })
      const data = (await result.json()) as any
      const url = data.audio?.url
      if (!url) throw new Error(`No audio URL in response: ${JSON.stringify(data)}`)
      return url
    }
    if (st.status === "FAILED") throw new Error(`Generation failed: ${JSON.stringify(st)}`)

    process.stdout.write(`  ${st.status.toLowerCase()}...\r`)
  }
  throw new Error("Timed out waiting for generation")
}

async function download(url: string, dest: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed: ${res.status}`)
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
  const kb = (fs.statSync(dest).size / 1024).toFixed(0)
  console.log(`  Downloaded (${kb} KB)`)
}

function ffprobe(filePath: string): number {
  const out = execSync(
    `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${filePath}"`,
    { encoding: "utf-8" },
  )
  return parseFloat(out.trim())
}

function crossfadeLoop(input: string, output: string) {
  const dur = ffprobe(input)
  if (dur <= LOOP_OVERLAP * 2) {
    console.log(`  Too short for crossfade (${dur.toFixed(1)}s), skipping`)
    fs.copyFileSync(input, output)
    return
  }

  const bodyDur = dur - LOOP_OVERLAP
  const fadeStart = bodyDur - LOOP_OVERLAP

  execSync(
    `ffmpeg -y -i "${input}" -filter_complex ` +
      `"[0]atrim=end=${bodyDur},afade=t=out:st=${fadeStart}:d=${LOOP_OVERLAP}[body];` +
      `[0]atrim=start=${bodyDur},afade=t=in:d=${LOOP_OVERLAP},asetpts=PTS-STARTPTS[tail];` +
      `[body][tail]amix=inputs=2:duration=first:normalize=0" ` +
      `"${output}"`,
    { stdio: "pipe" },
  )
  console.log(`  Crossfade: ${dur.toFixed(1)}s → ${bodyDur.toFixed(1)}s`)
}

function toOgg(input: string, output: string) {
  execSync(
    `ffmpeg -y -i "${input}" -af loudnorm=I=-16:TP=-1.5:LRA=11 -c:a libopus -b:a 128k "${output}"`,
    { stdio: "pipe" },
  )
  const kb = (fs.statSync(output).size / 1024).toFixed(0)
  console.log(`  → ${path.basename(output)} (${kb} KB)`)
}

async function processTrack(entry: MusicEntry, outDir: string, tmpDir: string) {
  console.log(`\n=== ${entry.phase} (${entry.loop ? "loop" : "sting"}, ${entry.duration}s) ===`)
  console.log(`  Prompt: "${entry.prompt}"`)

  const audioUrl = await generate(entry)

  const rawPath = path.join(tmpDir, `${entry.slug}-raw.wav`)
  await download(audioUrl, rawPath)

  const oggPath = path.join(outDir, `${entry.slug}.ogg`)

  if (entry.loop) {
    const loopedPath = path.join(tmpDir, `${entry.slug}-looped.wav`)
    crossfadeLoop(rawPath, loopedPath)
    toOgg(loopedPath, oggPath)
  } else {
    toOgg(rawPath, oggPath)
  }
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes("--dry-run")
  const slug = args.find(a => !a.startsWith("--"))

  if (!slug) {
    console.error("Usage: npx tsx scripts/generate-music.ts <slug> [--dry-run]")
    process.exit(1)
  }

  if (!dryRun && !FAL_KEY) {
    console.error("FALAI_API_KEY not set in .env")
    process.exit(1)
  }

  const gameDir = path.resolve("games", slug)
  const sopPath = path.join(gameDir, "SOP.md")
  if (!fs.existsSync(sopPath)) {
    console.error(`No SOP at ${sopPath}`)
    process.exit(1)
  }

  const entries = parseSopMusic(sopPath)
  console.log(`Found ${entries.length} tracks:`)
  for (const e of entries) {
    console.log(`  ${e.slug}.ogg (${e.loop ? "loop" : "sting"}, ${e.duration}s) — ${e.prompt}`)
  }

  if (dryRun) {
    console.log("\n--dry-run: stopping before generation")
    return
  }

  const outDir = path.join(gameDir, "static/audio/music")
  const tmpDir = path.join(gameDir, ".tmp-music")
  fs.mkdirSync(outDir, { recursive: true })
  fs.mkdirSync(tmpDir, { recursive: true })

  for (const entry of entries) {
    await processTrack(entry, outDir, tmpDir)
  }

  fs.rmSync(tmpDir, { recursive: true, force: true })

  console.log(`\nDone! Output: ${outDir}/`)
  for (const e of entries) console.log(`  ${e.slug}.ogg`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
