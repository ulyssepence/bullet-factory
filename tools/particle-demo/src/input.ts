const keys = new Set<string>()

window.addEventListener('keydown', (e) => keys.add(e.code))
window.addEventListener('keyup', (e) => keys.delete(e.code))

export function getMovement(): [number, number] {
  let x = 0
  let z = 0
  if (keys.has('KeyW') || keys.has('ArrowUp')) z -= 1
  if (keys.has('KeyS') || keys.has('ArrowDown')) z += 1
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1
  const len = Math.sqrt(x * x + z * z)
  if (len > 0) { x /= len; z /= len }
  return [x, z]
}
