/** Camera: orbit controls with smooth focus/reset tweens. */
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

const DEFAULT_POS = new THREE.Vector3(74, 56, 74)
const DEFAULT_TARGET = new THREE.Vector3(0, 0, 0)

export class CameraRig {
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  private tween: {
    t: number
    dur: number
    fromPos: THREE.Vector3
    toPos: THREE.Vector3
    fromTgt: THREE.Vector3
    toTgt: THREE.Vector3
  } | null = null

  constructor(dom: HTMLElement, aspect: number) {
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 2200)
    this.camera.position.copy(DEFAULT_POS)
    this.controls = new OrbitControls(this.camera, dom)
    this.controls.target.copy(DEFAULT_TARGET)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.minDistance = 8
    this.controls.maxDistance = 500
    this.controls.maxPolarAngle = Math.PI * 0.49
    this.controls.zoomSpeed = 1.1
    this.controls.panSpeed = 0.9
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    }
  }

  resize(aspect: number) {
    this.camera.aspect = aspect
    this.camera.updateProjectionMatrix()
  }

  /** Fly to a building, keeping a comfortable viewing offset. */
  focusOn(pos: THREE.Vector3, height: number, instant = false) {
    const dist = 18 + height * 1.6
    const dir = new THREE.Vector3().subVectors(this.camera.position, this.controls.target)
    dir.y = Math.max(dir.y, 1)
    dir.setLength(Math.max(dist, 16))
    dir.y = Math.max(dir.y, dist * 0.55)
    const toPos = new THREE.Vector3(pos.x + dir.x, dir.y, pos.z + dir.z)
    const toTgt = new THREE.Vector3(pos.x, height * 0.5, pos.z)
    if (instant) {
      this.jumpTo(toPos, toTgt)
    } else {
      this.tweenTo(toPos, toTgt)
    }
  }

  jumpTo(toPos: THREE.Vector3, toTgt: THREE.Vector3) {
    this.tween = null
    this.camera.position.copy(toPos)
    this.controls.target.copy(toTgt)
    this.controls.update()
  }

  reset() {
    this.tweenTo(DEFAULT_POS.clone(), DEFAULT_TARGET.clone())
  }

  overview() {
    this.tweenTo(DEFAULT_POS.clone(), DEFAULT_TARGET.clone())
  }

  private tweenTo(toPos: THREE.Vector3, toTgt: THREE.Vector3) {
    this.tween = {
      t: 0,
      dur: 0.9,
      fromPos: this.camera.position.clone(),
      toPos,
      fromTgt: this.controls.target.clone(),
      toTgt,
    }
  }

  tick(dt: number) {
    const tw = this.tween
    if (tw) {
      tw.t += dt
      const f = Math.min(tw.t / tw.dur, 1)
      const e = 1 - Math.pow(1 - f, 3) // ease-out cubic
      this.camera.position.lerpVectors(tw.fromPos, tw.toPos, e)
      this.controls.target.lerpVectors(tw.fromTgt, tw.toTgt, e)
      if (f >= 1) this.tween = null
    }
    this.controls.update()
  }
}
