import * as THREE from 'three'

interface Node {
  totalMs: number
  maxMs: number
  count: number
  children: Map<string, Node>
}

export interface ProfileData {
  frames: number
  render: { drawCalls: number, triangles: number } | null
  tree: ProfileNode[]
  spikes: SpikeEntry[]
}

export interface ProfileNode {
  key: string
  avgMs: number
  maxMs: number
  pct: number
  children: ProfileNode[]
}

export interface SpikeEntry {
  frameIndex: number
  totalMs: number
  tree: ProfileNode[]
}

const starts = new Map<string, number>()
let root: Node = mkNode()
let frameRoot: Node = mkNode()
let frameCount = 0
let totalFrames = 0
let flushStart = performance.now()
let gl: THREE.WebGLRenderer | null = null

const spikeBuffer: SpikeEntry[] = []
const SPIKE_LIMIT = 10

function mkNode(): Node {
  return { totalMs: 0, maxMs: 0, count: 0, children: new Map() }
}

function getNode(key: string, tree: Node): Node {
  const parts = key.split('.')
  let node = tree
  for (const part of parts) {
    let child = node.children.get(part)
    if (!child) {
      child = mkNode()
      node.children.set(part, child)
    }
    node = child
  }
  return node
}

export function start(key: string) {
  starts.set(key, performance.now())
}

export function stop(key: string) {
  const t0 = starts.get(key)
  if (t0 === undefined) return
  const delta = performance.now() - t0
  starts.delete(key)

  const node = getNode(key, root)
  node.totalMs += delta
  node.maxMs = Math.max(node.maxMs, delta)
  node.count++

  const fNode = getNode(key, frameRoot)
  fNode.totalMs += delta
  fNode.maxMs = Math.max(fNode.maxMs, delta)
  fNode.count++
}

export function renderer(r: THREE.WebGLRenderer) {
  gl = r
}

export function frame() {
  totalFrames++
  frameCount++

  const frameTotalMs = [...frameRoot.children.values()].reduce((s, n) => s + n.totalMs, 0)
  if (frameTotalMs > 16) {
    const entry: SpikeEntry = {
      frameIndex: totalFrames,
      totalMs: frameTotalMs,
      tree: toProfileNodes(frameRoot, 1),
    }
    if (spikeBuffer.length >= SPIKE_LIMIT) spikeBuffer.shift()
    spikeBuffer.push(entry)

    const lines = [`[profile:spike] frame ${totalFrames} — ${frameTotalMs.toFixed(1)}ms`]
    printNode(lines, frameRoot, '', 1, true)
    console.warn(lines.join('\n'))
  }

  frameRoot = mkNode()

  const elapsed = performance.now() - flushStart
  if (elapsed < 1000) return

  const fps = (frameCount / elapsed * 1000).toFixed(0)
  const lines: string[] = [`[profile] ${frameCount} frames in ${(elapsed / 1000).toFixed(1)}s (${fps} fps):`]
  printNode(lines, root, '', frameCount, true)

  let renderData: { drawCalls: number, triangles: number } | null = null
  if (gl) {
    const info = gl.info.render
    const tris = info.triangles > 1000
      ? `${(info.triangles / 1000).toFixed(1)}k`
      : String(info.triangles)
    lines.push(`render: ${info.calls} draw calls, ${tris} triangles`)
    renderData = { drawCalls: info.calls, triangles: info.triangles }
  }

  console.log(lines.join('\n'))

  ;(window as any).__PROFILE_DATA__ = {
    frames: frameCount,
    render: renderData,
    tree: toProfileNodes(root, frameCount),
    spikes: [...spikeBuffer],
  } satisfies ProfileData

  root = mkNode()
  frameCount = 0
  flushStart = performance.now()
}

function toProfileNodes(node: Node, frames: number): ProfileNode[] {
  const entries = [...node.children.entries()]
  const parentMs = entries.reduce((sum, [, n]) => sum + n.totalMs, 0)
  return entries.map(([name, child]) => ({
    key: name,
    avgMs: child.totalMs / frames,
    maxMs: child.maxMs,
    pct: parentMs > 0 ? (child.totalMs / parentMs) * 100 : 0,
    children: toProfileNodes(child, frames),
  }))
}

function printNode(lines: string[], node: Node, prefix: string, frames: number, isRoot: boolean) {
  const entries = [...node.children.entries()]
  const parentMs = isRoot
    ? entries.reduce((sum, [, n]) => sum + n.totalMs, 0)
    : node.totalMs

  for (let i = 0; i < entries.length; i++) {
    const [name, child] = entries[i]
    const last = i === entries.length - 1
    const avg = child.totalMs / frames
    const max = child.maxMs
    const pct = parentMs > 0 ? (child.totalMs / parentMs) * 100 : 0
    const connector = last ? '└─' : '├─'
    const line = `${prefix}${connector} ${name.padEnd(18)} avg ${avg.toFixed(1).padStart(5)}ms  max ${max.toFixed(1).padStart(5)}ms ${pct.toFixed(0).padStart(4)}%`
    lines.push(line)
    const childPrefix = prefix + (last ? '   ' : '│  ')
    if (child.children.size > 0) {
      printNode(lines, child, childPrefix, frames, false)
    }
  }
}
