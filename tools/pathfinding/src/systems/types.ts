export type EntityId = string

export interface WeaponState {
  type: string
  category: 'targeted' | 'orbital' | 'radial'
  damage: number
  cooldown: number
  cooldownTimer: number
  projectileSpeed: number
  pierce: number
  count: number
}

export interface EnemyState {
  id: EntityId
  type: string
  position: [number, number, number]
  health: number
  maxHealth: number
  speed: number
  damage: number
  size: number
  xpValue: number
}

export interface ProjectileState {
  id: EntityId
  position: [number, number, number]
  velocity: [number, number, number]
  damage: number
  pierce: number
  lifetime: number
}

export interface PickupState {
  id: EntityId
  type: 'xp' | 'health'
  position: [number, number, number]
  value: number
  age: number
  burstDx: number
  burstDz: number
}

export interface DestructibleState {
  id: EntityId
  type: string
  position: [number, number, number]
  health: number
  maxHealth: number
  size: number
  loot: { type: string; chance: number; value: number }[]
  chunkKey: number
}

export interface SpawnAccumulator {
  enemyType: string
  count: number
  spawned: number
}

export interface WaveDirectorState {
  waveIndex: number
  waveElapsed: number
  accumulators: SpawnAccumulator[]
  complete: boolean
}

export interface LevelUpChoice {
  sequenceId: string
  label: string
  index: number
}

export interface ProgressionState {
  sequenceTaken: Map<string, number>
  pendingChoices: LevelUpChoice[] | null
}

export interface WeaponDef {
  type: string
  category: 'targeted' | 'radial' | 'orbital'
  damage: number
  cooldown: number
  projectileSpeed: number
  pierce: number
  count: number
}

export interface UpgradeItem {
  label: string
  weight: number
  change: PlayerChange
}

export interface UpgradeSequence {
  id: string
  items: UpgradeItem[]
}

export type PlayerChange =
  | { type: 'add_weapon'; weapon: WeaponDef }
  | { type: 'modify_weapon'; weaponType: string; field: string; delta: number }
  | { type: 'add_orbital'; damage: number; radius: number; orbitRadius: number; speed: number }
  | { type: 'stat'; field: 'maxHealth' | 'speed' | 'magnetRadius'; delta: number }
  | { type: 'evolve'; inputs: [string, string]; result: WeaponDef }
