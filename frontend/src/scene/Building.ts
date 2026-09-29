/** Per-building animation state. Rendering is fully instanced by City. */
import type { ProcessInfo } from '../types'

export class Building {
  data: ProcessInfo
  slot: number
  x: number
  z: number
  w: number
  d: number

  hCur = 0.01
  hTgt: number
  colorCur: [number, number, number] = [0.05, 0.14, 0.4]
  colorTgt: [number, number, number]
  glow = 1
  glowTgt = 1
  dying = false

  constructor(data: ProcessInfo, slot: number, x: number, z: number, hTgt: number, color: [number, number, number]) {
    this.data = data
    this.slot = slot
    this.x = x
    this.z = z
    this.hTgt = hTgt
    this.colorTgt = color
    // Slight deterministic footprint variation from the identity hash.
    let hash = 0
    for (let i = 0; i < data.identity.length; i++) hash = (hash * 31 + data.identity.charCodeAt(i)) | 0
    const r1 = ((hash >>> 8) & 0xff) / 255
    const r2 = ((hash >>> 16) & 0xff) / 255
    this.w = 1.7 + r1 * 0.9
    this.d = 1.7 + r2 * 0.9
  }

  get pid(): number {
    return this.data.pid
  }

  get identity(): string {
    return this.data.identity
  }
}
