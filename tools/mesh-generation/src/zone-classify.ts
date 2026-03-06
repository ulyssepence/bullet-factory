import * as THREE from 'three'

export interface Zone {
  name: string
  debugColor: string
  style?: string
  color?: string
  height?: [number, number]
  radial?: [number, number]
  absX?: [number, number]
  absZ?: [number, number]
  slope?: [number, number]
  normalY?: [number, number]
  bones?: string[]
}

export interface ZoneConfig {
  zones: Zone[]
  fallback?: { debugColor: string; style?: string; color?: string }
}

export interface Island {
  vertexIndices: number[]
  centroid: THREE.Vector3
}

function hexToRGB(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  ]
}

function hexToVec3(hex: string): string {
  const [r, g, b] = hexToRGB(hex)
  return `${r.toFixed(4)}, ${g.toFixed(4)}, ${b.toFixed(4)}`
}

export function classifyVertex(
  zones: Zone[], h: number, r: number, absX: number, absZ: number, slope: number, normalY: number
): number {
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i]
    let match = true
    if (z.height && (h < z.height[0] || h > z.height[1])) match = false
    if (z.radial && (r < z.radial[0] || r > z.radial[1])) match = false
    if (z.absX && (absX < z.absX[0] || absX > z.absX[1])) match = false
    if (z.absZ && (absZ < z.absZ[0] || absZ > z.absZ[1])) match = false
    if (z.slope && (slope < z.slope[0] || slope > z.slope[1])) match = false
    if (z.normalY && (normalY < z.normalY[0] || normalY > z.normalY[1])) match = false
    if (match) return i
  }
  return -1
}

export function computeIslands(geometry: THREE.BufferGeometry): Island[] {
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute
  const count = pos.count
  const parent = new Int32Array(count)
  const rank = new Int32Array(count)
  for (let i = 0; i < count; i++) parent[i] = i

  function find(x: number): number {
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x] }
    return x
  }
  function union(a: number, b: number) {
    a = find(a); b = find(b)
    if (a === b) return
    if (rank[a] < rank[b]) parent[a] = b
    else if (rank[a] > rank[b]) parent[b] = a
    else { parent[b] = a; rank[a]++ }
  }

  const index = geometry.index
  if (index) {
    const arr = index.array
    for (let i = 0; i < arr.length; i += 3) {
      union(arr[i], arr[i + 1])
      union(arr[i + 1], arr[i + 2])
    }
  } else {
    for (let i = 0; i < count; i += 3) {
      union(i, i + 1)
      union(i + 1, i + 2)
    }
  }

  const groups = new Map<number, number[]>()
  for (let i = 0; i < count; i++) {
    const root = find(i)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root)!.push(i)
  }

  const islands: Island[] = []
  for (const [, verts] of groups) {
    const centroid = new THREE.Vector3()
    for (const vi of verts) {
      centroid.x += pos.getX(vi)
      centroid.y += pos.getY(vi)
      centroid.z += pos.getZ(vi)
    }
    centroid.divideScalar(verts.length)
    islands.push({ vertexIndices: verts, centroid })
  }
  return islands
}

export function applyZoneMaterial(model: THREE.Object3D, config: ZoneConfig, bbox: THREE.Box3) {
  const minY = bbox.min.y
  const rangeY = (bbox.max.y - bbox.min.y) || 1.0
  const maxRadial = Math.max(
    Math.abs(bbox.min.x), Math.abs(bbox.max.x),
    Math.abs(bbox.min.z), Math.abs(bbox.max.z),
    0.001
  )
  const maxAbsX = Math.max(Math.abs(bbox.min.x), Math.abs(bbox.max.x), 0.001)
  const maxAbsZ = Math.max(Math.abs(bbox.min.z), Math.abs(bbox.max.z), 0.001)

  const zones = config.zones || []
  const fallback = config.fallback?.debugColor || '#888888'
  const fallbackRGB = hexToRGB(fallback)
  const zoneRGBs = zones.map(z => hexToRGB(z.debugColor))

  const boneZoneMap = new Map<string, number>()
  for (let i = 0; i < zones.length; i++) {
    if (zones[i].bones) {
      for (const boneName of zones[i].bones!) boneZoneMap.set(boneName, i)
    }
  }

  let shaderMat: THREE.ShaderMaterial | null = null
  function getShaderMaterial(): THREE.ShaderMaterial {
    if (shaderMat) return shaderMat

    let zoneColorLookup = ''
    for (let i = 0; i < zones.length; i++) {
      zoneColorLookup += `        ${i > 0 ? 'else ' : ''}if (zi == ${i}) color = vec3(${hexToVec3(zones[i].debugColor)});\n`
    }
    let classify = '        bool matched = false;\n'
    const heightBoundaries = new Set<number>()
    for (const z of zones) {
      const conds: string[] = []
      if (z.height) {
        conds.push(`h >= ${z.height[0].toFixed(4)} && h <= ${z.height[1].toFixed(4)}`)
        heightBoundaries.add(z.height[0])
        heightBoundaries.add(z.height[1])
      }
      if (z.radial) conds.push(`r >= ${z.radial[0].toFixed(4)} && r <= ${z.radial[1].toFixed(4)}`)
      if (z.absX) conds.push(`absX >= ${z.absX[0].toFixed(4)} && absX <= ${z.absX[1].toFixed(4)}`)
      if (z.absZ) conds.push(`absZ >= ${z.absZ[0].toFixed(4)} && absZ <= ${z.absZ[1].toFixed(4)}`)
      if (z.slope) conds.push(`slope >= ${z.slope[0].toFixed(4)} && slope <= ${z.slope[1].toFixed(4)}`)
      if (z.normalY) conds.push(`faceNormal.y >= ${z.normalY[0].toFixed(4)} && faceNormal.y <= ${z.normalY[1].toFixed(4)}`)
      const cond = conds.length > 0 ? conds.join(' && ') : 'true'
      classify += `        if (!matched && (${cond})) { color = vec3(${hexToVec3(z.debugColor)}); matched = true; }\n`
    }
    let boundaryLines = ''
    for (const b of heightBoundaries) {
      if (b > 0.001 && b < 0.999) {
        boundaryLines += `      if (abs(h - ${b.toFixed(4)}) < 0.005) lineDarken = 0.4;\n`
      }
    }

    shaderMat = new THREE.ShaderMaterial({
      vertexShader: `
        attribute float zoneIndex;
        varying vec3 vObjPos;
        varying float vZoneIndex;
        void main() {
          vObjPos = position;
          vZoneIndex = zoneIndex;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vObjPos;
        varying float vZoneIndex;
        void main() {
          vec3 faceNormal = normalize(cross(dFdx(vObjPos), dFdy(vObjPos)));
          vec3 color = vec3(${hexToVec3(fallback)});
          float h = clamp((vObjPos.y - (${minY.toFixed(4)})) / (${rangeY.toFixed(4)}), 0.0, 1.0);
          int zi = int(floor(vZoneIndex + 0.5));
          if (zi >= 0) {
  ${zoneColorLookup}
          } else {
            float r = length(vObjPos.xz) / ${maxRadial.toFixed(4)};
            float absX = abs(vObjPos.x) / ${maxAbsX.toFixed(4)};
            float absZ = abs(vObjPos.z) / ${maxAbsZ.toFixed(4)};
            float slope = 1.0 - abs(faceNormal.y);
  ${classify}
          }
          vec3 lightDir = normalize(vec3(0.3, 1.0, 0.5));
          float lit = abs(dot(faceNormal, lightDir)) * 0.35 + 0.65;
          float lineDarken = 0.0;
          if (zi < 0) {
  ${boundaryLines}
          }
          gl_FragColor = vec4(color * lit * (1.0 - lineDarken), 1.0);
        }
      `,
      side: THREE.DoubleSide,
    })
    return shaderMat
  }

  model.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return
    const mesh = child as THREE.SkinnedMesh
    const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute
    const skinIdx = mesh.geometry.getAttribute('skinIndex') as THREE.BufferAttribute | null
    const skinWt = mesh.geometry.getAttribute('skinWeight') as THREE.BufferAttribute | null
    const hasSkinning = skinIdx && skinWt && mesh.skeleton && boneZoneMap.size > 0

    if (!mesh.userData._originalMaterial) {
      mesh.userData._originalMaterial = Array.isArray(mesh.material)
        ? mesh.material.map(m => m.clone())
        : (mesh.material as THREE.Material).clone()
    }

    if (hasSkinning) {
      const colors = new Float32Array(pos.count * 3)
      const islands = computeIslands(mesh.geometry)
      let largestIdx = 0
      for (let i = 1; i < islands.length; i++) {
        if (islands[i].vertexIndices.length > islands[largestIdx].vertexIndices.length)
          largestIdx = i
      }

      if (islands.length > 1) {
        for (let i = 0; i < islands.length; i++) {
          if (i === largestIdx) continue
          const c = islands[i].centroid
          const nh = Math.max(0, Math.min(1, (c.y - minY) / rangeY))
          const nr = Math.sqrt(c.x * c.x + c.z * c.z) / maxRadial
          const nAbsX = Math.abs(c.x) / maxAbsX
          const nAbsZ = Math.abs(c.z) / maxAbsZ
          const zi = classifyVertex(zones, nh, nr, nAbsX, nAbsZ, 0, 0)
          const rgb = zi >= 0 ? zoneRGBs[zi] : fallbackRGB
          for (const vi of islands[i].vertexIndices) {
            colors[vi * 3] = rgb[0]
            colors[vi * 3 + 1] = rgb[1]
            colors[vi * 3 + 2] = rgb[2]
          }
        }
      }

      const positionZones = zones
        .map((z, i) => ({ idx: i, zone: z }))
        .filter(({ zone }) => !zone.bones && zone.height)

      for (const vi of islands[largestIdx].vertexIndices) {
        let maxW = 0, maxBoneIdx = 0
        for (let j = 0; j < 4; j++) {
          const w = skinWt!.getComponent(vi, j)
          if (w > maxW) { maxW = w; maxBoneIdx = skinIdx!.getComponent(vi, j) }
        }
        const bone = mesh.skeleton!.bones[maxBoneIdx]
        let zi: number | undefined = boneZoneMap.get(bone ? bone.name : '')

        if (positionZones.length > 0) {
          const y = pos.getY(vi)
          const h = Math.max(0, Math.min(1, (y - minY) / rangeY))
          const x = pos.getX(vi), zz = pos.getZ(vi)
          const r = Math.sqrt(x * x + zz * zz) / maxRadial
          const aX = Math.abs(x) / maxAbsX
          const aZ = Math.abs(zz) / maxAbsZ
          for (const { idx, zone } of positionZones) {
            if (zone.height && (h < zone.height[0] || h > zone.height[1])) continue
            if (zone.radial && (r < zone.radial[0] || r > zone.radial[1])) continue
            if (zone.absX && (aX < zone.absX[0] || aX > zone.absX[1])) continue
            if (zone.absZ && (aZ < zone.absZ[0] || aZ > zone.absZ[1])) continue
            zi = idx
            break
          }
        }

        const rgb = zi !== undefined ? zoneRGBs[zi] : fallbackRGB
        colors[vi * 3] = rgb[0]
        colors[vi * 3 + 1] = rgb[1]
        colors[vi * 3 + 2] = rgb[2]
      }
      mesh.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
      mesh.material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })
    } else {
      const zoneIndexArr = new Float32Array(pos.count)
      const islands = computeIslands(mesh.geometry)
      if (islands.length > 1) {
        let largestIdx = 0
        for (let i = 1; i < islands.length; i++) {
          if (islands[i].vertexIndices.length > islands[largestIdx].vertexIndices.length)
            largestIdx = i
        }
        for (let i = 0; i < islands.length; i++) {
          if (i === largestIdx) {
            for (const vi of islands[i].vertexIndices) zoneIndexArr[vi] = -1.0
            continue
          }
          const c = islands[i].centroid
          const nh = Math.max(0, Math.min(1, (c.y - minY) / rangeY))
          const nr = Math.sqrt(c.x * c.x + c.z * c.z) / maxRadial
          const nAbsX = Math.abs(c.x) / maxAbsX
          const nAbsZ = Math.abs(c.z) / maxAbsZ
          const zi = classifyVertex(zones, nh, nr, nAbsX, nAbsZ, 0, 0)
          for (const vi of islands[i].vertexIndices) zoneIndexArr[vi] = zi
        }
      } else {
        zoneIndexArr.fill(-1.0)
      }
      mesh.geometry.setAttribute('zoneIndex', new THREE.BufferAttribute(zoneIndexArr, 1))
      mesh.material = getShaderMaterial()
    }
  })
}

export function restoreOriginalMaterials(model: THREE.Object3D) {
  model.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return
    const mesh = child as THREE.Mesh
    if (!mesh.userData._originalMaterial) return

    const current = mesh.material
    if (Array.isArray(current)) {
      current.forEach(m => m.dispose())
    } else {
      (current as THREE.Material).dispose()
    }

    if (Array.isArray(mesh.userData._originalMaterial)) {
      mesh.material = mesh.userData._originalMaterial.map((m: THREE.Material) => m.clone())
    } else {
      mesh.material = mesh.userData._originalMaterial.clone()
    }

    if (mesh.geometry.hasAttribute('color')) {
      mesh.geometry.deleteAttribute('color')
    }
    if (mesh.geometry.hasAttribute('zoneIndex')) {
      mesh.geometry.deleteAttribute('zoneIndex')
    }
  })
}
