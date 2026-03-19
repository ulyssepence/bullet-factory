import * as THREE from 'three'

export type ShaderVariant = {
  label: string
  vertex: string
  fragment: string
  controls: Record<string, { value: number; min: number; max: number; step: number }>
  sharedDefaults?: Partial<{
    density: number; bladeHeight: number; bladeHeightVar: number; bladeWidth: number
    windSpeed: number; windStrength: number; baseColor: string; tipColor: string
  }>
  uniforms?: Record<string, { value: any }>
  groundColor?: string
  materialConfig?: Partial<{ blending: THREE.Blending; depthWrite: boolean; transparent: boolean; alphaTest: number }>
}

const vertexWind = /* glsl */ `
  attribute vec3 aOffset;
  attribute float aRotation;
  attribute float aScale;
  attribute float aColorVar;

  varying vec2 vUv;
  varying float vColorVar;
  varying vec3 vWorldPos;

  uniform float uTime;
  uniform float uWindSpeed;
  uniform float uWindStrength;
  uniform vec2 uWindDirection;
  uniform float uBladeHeight;
  uniform float uBladeHeightVar;

  uniform float uBillboard;

  void main() {
    vUv = uv;
    vColorVar = aColorVar;

    float h = uBladeHeight + uBladeHeightVar * (aColorVar * 2.0 - 1.0);
    vec3 pos = position;
    pos.y *= h * aScale;

    vec3 rotated;
    if (uBillboard > 0.5) {
      vec3 camRight = vec3(modelViewMatrix[0][0], modelViewMatrix[1][0], modelViewMatrix[2][0]);
      rotated = camRight * pos.x + vec3(0.0, 1.0, 0.0) * pos.y;
    } else {
      float c = cos(aRotation);
      float s = sin(aRotation);
      rotated = vec3(pos.x * c - pos.z * s, pos.y, pos.x * s + pos.z * c);
    }
    vec3 worldPos = rotated + aOffset;

    vec2 windDir = normalize(uWindDirection);
    float windPhase = dot(worldPos.xz, windDir) * 0.4;
    float t = uTime * uWindSpeed;
    float wind = sin(t * 1.975 + windPhase) * 0.4
               + sin(t * 0.793 + windPhase * 1.3) * 0.3
               + sin(t * 0.375 + windPhase * 0.7) * 0.2
               + sin(t * 3.1 + windPhase * 2.1) * 0.1;

    float bendFactor = uv.y * uv.y;
    worldPos.x += wind * uWindStrength * bendFactor * windDir.x * h;
    worldPos.z += wind * uWindStrength * bendFactor * windDir.y * h;
    worldPos.y -= abs(wind) * uWindStrength * bendFactor * 0.08 * h;

    vWorldPos = worldPos;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(worldPos, 1.0);
  }
`

const vertexFloat = /* glsl */ `
  attribute vec3 aOffset;
  attribute float aRotation;
  attribute float aScale;
  attribute float aColorVar;

  varying vec2 vUv;
  varying float vColorVar;
  varying vec3 vWorldPos;

  uniform float uTime;
  uniform float uWindSpeed;
  uniform float uWindStrength;
  uniform vec2 uWindDirection;
  uniform float uBladeHeight;
  uniform float uBladeHeightVar;
  uniform float uFloatSpeed;
  uniform float uBillboard;

  void main() {
    vUv = uv;
    vColorVar = aColorVar;

    float h = uBladeHeight + uBladeHeightVar * (aColorVar * 2.0 - 1.0);
    vec3 pos = position;
    pos.y *= h * aScale;

    vec3 rotated;
    if (uBillboard > 0.5) {
      vec3 camRight = vec3(modelViewMatrix[0][0], modelViewMatrix[1][0], modelViewMatrix[2][0]);
      rotated = camRight * pos.x + vec3(0.0, 1.0, 0.0) * pos.y;
    } else {
      float c = cos(aRotation);
      float s = sin(aRotation);
      rotated = vec3(pos.x * c - pos.z * s, pos.y, pos.x * s + pos.z * c);
    }
    vec3 worldPos = rotated + aOffset;

    float seed1 = fract(sin(aColorVar * 127.1) * 43758.5);
    float seed2 = fract(sin(aColorVar * 269.5) * 18732.3);
    float t = uTime * uFloatSpeed;
    worldPos.y += sin(t * 0.7 + seed1 * 6.28) * 0.5 + 0.5;
    worldPos.x += sin(t * 0.3 + seed2 * 6.28) * 0.15;
    worldPos.z += cos(t * 0.4 + seed1 * 3.14) * 0.15;

    vWorldPos = worldPos;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(worldPos, 1.0);
  }
`

const vertexStatic = /* glsl */ `
  attribute vec3 aOffset;
  attribute float aRotation;
  attribute float aScale;
  attribute float aColorVar;

  varying vec2 vUv;
  varying float vColorVar;
  varying vec3 vWorldPos;

  uniform float uTime;
  uniform float uWindSpeed;
  uniform float uWindStrength;
  uniform vec2 uWindDirection;
  uniform float uBladeHeight;
  uniform float uBladeHeightVar;
  uniform float uVibrateAmp;
  uniform float uBillboard;

  void main() {
    vUv = uv;
    vColorVar = aColorVar;

    float h = uBladeHeight + uBladeHeightVar * (aColorVar * 2.0 - 1.0);
    vec3 pos = position;
    pos.y *= h * aScale;

    vec3 rotated;
    if (uBillboard > 0.5) {
      vec3 camRight = vec3(modelViewMatrix[0][0], modelViewMatrix[1][0], modelViewMatrix[2][0]);
      rotated = camRight * pos.x + vec3(0.0, 1.0, 0.0) * pos.y;
    } else {
      float c = cos(aRotation);
      float s = sin(aRotation);
      rotated = vec3(pos.x * c - pos.z * s, pos.y, pos.x * s + pos.z * c);
    }
    vec3 worldPos = rotated + aOffset;

    float vibrate = sin(uTime * 20.0 + aColorVar * 100.0) * uVibrateAmp * uv.y;
    worldPos.x += vibrate;

    vWorldPos = worldPos;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(worldPos, 1.0);
  }
`

// ── Grass ──────────────────────────────────────────────────

const grassFragment = /* glsl */ `
  varying vec2 vUv;
  varying float vColorVar;

  uniform vec3 uBaseColor;
  uniform vec3 uTipColor;
  uniform float uColorVariation;
  uniform float uBladeWidth;

  void main() {
    float x = vUv.x;
    float y = vUv.y;
    float numBlades = 4.0;
    float bladeSpace = 1.0 / numBlades;
    float localX = mod(x, bladeSpace) / bladeSpace;
    float bladeIdx = floor(x * numBlades);
    float seed = fract(sin(bladeIdx * 127.1 + 311.7) * 43758.5453);
    float xOffset = (seed - 0.5) * 0.3;
    localX = localX - 0.5 + xOffset;
    float taper = 1.0 - y;
    float widthScale = uBladeWidth * 12.0;
    float halfWidth = taper * widthScale * 0.5;
    if (abs(localX) > halfWidth) discard;
    float heightSeed = fract(sin(bladeIdx * 93.17) * 24831.1);
    float bladeMaxH = 0.5 + heightSeed * 0.5;
    if (y > bladeMaxH) discard;
    float normalizedY = y / bladeMaxH;
    vec3 varTint = vec3(
      fract(sin(vColorVar * 127.1) * 43758.5),
      fract(sin(vColorVar * 269.5) * 18732.3),
      fract(sin(vColorVar * 419.2) * 95124.7)
    );
    varTint = (varTint - 0.5) * uColorVariation * 0.3;
    vec3 base = uBaseColor + varTint;
    vec3 tip = uTipColor + varTint;
    vec3 color = mix(base, tip, normalizedY);
    float edgeSoft = smoothstep(halfWidth, halfWidth * 0.5, abs(localX));
    float ao = smoothstep(0.0, 0.15, y);
    gl_FragColor = vec4(color * (0.5 + ao * 0.5), edgeSoft);
  }
`

// ── Thorns ─────────────────────────────────────────────────

const thornsFragment = /* glsl */ `
  varying vec2 vUv;
  varying float vColorVar;

  uniform vec3 uBaseColor;
  uniform vec3 uTipColor;
  uniform float uColorVariation;
  uniform float uBladeWidth;

  void main() {
    float x = vUv.x;
    float y = vUv.y;
    float numSpikes = 3.0;
    float spikeSpace = 1.0 / numSpikes;
    float localX = mod(x, spikeSpace) / spikeSpace - 0.5;
    float spikeIdx = floor(x * numSpikes);
    float heightSeed = fract(sin(spikeIdx * 73.17 + 191.3) * 24831.1);
    float spikeMaxH = 0.4 + heightSeed * 0.6;
    if (y > spikeMaxH) discard;
    float normalizedY = y / spikeMaxH;
    float halfWidth = (1.0 - normalizedY) * uBladeWidth * 3.0;
    if (abs(localX) > halfWidth) discard;
    vec3 varTint = vec3(
      fract(sin(vColorVar * 127.1) * 43758.5),
      fract(sin(vColorVar * 269.5) * 18732.3),
      fract(sin(vColorVar * 419.2) * 95124.7)
    );
    varTint = (varTint - 0.5) * uColorVariation * 0.15;
    vec3 base = uBaseColor + varTint;
    vec3 tip = uTipColor + varTint;
    vec3 color = mix(base, tip, normalizedY);
    float edgeHighlight = pow(1.0 - abs(localX / halfWidth), 8.0) * 0.3;
    float ao = smoothstep(0.0, 0.1, y);
    gl_FragColor = vec4(color * (0.4 + ao * 0.6) + edgeHighlight, 1.0);
  }
`

// ── Wheat ──────────────────────────────────────────────────

const wheatFragment = /* glsl */ `
  varying vec2 vUv;
  varying float vColorVar;

  uniform vec3 uBaseColor;
  uniform vec3 uTipColor;
  uniform float uColorVariation;
  uniform float uBladeWidth;
  uniform float uStalkWidth;
  uniform float uSeedHeadSize;

  void main() {
    float x = vUv.x;
    float y = vUv.y;
    float numStalks = 3.0;
    float bladeSpace = 1.0 / numStalks;
    float localX = mod(x, bladeSpace) / bladeSpace;
    float stalkIdx = floor(x * numStalks);
    float seed = fract(sin(stalkIdx * 127.1 + 311.7) * 43758.5453);
    localX = localX - 0.5 + (seed - 0.5) * 0.2;
    float heightSeed = fract(sin(stalkIdx * 73.17 + 191.3) * 24831.1);
    float stalkMaxH = 0.6 + heightSeed * 0.4;
    if (y > stalkMaxH) discard;
    float normalizedY = y / stalkMaxH;
    float seedHeadStart = 1.0 - uSeedHeadSize;
    float halfWidth;
    bool isHead = normalizedY > seedHeadStart;
    if (isHead) {
      float headY = (normalizedY - seedHeadStart) / uSeedHeadSize;
      float bulge = sin(headY * 3.14159);
      halfWidth = uStalkWidth * 2.0 + bulge * uBladeWidth * 5.0;
    } else {
      float taper = 1.0 - normalizedY * 0.15;
      halfWidth = uStalkWidth * 2.0 * taper;
    }
    if (abs(localX) > halfWidth) discard;
    vec3 varTint = vec3(
      fract(sin(vColorVar * 127.1) * 43758.5),
      fract(sin(vColorVar * 269.5) * 18732.3),
      fract(sin(vColorVar * 419.2) * 95124.7)
    );
    varTint = (varTint - 0.5) * uColorVariation * 0.15;
    vec3 base = uBaseColor + varTint;
    vec3 tip = uTipColor + varTint;
    vec3 color = mix(base, tip, normalizedY);
    if (isHead) {
      float headY = (normalizedY - seedHeadStart) / uSeedHeadSize;
      float grain = fract(sin(floor(headY * 6.0) * 93.17 + stalkIdx * 47.1) * 24831.1);
      color = mix(color, color * 1.15, grain * 0.3);
    }
    float ao = smoothstep(0.0, 0.1, y);
    gl_FragColor = vec4(color * (0.5 + ao * 0.5), 1.0);
  }
`

// ── Mushrooms ──────────────────────────────────────────────

const mushroomsFragment = /* glsl */ `
  varying vec2 vUv;
  varying float vColorVar;

  uniform vec3 uBaseColor;
  uniform vec3 uTipColor;
  uniform float uColorVariation;
  uniform float uBladeWidth;
  uniform float uCapWidth;
  uniform float uSpotDensity;

  void main() {
    float x = vUv.x;
    float y = vUv.y;
    float localX = x - 0.5;
    float maxH = 0.5 + fract(sin(vColorVar * 93.17) * 24831.1) * 0.3;
    if (y > maxH) discard;
    float normalizedY = y / maxH;
    float capStart = 0.45;
    float halfWidth;
    bool isCap = false;
    if (normalizedY > capStart) {
      isCap = true;
      float capY = (normalizedY - capStart) / (1.0 - capStart);
      float dome = sqrt(max(0.0, 1.0 - pow(capY * 2.0 - 1.0, 2.0)));
      halfWidth = dome * uCapWidth * 0.5;
    } else {
      halfWidth = uBladeWidth * 2.0;
    }
    if (abs(localX) > halfWidth) discard;
    vec3 stemColor = vec3(0.9, 0.85, 0.75);
    float capSeed = fract(sin(vColorVar * 347.1) * 15731.3);
    vec3 capColor;
    if (capSeed < 0.33) capColor = vec3(0.8, 0.15, 0.1);
    else if (capSeed < 0.66) capColor = vec3(0.55, 0.35, 0.2);
    else capColor = vec3(0.85, 0.8, 0.7);
    vec3 color = isCap ? capColor : stemColor;
    if (isCap) {
      float capY = (normalizedY - capStart) / (1.0 - capStart);
      if (capSeed < 0.33 && uSpotDensity > 0.0) {
        vec2 spotUv = vec2(localX / halfWidth, capY);
        float closestDist = 1.0;
        for (float i = 0.0; i < 4.0; i++) {
          float sx = fract(sin(i * 127.1 + vColorVar * 311.7) * 43758.5) * 1.4 - 0.7;
          float sy = fract(sin(i * 269.5 + vColorVar * 183.3) * 18732.3) * 0.6 + 0.2;
          float d = length(spotUv - vec2(sx, sy));
          closestDist = min(closestDist, d);
        }
        float spotRadius = 0.12 * uSpotDensity;
        if (closestDist < spotRadius) {
          color = vec3(1.0, 0.95, 0.9);
        }
      }
      float capAo = smoothstep(0.0, 0.2, capY);
      color *= 0.6 + capAo * 0.4;
    }
    float ao = smoothstep(0.0, 0.15, y);
    gl_FragColor = vec4(color * (0.5 + ao * 0.5), 1.0);
  }
`

// ── Ferns ──────────────────────────────────────────────────

const fernsFragment = /* glsl */ `
  varying vec2 vUv;
  varying float vColorVar;

  uniform vec3 uBaseColor;
  uniform vec3 uTipColor;
  uniform float uColorVariation;
  uniform float uBladeWidth;
  uniform float uToothCount;
  uniform float uFrondWidth;

  void main() {
    float x = vUv.x;
    float y = vUv.y;
    float localX = x - 0.5;
    float maxH = 0.6 + fract(sin(vColorVar * 93.17) * 24831.1) * 0.4;
    if (y > maxH) discard;
    float normalizedY = y / maxH;
    float envelope = sin(normalizedY * 3.14159);
    float baseWidth = uFrondWidth * 0.5 * envelope;
    float toothMod = fract(normalizedY * uToothCount);
    float tooth = smoothstep(0.0, 0.3, toothMod) * smoothstep(1.0, 0.7, toothMod);
    float halfWidth = baseWidth * (0.5 + tooth * 0.5);
    if (abs(localX) > halfWidth) discard;
    vec3 varTint = vec3(
      fract(sin(vColorVar * 127.1) * 43758.5),
      fract(sin(vColorVar * 269.5) * 18732.3),
      fract(sin(vColorVar * 419.2) * 95124.7)
    );
    varTint = (varTint - 0.5) * uColorVariation * 0.2;
    vec3 base = uBaseColor + varTint;
    vec3 tip = uTipColor + varTint;
    vec3 color = mix(base, tip, normalizedY);
    float spine = 1.0 - smoothstep(0.0, uFrondWidth * 0.05, abs(localX));
    color = mix(color, color * 0.7, spine * 0.3);
    float ao = smoothstep(0.0, 0.15, y);
    gl_FragColor = vec4(color * (0.4 + ao * 0.6), 1.0);
  }
`

// ── Seaweed ────────────────────────────────────────────────

const seaweedFragment = /* glsl */ `
  varying vec2 vUv;
  varying float vColorVar;
  varying vec3 vWorldPos;

  uniform vec3 uBaseColor;
  uniform vec3 uTipColor;
  uniform float uColorVariation;
  uniform float uBladeWidth;
  uniform float uTime;
  uniform float uWaveFreq;
  uniform float uEdgeWave;
  uniform float uRibbonWidth;

  void main() {
    float x = vUv.x;
    float y = vUv.y;
    float numRibbons = 2.0;
    float ribbonSpace = 1.0 / numRibbons;
    float localX = mod(x, ribbonSpace) / ribbonSpace - 0.5;
    float maxH = 0.6 + fract(sin(vColorVar * 93.17) * 24831.1) * 0.4;
    if (y > maxH) discard;
    float normalizedY = y / maxH;
    float taper = 1.0 - normalizedY * 0.3;
    float waveOffset = sin(normalizedY * uWaveFreq + uTime * 0.8 + vColorVar * 6.28) * uEdgeWave;
    float halfWidth = uRibbonWidth * 0.5 * taper;
    float shiftedX = localX - waveOffset * 0.1;
    if (abs(shiftedX) > halfWidth) discard;
    vec3 varTint = vec3(
      fract(sin(vColorVar * 127.1) * 43758.5),
      fract(sin(vColorVar * 269.5) * 18732.3),
      fract(sin(vColorVar * 419.2) * 95124.7)
    );
    varTint = (varTint - 0.5) * uColorVariation * 0.25;
    vec3 base = uBaseColor + varTint;
    vec3 tip = uTipColor + varTint;
    vec3 color = mix(base, tip, normalizedY);
    float translucency = normalizedY * 0.3;
    color += translucency * vec3(0.1, 0.2, 0.05);
    float ao = smoothstep(0.0, 0.2, y);
    gl_FragColor = vec4(color * (0.4 + ao * 0.6), 1.0);
  }
`

// ── Wildflowers ────────────────────────────────────────────

const wildflowersFragment = /* glsl */ `
  varying vec2 vUv;
  varying float vColorVar;

  uniform vec3 uBaseColor;
  uniform vec3 uTipColor;
  uniform float uColorVariation;
  uniform float uBladeWidth;
  uniform float uPetalSize;

  void main() {
    float x = vUv.x;
    float y = vUv.y;
    float localX = x - 0.5;
    float maxH = 0.6 + fract(sin(vColorVar * 93.17) * 24831.1) * 0.4;
    if (y > maxH) discard;
    float normalizedY = y / maxH;

    float flowerStart = 0.7;
    if (normalizedY < flowerStart) {
      float stemWidth = uBladeWidth * 0.3;
      if (abs(localX) > stemWidth) discard;
      vec3 color = mix(uBaseColor, uTipColor, normalizedY / flowerStart);
      float ao = smoothstep(0.0, 0.15, y);
      gl_FragColor = vec4(color * (0.5 + ao * 0.5), 1.0);
    } else {
      float flowerY = (normalizedY - flowerStart) / (1.0 - flowerStart);
      float cx = localX / (uPetalSize * 0.5);
      float cy = (flowerY - 0.5) * 2.0;
      float r = sqrt(cx * cx + cy * cy);
      if (r > 1.0) discard;
      float angle = atan(cy, cx);
      float petalShape = cos(angle * 2.5) * 0.3 + 0.7;
      if (r > petalShape) discard;
      float paletteSeed = floor(vColorVar * 4.0) / 4.0;
      vec3 petalColor;
      if (paletteSeed < 0.25) petalColor = vec3(0.95, 0.4, 0.6);
      else if (paletteSeed < 0.5) petalColor = vec3(0.6, 0.4, 0.85);
      else if (paletteSeed < 0.75) petalColor = vec3(0.95, 0.85, 0.3);
      else petalColor = vec3(0.95, 0.92, 0.88);
      if (r < 0.2) petalColor = vec3(0.95, 0.85, 0.2);
      gl_FragColor = vec4(petalColor, 1.0);
    }
  }
`

// ── Crystals ───────────────────────────────────────────────

const crystalsFragment = /* glsl */ `
  varying vec2 vUv;
  varying float vColorVar;

  uniform vec3 uBaseColor;
  uniform vec3 uTipColor;
  uniform float uColorVariation;
  uniform float uBladeWidth;
  uniform float uTime;
  uniform float uHueSpeed;
  uniform float uHueBase;

  vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }

  void main() {
    float x = vUv.x;
    float y = vUv.y;
    float numShards = 3.0;
    float shardSpace = 1.0 / numShards;
    float localX = mod(x, shardSpace) / shardSpace - 0.5;
    float shardIdx = floor(x * numShards);
    float heightSeed = fract(sin(shardIdx * 73.17 + 191.3) * 24831.1);
    float widthSeed = fract(sin(shardIdx * 147.3 + 89.1) * 31247.7);
    float shardMaxH = 0.4 + heightSeed * 0.6;
    if (y > shardMaxH) discard;
    float normalizedY = y / shardMaxH;
    float asymmetry = (widthSeed - 0.5) * 0.2;
    float taper = 1.0 - normalizedY;
    float halfWidth = taper * (uBladeWidth * 4.0 + widthSeed * uBladeWidth * 4.0);
    if (localX < -halfWidth + asymmetry || localX > halfWidth + asymmetry) discard;
    float hue = uHueBase + vColorVar * 0.3 + sin(uTime * uHueSpeed + y * 3.0) * 0.08;
    float sat = 0.5 + normalizedY * 0.3;
    float val = 0.5 + normalizedY * 0.5;
    vec3 color = hsv2rgb(vec3(fract(hue), sat, val));
    float edgeBright = pow(1.0 - abs((localX - asymmetry) / halfWidth), 4.0) * 0.2;
    color += edgeBright;
    gl_FragColor = vec4(color, 1.0);
  }
`

// ── Dandelions ─────────────────────────────────────────────

const dandelionsFragment = /* glsl */ `
  varying vec2 vUv;
  varying float vColorVar;

  uniform vec3 uBaseColor;
  uniform vec3 uTipColor;
  uniform float uColorVariation;
  uniform float uBladeWidth;
  uniform float uTime;
  uniform float uPuffSize;
  uniform float uNoiseThreshold;

  float hash2d(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise2d(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash2d(i);
    float b = hash2d(i + vec2(1.0, 0.0));
    float c = hash2d(i + vec2(0.0, 1.0));
    float d = hash2d(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  void main() {
    float x = vUv.x;
    float y = vUv.y;
    float localX = x - 0.5;
    float maxH = 0.7 + fract(sin(vColorVar * 93.17) * 24831.1) * 0.3;
    if (y > maxH) discard;
    float normalizedY = y / maxH;

    float puffStart = 1.0 - uPuffSize;
    if (normalizedY < puffStart) {
      float stemWidth = uBladeWidth * 0.25;
      if (abs(localX) > stemWidth) discard;
      vec3 color = mix(uBaseColor, uTipColor, normalizedY / puffStart);
      float ao = smoothstep(0.0, 0.1, y);
      gl_FragColor = vec4(color * (0.5 + ao * 0.5), 1.0);
    } else {
      float puffY = (normalizedY - puffStart) / uPuffSize;
      float cx = localX / (uPuffSize * 0.4);
      float cy = (puffY - 0.5) * 2.0;
      float r = sqrt(cx * cx + cy * cy);
      if (r > 1.0) discard;
      float n = noise2d(vec2(cx, cy) * 6.0 + vColorVar * 10.0 + uTime * 0.3);
      float edgeFade = smoothstep(1.0, 0.5, r);
      float threshold = uNoiseThreshold + (1.0 - edgeFade) * 0.3;
      if (n < threshold) discard;
      vec3 puffColor = vec3(0.95, 0.93, 0.88);
      float brightness = 0.8 + n * 0.2;
      gl_FragColor = vec4(puffColor * brightness, 1.0);
    }
  }
`

// ── Fireflies ──────────────────────────────────────────────

const firefliesFragment = /* glsl */ `
  varying vec2 vUv;
  varying float vColorVar;

  uniform float uTime;
  uniform float uPulseRate;
  uniform float uGlowSize;

  void main() {
    float edgeDist = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
    if (edgeDist < 0.05) discard;
    float x = vUv.x - 0.5;
    float y = vUv.y - 0.5;
    float r = sqrt(x * x + y * y);
    float size = min(uGlowSize, 0.35);
    if (r > size) discard;
    float glow = smoothstep(size, 0.0, r);
    glow = pow(glow, 2.0);
    float edgeFade = smoothstep(0.05, 0.15, edgeDist);
    glow *= edgeFade;
    float pulse = pow(max(0.0, sin(uTime * uPulseRate + vColorVar * 6.28)), 4.0);
    float brightness = glow * pulse;
    if (brightness < 0.01) discard;
    vec3 color = mix(vec3(0.2, 0.8, 0.0), vec3(0.9, 1.0, 0.3), glow);
    gl_FragColor = vec4(color * brightness, brightness);
  }
`

// ── Registry ───────────────────────────────────────────────

export const variants: Record<string, ShaderVariant> = {
  grass: {
    label: 'Classic Grass',
    vertex: vertexWind,
    fragment: grassFragment,
    controls: {},
    groundColor: '#2d5a1e',
  },
  wheat: {
    label: 'Wheat',
    vertex: vertexWind,
    fragment: wheatFragment,
    controls: {
      stalkWidth: { value: 0.03, min: 0.01, max: 0.1, step: 0.005 },
      seedHeadSize: { value: 0.25, min: 0.1, max: 0.5, step: 0.05 },
    },
    sharedDefaults: {
      baseColor: '#c4a035', tipColor: '#e8d574',
      bladeHeight: 0.7, bladeHeightVar: 0.15, windStrength: 0.5,
    },
    groundColor: '#8b7d3c',
  },
  wildflowers: {
    label: 'Wildflowers',
    vertex: vertexWind,
    fragment: wildflowersFragment,
    controls: {
      petalSize: { value: 0.25, min: 0.1, max: 0.5, step: 0.05 },
    },
    sharedDefaults: {
      baseColor: '#2d6b2d', tipColor: '#5a9b3a',
      bladeHeight: 0.5, windStrength: 0.2, windSpeed: 0.8,
    },
    groundColor: '#3a6b2a',
  },
  mushrooms: {
    label: 'Mushrooms',
    vertex: vertexWind,
    fragment: mushroomsFragment,
    controls: {
      capWidth: { value: 0.4, min: 0.15, max: 0.8, step: 0.05 },
      spotDensity: { value: 0.5, min: 0, max: 1, step: 0.05 },
    },
    sharedDefaults: {
      bladeHeight: 0.3, bladeHeightVar: 0.1, bladeWidth: 0.04,
      windStrength: 0.02, windSpeed: 0.3,
    },
    groundColor: '#2a3a1e',
  },
  crystals: {
    label: 'Crystal Spikes',
    vertex: vertexStatic,
    fragment: crystalsFragment,
    controls: {
      hueSpeed: { value: 0.5, min: 0, max: 3, step: 0.1 },
      hueBase: { value: 0.55, min: 0, max: 1, step: 0.01 },
      vibrateAmp: { value: 0.002, min: 0, max: 0.01, step: 0.001 },
    },
    sharedDefaults: {
      bladeHeight: 0.6, bladeHeightVar: 0.3, windStrength: 0,
      baseColor: '#4a2a6b', tipColor: '#8b6bb5',
    },
    groundColor: '#1a1a2e',
  },
  seaweed: {
    label: 'Seaweed / Kelp',
    vertex: vertexWind,
    fragment: seaweedFragment,
    controls: {
      waveFreq: { value: 6.0, min: 2, max: 15, step: 0.5 },
      edgeWave: { value: 0.5, min: 0, max: 1, step: 0.05 },
      ribbonWidth: { value: 0.2, min: 0.05, max: 0.5, step: 0.05 },
    },
    sharedDefaults: {
      baseColor: '#2a7a4a', tipColor: '#5aba6a',
      bladeHeight: 0.8, windSpeed: 0.6, windStrength: 0.3,
    },
    groundColor: '#0a1520',
  },
  ferns: {
    label: 'Ferns',
    vertex: vertexWind,
    fragment: fernsFragment,
    controls: {
      toothCount: { value: 8, min: 3, max: 20, step: 1 },
      frondWidth: { value: 0.4, min: 0.1, max: 0.8, step: 0.05 },
    },
    sharedDefaults: {
      baseColor: '#2a6a2a', tipColor: '#6aba4a',
      bladeHeight: 0.5, bladeHeightVar: 0.2, windStrength: 0.15,
    },
    groundColor: '#0e1a08',
  },
  thorns: {
    label: 'Thorns / Spikes',
    vertex: vertexStatic,
    fragment: thornsFragment,
    controls: {
      vibrateAmp: { value: 0.002, min: 0, max: 0.01, step: 0.001 },
    },
    sharedDefaults: {
      baseColor: '#2a2d30', tipColor: '#6a7078',
      bladeHeight: 0.5, bladeHeightVar: 0.25, bladeWidth: 0.05,
      windStrength: 0,
    },
    groundColor: '#1a0e08',
  },
  dandelions: {
    label: 'Dandelion Puffs',
    vertex: vertexWind,
    fragment: dandelionsFragment,
    controls: {
      puffSize: { value: 0.3, min: 0.15, max: 0.5, step: 0.05 },
      noiseThreshold: { value: 0.35, min: 0.1, max: 0.7, step: 0.05 },
    },
    sharedDefaults: {
      baseColor: '#5a8a3a', tipColor: '#7aaa5a',
      bladeHeight: 0.6, windStrength: 0.15, windSpeed: 0.8,
    },
    groundColor: '#3a5a2a',
  },
  fireflies: {
    label: 'Fireflies',
    vertex: vertexFloat,
    fragment: firefliesFragment,
    controls: {
      pulseRate: { value: 2.0, min: 0.5, max: 5, step: 0.1 },
      floatSpeed: { value: 1.0, min: 0.1, max: 3, step: 0.1 },
      glowSize: { value: 0.3, min: 0.05, max: 0.5, step: 0.05 },
    },
    sharedDefaults: {
      density: 5000, bladeHeight: 0.15, bladeHeightVar: 0.05, windStrength: 0,
    },
    groundColor: '#0a1a0a',
    materialConfig: {
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    },
  },
}
