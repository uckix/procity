/** Process details panel (opened by click or search). */
import type { ProcessInfo } from '../types'
import { formatMB } from '../lib/logic'

export class ProcessPanel {
  root: HTMLElement
  onFocus: (identity: string) => void = () => {}
  onClose: () => void = () => {}
  private fields: Record<string, HTMLElement> = {}
  private focusBtn: HTMLButtonElement
  private currentIdentity: string | null = null

  constructor() {
    this.root = document.getElementById('details')!
    this.root.innerHTML = `
      <div class="panel-head">
        <span class="panel-title" id="pd-name">—</span>
        <button class="icon-btn" id="pd-close" title="Close">✕</button>
      </div>
      <div class="panel-body">
        <div class="detail-grid">
          <span class="k">PID</span><span class="v" id="pd-pid">—</span>
          <span class="k">PARENT</span><span class="v" id="pd-ppid">—</span>
          <span class="k">USER</span><span class="v" id="pd-user">—</span>
          <span class="k">STATUS</span><span class="v" id="pd-status">—</span>
          <span class="k">CPU</span><span class="v" id="pd-cpu">—</span>
          <span class="k">MEMORY</span><span class="v" id="pd-mem">—</span>
          <span class="k">MEM %</span><span class="v" id="pd-mempct">—</span>
          <span class="k">THREADS</span><span class="v" id="pd-threads">—</span>
          <span class="k">STARTED</span><span class="v" id="pd-started">—</span>
        </div>
        <div class="cmdline" id="pd-cmd" title="command line">—</div>
        <button class="btn focus-btn" id="pd-focus">◎ FOCUS CAMERA</button>
      </div>
    `
    for (const id of ['pid', 'ppid', 'user', 'status', 'cpu', 'mem', 'mempct', 'threads', 'started']) {
      this.fields[id] = this.root.querySelector(`#pd-${id}`)!
    }
    this.focusBtn = this.root.querySelector('#pd-focus')!
    this.focusBtn.addEventListener('click', () => {
      if (this.currentIdentity) this.onFocus(this.currentIdentity)
    })
    this.root.querySelector('#pd-close')!.addEventListener('click', () => this.hide())
  }

  show(p: ProcessInfo) {
    this.currentIdentity = p.identity
    this.root.querySelector('#pd-name')!.textContent = p.name
    this.fields['pid'].textContent = String(p.pid)
    this.fields['ppid'].textContent = p.ppid > 0 ? String(p.ppid) : '—'
    this.fields['user'].textContent = p.username ?? (p.uid !== null ? `uid ${p.uid}` : '—')
    this.fields['status'].textContent = p.status
    this.fields['cpu'].textContent = `${p.cpu_percent.toFixed(1)}%`
    this.fields['mem'].textContent = formatMB(p.mem_mb)
    this.fields['mempct'].textContent = `${p.mem_percent.toFixed(1)}%`
    this.fields['threads'].textContent = p.num_threads !== null ? String(p.num_threads) : '—'
    this.fields['started'].textContent = new Date(p.create_time * 1000).toLocaleTimeString()
    const cmd = this.root.querySelector<HTMLElement>('#pd-cmd')!
    cmd.textContent = p.cmdline && p.cmdline.length ? p.cmdline.join(' ') : '(unavailable — kernel thread or restricted)'
    this.root.classList.add('open')
  }

  /** User dismissed the panel (✕ button). */
  hide() {
    this.close()
    this.onClose()
  }

  /** Programmatic close, e.g. the selected process exited. */
  close() {
    this.currentIdentity = null
    this.root.classList.remove('open')
  }

  get identity(): string | null {
    return this.currentIdentity
  }
}
