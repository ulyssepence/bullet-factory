import "dotenv/config"
import * as fs from "fs"
import * as path from "path"
import { isValidGlb, loadState, saveState, loadResults, saveResults, appendAuditLog } from "./mesh-utils"
import type { TaskState, EntryResult } from "./mesh-utils"

const API_BASE = "https://api.meshy.ai/openapi"
const API_KEY = process.env.MESHY_API_KEY
if (!API_KEY) throw new Error("MESHY_API_KEY not set")

const headers = {
  Authorization: `Bearer ${API_KEY}`,
  "Content-Type": "application/json",
}

async function api(method: string, endpoint: string, body?: unknown) {
  const maxRetries = 3
  let delay = 2000
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })
    if (res.ok) return res.json()
    const status = res.status
    const text = await res.text()
    if ((status === 429 || status >= 500) && attempt < maxRetries) {
      console.log(`  [retry] ${method} ${endpoint}: ${status}, retrying in ${delay / 1000}s...`)
      await new Promise(r => setTimeout(r, delay))
      delay *= 2
      continue
    }
    throw new Error(`${method} ${endpoint}: ${status} ${text}`)
  }
  throw new Error("unreachable")
}

async function poll(endpoint: string, label: string, intervalMs = 10_000, maxMs = 300_000): Promise<any> {
  const start = Date.now()
  let lastLoggedPct = -1
  while (Date.now() - start < maxMs) {
    const task = await api("GET", endpoint)
    if (task.status === "SUCCEEDED") return task
    if (task.status === "FAILED") throw new Error(`Task failed: ${task.task_error}`)
    const pct = task.progress ?? 0
    const bucket = Math.floor(pct / 25) * 25
    if (bucket > lastLoggedPct) {
      console.log(`  [${label}] ${bucket}%`)
      lastLoggedPct = bucket
    }
    await new Promise(r => setTimeout(r, intervalMs))
  }
  throw new Error(`Timed out polling ${endpoint}`)
}

async function download(url: string, dest: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed: ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  fs.writeFileSync(dest, buf)
  return buf.length
}

interface MeshEntry {
  name: string
  prompt: string
  targetPolycount?: number
  role?: string
  animationMode?: "humanoid" | "procedural" | "static"
}

const POLY_BUDGET = {
  enemy: 1500,
  boss: 5000,
  player: 3000,
  prop: 500,
} as const

interface Manifest {
  style?: string
  characters: MeshEntry[]
  props: MeshEntry[]
}

async function processCharacter(
  entry: MeshEntry,
  outDir: string,
  noRig: boolean,
  state: TaskState,
  statePath: string,
): Promise<EntryResult> {
  const { name, prompt } = entry
  const mode = entry.animationMode ?? "humanoid"
  const needsRig = !noRig && mode === "humanoid"
  const polycount = entry.targetPolycount ?? POLY_BUDGET.enemy
  const meshPath = path.join(outDir, `${name}.glb`)
  const riggedPath = path.join(outDir, `${name}-rigged.glb`)
  const rejectedPath = path.join(outDir, "rejected", `${name}.glb`)
  const finalPath = needsRig ? riggedPath : meshPath

  if (isValidGlb(finalPath)) {
    console.log(`[${name}] SKIP — output exists`)
    return { name, genId: state[name]?.genTaskId ?? "unknown", rigId: state[name]?.rigTaskId, type: "character", animationMode: mode, outcome: "SKIP" }
  }
  if (fs.existsSync(rejectedPath)) {
    console.log(`[${name}] SKIP — in rejected/`)
    return { name, genId: state[name]?.genTaskId ?? "unknown", type: "character", animationMode: mode, outcome: "SKIP" }
  }

  console.log(`[${name}] character, ${polycount} polys${needsRig ? ", rigged" : ""}`)

  let genId = state[name]?.genTaskId ?? null
  if (!genId) {
    const genResult = await api("POST", "/v2/text-to-3d", {
      mode: "preview",
      prompt,
      model_type: "lowpoly",
      should_remesh: true,
      target_polycount: polycount,
      topology: "triangle",
    })
    genId = genResult.result
    state[name] = { genTaskId: genId, rigTaskId: null, status: "generating" }
    await saveState(statePath, state)
    console.log(`  [${name}] gen task: ${genId}`)
  } else {
    console.log(`  [${name}] resuming gen task: ${genId}`)
  }

  const genTask = await poll(`/v2/text-to-3d/${genId}`, name)
  console.log(`  [${name}] gen done (${((genTask.finished_at - genTask.started_at) / 1000).toFixed(0)}s)`)

  const meshSize = await download(genTask.model_urls.glb, meshPath)
  console.log(`  [${name}] mesh: ${(meshSize / 1024).toFixed(0)} KB`)

  if (genTask.thumbnail_url) {
    await download(genTask.thumbnail_url, path.join(outDir, `${name}-preview.png`))
  }

  if (!needsRig) {
    state[name] = { ...state[name]!, genTaskId: genId, rigTaskId: null, status: "done" }
    await saveState(statePath, state)
    return { name, genId, type: "character", animationMode: mode, outcome: "OK" }
  }

  let rigId = state[name]?.rigTaskId ?? null
  if (!rigId) {
    try {
      const rigResult = await api("POST", "/v1/rigging", {
        input_task_id: genId,
        height_meters: 1.7,
      })
      rigId = rigResult.result
      state[name] = { ...state[name]!, rigTaskId: rigId, status: "rigging" }
      await saveState(statePath, state)
      console.log(`  [${name}] rig task: ${rigId}`)
    } catch (e: any) {
      console.error(`  [${name}] rigging POST failed: ${e.message}`)
      moveToRejected(name, outDir)
      state[name] = { ...state[name]!, status: "failed" }
      await saveState(statePath, state)
      return { name, genId, rigId: null, type: "character", animationMode: mode, rejected: true, outcome: "FAIL", error: e.message }
    }
  } else {
    console.log(`  [${name}] resuming rig task: ${rigId}`)
  }

  try {
    const rigTask = await poll(`/v1/rigging/${rigId}`, name)
    console.log(`  [${name}] rig done (${((rigTask.finished_at - rigTask.started_at) / 1000).toFixed(0)}s)`)

    const assets = rigTask.result
    const riggedSize = await download(assets.rigged_character_glb_url, riggedPath)
    console.log(`  [${name}] rigged: ${(riggedSize / 1024).toFixed(0)} KB`)

    if (assets.basic_animations?.walking_glb_url) {
      const s = await download(assets.basic_animations.walking_glb_url, path.join(outDir, `${name}-walk.glb`))
      console.log(`  [${name}] walk: ${(s / 1024).toFixed(0)} KB`)
    }
    if (assets.basic_animations?.running_glb_url) {
      const s = await download(assets.basic_animations.running_glb_url, path.join(outDir, `${name}-run.glb`))
      console.log(`  [${name}] run: ${(s / 1024).toFixed(0)} KB`)
    }

    state[name] = { ...state[name]!, status: "done" }
    await saveState(statePath, state)
    return { name, genId, rigId, type: "character", animationMode: mode, outcome: "OK" }
  } catch (e: any) {
    console.error(`  [${name}] rigging failed: ${e.message}`)
    moveToRejected(name, outDir)
    state[name] = { ...state[name]!, status: "failed" }
    await saveState(statePath, state)
    return { name, genId, rigId, type: "character", animationMode: mode, rejected: true, outcome: "FAIL", error: e.message }
  }
}

async function processProp(
  entry: MeshEntry,
  outDir: string,
  state: TaskState,
  statePath: string,
): Promise<EntryResult> {
  const { name, prompt } = entry
  const polycount = entry.targetPolycount ?? POLY_BUDGET.prop
  const meshPath = path.join(outDir, `${name}.glb`)
  const rejectedPath = path.join(outDir, "rejected", `${name}.glb`)

  if (isValidGlb(meshPath)) {
    console.log(`[${name}] SKIP — output exists`)
    return { name, genId: state[name]?.genTaskId ?? "unknown", type: "prop", outcome: "SKIP" }
  }
  if (fs.existsSync(rejectedPath)) {
    console.log(`[${name}] SKIP — in rejected/`)
    return { name, genId: state[name]?.genTaskId ?? "unknown", type: "prop", outcome: "SKIP" }
  }

  console.log(`[${name}] prop, ${polycount} polys`)

  let genId = state[name]?.genTaskId ?? null
  if (!genId) {
    const genResult = await api("POST", "/v2/text-to-3d", {
      mode: "preview",
      prompt,
      model_type: "lowpoly",
      should_remesh: true,
      target_polycount: polycount,
      topology: "triangle",
    })
    genId = genResult.result
    state[name] = { genTaskId: genId, rigTaskId: null, status: "generating" }
    await saveState(statePath, state)
    console.log(`  [${name}] gen task: ${genId}`)
  } else {
    console.log(`  [${name}] resuming gen task: ${genId}`)
  }

  const genTask = await poll(`/v2/text-to-3d/${genId}`, name)
  console.log(`  [${name}] gen done (${((genTask.finished_at - genTask.started_at) / 1000).toFixed(0)}s)`)

  const meshSize = await download(genTask.model_urls.glb, meshPath)
  console.log(`  [${name}] mesh: ${(meshSize / 1024).toFixed(0)} KB`)

  if (genTask.thumbnail_url) {
    await download(genTask.thumbnail_url, path.join(outDir, `${name}-preview.png`))
  }

  state[name] = { ...state[name]!, status: "done" }
  await saveState(statePath, state)
  return { name, genId, type: "prop", outcome: "OK" }
}

function moveToRejected(name: string, outDir: string) {
  const rejectDir = path.join(outDir, "rejected")
  fs.mkdirSync(rejectDir, { recursive: true })
  const meshPath = path.join(outDir, `${name}.glb`)
  if (fs.existsSync(meshPath)) {
    fs.renameSync(meshPath, path.join(rejectDir, `${name}.glb`))
  }
  const previewPath = path.join(outDir, `${name}-preview.png`)
  if (fs.existsSync(previewPath)) {
    fs.renameSync(previewPath, path.join(rejectDir, `${name}-preview.png`))
  }
  console.log(`  [${name}] moved to rejected/`)
}

async function main() {
  const args = process.argv.slice(2)
  const noRig = args.includes("--no-rig")
  const positional = args.filter(a => !a.startsWith("--"))
  const slug = positional[0]
  if (!slug) {
    console.error("Usage: npx tsx scripts/generate-meshes.ts <slug> [manifest.json] [--no-rig]")
    console.error("")
    console.error("Options:")
    console.error("  --no-rig    Skip rigging for characters (saves 5 credits each, no animations)")
    console.error("")
    console.error("manifest.json format:")
    console.error('  {')
    console.error('    "characters": [{"name": "goblin", "prompt": "Low poly goblin, T-pose, game character", "role": "Fast melee swarm enemy", "animationMode": "humanoid"}],')
    console.error('    "props": [{"name": "barrel", "prompt": "Wooden barrel, simple, game prop", "role": "Destructible container"}]')
    console.error("")
    console.error("animationMode (characters only, default: humanoid):")
    console.error('  "humanoid"    — rig + walk/run animations (Mixamo skeleton, bipedal only)')
    console.error('  "procedural"  — static mesh, animate in code (bob, sway, pulse)')
    console.error('  "static"      — static mesh, no animation')
    console.error('  }')
    console.error("")
    console.error("If no manifest given, reads from games/<slug>/mesh-manifest.json")
    process.exit(1)
  }

  const gameDir = path.resolve("games", slug)
  if (!fs.existsSync(gameDir)) {
    console.error(`Game directory not found: ${gameDir}`)
    process.exit(1)
  }

  const manifestPath = positional[1] ?? path.join(gameDir, "mesh-manifest.json")
  if (!fs.existsSync(manifestPath)) {
    console.error(`Manifest not found: ${manifestPath}`)
    process.exit(1)
  }

  const manifest: Manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  const stylePrefix = manifest.style ? manifest.style.trim() + ', ' : ''
  const characters = (manifest.characters ?? []).map(e => ({ ...e, prompt: stylePrefix + e.prompt }))
  const props = (manifest.props ?? []).map(e => ({ ...e, prompt: stylePrefix + e.prompt }))
  const outDir = path.join(gameDir, "static", "models")
  fs.mkdirSync(outDir, { recursive: true })

  const charCredits = characters.reduce((sum, e) => {
    const rigged = !noRig && (e.animationMode ?? "humanoid") === "humanoid"
    return sum + 20 + (rigged ? 5 : 0)
  }, 0)
  const propCredits = props.length * 20
  const totalCredits = charCredits + propCredits

  const riggedCount = noRig ? 0 : characters.filter(e => (e.animationMode ?? "humanoid") === "humanoid").length
  console.log(`Generating meshes for ${slug}${noRig ? " (no rigging)" : ""}`)
  console.log(`  Characters: ${characters.length} (${riggedCount} rigged, ${characters.length - riggedCount} static) — ${charCredits} credits`)
  console.log(`  Props:      ${props.length} — ${propCredits} credits`)
  console.log(`  Total:      ${totalCredits} credits (max, before skips)`)
  console.log(`  Output:     ${outDir}`)

  const balanceBefore = await api("GET", "/v1/balance")
  console.log(`  Balance:    ${balanceBefore.balance} credits`)

  if (balanceBefore.balance < totalCredits) {
    console.error(`\nInsufficient credits: need ~${totalCredits}, have ${balanceBefore.balance}`)
    process.exit(1)
  }

  const statePath = path.join(gameDir, "mesh-state.json")
  const resultsPath = path.join(gameDir, "mesh-results.json")
  const auditPath = path.join(gameDir, "mesh-audit.log")
  const state = loadState(statePath)
  const existingResults = loadResults(resultsPath)

  const allEntries: Array<{ entry: MeshEntry; kind: "character" | "prop" }> = [
    ...characters.map(e => ({ entry: e, kind: "character" as const })),
    ...props.map(e => ({ entry: e, kind: "prop" as const })),
  ]

  console.log(`\nStarting ${allEntries.length} entries in parallel...\n`)

  const settled = await Promise.allSettled(
    allEntries.map(async ({ entry, kind }) => {
      try {
        const result = kind === "character"
          ? await processCharacter(entry, outDir, noRig, state, statePath)
          : await processProp(entry, outDir, state, statePath)

        const merged = existingResults.filter(r => r.name !== result.name)
        merged.push(result)
        await saveResults(resultsPath, merged)
        existingResults.splice(0, existingResults.length, ...merged)

        await appendAuditLog(auditPath, result)
        return result
      } catch (e: any) {
        const result: EntryResult = {
          name: entry.name,
          genId: state[entry.name]?.genTaskId ?? "unknown",
          type: kind,
          outcome: "FAIL",
          error: e.message,
        }
        await appendAuditLog(auditPath, result)
        console.error(`[${entry.name}] FAILED: ${e.message}`)
        return result
      }
    }),
  )

  const results = settled.map(s => s.status === "fulfilled" ? s.value : null).filter(Boolean) as EntryResult[]
  const ok = results.filter(r => r.outcome === "OK")
  const skipped = results.filter(r => r.outcome === "SKIP")
  const failed = results.filter(r => r.outcome === "FAIL")

  const balanceAfter = await api("GET", "/v1/balance")
  const spent = balanceBefore.balance - balanceAfter.balance

  console.log(`\n=== Results ===`)
  for (const r of results) {
    const detail = r.outcome === "FAIL" ? `: ${r.error}` : ""
    const typeInfo = r.type === "character" ? `character${r.animationMode === "humanoid" ? ", rigged" : ""}` : "prop"
    const pad = r.outcome.padEnd(4)
    console.log(`  ${pad}  ${r.name} (${typeInfo})${detail}`)
  }
  console.log(`${ok.length}/${allEntries.length} generated, ${skipped.length} skipped, ${failed.length} failed`)
  console.log(`Spent: ~${spent} credits (${balanceAfter.balance} remaining)`)
}

main().catch(e => {
  console.error(e.message)
  process.exit(1)
})
