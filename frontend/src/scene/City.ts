/** The instanced process city: layout, spawn/despawn, animation, picking. */
import * as THREE from 'three'
import type { FilterKind, Metric, ProcessInfo, Snapshot } from '../types'
import { cpuColor, heightForProcess, matchFilter } from '../lib/logic'
import { Building } from './Building'
import { THEME } from '../theme'

const SPACING = 3.6
const GRID_R = 22 // diamond-ish grid of ~1480 slots (buildings beyond that are not drawn)
const CAPACITY = 2000

const VERT = /* glsl */ `
varying vec3 vWorld;
varying vec2 vUv;
varying vec3 vNeon;
varying float vSeed;
varying vec3 vNormalW;

void main() {
  vec4 local = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    local = instanceMatrix * local;
  #endif
  #ifdef USE_INSTANCING_COLOR
    vNeon = instanceColor;
  #else
    vNeon = vec3(0.05, 0.14, 0.4);
  #endif
  vec4 world = modelMatrix * local;
  vWorld = world.xyz;
  vUv = uv;
  vNormalW = normal; // buildings are axis-aligned, no rotation applied
  vSeed = fract(sin(dot(vWorld.xz, vec2(12.9898, 78.233))) * 43758.5453);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

const FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform vec3 uBaseA;
uniform vec3 uBaseB;
varying vec3 vWorld;
varying vec2 vUv;
varying vec3 vNeon;
varying float vSeed;
varying vec3 vNormalW;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  // Dark structural body with a subtle vertical gradient + face shading.
  vec3 base = mix(uBaseA, uBaseB, smoothstep(0.0, 30.0, vWorld.y));
  float face = 0.55 + 0.45 * clamp(dot(normalize(vNormalW), normalize(vec3(0.35, 0.8, 0.45))), 0.0, 1.0);
  base *= face;

  // Illuminated window bands on the side faces.
  vec2 cellUv = vec2(vUv.x * 7.0, vWorld.y * 0.55);
  vec2 cell = floor(cellUv);
  vec2 f = fract(cellUv);
  float lit = step(0.45, hash(cell + vSeed * 97.0));
  float winX = smoothstep(0.18, 0.30, f.x) * (1.0 - smoothstep(0.70, 0.82, f.x));
  float winY = smoothstep(0.25, 0.45, f.y) * (1.0 - smoothstep(0.60, 0.80, f.y));
  float side = step(0.15, abs(vNormalW.y) > 0.5 ? 0.0 : 1.0);
  float win = winX * winY * lit * side * 0.85;

  // Thin glowing edges around every face.
  vec2 e = min(vUv, 1.0 - vUv);
  float edge = 1.0 - smoothstep(0.0, 0.045, min(e.x, e.y));
  float topEdge = (1.0 - smoothstep(0.0, 0.06, e.y)) * step(0.85, vUv.y);

  // High-CPU buildings pulse more.
  float lum = dot(vNeon, vec3(0.299, 0.587, 0.114));
  float pulse = 1.0 + 0.35 * sin(uTime * (2.5 + 5.0 * lum)) * smoothstep(0.25, 0.9, lum);

  vec3 color = base;
  color += vNeon * (win * pulse + edge * 0.75 + topEdge * 1.3);

  // Manual exponential-squared fog to the background color.
  float dist = length(vWorld - cameraPosition);
  float fog = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  color = mix(color, uFogColor, clamp(fog, 0.0, 1.0));

  gl_FragColor = vec4(color, 1.0);
}
`

export class City {
  group = new THREE.Group()
  mesh: THREE.InstancedMesh
  private mat: THREE.ShaderMaterial
  private slots: Array<{ x: number; z: number }>
  private freeSlots: number[]
  private buildings = new Map<string, Building>()
  private instances: Building[] = []
  private tmpObj = new THREE.Object3D()
  private tmpColor = new THREE.Color()
  private metric: Metric = 'mem'
  private filter: FilterKind = 'all'
  private currentUid: number | null = null
  private selected: string | null = null
  private hovered: string | null = null

  constructor() {
    // Precompute slots on a grid, ordered by distance from the centre so the
    // city grows outward from downtown and stays stable per-process.
    const slots: Array<{ x: number; z: number }> = []
    for (let gx = -GRID_R; gx <= GRID_R; gx++) {
      for (let gz = -GRID_R; gz <= GRID_R; gz++) {
        if (Math.abs(gx) + Math.abs(gz) > GRID_R + 6) continue // rounded city
        slots.push({ x: gx * SPACING, z: gz * SPACING })
      }
    }
    slots.sort((a, b) => a.x * a.x + a.z * a.z - (b.x * b.x + b.z * b.z))
    this.slots = slots
    this.freeSlots = slots.map((_, i) => i)

    const geo = new THREE.BoxGeometry(1, 1, 1)
    geo.translate(0, 0.5, 0) // grow upward from the ground
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uFogColor: { value: new THREE.Color(THEME.background) },
        uFogDensity: { value: THEME.fogDensity },
        uBaseA: { value: new THREE.Color(THEME.buildingBase) },
        uBaseB: { value: new THREE.Color(THEME.buildingTop) },
      },
    })
    this.mesh = new THREE.InstancedMesh(geo, this.mat, CAPACITY)
    this.mesh.count = 0
    this.mesh.frustumCulled = false
    // Raycasting tests this sphere first; three.js computes it once and never
    // refreshes it, so a sphere taken while buildings were still growing (or
    // count was 0) makes clicks miss. Use a fixed sphere covering the city.
    this.mesh.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(0, 0, 0),
      Math.hypot((GRID_R + 1) * SPACING, (GRID_R + 1) * SPACING, 40),
    )
    // Create the instanceColor buffer.
    this.tmpColor.setRGB(0.05, 0.14, 0.4)
    for (let i = 0; i < CAPACITY; i++) this.mesh.setColorAt(i, this.tmpColor)
    this.mesh.instanceColor!.needsUpdate = true
    this.group.add(this.mesh)
  }

  setMetric(m: Metric) {
    this.metric = m
  }

  setFilter(f: FilterKind, currentUid: number | null) {
    this.filter = f
    this.currentUid = currentUid
  }

  setSelected(identity: string | null) {
    this.selected = identity
  }

  get count(): number {
    return this.buildings.size
  }

  get list(): Building[] {
    return this.instances
  }

  getBuilding(identity: string | null): Building | undefined {
    if (!identity) return undefined
    return this.buildings.get(identity)
  }

  /** Apply a new monitoring snapshot (1 Hz) — stable slot assignment. */
  update(snap: Snapshot) {
    const seen = new Set<string>()
    let added = false
    for (const p of snap.processes) {
      seen.add(p.identity)
      const h = heightForProcess(p, this.metric)
      const c = cpuColor(p.cpu_percent)
      const dim = matchFilter(p, this.filter, this.currentUid) ? 1 : 0.12
      const existing = this.buildings.get(p.identity)
      if (existing) {
        existing.data = p
        existing.dying = false // reappeared before its collapse finished
        existing.hTgt = h
        existing.colorTgt = c
        existing.glowTgt = dim
      } else {
        const slot = this.freeSlots.shift() ?? this.slots.length // overflow: none rendered
        if (slot >= this.slots.length) continue
        const pos = this.slots[slot]
        const b = new Building(p, slot, pos.x, pos.z, h, c)
        b.glowTgt = dim
        b.glow = 0.2
        this.buildings.set(p.identity, b)
        this.instances.push(b)
        added = true
      }
    }
    if (added) this.rebuildIndex()
    // Processes that vanished start their collapse animation.
    for (const [identity, b] of this.buildings) {
      if (!seen.has(identity) && !b.dying) {
        b.dying = true
        b.hTgt = 0.01
        b.glowTgt = 0
      }
    }
  }

  /** Per-frame animation; interpolates heights, colors, glow between ticks. */
  tick(dt: number, time: number) {
    this.mat.uniforms.uTime.value = time
    const k = 1 - Math.exp(-dt * 4.0)
    const mesh = this.mesh

    // Remove fully collapsed buildings first, so instance indices are final
    // before any matrix is written (removing mid-loop shifted later
    // instances and left a stale duplicate at the end for a frame).
    let removed = false
    for (const b of this.instances) {
      if (b.dying && b.hCur < 0.12) {
        this.buildings.delete(b.identity)
        this.freeSlots.push(b.slot)
        removed = true
      }
    }
    if (removed) {
      this.instances = this.instances.filter((b) => this.buildings.has(b.identity))
      this.freeSlots.sort((a, z) => a - z)
      this.rebuildIndex()
    }

    const n = this.instances.length
    for (let i = 0; i < n; i++) {
      const b = this.instances[i]
      b.hCur += (b.hTgt - b.hCur) * k
      for (let c = 0; c < 3; c++) {
        b.colorCur[c] += (b.colorTgt[c] - b.colorCur[c]) * k
      }
      b.glow += (b.glowTgt - b.glow) * k

      const o = this.tmpObj
      o.position.set(b.x, 0, b.z)
      o.scale.set(b.w, b.hCur, b.d)
      o.rotation.set(0, 0, 0)
      o.updateMatrix()
      mesh.setMatrixAt(i, o.matrix)

      let g = b.glow
      if (b.identity === this.selected) g = Math.max(g, 1) * (0.9 + 0.1 * Math.sin(time * 6))
      else if (b.identity === this.hovered) g = Math.min(1, g * 1.6)
      const col = this.tmpColor
      col.setRGB(b.colorCur[0] * g, b.colorCur[1] * g, b.colorCur[2] * g)
      mesh.setColorAt(i, col)
    }

    mesh.count = n
    mesh.instanceMatrix.needsUpdate = true
    mesh.instanceColor!.needsUpdate = true
  }

  /** identity -> current world position + height, for camera focus. */
  focusPoint(identity: string | null): { pos: THREE.Vector3; height: number } | null {
    const b = this.getBuilding(identity)
    if (!b) return null
    return { pos: new THREE.Vector3(b.x, 0, b.z), height: b.hTgt }
  }

  private index = new Map<string, number>()
  private rebuildIndex() {
    this.index.clear()
    for (let i = 0; i < this.instances.length; i++) this.index.set(this.instances[i].identity, i)
  }

  identityAt(instanceId: number): string | null {
    const b = this.instances[instanceId]
    return b && !b.dying ? b.identity : null
  }

  instanceIndexOf(identity: string | null): number {
    if (!identity) return -1
    const i = this.index.get(identity)
    return i === undefined ? -1 : i
  }

  setHovered(identity: string | null) {
    this.hovered = identity
  }
}
