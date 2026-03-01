import "dotenv/config"
import * as fs from "fs"
import * as path from "path"

const API_BASE = "https://api.meshy.ai/openapi"
const API_KEY = process.env.MESHY_API_KEY
if (!API_KEY) throw new Error("MESHY_API_KEY not set")

const headers = {
  Authorization: `Bearer ${API_KEY}`,
  "Content-Type": "application/json",
}

async function api(method: string, endpoint: string, body?: unknown) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`${method} ${endpoint}: ${res.status} ${await res.text()}`)
  return res.json()
}

async function poll(endpoint: string, intervalMs = 10_000, maxMs = 300_000): Promise<any> {
  const start = Date.now()
  while (Date.now() - start < maxMs) {
    const task = await api("GET", endpoint)
    if (task.status === "SUCCEEDED") return task
    if (task.status === "FAILED") throw new Error(`Task failed: ${task.task_error}`)
    process.stdout.write(`  ${task.progress ?? 0}%\r`)
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

async function generateAndRig(entry: MeshEntry, outDir: string) {
  const { name, prompt } = entry
  const polycount = entry.targetPolycount ?? POLY_BUDGET.enemy
  console.log(`\n=== ${name} (character, ${polycount} polys) ===`)

  console.log(`[1/3] Generating mesh...`)
  const genResult = await api("POST", "/v2/text-to-3d", {
    mode: "preview",
    prompt,
    model_type: "lowpoly",
    should_remesh: true,
    target_polycount: polycount,
    topology: "triangle",
  })
  const genId = genResult.result
  console.log(`  Task: ${genId}`)
  const genTask = await poll(`/v2/text-to-3d/${genId}`)
  console.log(`  Done (${((genTask.finished_at - genTask.started_at) / 1000).toFixed(0)}s)`)

  const meshPath = path.join(outDir, `${name}.glb`)
  const meshSize = await download(genTask.model_urls.glb, meshPath)
  console.log(`  Mesh: ${(meshSize / 1024).toFixed(0)} KB`)

  if (genTask.thumbnail_url) {
    await download(genTask.thumbnail_url, path.join(outDir, `${name}-preview.png`))
  }

  console.log(`[2/3] Rigging...`)
  try {
    const rigResult = await api("POST", "/v1/rigging", {
      input_task_id: genId,
      height_meters: 1.7,
    })
    const rigId = rigResult.result
    const rigTask = await poll(`/v1/rigging/${rigId}`)
    console.log(`  Done (${((rigTask.finished_at - rigTask.started_at) / 1000).toFixed(0)}s)`)

    console.log(`[3/3] Downloading animations...`)
    const assets = rigTask.result

    const riggedSize = await download(assets.rigged_character_glb_url, path.join(outDir, `${name}-rigged.glb`))
    console.log(`  Rigged: ${(riggedSize / 1024).toFixed(0)} KB`)

    if (assets.basic_animations?.walking_glb_url) {
      const s = await download(assets.basic_animations.walking_glb_url, path.join(outDir, `${name}-walk.glb`))
      console.log(`  Walk: ${(s / 1024).toFixed(0)} KB`)
    }

    if (assets.basic_animations?.running_glb_url) {
      const s = await download(assets.basic_animations.running_glb_url, path.join(outDir, `${name}-run.glb`))
      console.log(`  Run: ${(s / 1024).toFixed(0)} KB`)
    }

    return { name, genId, rigId, type: "character" as const }
  } catch (e: any) {
    console.error(`  Rigging failed: ${e.message}`)
    const rejectDir = path.join(outDir, "rejected")
    fs.mkdirSync(rejectDir, { recursive: true })
    const src = meshPath
    const dest = path.join(rejectDir, `${name}.glb`)
    fs.renameSync(src, dest)
    const previewSrc = path.join(outDir, `${name}-preview.png`)
    if (fs.existsSync(previewSrc)) fs.renameSync(previewSrc, path.join(rejectDir, `${name}-preview.png`))
    console.log(`  Moved to rejected/: ${name}.glb`)
    return { name, genId, rigId: null, type: "character" as const, rejected: true }
  }
}

async function generateStatic(entry: MeshEntry, outDir: string) {
  const { name, prompt } = entry
  const polycount = entry.targetPolycount ?? POLY_BUDGET.prop
  console.log(`\n=== ${name} (prop, ${polycount} polys) ===`)

  console.log(`[1/1] Generating mesh...`)
  const genResult = await api("POST", "/v2/text-to-3d", {
    mode: "preview",
    prompt,
    model_type: "lowpoly",
    should_remesh: true,
    target_polycount: polycount,
    topology: "triangle",
  })
  const genId = genResult.result
  console.log(`  Task: ${genId}`)
  const genTask = await poll(`/v2/text-to-3d/${genId}`)
  console.log(`  Done (${((genTask.finished_at - genTask.started_at) / 1000).toFixed(0)}s)`)

  const meshPath = path.join(outDir, `${name}.glb`)
  const meshSize = await download(genTask.model_urls.glb, meshPath)
  console.log(`  Mesh: ${(meshSize / 1024).toFixed(0)} KB`)

  if (genTask.thumbnail_url) {
    await download(genTask.thumbnail_url, path.join(outDir, `${name}-preview.png`))
  }

  return { name, genId, type: "prop" as const }
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
    console.error('    "characters": [{"name": "goblin", "prompt": "Low poly goblin, T-pose, game character", "role": "Fast melee swarm enemy"}],')
    console.error('    "props": [{"name": "barrel", "prompt": "Wooden barrel, simple, game prop", "role": "Destructible container"}]')
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

  const rigCredits = noRig ? 0 : 5
  const charCredits = characters.length * (20 + rigCredits)
  const propCredits = props.length * 20
  const totalCredits = charCredits + propCredits

  console.log(`Generating meshes for ${slug}${noRig ? " (no rigging)" : ""}`)
  console.log(`  Characters: ${characters.length} (${charCredits} credits — 20 gen${noRig ? "" : " + 5 rig"} each)`)
  console.log(`  Props:      ${props.length} (${propCredits} credits — 20 gen each, no rig)`)
  console.log(`  Total:      ${totalCredits} credits`)
  console.log(`  Output:     ${outDir}`)

  const balanceRes = await api("GET", "/v1/balance")
  console.log(`  Balance:    ${balanceRes.balance} credits`)

  if (balanceRes.balance < totalCredits) {
    console.error(`\nInsufficient credits: need ~${totalCredits}, have ${balanceRes.balance}`)
    process.exit(1)
  }

  const results = []

  for (const entry of characters) {
    const mode = entry.animationMode ?? "humanoid"
    if (noRig || mode !== "humanoid") {
      const result = await generateStatic(entry, outDir)
      results.push({ ...result, type: "character" as const, animationMode: mode })
    } else {
      const result = await generateAndRig(entry, outDir)
      results.push(result)
    }
  }

  for (const entry of props) {
    const result = await generateStatic(entry, outDir)
    results.push(result)
  }

  const resultsPath = path.join(gameDir, "mesh-results.json")
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2))
  console.log(`\nResults: ${resultsPath}`)
  console.log(`Done: ${results.length}/${characters.length + props.length} meshes`)
}

main().catch(e => {
  console.error(e.message)
  process.exit(1)
})
