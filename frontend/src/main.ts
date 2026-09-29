/** PROCity application controller: wires backend stream, city, and UI. */
import * as THREE from 'three'
import type { FilterKind, Metric, ProcessInfo, Snapshot, SortKey } from './types'
import { ApiClient } from './services/api'
import { City } from './scene/City'
import { CameraRig } from './scene/CameraRig'
import { Environment } from './scene/Environment'
import { Interaction } from './scene/Interaction'
import { HUD } from './ui/HUD'
import { ProcessPanel } from './ui/ProcessPanel'
import { Search } from './ui/Search'
import { Filters, TopList } from './ui/Filters'
import { guessUid } from './lib/logic'

const canvas = document.getElementById('scene') as HTMLCanvasElement
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.setSize(innerWidth, innerHeight)

const scene = new THREE.Scene()
const env = new Environment(scene)
const rig = new CameraRig(canvas, innerWidth / innerHeight)
const city = new City()
scene.add(city.group)

// -------- UI --------
const hud = new HUD()
const panel = new ProcessPanel()
const search = new Search()
const filters = new Filters()
const toplists = new TopList()

filters.root.prepend(search.root)

// -------- state --------
let metric: Metric = 'mem'
let filter: FilterKind = 'all'
let sort: SortKey = 'cpu'
let currentUid: number | null = null
let selected: string | null = null
let lastProcs: ProcessInfo[] = []

function select(identity: string | null) {
  const b = city.getBuilding(identity)
  selected = b ? identity : null
  city.setSelected(selected)
  if (b) panel.show(b.data)
  else panel.close()
  refreshLists()
}

function focusBuilding(identity: string, instant = false, close = false) {
  const fp = city.focusPoint(identity)
  if (!fp) return
  select(identity)
  if (close) {
    rig.jumpTo(
      new THREE.Vector3(fp.pos.x + 22, Math.max(18, fp.height + 6), fp.pos.z + 24),
      new THREE.Vector3(fp.pos.x, fp.height * 0.4, fp.pos.z),
    )
  } else {
    rig.focusOn(fp.pos, fp.height, instant)
  }
}


panel.onFocus = focusBuilding
panel.onClose = () => {
  selected = null
  city.setSelected(null)
}
search.onPick = (id) => focusBuilding(id)
toplists.onPick = (id) => focusBuilding(id)
filters.onMetric = (m) => {
  metric = m
  city.setMetric(m)
  if (lastSnapshot) applySnapshot(lastSnapshot)
}
filters.onFilter = (f) => {
  filter = f
  if (lastSnapshot) applySnapshot(lastSnapshot)
}
filters.onSort = (s) => {
  sort = s
  refreshLists()
}
filters.onResetCamera = () => {
  rig.reset()
  select(null)
}

// -------- data flow --------
const api = new ApiClient()
let lastSnapshot: Snapshot | null = null

api.onStatus = (s) => hud.setStatus(s)

api.onSnapshot = (snap) => {
  lastSnapshot = snap
  applySnapshot(snap)
}

let initialFocusDone = false

function applySnapshot(snap: Snapshot) {
  lastProcs = snap.processes
  // Recomputed each time so switching demo <-> live data picks the right user.
  currentUid = guessUid(snap.processes)
  city.setFilter(filter, currentUid)
  city.update(snap)
  hud.update(snap)
  search.setProcesses(snap.processes)
  // Dynamic window title with live system info
  document.title = `PROCity — ${snap.total_processes} procs (${snap.system.cpu_total.toFixed(0)}% CPU)`

  // Support deep-linking via query parameters (e.g. ?focus=top or ?pid=1234)
  if (!initialFocusDone && snap.processes.length > 0) {
    const params = new URLSearchParams(window.location.search)
    const focusPidStr = params.get('pid')
    const focusTop = params.get('focus')
    if (focusPidStr) {
      const pid = parseInt(focusPidStr, 10)
      const b = city.list.find((x) => x.data.pid === pid)
      if (b) {
        focusBuilding(b.identity)
        initialFocusDone = true
      }
    } else if (focusTop === '1' || focusTop === 'top' || focusTop === 'true') {
      const topProc = [...snap.processes].sort((a, b) => b.cpu_percent - a.cpu_percent)[0]
      if (topProc) {
        focusBuilding(topProc.identity, true, params.get('zoom') === 'close')
        initialFocusDone = true
      }
    }
  }

  // Keep the open details panel in sync; close it once the process has exited.
  if (selected) {
    const b = city.getBuilding(selected)
    if (b && !b.dying) panel.show(b.data)
    else select(null)
  }
  refreshLists()
}

function refreshLists() {
  toplists.update(lastProcs, filter, sort, currentUid, selected)
}

// -------- keyboard navigation --------
window.addEventListener('keydown', (e) => {
  const activeTag = document.activeElement?.tagName.toLowerCase()
  if (activeTag === 'input' || activeTag === 'textarea') {
    if (e.key === 'Escape') {
      search.clear()
      ;(document.activeElement as HTMLElement)?.blur()
    }
    return
  }

  if (e.key === 'Escape') {
    select(null)
    search.clear()
  } else if (e.key === 'r' || e.key === 'R' || e.code === 'Space') {
    if (e.code === 'Space') e.preventDefault()
    rig.reset()
    select(null)
  } else if (e.key === '/') {
    e.preventDefault()
    search.focusInput()
  } else if (e.key === '1') {
    filters.setMetric('mem')
  } else if (e.key === '2') {
    filters.setMetric('cpu')
  } else if (e.key === '3') {
    filters.setMetric('threads')
  }
})

// -------- global programmatic interface --------
;(window as any).procity = {
  select,
  focusBuilding,
  focusPid: (pid: number) => {
    const b = city.list.find((x) => x.data.pid === pid)
    if (b) focusBuilding(b.identity)
  },
  resetCamera: () => {
    rig.reset()
    select(null)
  },
  setMetric: (m: Metric) => filters.setMetric(m),
  setFilter: (f: FilterKind) => filters.setFilter(f),
  getSnapshot: () => lastSnapshot,
  city,
  rig,
}

// -------- picking --------
new Interaction(canvas, rig.camera, city, {
  onSelect: (id) => select(id),
  onFocus: (id) => focusBuilding(id),
  onHover: (id) => {
    canvas.style.cursor = id ? 'pointer' : ''
    city.setHovered(id)
  },
})

// -------- resize --------
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight)
  rig.resize(innerWidth / innerHeight)
})

// -------- render loop (rendering is decoupled from 1 Hz monitoring) --------
const clock = new THREE.Clock()
function animate() {
  requestAnimationFrame(animate)
  const dt = Math.min(clock.getDelta(), 0.1)
  const t = clock.elapsedTime
  city.tick(dt, t)
  rig.tick(dt)
  const b = city.getBuilding(selected)
  if (b) env.updateBeacon(b.x, b.z, b.hCur, t)
  else env.updateBeacon(null, null, 0, t)
  renderer.render(scene, rig.camera)
}

api.start()
animate()

