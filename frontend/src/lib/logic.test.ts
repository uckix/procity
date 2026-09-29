import { describe, expect, it } from 'vitest'
import {
  cpuColor,
  escapeHtml,
  formatMB,
  formatUptime,
  guessUid,
  heightForProcess,
  logScale,
  matchFilter,
  searchMatch,
  sortProcesses,
} from './logic'
import type { ProcessInfo } from '../types'

const mk = (over: Partial<ProcessInfo> = {}): ProcessInfo => ({
  identity: '1:1000',
  pid: 1,
  ppid: 0,
  name: 'systemd',
  username: 'root',
  uid: 0,
  cmdline: ['/usr/lib/systemd/systemd'],
  cpu_percent: 0.5,
  mem_bytes: 100 * 1024 * 1024,
  mem_mb: 100,
  mem_percent: 1.4,
  num_threads: 1,
  status: 'running',
  create_time: 1000,
  ...over,
})

describe('logScale', () => {
  it('maps lo to 0 and hi to 1', () => {
    expect(logScale(1, 1, 4096)).toBe(0)
    expect(logScale(4096, 1, 4096)).toBe(1)
    expect(logScale(99999, 1, 4096)).toBe(1)
    expect(logScale(0, 1, 4096)).toBe(0)
  })
  it('is monotonic', () => {
    let prev = -1
    for (let v = 1; v <= 5000; v += 100) {
      const s = logScale(v, 1, 4096)
      expect(s).toBeGreaterThanOrEqual(prev)
      prev = s
    }
  })
  it('keeps small values visible (log spread)', () => {
    // 32MB should be well above 25% of the height range, not invisible.
    expect(logScale(32, 1, 4096)).toBeGreaterThan(0.25)
  })
})

describe('heightForProcess', () => {
  it('grows with memory', () => {
    const small = heightForProcess(mk({ mem_mb: 10 }), 'mem')
    const big = heightForProcess(mk({ mem_mb: 2000 }), 'mem')
    expect(big).toBeGreaterThan(small)
  })
  it('supports cpu and threads metrics', () => {
    const idle = heightForProcess(mk({ cpu_percent: 0, num_threads: 1 }), 'cpu')
    const busy = heightForProcess(mk({ cpu_percent: 95, num_threads: 64 }), 'threads')
    expect(busy).toBeGreaterThan(idle)
  })
  it('never returns below the minimum height', () => {
    expect(heightForProcess(mk({ mem_mb: 0, cpu_percent: 0, num_threads: 0 }), 'mem')).toBeGreaterThan(0)
  })
})

describe('cpuColor', () => {
  it('is blue-ish at idle and red at full load', () => {
    const [r0, g0, b0] = cpuColor(0)
    const [r1, , b1] = cpuColor(100)
    expect(b0).toBeGreaterThan(r0)
    expect(r1).toBeGreaterThan(b1)
  })
  it('is monotonic through cyan to orange', () => {
    const mid = cpuColor(50)
    expect(mid[1]).toBeGreaterThan(0.8) // cyan-ish
  })
  it('warn color appears above 75%', () => {
    const [r, , b] = cpuColor(90)
    expect(r).toBeGreaterThan(0.9)
    expect(r).toBeGreaterThan(b)
  })
})

describe('matchFilter', () => {
  const root = mk()
  const user = mk({ uid: 1000, username: 'alice', cpu_percent: 42, mem_mb: 900 })
  it('all matches everything', () => {
    expect(matchFilter(root, 'all', 1000)).toBe(true)
    expect(matchFilter(user, 'all', 1000)).toBe(true)
  })
  it('highcpu threshold', () => {
    expect(matchFilter(user, 'highcpu', 1000)).toBe(true)
    expect(matchFilter(root, 'highcpu', 1000)).toBe(false)
  })
  it('highmem threshold', () => {
    expect(matchFilter(user, 'highmem', 1000)).toBe(true)
    expect(matchFilter(mk({ mem_mb: 12 }), 'highmem', 1000)).toBe(false)
  })
  it('user vs system by uid', () => {
    expect(matchFilter(user, 'user', 1000)).toBe(true)
    expect(matchFilter(root, 'user', 1000)).toBe(false)
    expect(matchFilter(root, 'system', 1000)).toBe(true)
    expect(matchFilter(user, 'system', 1000)).toBe(false)
  })
  it('user filter falls back to username when uid unknown', () => {
    const noUid = mk({ uid: null, username: 'alice' })
    expect(matchFilter(noUid, 'user', 1000)).toBe(true)
  })
})

describe('searchMatch', () => {
  const p = mk({ name: 'Firefox', pid: 4242, username: 'alice' })
  it('matches name, pid and username case-insensitively', () => {
    expect(searchMatch(p, 'fire')).toBe(true)
    expect(searchMatch(p, '4242')).toBe(true)
    expect(searchMatch(p, 'ALICE')).toBe(true)
  })
  it('rejects empty and non-matching queries', () => {
    expect(searchMatch(p, '  ')).toBe(false)
    expect(searchMatch(p, 'zzzz')).toBe(false)
  })
})

describe('sortProcesses', () => {
  it('sorts by cpu or memory without mutating input', () => {
    const list = [mk({ cpu_percent: 1, mem_mb: 500 }), mk({ cpu_percent: 90, mem_mb: 5 })]
    const byCpu = sortProcesses(list, 'cpu')
    const byMem = sortProcesses(list, 'mem')
    expect(byCpu[0].cpu_percent).toBe(90)
    expect(byMem[0].mem_mb).toBe(500)
    expect(list[0].cpu_percent).toBe(1)
  })
})

describe('formatters', () => {
  it('formats MB/GB', () => {
    expect(formatMB(512)).toBe('512 MB')
    expect(formatMB(2048)).toBe('2.0 GB')
  })
  it('formats uptime', () => {
    expect(formatUptime(3600 * 25)).toBe('1d 1h 0m')
    expect(formatUptime(7200)).toBe('2h 0m')
    expect(formatUptime(300)).toBe('5m')
  })
})

describe('escapeHtml', () => {
  it('neutralises markup in untrusted process names', () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;')
    expect(escapeHtml("a&b'c")).toBe('a&amp;b&#39;c')
  })
})

describe('user/system classification', () => {
  it('treats nobody (65534) as a system process', () => {
    const nobody = mk({ uid: 65534, username: 'nobody' })
    expect(matchFilter(nobody, 'user', 1000)).toBe(false)
    expect(matchFilter(nobody, 'system', 1000)).toBe(true)
  })
  it('guessUid picks the majority login user, ignoring root and nobody', () => {
    const procs = [
      mk({ uid: 0 }), mk({ uid: 0 }), mk({ uid: 0 }),
      mk({ uid: 65534 }), mk({ uid: 65534 }), mk({ uid: 65534 }),
      mk({ uid: 1000 }), mk({ uid: 1000 }), mk({ uid: 1001 }),
    ]
    expect(guessUid(procs)).toBe(1000)
    expect(guessUid([mk({ uid: 0 })])).toBeNull()
  })
})
