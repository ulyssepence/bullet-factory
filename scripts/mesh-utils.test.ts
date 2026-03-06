import * as assert from "node:assert/strict"
import * as fs from "fs"
import * as path from "path"
import * as os from "os"
import { isValidGlb, loadState, saveState, loadResults, saveResults, appendAuditLog } from "./mesh-utils"
import type { TaskState, EntryResult } from "./mesh-utils"

let tmpDir: string

function setup() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mesh-test-"))
}

function teardown() {
  fs.rmSync(tmpDir, { recursive: true, force: true })
}

async function test(name: string, fn: () => Promise<void> | void) {
  setup()
  try {
    await fn()
    console.log(`  PASS  ${name}`)
  } catch (e: any) {
    console.error(`  FAIL  ${name}`)
    console.error(`        ${e.message}`)
    process.exitCode = 1
  } finally {
    teardown()
  }
}

async function run() {
  console.log("mesh-utils tests\n")

  await test("isValidGlb returns true for valid GLB", () => {
    const p = path.join(tmpDir, "valid.glb")
    const buf = Buffer.alloc(12)
    buf.write("glTF", 0, "ascii")
    fs.writeFileSync(p, buf)
    assert.equal(isValidGlb(p), true)
  })

  await test("isValidGlb returns false for non-GLB file", () => {
    const p = path.join(tmpDir, "invalid.glb")
    fs.writeFileSync(p, "not a glb file")
    assert.equal(isValidGlb(p), false)
  })

  await test("isValidGlb returns false for missing file", () => {
    assert.equal(isValidGlb(path.join(tmpDir, "nope.glb")), false)
  })

  await test("isValidGlb returns false for empty file", () => {
    const p = path.join(tmpDir, "empty.glb")
    fs.writeFileSync(p, "")
    assert.equal(isValidGlb(p), false)
  })

  await test("isValidGlb returns false for 3-byte file", () => {
    const p = path.join(tmpDir, "short.glb")
    fs.writeFileSync(p, "glT")
    assert.equal(isValidGlb(p), false)
  })

  await test("loadState returns empty object for missing file", () => {
    const state = loadState(path.join(tmpDir, "missing.json"))
    assert.deepEqual(state, {})
  })

  await test("saveState + loadState roundtrip", async () => {
    const p = path.join(tmpDir, "state.json")
    const state: TaskState = {
      goblin: { genTaskId: "abc", rigTaskId: "def", status: "done" },
      orc: { genTaskId: "ghi", rigTaskId: null, status: "generating" },
    }
    await saveState(p, state)
    const loaded = loadState(p)
    assert.deepEqual(loaded, state)
  })

  await test("saveState overwrites previous state", async () => {
    const p = path.join(tmpDir, "state2.json")
    await saveState(p, { a: { genTaskId: "1", rigTaskId: null, status: "generating" } })
    await saveState(p, { b: { genTaskId: "2", rigTaskId: null, status: "done" } })
    const loaded = loadState(p)
    assert.equal(loaded.a, undefined)
    assert.equal(loaded.b!.genTaskId, "2")
  })

  await test("loadResults returns empty array for missing file", () => {
    assert.deepEqual(loadResults(path.join(tmpDir, "nope.json")), [])
  })

  await test("saveResults + loadResults roundtrip", async () => {
    const p = path.join(tmpDir, "results.json")
    const results: EntryResult[] = [
      { name: "goblin", genId: "abc", type: "character", outcome: "OK" },
      { name: "barrel", genId: "def", type: "prop", outcome: "SKIP" },
    ]
    await saveResults(p, results)
    const loaded = loadResults(p)
    assert.deepEqual(loaded, results)
  })

  await test("appendAuditLog creates file and appends lines", async () => {
    const p = path.join(tmpDir, "audit.log")
    const entry1: EntryResult = { name: "goblin", genId: "abc", rigId: "def", type: "character", outcome: "OK" }
    const entry2: EntryResult = { name: "orc", genId: "ghi", type: "character", outcome: "FAIL", error: "timeout" }
    await appendAuditLog(p, entry1)
    await appendAuditLog(p, entry2)
    const lines = fs.readFileSync(p, "utf8").trim().split("\n")
    assert.equal(lines.length, 2)
    assert.ok(lines[0].includes("goblin"))
    assert.ok(lines[0].includes("gen=abc"))
    assert.ok(lines[0].includes("rig=def"))
    assert.ok(lines[0].includes("OK"))
    assert.ok(lines[1].includes("orc"))
    assert.ok(lines[1].includes("FAIL"))
    assert.ok(lines[1].includes("timeout"))
  })

  await test("serialWrite preserves order under concurrent calls", async () => {
    const p = path.join(tmpDir, "serial.json")
    const state: TaskState = {}
    const promises: Promise<void>[] = []
    for (let i = 0; i < 10; i++) {
      state[`entry${i}`] = { genTaskId: `id${i}`, rigTaskId: null, status: "done" }
      promises.push(saveState(p, { ...state }))
    }
    await Promise.all(promises)
    const final = loadState(p)
    assert.equal(Object.keys(final).length, 10)
    for (let i = 0; i < 10; i++) {
      assert.equal(final[`entry${i}`]!.genTaskId, `id${i}`)
    }
  })

  await test("incremental results merge pattern", async () => {
    const p = path.join(tmpDir, "results-merge.json")
    const existing: EntryResult[] = [
      { name: "goblin", genId: "old", type: "character", outcome: "OK" },
    ]
    await saveResults(p, existing)

    const newResult: EntryResult = { name: "goblin", genId: "new", type: "character", outcome: "SKIP" }
    const loaded = loadResults(p)
    const merged = loaded.filter(r => r.name !== newResult.name)
    merged.push(newResult)
    await saveResults(p, merged)

    const final = loadResults(p)
    assert.equal(final.length, 1)
    assert.equal(final[0].genId, "new")
    assert.equal(final[0].outcome, "SKIP")
  })

  console.log("")
}

run()
