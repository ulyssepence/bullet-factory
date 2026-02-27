# Playtesting

## Bot-runner balance checks

Run `npx tsx scripts/bot-runner.ts <slug>`. 10 runs, >=80% must pass each check. All thresholds are game-agnostic minimums:

| Check | Threshold | Rationale |
|-------|-----------|-----------|
| survive >30s | `timeOfDeath > 30` | Bot shouldn't die instantly |
| takes damage | `minHP < 80%` | Game shouldn't be trivially safe |
| level >=3 by 120s | `levelAt120s >= 3` | XP flow isn't starved |
| peak enemies <300 | `peakEnemyCount < 300` | Spawn doesn't overwhelm tick budget |
| peak tick <16ms | `peakTickMs < 16` | Logic stays within frame budget |

### Degenerate strategy check

- **Stationary test** (zero movement for 120s) — player must die. Game can't be won standing still.

If checks fail, adjust `spec.ts` and re-run.
