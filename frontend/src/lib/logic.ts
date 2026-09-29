/** Pure, testable logic: normalization, colors, filters, search, sorting. */
import type { FilterKind, Metric, ProcessInfo, SortKey } from '../types'
import { THEME } from '../theme'

export const MIN_HEIGHT = 1.4
export const MAX_HEIGHT = 30.0

export function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t
}

/** Logarithmic normalization so huge outliers do not flatten everything else. */
export function logScale(v: number, lo: number, hi: number): number {
  const a = Math.log1p(Math.max(v, lo))
  const b = Math.log1p(lo)
  const c = Math.log1p(hi)
  return clamp01((a - b) / (c - b))
}

/** Metric ranges (lo, hi) per height metric. */
const RANGES: Record<Metric, [number, number]> = {
  mem: [1, 4096], // MB
  cpu: [0.2, 100], // percent
  threads: [1, 128],
}

export function heightForProcess(p: ProcessInfo, metric: Metric): number {
  const v = metric === 'mem' ? p.mem_mb : metric === 'cpu' ? p.cpu_percent : p.num_threads ?? 1
  const [lo, hi] = RANGES[metric]
  return MIN_HEIGHT + (MAX_HEIGHT - MIN_HEIGHT) * logScale(v, lo, hi)
}

/** CPU% -> RGB gradient: dark blue -> neon blue -> cyan -> orange -> red. */
type RGB = [number, number, number]
const STOPS = THEME.cpuGradient

export function cpuColor(cpu: number): RGB {
  const t = clamp01(cpu / 100)
  for (let i = 1; i < STOPS.length; i++) {
    const [t1, c1] = STOPS[i]
    const [t0, c0] = STOPS[i - 1]
    if (t <= t1) {
      const f = (t - t0) / (t1 - t0 || 1)
      return [c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f, c0[2] + (c1[2] - c0[2]) * f]
    }
  }
  return STOPS[STOPS.length - 1][1]
}

/** True when the process passes the active filter. */
export function matchFilter(p: ProcessInfo, filter: FilterKind, currentUid: number | null): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'highcpu':
      return p.cpu_percent >= 10
    case 'highmem':
      return p.mem_mb >= 300
    case 'user':
      return isUserProcess(p, currentUid)
    case 'system':
      return !isUserProcess(p, currentUid)
    default:
      return true
  }
}

const NOBODY_UID = 65534

/** Login-user process: uid >= 1000 (not "nobody"), or the desktop user's own uid. */
function isUserProcess(p: ProcessInfo, currentUid: number | null): boolean {
  if (p.uid !== null) return p.uid === currentUid || (p.uid >= 1000 && p.uid !== NOBODY_UID)
  return p.username !== null && p.username !== 'root' && p.username !== 'nobody'
}

/** Guess the desktop user's uid from the majority of accessible processes. */
export function guessUid(procs: ProcessInfo[]): number | null {
  const counts = new Map<number, number>()
  for (const p of procs) {
    if (p.uid !== null && p.uid >= 1000 && p.uid !== NOBODY_UID) {
      counts.set(p.uid, (counts.get(p.uid) ?? 0) + 1)
    }
  }
  let best: number | null = null
  let bestN = 0
  for (const [uid, n] of counts) {
    if (n > bestN) {
      best = uid
      bestN = n
    }
  }
  return best
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/** Escape text for innerHTML / attribute values (process names are untrusted). */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c])
}

/** Search by process name, PID or username (case-insensitive substring). */
export function searchMatch(p: ProcessInfo, q: string): boolean {
  const needle = q.trim().toLowerCase()
  if (!needle) return false
  return (
    p.name.toLowerCase().includes(needle) ||
    String(p.pid).includes(needle) ||
    (p.username !== null && p.username.toLowerCase().includes(needle))
  )
}

export function sortProcesses(list: ProcessInfo[], by: SortKey): ProcessInfo[] {
  const copy = [...list]
  copy.sort((a, b) =>
    by === 'cpu' ? b.cpu_percent - a.cpu_percent : b.mem_mb - a.mem_mb,
  )
  return copy
}

export function formatMB(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
  return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`
}

export function formatUptime(s: number): string {
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}
