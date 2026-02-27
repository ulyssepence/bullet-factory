# Character Animation

Load rigged GLB characters with walk/run animations in React Three Fiber.

## File layout

After `generate-meshes.ts` runs, each character has 3 GLBs:

```
static/models/
  cowboy-bot.glb           # unrigged (kept as fallback)
  cowboy-bot-rigged.glb    # rigged T-pose with skeleton
  cowboy-bot-walk.glb      # walking animation (includes full skinned mesh)
  cowboy-bot-run.glb       # running animation (includes full skinned mesh)
```

The animation GLBs contain both the skinned mesh AND the animation clip. Use the rigged GLB for the base model and extract animation clips from the walk/run GLBs.

## Loading pattern

```tsx
import { useGLTF, useAnimations } from '@react-three/drei'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js'

function useCharacter(basePath: string) {
  const { scene: baseScene } = useGLTF(`${basePath}-rigged.glb`)
  const { animations: walkAnims } = useGLTF(`${basePath}-walk.glb`)
  const { animations: runAnims } = useGLTF(`${basePath}-run.glb`)

  // Clone scene so each instance has its own skeleton
  const clone = useMemo(() => SkeletonUtils.clone(baseScene), [baseScene])

  // Rename clips for easy access
  const clips = useMemo(() => {
    const all: THREE.AnimationClip[] = []
    for (const c of walkAnims) all.push(c.clone().setName('walk'))
    for (const c of runAnims) all.push(c.clone().setName('run'))
    return all
  }, [walkAnims, runAnims])

  const { actions, mixer } = useAnimations(clips, clone)

  return { scene: clone, actions, mixer }
}
```

## Playing animations

```tsx
function Enemy({ position, isMoving, speed }: EnemyProps) {
  const { scene, actions } = useCharacter('models/bandit-runner')

  useEffect(() => {
    if (!isMoving) {
      // No idle animation from Meshy — stop all, show T-pose
      Object.values(actions).forEach(a => a?.fadeOut(0.2))
      return
    }
    const clip = speed > 3 ? 'run' : 'walk'
    const action = actions[clip]
    if (action) {
      action.reset().fadeIn(0.2).play()
      return () => { action.fadeOut(0.2) }
    }
  }, [isMoving, speed > 3])

  return <primitive object={scene} position={position} />
}
```

## Instanced characters (many enemies of same type)

For VS-like games with 100+ enemies on screen, don't create a separate `useGLTF` per instance. Load the model once, clone per instance with `SkeletonUtils.clone`:

```tsx
const pool = useMemo(() => {
  return Array.from({ length: POOL_SIZE }, () => {
    const clone = SkeletonUtils.clone(baseScene)
    const mixer = new THREE.AnimationMixer(clone)
    const actions = Object.fromEntries(clips.map(c => [c.name, mixer.clipAction(c)]))
    return { scene: clone, actions, mixer }
  })
}, [baseScene, clips])

// In useFrame, update all active mixers:
useFrame((_, delta) => {
  for (const enemy of activeEnemies) {
    enemy.mixer.update(delta)
  }
})
```

## Key gotchas

- **SkeletonUtils.clone is required** for skinned meshes. Regular `scene.clone()` shares the skeleton, so all instances animate together.
- **Meshy provides walking + running only.** No idle, attack, or death animations. Handle idle by stopping the mixer (shows T-pose) or by blending walk speed to 0.
- **Animation clips from separate GLBs work** because Meshy uses the same Mixamo skeleton across all outputs for a given character. The bone names and hierarchy match exactly.
- **Preload all GLBs** to avoid pop-in: `useGLTF.preload(['models/x-rigged.glb', 'models/x-walk.glb', 'models/x-run.glb'])`
- **Scale/rotation**: Meshy models face +Z in T-pose. You may need `rotation-y={Math.PI}` to face the camera or movement direction.
