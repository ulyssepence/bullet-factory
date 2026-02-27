# Progression

## Level-up UI

The level-up modal presents upgrade choices with:
- **Weapon icon/mesh thumbnail** next to each option
- **Reroll button** — spends a charge, re-rolls choices (charge count visible)
- **Skip button** — dismisses without choosing
- **Banish button** — permanently removes an upgrade sequence from this run's pool (limited by `banishSlots` in spec)

## Weapon cap

When the player has `maxWeapons` weapons, level-up skips sequences whose front item is `add_weapon`. Only stat upgrades, weapon modifications, and evolutions are offered.

## Upgrade selection algorithm

See `patterns/game-spec.md` for the full sequence-front weighted selection algorithm, `PlayerChange` types, and example sequences.
