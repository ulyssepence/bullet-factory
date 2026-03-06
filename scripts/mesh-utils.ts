import * as fs from "fs"

export interface TaskStateEntry {
  genTaskId: string | null
  rigTaskId: string | null
  status: "generating" | "rigging" | "done" | "failed"
}

export interface TaskState {
  [name: string]: TaskStateEntry
}

export interface EntryResult {
  name: string
  genId: string
  rigId?: string | null
  type: "character" | "prop"
  animationMode?: string
  rejected?: boolean
  outcome: "OK" | "FAIL" | "SKIP"
  error?: string
}

let writeLock = Promise.resolve()
export function serialWrite(fn: () => void) {
  writeLock = writeLock.then(fn)
  return writeLock
}

export function isValidGlb(filePath: string): boolean {
  if (!fs.existsSync(filePath)) return false
  const fd = fs.openSync(filePath, "r")
  const buf = Buffer.alloc(4)
  fs.readSync(fd, buf, 0, 4, 0)
  fs.closeSync(fd)
  return buf.toString("ascii") === "glTF"
}

export function loadState(statePath: string): TaskState {
  if (fs.existsSync(statePath)) return JSON.parse(fs.readFileSync(statePath, "utf8"))
  return {}
}

export function saveState(statePath: string, state: TaskState) {
  return serialWrite(() => fs.writeFileSync(statePath, JSON.stringify(state, null, 2)))
}

export function loadResults(resultsPath: string): EntryResult[] {
  if (fs.existsSync(resultsPath)) return JSON.parse(fs.readFileSync(resultsPath, "utf8"))
  return []
}

export function saveResults(resultsPath: string, results: EntryResult[]) {
  return serialWrite(() => fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2)))
}

export function appendAuditLog(auditPath: string, entry: EntryResult) {
  const line = [
    new Date().toISOString(),
    entry.name,
    entry.type,
    `gen=${entry.genId ?? "none"}`,
    `rig=${entry.rigId ?? "none"}`,
    entry.outcome,
    entry.error ?? "",
  ].join("\t")
  return serialWrite(() => fs.appendFileSync(auditPath, line + "\n"))
}
