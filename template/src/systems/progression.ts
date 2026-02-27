import * as t from './types'

export interface SelectChoicesOpts {
  maxWeapons?: number
  currentWeaponCount?: number
  banished?: Set<string>
}

export function xpToNext(level: number, base: number, scaling: number): number {
  return Math.floor(base * Math.pow(scaling, level - 1))
}

export function selectChoices(
  sequences: t.UpgradeSequence[],
  taken: Map<string, number>,
  count: number,
  rng: () => number,
  opts?: SelectChoicesOpts,
): t.LevelUpChoice[] {
  const fronts: { seqId: string; label: string; weight: number; idx: number }[] = []
  for (const seq of sequences) {
    if (opts?.banished?.has(seq.id)) continue
    const idx = taken.get(seq.id) ?? 0
    if (idx >= seq.items.length) continue
    const item = seq.items[idx]
    if (opts?.maxWeapons != null && opts.currentWeaponCount != null &&
        opts.currentWeaponCount >= opts.maxWeapons && item.change.type === 'add_weapon') continue
    fronts.push({ seqId: seq.id, label: item.label, weight: item.weight, idx })
  }

  const choices: t.LevelUpChoice[] = []
  for (let i = 0; i < count && fronts.length > 0; i++) {
    const totalWeight = fronts.reduce((sum, f) => sum + f.weight, 0)
    let roll = rng() * totalWeight
    let picked = 0
    for (let j = 0; j < fronts.length; j++) {
      roll -= fronts[j].weight
      if (roll <= 0) { picked = j; break }
    }
    choices.push({
      sequenceId: fronts[picked].seqId,
      label: fronts[picked].label,
      index: fronts[picked].idx,
    })
    fronts.splice(picked, 1)
  }
  return choices
}

export function applyChange(
  state: { weapons: t.WeaponState[]; health: number; maxHealth: number; speed: number; magnetRadius: number },
  change: t.PlayerChange,
): void {
  switch (change.type) {
    case 'add_weapon':
      state.weapons.push(weaponFromDef(change.weapon))
      break
    case 'modify_weapon': {
      const w = state.weapons.find(w => w.type === change.weaponType)
      if (w) (w as any)[change.field] += change.delta
      break
    }
    case 'add_orbital':
      break
    case 'stat':
      ;(state as any)[change.field] += change.delta
      if (change.field === 'maxHealth') state.health += change.delta
      break
    case 'evolve':
      state.weapons = state.weapons.filter(
        w => w.type !== change.inputs[0] && w.type !== change.inputs[1]
      )
      state.weapons.push(weaponFromDef(change.result))
      break
  }
}

export function weaponFromDef(def: t.WeaponDef): t.WeaponState {
  return {
    type: def.type,
    category: def.category,
    damage: def.damage,
    cooldown: def.cooldown,
    cooldownTimer: 0,
    projectileSpeed: def.projectileSpeed,
    pierce: def.pierce,
    count: def.count,
  }
}
