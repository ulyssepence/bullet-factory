import * as grid from './grid'

export interface NavigationConfig {
  maxFlowDepth: number
  flowRecomputeDist: number
  losRange: number
}

export interface NavigationState {
  flowDirs: Int8Array
  flowGen: Uint32Array
  flowGeneration: number
  lastFlowCell: [number, number]
  qX: Int16Array
  qZ: Int16Array
  qD: Uint16Array
  worldSize: number
}

export function createNavigationState(worldSize: number, bfsMax: number): NavigationState {
  const cells = worldSize * worldSize
  return {
    flowDirs: new Int8Array(cells * 2),
    flowGen: new Uint32Array(cells),
    flowGeneration: 0,
    lastFlowCell: [-999, -999],
    qX: new Int16Array(bfsMax),
    qZ: new Int16Array(bfsMax),
    qD: new Uint16Array(bfsMax),
    worldSize,
  }
}

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
  nav.flowDirs[startIdx * 2] = 0
  nav.flowDirs[startIdx * 2 + 1] = 0

  let head = 0, tail = 0
  nav.qX[tail] = px; nav.qZ[tail] = pz; nav.qD[tail] = 0; tail++

  const NDX = [-1, 1, 0, 0]
  const NDZ = [0, 0, -1, 1]

  while (head < tail) {
    const cx = nav.qX[head], cz = nav.qZ[head], cd = nav.qD[head]; head++
    if (cd >= config.maxFlowDepth) continue

    for (let ni = 0; ni < 4; ni++) {
      const nx = cx + NDX[ni]
      const nz = cz + NDZ[ni]
      const nIdx = grid.gridIdx(nx, nz, ws)
      if (nav.flowGen[nIdx] === nav.flowGeneration) continue
      if (levelGrid[nIdx] === 1) continue

      nav.flowGen[nIdx] = nav.flowGeneration
      nav.flowDirs[nIdx * 2] = (cx - nx) as -1 | 0 | 1
      nav.flowDirs[nIdx * 2 + 1] = (cz - nz) as -1 | 0 | 1

      if (tail < nav.qX.length) {
        nav.qX[tail] = nx; nav.qZ[tail] = nz; nav.qD[tail] = cd + 1; tail++
      }
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
    if (levelGrid[grid.gridIdx(fx, fz, worldSize)] === 1) return false
  }
  return true
}
