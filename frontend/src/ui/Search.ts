/** Search bar: type name / PID / username, click a result to fly to it. */
import type { ProcessInfo } from '../types'
import { escapeHtml, formatMB, searchMatch } from '../lib/logic'

export class Search {
  root: HTMLElement
  onPick: (identity: string) => void = () => {}
  private input: HTMLInputElement
  private results: HTMLElement
  private procs: ProcessInfo[] = []

  constructor() {
    this.root = document.createElement('div')
    this.root.className = 'search-box'
    this.root.innerHTML = `
      <input id="search-input" type="text" placeholder="Search name, PID, user…" spellcheck="false" />
      <div class="search-results" id="search-results"></div>
    `
    this.input = this.root.querySelector('#search-input')!
    this.results = this.root.querySelector('#search-results')!
    this.input.addEventListener('input', () => this.refresh())
    this.input.addEventListener('focus', () => this.refresh())
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const first = this.results.querySelector<HTMLElement>('.search-hit')
        if (first && first.dataset.identity) {
          this.results.classList.remove('open')
          this.input.blur()
          this.onPick(first.dataset.identity)
        }
      } else if (e.key === 'Escape') {
        this.results.classList.remove('open')
        this.input.blur()
      }
    })
    document.addEventListener('pointerdown', (e) => {
      if (!this.root.contains(e.target as Node)) this.results.classList.remove('open')
    })
  }

  focusInput() {
    this.input.focus()
    this.input.select()
  }

  clear() {
    this.input.value = ''
    this.results.classList.remove('open')
    this.results.innerHTML = ''
  }

  setProcesses(procs: ProcessInfo[]) {
    this.procs = procs
    if (this.results.classList.contains('open')) this.refresh()
  }

  private refresh() {
    const q = this.input.value
    if (!q.trim()) {
      this.results.classList.remove('open')
      this.results.innerHTML = ''
      return
    }
    const hits: ProcessInfo[] = []
    for (const p of this.procs) {
      if (searchMatch(p, q)) hits.push(p)
      if (hits.length >= 20) break
    }
    this.results.innerHTML = hits
      .map(
        (p) => `
        <div class="search-hit" data-identity="${escapeHtml(p.identity)}">
          <span class="hit-name">${escapeHtml(p.name)}</span>
          <span class="hit-meta">${p.pid} · ${escapeHtml(p.username ?? '?')} · ${p.cpu_percent.toFixed(1)}% · ${formatMB(p.mem_mb)}</span>
        </div>`,
      )
      .join('')
    this.results.classList.add('open')
    this.results.querySelectorAll<HTMLElement>('.search-hit').forEach((el) => {
      el.addEventListener('pointerdown', (ev) => {
        ev.preventDefault()
        this.results.classList.remove('open')
        this.onPick(el.dataset.identity!)
      })
    })
  }
}
