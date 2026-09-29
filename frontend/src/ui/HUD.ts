/** Upper-left HUD: title, connection badge, live system stats. */
import type { ConnStatus, Snapshot } from '../types'
import { formatMB, formatUptime } from '../lib/logic'

const STATUS_TEXT: Record<ConnStatus, string> = {
  connecting: 'CONNECTING',
  live: 'LIVE',
  reconnecting: 'RECONNECTING',
  demo: 'DEMO DATA',
}
const STATUS_CLASS: Record<ConnStatus, string> = {
  connecting: 'badge-amber',
  live: 'badge-green',
  reconnecting: 'badge-amber',
  demo: 'badge-orange',
}

export class HUD {
  root: HTMLElement
  private connBadge: HTMLElement
  private demoBanner: HTMLElement
  private cpu: HTMLElement
  private cores: HTMLElement
  private ram: HTMLElement
  private swap: HTMLElement
  private gpu: HTMLElement
  private procs: HTMLElement
  private uptime: HTMLElement
  private notice: HTMLElement
  private status: ConnStatus = 'connecting'
  private demoData = false

  constructor() {
    this.root = document.getElementById('hud')!
    this.root.innerHTML = `
      <div class="hud-head">
        <h1>PROCITY</h1>
        <span id="conn-badge" class="badge badge-amber">CONNECTING</span>
      </div>
      <div class="hud-grid">
        <div class="hud-row"><span class="k">CPU</span><span class="v" id="hud-cpu">--%</span></div>
        <div class="cores" id="hud-cores"></div>
        <div class="hud-row"><span class="k">RAM</span><span class="v" id="hud-ram">--</span></div>
        <div class="hud-row"><span class="k">SWAP</span><span class="v dim" id="hud-swap">--</span></div>
        <div class="hud-row" id="hud-gpu-row" style="display:none"><span class="k">GPU</span><span class="v" id="hud-gpu">--</span></div>
        <div class="hud-row"><span class="k">PROCESSES</span><span class="v" id="hud-procs">--</span></div>
        <div class="hud-row"><span class="k">UPTIME</span><span class="v dim" id="hud-uptime">--</span></div>
      </div>
      <div class="hud-notice" id="hud-notice"></div>
      <div class="demo-banner" id="demo-banner" style="display:none">DEMO MODE — SYNTHETIC DATA (backend unavailable)</div>
      <div class="hud-shortcuts"><span><span class="sc-key">ESC</span> close</span><span><span class="sc-key">/</span> search</span><span><span class="sc-key">R</span> reset</span><span><span class="sc-key">1-3</span> metric</span></div>

    `
    this.connBadge = this.root.querySelector('#conn-badge')!
    this.demoBanner = this.root.querySelector('#demo-banner')!
    this.cpu = this.root.querySelector('#hud-cpu')!
    this.cores = this.root.querySelector('#hud-cores')!
    this.ram = this.root.querySelector('#hud-ram')!
    this.swap = this.root.querySelector('#hud-swap')!
    this.gpu = this.root.querySelector('#hud-gpu')!
    this.procs = this.root.querySelector('#hud-procs')!
    this.uptime = this.root.querySelector('#hud-uptime')!
    this.notice = this.root.querySelector('#hud-notice')!
  }

  setStatus(s: ConnStatus) {
    this.status = s
    this.renderStatus()
  }

  /** Synthetic data is labelled whether it comes from the browser fallback or a --demo backend. */
  private renderStatus() {
    const s: ConnStatus = this.demoData ? 'demo' : this.status
    this.connBadge.textContent = STATUS_TEXT[s]
    this.connBadge.className = `badge ${STATUS_CLASS[s]}`
    this.demoBanner.style.display = s === 'demo' ? '' : 'none'
    this.demoBanner.textContent =
      this.status === 'live'
        ? 'DEMO MODE — SYNTHETIC DATA (backend started with --demo)'
        : 'DEMO MODE — SYNTHETIC DATA (backend unavailable)'
  }

  update(snap: Snapshot) {
    if (snap.demo !== this.demoData) {
      this.demoData = snap.demo
      this.renderStatus()
    }
    const sys = snap.system
    this.cpu.textContent = `${sys.cpu_total.toFixed(1)}%`
    this.cpu.style.color = sys.cpu_total > 75 ? 'var(--red)' : sys.cpu_total > 45 ? 'var(--orange)' : ''

    // Per-core bars.
    if (this.cores.children.length !== sys.cpu_per_core.length) {
      this.cores.innerHTML = sys.cpu_per_core
        .map(() => '<div class="core"><div class="core-fill"></div></div>')
        .join('')
    }
    const fills = this.cores.querySelectorAll<HTMLElement>('.core-fill')
    sys.cpu_per_core.forEach((c, i) => {
      const f = fills[i] as HTMLElement
      if (f) {
        f.style.height = `${Math.min(100, c)}%`
        f.style.background = c > 75 ? 'var(--red)' : c > 45 ? 'var(--orange)' : 'var(--blue)'
      }
    })

    this.ram.textContent = `${formatMB(sys.ram_used_mb)} / ${formatMB(sys.ram_total_mb)} (${sys.ram_percent.toFixed(0)}%)`
    this.swap.textContent = `${formatMB(sys.swap_used_mb)} / ${formatMB(sys.swap_total_mb)}`
    this.procs.textContent = `${snap.total_processes}`
    this.uptime.textContent = formatUptime(sys.uptime_s)

    const gpuRow = this.root.querySelector<HTMLElement>('#hud-gpu-row')!
    if (sys.gpu) {
      gpuRow.style.display = ''
      const parts: string[] = [`${sys.gpu.utilization.toFixed(0)}%`]
      if (sys.gpu.temperature_c > 0) parts.push(`${sys.gpu.temperature_c.toFixed(0)}°C`)
      if (sys.gpu.mem_total_mb > 0) parts.push(`${formatMB(sys.gpu.mem_used_mb)}/${formatMB(sys.gpu.mem_total_mb)}`)
      if (sys.gpu.power_w > 0) parts.push(`${sys.gpu.power_w.toFixed(0)}W`)
      this.gpu.textContent = parts.join('  ')
      if (sys.gpu.name) this.gpu.title = sys.gpu.name
    } else {
      gpuRow.style.display = 'none'
    }

    if (snap.truncated) {
      this.notice.textContent = `Showing top ${snap.display_limit} of ${snap.total_processes} processes (by CPU+RAM)`
      this.notice.style.display = ''
    } else {
      this.notice.style.display = 'none'
    }
  }
}
