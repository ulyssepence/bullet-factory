# Mesh Replacement

Replace graybox box geometry with authored GLB meshes. One draw call per mesh type per chunk via `InstancedMesh`.

## Loading

Load each GLB once at startup. Use `useGLTF` (from `@react-three/drei`) or `GLTFLoader` directly:

```tsx
const { scene } = useGLTF('/static/models/barrel.glb')
const geometry = (scene.children[0] as THREE.Mesh).geometry
```

For multiple meshes in one file, traverse `scene` to find the right child by name.

## Instanced rendering

Feed the extracted `BufferGeometry` into `InstancedMesh` with the same transform logic used for graybox boxes:

```tsx
function ChunkProps({ positions, geometry, material }: {
  positions: [number, number, number][]
  geometry: THREE.BufferGeometry
  material: THREE.Material
}) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])

  useEffect(() => {
    positions.forEach((pos, i) => {
      dummy.position.set(...pos)
      dummy.updateMatrix()
      ref.current!.setMatrixAt(i, dummy.matrix)
    })
    ref.current!.instanceMatrix.needsUpdate = true
  }, [positions])

  return <instancedMesh ref={ref} args={[geometry, material, positions.length]} />
}
```

Positions come from `scatterProps()` or chunk template placement data — same source as graybox.

## Scaling and orientation

GLB models may not match graybox box dimensions. Normalize at load time:

```ts
geometry.computeBoundingBox()
const box = geometry.boundingBox!
const size = new THREE.Vector3()
box.getSize(size)
const scale = targetSize / Math.max(size.x, size.y, size.z)
geometry.scale(scale, scale, scale)
geometry.center()
```

## Performance

- One `InstancedMesh` per mesh type per chunk = one draw call each
- Chunks beyond view distance dispose their instanced meshes (same lifecycle as graybox)
- Share `BufferGeometry` across chunks — only instance matrices differ
- For props with few instances (<5 per chunk), plain `<mesh>` is fine — instancing overhead isn't worth it

## Rigged/animated meshes

For characters (enemies, player, bosses) with skeletal animation, see `patterns/character-animation.md`. Those use `SkinnedMesh` + `AnimationMixer`, not `InstancedMesh`. Clone with `SkeletonUtils.clone()` to share geometry while having independent skeletons.
