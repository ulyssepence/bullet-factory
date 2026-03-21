import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { EffectComposer } from '@react-three/postprocessing'
import { GamePostFX, wrapFragment, SHADER_UNIFORMS, SHADER_PREAMBLE, PREAMBLE_LINE_COUNT } from '../../../template/src/postfx'
import { Scene } from './scene'

import { PRESETS, DEFAULT_PRESET_NAME } from './presets'

import ace from 'ace-builds'
import 'ace-builds/src-noconflict/mode-glsl'
import 'ace-builds/src-noconflict/theme-monokai'

const STUB_PREAMBLE = `precision highp float;\nuniform sampler2D inputBuffer;\nvarying vec2 vUv;\n`

function testCompile(body: string): string | null {
  const canvas = document.createElement('canvas')
  const gl = canvas.getContext('webgl')
  if (!gl) return 'No WebGL context'

  const shader = gl.createShader(gl.FRAGMENT_SHADER)
  if (!shader) return 'Failed to create shader'

  const STUB_MAIN = `\nvoid main() { vec4 o; mainImage(vec4(0.0), vUv, o); gl_FragColor = o; }\n`
  const fullSrc = STUB_PREAMBLE + wrapFragment(body) + STUB_MAIN
  gl.shaderSource(shader, fullSrc)
  gl.compileShader(shader)

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) || 'Unknown error'
    gl.deleteShader(shader)
    canvas.remove()
    return log
  }

  gl.deleteShader(shader)
  canvas.remove()
  return null
}

function adjustErrorLines(error: string): string {
  const stubLines = STUB_PREAMBLE.split('\n').length - 1
  return error.replace(/ERROR:\s*\d+:(\d+)/g, (match, lineStr) => {
    const line = parseInt(lineStr)
    const adjusted = line - stubLines - PREAMBLE_LINE_COUNT + 1
    return adjusted > 0 ? `ERROR: line ${adjusted}` : match
  })
}

function PostFXBridge({ effect }: { effect: GamePostFX }) {
  return (
    <EffectComposer>
      <primitive object={effect} />
    </EffectComposer>
  )
}

function SceneWithPostFX({ effect }: { effect: GamePostFX }) {
  const { camera } = useThree()
  const worldSize = 48
  const center = worldSize / 2

  useEffect(() => {
    camera.position.set(center, center * 1.2, center + center * 0.8)
    ;(camera as any).lookAt?.(center, 0.6, center)
  }, [camera, center])

  return (
    <>
      <OrbitControls target={[center, 0.6, center]} enableZoom enablePan />
      <Scene />
      <PostFXBridge effect={effect} />
    </>
  )
}

function App() {
  const [error, setError] = useState<string | null>(null)
  const editorRef = useRef<ace.Ace.Editor | null>(null)
  const editorContainerRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const defaultPreset = useMemo(() => PRESETS.find(p => p.name === DEFAULT_PRESET_NAME)!, [])
  const effect = useMemo(() => {
    const fx = new GamePostFX()
    fx.setBody(defaultPreset.body)
    return fx
  }, [])

  const categories = useMemo(() => {
    const cats: string[] = []
    for (const p of PRESETS) {
      if (!cats.includes(p.category)) cats.push(p.category)
    }
    return cats
  }, [])

  const handlePresetChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const idx = parseInt(e.target.value)
    if (isNaN(idx)) return
    const preset = PRESETS[idx]
    if (!preset || !editorRef.current) return
    editorRef.current.setValue(preset.body, -1)
  }, [])

  useEffect(() => {
    if (!editorContainerRef.current) return
    const editor = ace.edit(editorContainerRef.current, {
      mode: 'ace/mode/glsl',
      theme: 'ace/theme/monokai',
      value: defaultPreset.body,
      fontSize: 14,
      showPrintMargin: false,
      tabSize: 2,
      wrap: true,
    })
    editorRef.current = editor

    editor.session.on('change', () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        const body = editor.getValue()
        const err = testCompile(body)
        if (err) {
          setError(adjustErrorLines(err))
        } else {
          setError(null)
          effect.setBody(body)
        }
      }, 300)
    })

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      editor.destroy()
    }
  }, [effect])

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <div style={{ width: '40%', display: 'flex', flexDirection: 'column', background: '#1e1e1e' }}>
        <div style={{
          padding: '8px 12px', background: '#2d2d2d', color: '#ccc',
          fontFamily: 'monospace', fontSize: 12, borderBottom: '1px solid #444',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span>Fragment Shader Body</span>
          <select
            onChange={handlePresetChange}
            defaultValue=""
            style={{
              background: '#1e1e1e', color: '#ccc', border: '1px solid #555',
              padding: '2px 6px', fontFamily: 'monospace', fontSize: 12,
              borderRadius: 3, cursor: 'pointer', flex: 1, maxWidth: 260,
            }}
          >
            <option value="" disabled>Load preset...</option>
            {categories.map(cat => (
              <optgroup key={cat} label={cat}>
                {PRESETS.map((p, i) =>
                  p.category === cat ? <option key={i} value={i}>{p.name}</option> : null
                )}
              </optgroup>
            ))}
          </select>
        </div>
        <div ref={editorContainerRef} style={{ flex: 1 }} />
        {error && (
          <div style={{
            background: '#4a1111', color: '#ff8888', padding: '8px 12px',
            fontFamily: 'monospace', fontSize: 12, maxHeight: 120, overflow: 'auto',
            borderTop: '1px solid #ff4444', whiteSpace: 'pre-wrap',
          }}>
            {error}
          </div>
        )}
      </div>

      <Canvas
        shadows
        camera={{ fov: 50, near: 0.1, far: 500 }}
        style={{ width: '60%', height: '100%', background: '#222' }}
      >
        <SceneWithPostFX effect={effect} />
      </Canvas>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
