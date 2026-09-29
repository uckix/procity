/** Picking: click to select, double-click to focus, hover highlight. */
import * as THREE from 'three'
import type { City } from './City'

export class Interaction {
  private raycaster = new THREE.Raycaster()
  private pointer = new THREE.Vector2()
  private downX = 0
  private downY = 0
  private downTime = 0

  constructor(
    private dom: HTMLElement,
    private camera: THREE.Camera,
    private city: City,
    callbacks: {
      onSelect: (identity: string | null) => void
      onFocus: (identity: string) => void
      onHover: (identity: string | null) => void
    },
  ) {
    dom.addEventListener('pointerdown', (e) => {
      this.downX = e.clientX
      this.downY = e.clientY
      this.downTime = performance.now()
    })
    dom.addEventListener('pointerup', (e) => {
      if (e.button !== 0) return
      if (Math.hypot(e.clientX - this.downX, e.clientY - this.downY) > 6) return
      if (performance.now() - this.downTime > 600) return
      callbacks.onSelect(this.pick(e))
    })
    dom.addEventListener('dblclick', (e) => {
      const id = this.pick(e)
      if (id) callbacks.onFocus(id)
    })
    dom.addEventListener('pointermove', (e) => {
      if (e.buttons !== 0) return
      callbacks.onHover(this.pick(e))
    })
  }

  private pick(e: PointerEvent | MouseEvent): string | null {
    const rect = this.dom.getBoundingClientRect()
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const hits = this.raycaster.intersectObject(this.city.mesh, false)
    if (hits.length > 0 && hits[0].instanceId !== undefined) {
      return this.city.identityAt(hits[0].instanceId)
    }
    return null
  }
}
