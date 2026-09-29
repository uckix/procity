/** Toolbar: metric switch, filters, sorting, camera reset, top-process list. */
import type { FilterKind, Metric, ProcessInfo, SortKey } from '../types'
import { escapeHtml, formatMB, matchFilter, sortProcesses } from '../lib/logic'

export class Filters {
  root: HTMLElement
  onMetric: (m: Metric) => void = () => {}
  onFilter: (f: FilterKind) => void = () => {}
  onSort: (s: SortKey) => void = () => {}
  onResetCamera: () => void = () => {}
  onPick: (identity: string) => void = () => {}

  private metricBtns = new Map<string, HTMLElement>()
  private filterBtns = new Map<string, HTMLElement>()
  private sortBtns = new Map<string, HTMLElement>()
  private list!: HTMLElement

  constructor() {
    this.root = document.getElementById('toolbar')!
    this.root.innerHTML = `
      <div class="tb-row tb-metrics" id="tb-metrics">
        <span class="tb-label">HEIGHT</span>
        <button data-metric="mem" class="tb-btn active">MEMORY</button>
        <button data-metric="cpu" class="tb-btn">CPU</button>
        <button data-metric="threads" class="tb-btn">THREADS</button>
      </div>
      <div class="tb-row tb-filters" id="tb-filters">
        <span class="tb-label">FILTER</span>
        <button data-filter="all" class="tb-btn active">ALL</button>
        <button data-filter="highcpu" class="tb-btn">HIGH CPU</button>
        <button data-filter="highmem" class="tb-btn">HIGH MEM</button>
        <button data-filter="user" class="tb-btn">USER</button>
        <button data-filter="system" class="tb-btn">SYSTEM</button>
      </div>
      <div class="tb-row tb-sort">
        <span class="tb-label">SORT</span>
        <button data-sort="cpu" class="tb-btn active">CPU</button>
        <button data-sort="mem" class="tb-btn">MEMORY</button>
        <button id="tb-reset" class="tb-btn tb-accent" title="Reset camera">⟳ CAMERA</button>
      </div>
    `
    this.root.querySelectorAll<HTMLElement>('[data-metric]').forEach((b) => {
      this.metricBtns.set(b.dataset.metric!, b)
      b.addEventListener('click', () => {
        this.setActive(this.metricBtns, b)
        this.onMetric(b.dataset.metric as Metric)
      })
    })
    this.root.querySelectorAll<HTMLElement>('[data-filter]').forEach((b) => {
      this.filterBtns.set(b.dataset.filter!, b)
      b.addEventListener('click', () => {
        this.setActive(this.filterBtns, b)
        this.onFilter(b.dataset.filter as FilterKind)
      })
    })
    this.root.querySelectorAll<HTMLElement>('[data-sort]').forEach((b) => {
      this.sortBtns.set(b.dataset.sort!, b)
      b.addEventListener('click', () => {
        this.setActive(this.sortBtns, b)
        this.onSort(b.dataset.sort as SortKey)
      })
    })
    this.root.querySelector('#tb-reset')!.addEventListener('click', () => this.onResetCamera())
  }

  setMetric(m: Metric) {
    const btn = this.metricBtns.get(m)
    if (btn) {
      this.setActive(this.metricBtns, btn)
      this.onMetric(m)
    }
  }

  setFilter(f: FilterKind) {
    const btn = this.filterBtns.get(f)
    if (btn) {
      this.setActive(this.filterBtns, btn)
      this.onFilter(f)
    }
  }

  private setActive(map: Map<string, HTMLElement>, active: HTMLElement) {
    map.forEach((b) => b.classList.remove('active'))
    active.classList.add('active')
  }
}

/** Top-processes list (right column, respects filter + sort). */
export class TopList {
  root: HTMLElement
  private rows: HTMLElement
  onPick: (identity: string) => void = () => {}

  constructor() {
    this.root = document.getElementById('toplist')!
    this.root.innerHTML = `<div class="panel-head"><span class="panel-title">TOP PROCESSES</span></div>
      <div class="top-rows" id="top-rows"></div>`
    this.rows = this.root.querySelector('#top-rows')!
    // Rows are rebuilt every tick; pointerdown on the container survives that
    // (a click spanning a rebuild would otherwise be lost).
    this.rows.addEventListener('pointerdown', (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('.top-row')
      if (row?.dataset.identity) this.onPick(row.dataset.identity)
    })
  }

  update(procs: ProcessInfo[], filter: FilterKind, sort: SortKey, currentUid: number | null, selected: string | null) {
    const filtered = procs.filter((p) => matchFilter(p, filter, currentUid))
    const top = sortProcesses(filtered, sort).slice(0, 18)
    this.rows.innerHTML = top
      .map(
        (p, i) => `
        <div class="top-row${p.identity === selected ? ' selected' : ''}" data-identity="${p.identity}">
          <span class="top-rank">${i + 1}</span>
          <span class="top-name" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</span>
          <span class="top-cpu">${p.cpu_percent.toFixed(1)}%</span>
          <span class="top-mem">${formatMB(p.mem_mb)}</span>
        </div>`,
      )
      .join('')
  }
}
