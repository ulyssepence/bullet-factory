import * as grid from './grid'

export interface NavigationConfig {
  maxFlowDepth: number
  flowRecomputeDist: number
  losRange: number
}

export interface NavigationState {
  flowDirs: Int8Array
  flowGen: Uint32Array
  flowCost: Float32Array
  flowGeneration: number
  lastFlowCell: [number, number]
  worldSize: number
  speedGrid?: Float32Array
}

export function createNavigationState(worldSize: number, _bfsMax?: number): NavigationState {
  const cells = worldSize * worldSize
  return {
    flowDirs: new Int8Array(cells * 2),
    flowGen: new Uint32Array(cells),
    flowCost: new Float32Array(cells),
    flowGeneration: 0,
    lastFlowCell: [-999, -999],
    worldSize,
  }
}

const NDX = [-1, 1, 0, 0]
const NDZ = [0, 0, -1, 1]

export function recomputeFlow(
  nav: NavigationState,
  playerPos: [number, number, number],
  levelGrid: Uint8Array,
  config: NavigationConfig,
): void {
  const px = Math.floor(playerPos[0])
  const pz = Math.floor(playerPos[2])
  if (Math.abs(px - nav.lastFlowCell[0]) < config.flowRecomputeDist &&
      Math.abs(pz - nav.lastFlowCell[1]) < config.flowRecomputeDist) return
  nav.lastFlowCell = [px, pz]
  nav.flowGeneration++

  const ws = nav.worldSize
  const startIdx = grid.gridIdx(px, pz, ws)
  nav.flowGen[startIdx] = nav.flowGeneration
  nav.flowCost[startIdx] = 0
  nav.flowDirs[startIdx * 2] = 0
  nav.flowDirs[startIdx * 2 + 1] = 0

  const speedGrid = nav.speedGrid
  const hasSpeed = speedGrid !== undefined

  // Binary min-heap for Dijkstra
  const heapIdx: Int32Array = new Int32Array(config.maxFlowDepth * 4)
  const heapCost: Float32Array = new Float32Array(config.maxFlowDepth * 4)
  let heapSize = 0

  function heapPush(idx: number, cost: number) {
    if (heapSize >= heapIdx.length) return
    let i = heapSize++
    heapIdx[i] = idx
    heapCost[i] = cost
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (heapCost[parent] <= heapCost[i]) break
      const ti = heapIdx[parent]; heapIdx[parent] = heapIdx[i]; heapIdx[i] = ti
      const tc = heapCost[parent]; heapCost[parent] = heapCost[i]; heapCost[i] = tc
      i = parent
    }
  }

  function heapPop(): number {
    const result = heapIdx[0]
    heapSize--
    if (heapSize > 0) {
      heapIdx[0] = heapIdx[heapSize]
      heapCost[0] = heapCost[heapSize]
      let i = 0
      while (true) {
        let smallest = i
        const l = 2 * i + 1, r = 2 * i + 2
        if (l < heapSize && heapCost[l] < heapCost[smallest]) smallest = l
        if (r < heapSize && heapCost[r] < heapCost[smallest]) smallest = r
        if (smallest === i) break
        const ti = heapIdx[smallest]; heapIdx[smallest] = heapIdx[i]; heapIdx[i] = ti
        const tc = heapCost[smallest]; heapCost[smallest] = heapCost[i]; heapCost[i] = tc
        i = smallest
      }
    }
    return result
  }

  heapPush(startIdx, 0)

  while (heapSize > 0) {
    const curIdx = heapPop()
    const curCost = nav.flowCost[curIdx]

    if (curCost > config.maxFlowDepth) continue

    const cx = curIdx % ws
    const cz = (curIdx / ws) | 0

    for (let ni = 0; ni < 4; ni++) {
      const nx = cx + NDX[ni]
      const nz = cz + NDZ[ni]
      if (nx < 0 || nx >= ws || nz < 0 || nz >= ws) continue
      const nIdx = nz * ws + nx
      const cell = levelGrid[nIdx]
      if (cell === 1 || cell === 3) continue

      const edgeCost = hasSpeed
        ? 1 + (1 - speedGrid![nIdx]) * 3
        : 1
      const newCost = curCost + edgeCost

      if (nav.flowGen[nIdx] === nav.flowGeneration && nav.flowCost[nIdx] <= newCost) continue

      nav.flowGen[nIdx] = nav.flowGeneration
      nav.flowCost[nIdx] = newCost
      nav.flowDirs[nIdx * 2] = (cx - nx) as -1 | 0 | 1
      nav.flowDirs[nIdx * 2 + 1] = (cz - nz) as -1 | 0 | 1

      heapPush(nIdx, newCost)
    }
  }
}

export function getFlowDir(nav: NavigationState, x: number, z: number): [number, number] {
  const idx = grid.gridIdx(x, z, nav.worldSize)
  if (nav.flowGen[idx] !== nav.flowGeneration) return [0, 0]
  return [nav.flowDirs[idx * 2], nav.flowDirs[idx * 2 + 1]]
}

export function hasLOS(
  levelGrid: Uint8Array, worldSize: number,
  x0: number, z0: number, x1: number, z1: number,
): boolean {
  const dx = grid.shortestWrapped(x1, x0, worldSize)
  const dz = grid.shortestWrapped(z1, z0, worldSize)
  const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)))
  if (steps === 0) return true
  const sx = dx / steps
  const sz = dz / steps
  let fx = x0, fz = z0
  for (let i = 0; i < steps; i++) {
    fx += sx; fz += sz
    const c = levelGrid[grid.gridIdx(fx, fz, worldSize)]
    if (c === 1 || c === 3) return false
  }
  return true
}
