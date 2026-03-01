import React, { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'

export function FpsOverlay() {
  const ref = useRef<HTMLDivElement>(null)
  const frames = useRef(0)
  const lastTime = useRef(performance.now())

  useFrame(() => {
    frames.current++
    const now = performance.now()
    const elapsed = now - lastTime.current
    if (elapsed >= 500) {
      const fps = Math.round((frames.current / elapsed) * 1000)
      const ms = (elapsed / frames.current).toFixed(1)
      if (ref.current) ref.current.textContent = `${fps} fps / ${ms} ms`
      frames.current = 0
      lastTime.current = now
    }
  })

  return (
    <Html
      calculatePosition={() => [0, 0, 0]}
      style={{
        position: 'fixed',
        top: 8,
        right: 8,
        background: 'rgba(0,0,0,0.6)',
        color: '#0f0',
        fontFamily: 'monospace',
        fontSize: 12,
        padding: '2px 6px',
        borderRadius: 3,
        pointerEvents: 'none',
        zIndex: 9999,
        whiteSpace: 'nowrap',
      }}
    >
      <div ref={ref}>-- fps</div>
    </Html>
  )
}
