import * as t from './types'
import * as grid from './grid'

export interface CombatConfig {
  worldSize: number
  projectileLifetime: number
  projectileRadius: number
  pickupCollectRadius: number
  burstDuration: number
  burstSpeed: number
  pullDelay: number
}

export interface CombatTickState {
  player: {
    position: [number, number, number]
    weapons: t.WeaponState[]
    xp: number
    health: number
    maxHealth: number
    magnetRadius: number
  }
  enemies: Map<string, t.EnemyState>
  projectiles: Map<string, t.ProjectileState>
  pickups: Map<string, t.PickupState>
  destructibles: Map<string, t.DestructibleState>
  level: { grid: Uint8Array }
  kills: number
}

export interface CombatCallbacks {
  onEnemyKilled?: (enemy: t.EnemyState) => void
  onEnemyHit?: (enemy: t.EnemyState, damage: number) => void
  onPickupCollected?: (pickup: t.PickupState) => void
  onWeaponFired?: (weapon: t.WeaponState) => void
  onDestructibleDestroyed?: (dest: t.DestructibleState) => void
}

export const defaultCombatConfig: CombatConfig = {
  worldSize: 0,
  projectileLifetime: 3,
  projectileRadius: 0.15,
  pickupCollectRadius: 0.5,
  burstDuration: 0.3,
  burstSpeed: 6,
  pullDelay: 0.5,
}

export function findNearestEnemy(
  pos: [number, number, number],
  enemies: Map<string, t.EnemyState>,
  worldSize: number,
): t.EnemyState | null {
  let best: t.EnemyState | null = null
  let bestD2 = Infinity
  for (const e of enemies.values()) {
    const dx = grid.shortestWrapped(e.position[0], pos[0], worldSize)
    const dz = grid.shortestWrapped(e.position[2], pos[2], worldSize)
    const d2 = dx * dx + dz * dz
    if (d2 < bestD2) { bestD2 = d2; best = e }
  }
  return best
}

export function tickWeapons(
  state: CombatTickState,
  dt: number,
  config: CombatConfig,
  genId: () => string,
  callbacks?: CombatCallbacks,
): void {
  const ws = config.worldSize
  for (const weapon of state.player.weapons) {
    weapon.cooldownTimer = Math.max(0, weapon.cooldownTimer - dt)
    if (weapon.cooldownTimer > 0) continue
    if (weapon.category === 'orbital') continue

    const target = findNearestEnemy(state.player.position, state.enemies, ws)
    if (!target) continue

    const dx = grid.shortestWrapped(target.position[0], state.player.position[0], ws)
    const dz = grid.shortestWrapped(target.position[2], state.player.position[2], ws)
    const dist = Math.sqrt(dx * dx + dz * dz)
    if (dist < 0.01) continue

    weapon.cooldownTimer = weapon.cooldown
    callbacks?.onWeaponFired?.(weapon)
    const dirX = dx / dist
    const dirZ = dz / dist

    for (let i = 0; i < weapon.count; i++) {
      const spread = weapon.count > 1 ? (i - (weapon.count - 1) / 2) * 0.15 : 0
      const cos = Math.cos(spread)
      const sin = Math.sin(spread)
      const vx = (dirX * cos - dirZ * sin) * weapon.projectileSpeed
      const vz = (dirX * sin + dirZ * cos) * weapon.projectileSpeed

      const id = genId()
      state.projectiles.set(id, {
        id,
        position: [...state.player.position] as [number, number, number],
        velocity: [vx, 0, vz],
        damage: weapon.damage,
        pierce: weapon.pierce,
        lifetime: config.projectileLifetime,
      })
    }
  }
}

export function tickProjectiles(
  state: CombatTickState,
  dt: number,
  config: CombatConfig,
  genId: () => string,
  callbacks?: CombatCallbacks,
): void {
  const levelGrid = state.level.grid
  const ws = config.worldSize

  for (const [id, proj] of state.projectiles) {
    proj.position[0] += proj.velocity[0] * dt
    proj.position[2] += proj.velocity[2] * dt
    proj.lifetime -= dt

    proj.position[0] = grid.wrapCoord(proj.position[0], ws)
    proj.position[2] = grid.wrapCoord(proj.position[2], ws)

    const cellAt = levelGrid[grid.gridIdx(proj.position[0], proj.position[2], ws)]
    if (cellAt === 1 || cellAt === 3) {
      state.projectiles.delete(id); continue
    }
    if (proj.lifetime <= 0) {
      state.projectiles.delete(id); continue
    }

    let destroyed = false

    for (const [eid, enemy] of state.enemies) {
      const ex = grid.shortestWrapped(proj.position[0], enemy.position[0], ws)
      const ez = grid.shortestWrapped(proj.position[2], enemy.position[2], ws)
      const d = Math.sqrt(ex * ex + ez * ez)
      if (d < enemy.size * 0.5 + config.projectileRadius) {
        enemy.health -= proj.damage
        proj.pierce--
        if (enemy.health <= 0) {
          callbacks?.onEnemyKilled?.(enemy)
          spawnPickup(state, enemy.position, 'xp', enemy.xpValue, genId)
          state.enemies.delete(eid)
          state.kills++
        } else {
          callbacks?.onEnemyHit?.(enemy, proj.damage)
        }
        if (proj.pierce < 0) { destroyed = true; break }
      }
    }
    if (destroyed) { state.projectiles.delete(id); continue }

    for (const [did, dest] of state.destructibles) {
      const ex = grid.shortestWrapped(proj.position[0], dest.position[0], ws)
      const ez = grid.shortestWrapped(proj.position[2], dest.position[2], ws)
      const d = Math.sqrt(ex * ex + ez * ez)
      if (d < dest.size * 0.5 + config.projectileRadius) {
        dest.health -= proj.damage
        proj.pierce--
        if (dest.health <= 0) {
          for (const drop of dest.loot) {
            if (Math.random() < drop.chance) {
              const ptype = (drop.type === 'health') ? 'health' as const : 'xp' as const
              spawnPickup(state, dest.position, ptype, drop.value, genId)
            }
          }
          callbacks?.onDestructibleDestroyed?.(dest)
          state.destructibles.delete(did)
        }
        if (proj.pierce < 0) { destroyed = true; break }
      }
    }
    if (destroyed) { state.projectiles.delete(id); continue }
  }
}

function spawnPickup(
  state: CombatTickState,
  pos: [number, number, number],
  type: t.PickupState['type'],
  value: number,
  genId: () => string,
): void {
  const angle = Math.random() * Math.PI * 2
  const id = genId()
  state.pickups.set(id, {
    id, type,
    position: [...pos] as [number, number, number],
    value, age: 0,
    burstDx: Math.cos(angle), burstDz: Math.sin(angle),
  })
}

export { spawnPickup }

export function tickPickups(
  state: CombatTickState,
  dt: number,
  config: CombatConfig,
  callbacks?: CombatCallbacks,
): void {
  const pp = state.player.position
  const magnet = state.player.magnetRadius
  const ws = config.worldSize

  for (const [id, pickup] of state.pickups) {
    pickup.age += dt

    if (pickup.age < config.burstDuration) {
      const progress = pickup.age / config.burstDuration
      const speed = config.burstSpeed * (1 - progress * progress) * dt
      pickup.position[0] = grid.wrapCoord(pickup.position[0] + pickup.burstDx * speed, ws)
      pickup.position[2] = grid.wrapCoord(pickup.position[2] + pickup.burstDz * speed, ws)
      continue
    }

    const dx = grid.shortestWrapped(pp[0], pickup.position[0], ws)
    const dz = grid.shortestWrapped(pp[2], pickup.position[2], ws)
    const dist = Math.sqrt(dx * dx + dz * dz)

    if (pickup.age > config.pullDelay && dist < magnet && dist > config.pickupCollectRadius) {
      const pullAge = pickup.age - config.pullDelay
      const accel = Math.min(pullAge * pullAge * 20, 16)
      const pull = accel * dt
      pickup.position[0] = grid.wrapCoord(pickup.position[0] + (dx / dist) * pull, ws)
      pickup.position[2] = grid.wrapCoord(pickup.position[2] + (dz / dist) * pull, ws)
    }

    if (dist < config.pickupCollectRadius) {
      callbacks?.onPickupCollected?.(pickup)
      if (pickup.type === 'xp') state.player.xp += pickup.value
      else if (pickup.type === 'health') state.player.health = Math.min(state.player.health + pickup.value, state.player.maxHealth)
      state.pickups.delete(id)
    }
  }
}
