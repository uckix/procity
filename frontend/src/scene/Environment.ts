/** Static environment: fog, ground, grid, distant skyline, selection beacon. */
import * as THREE from 'three'
import { THEME } from '../theme'

export class Environment {
  group = new THREE.Group()
  beacon: THREE.Group
  private ring: THREE.Mesh
  private beam: THREE.Mesh

  constructor(scene: THREE.Scene) {
    scene.background = new THREE.Color(THEME.background)
    scene.fog = new THREE.FogExp2(THEME.background, THEME.envFogDensity)

    // Dark reflective-looking ground.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(1600, 1600),
      new THREE.MeshBasicMaterial({ color: THEME.ground }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.02
    this.group.add(ground)

    // Subtle neon grid.
    const grid = new THREE.GridHelper(1400, 96, THEME.gridMajor, THEME.gridMinor)
    ;(grid.material as THREE.Material).transparent = true
    ;(grid.material as THREE.Material).opacity = THEME.gridOpacity
    grid.position.y = 0.0
    this.group.add(grid)

    // Distant skyline silhouettes on an outer ring.
    const N = 420
    const skyGeo = new THREE.BoxGeometry(1, 1, 1)
    skyGeo.translate(0, 0.5, 0)
    const skyMat = new THREE.MeshBasicMaterial({ color: THEME.skyline })
    const sky = new THREE.InstancedMesh(skyGeo, skyMat, N)
    const dummy = new THREE.Object3D()
    for (let i = 0; i < N; i++) {
      const ang = (i / N) * Math.PI * 2 + Math.random() * 0.05
      const rad = 120 + Math.pow(Math.random(), 0.7) * 220
      dummy.position.set(Math.cos(ang) * rad, 0, Math.sin(ang) * rad)
      const h = 2 + Math.pow(Math.random(), 2.2) * 22
      dummy.scale.set(2.5 + Math.random() * 4, h, 2.5 + Math.random() * 4)
      dummy.rotation.set(0, Math.random() * 0.4 - 0.2, 0)
      dummy.updateMatrix()
      sky.setMatrixAt(i, dummy.matrix)
    }
    sky.instanceMatrix.needsUpdate = true
    this.group.add(sky)

    // Faint neon window specks on the skyline.
    const dotCount = 2600
    const dotGeo = new THREE.BufferGeometry()
    const dotPos = new Float32Array(dotCount * 3)
    const dotCol = new Float32Array(dotCount * 3)
    for (let i = 0; i < dotCount; i++) {
      const ang = Math.random() * Math.PI * 2
      const rad = 122 + Math.pow(Math.random(), 0.7) * 215
      dotPos[i * 3] = Math.cos(ang) * rad
      dotPos[i * 3 + 1] = Math.random() * 16
      dotPos[i * 3 + 2] = Math.sin(ang) * rad
      const warm = Math.random() < 0.5
      const dim = 0.25 + Math.random() * 0.45
      dotCol[i * 3] = warm ? dim : dim * 0.2
      dotCol[i * 3 + 1] = warm ? dim * 0.5 : dim * 0.7
      dotCol[i * 3 + 2] = warm ? dim * 0.2 : dim
    }
    dotGeo.setAttribute('position', new THREE.BufferAttribute(dotPos, 3))
    dotGeo.setAttribute('color', new THREE.BufferAttribute(dotCol, 3))
    const dots = new THREE.Points(
      dotGeo,
      new THREE.PointsMaterial({ size: 0.55, vertexColors: true, transparent: true, opacity: 0.7 }),
    )
    this.group.add(dots)

    scene.add(this.group)

    // Selection beacon: base ring + vertical light beam.
    this.beacon = new THREE.Group()
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(1.6, 2.1, 40),
      new THREE.MeshBasicMaterial({ color: THEME.beacon, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    )
    this.ring.rotation.x = -Math.PI / 2
    this.ring.position.y = 0.06
    this.beacon.add(this.ring)
    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.28, 1, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: THEME.beacon,
        transparent: true,
        opacity: 0.18,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    )
    this.beacon.add(this.beam)
    this.beacon.visible = false
    scene.add(this.beacon)
  }

  /** Position the beacon on the selected building, call each frame. */
  updateBeacon(x: number | null, z: number | null, topY: number, time: number) {
    if (x === null || z === null) {
      this.beacon.visible = false
      return
    }
    this.beacon.visible = true
    this.beacon.position.set(x, 0, z)
    this.beam.position.y = topY / 2
    this.beam.scale.y = Math.max(topY, 2)
    const pulse = 0.5 + 0.4 * Math.sin(time * 5)
    ;(this.beam.material as THREE.MeshBasicMaterial).opacity = 0.1 + 0.12 * pulse
    this.ring.scale.setScalar(0.9 + 0.15 * pulse)
  }
}
