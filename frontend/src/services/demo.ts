/** Client-side synthetic data source used when the backend is unavailable. */
import type { ProcessInfo, Snapshot } from '../types'

const NAMES = [
  'systemd', 'hyprland', 'waybar', 'alacritty', 'kitty', 'firefox', 'node', 'v8',
  'python3', 'uvicorn', 'dunst', 'pipewire', 'wireplumber', 'polkitd', 'dbus-daemon',
  'NetworkManager', 'sshd', 'systemd-journald', 'systemd-logind', 'systemd-udevd',
  'gvfsd', 'xdg-desktop-portal', 'rtkit-daemon', 'upowerd', 'mpv', 'nvim', 'fish',
  'bash', 'zsh', 'git', 'cargo', 'clang', 'rust-analyzer', 'gamescope', 'swayidle',
  'wl-copy', 'grim', 'pipewire-pulse', 'kwin_wayland', 'opencode', 'claude', 'steam',
]

const rand = (a: number, b: number) => a + Math.random() * (b - a)

export class DemoSource {
  private procs = new Map<string, ProcessInfo>()
  /** Per-process base load and memory that values fluctuate around (no drift). */
  private base = new Map<string, { cpu: number; mem: number }>()
  private nextPid = 1000

  constructor() {
    for (let i = 0; i < 260; i++) this.spawn()
  }

  private spawn() {
    const pid = this.nextPid++
    const create_time = Date.now() / 1000 - rand(0, 3600)
    const identity = `${pid}:${Math.floor(create_time)}`
    const memMb = Math.max(0.5, Math.exp(rand(-3, 6)))
    const uid = Math.random() < 0.7 ? 1000 : 0
    this.procs.set(identity, {
      identity,
      pid,
      ppid: Math.max(0, pid - Math.floor(rand(1, 20))),
      name: NAMES[Math.floor(Math.random() * NAMES.length)],
      username: uid === 1000 ? 'demo' : 'root',
      uid,
      cmdline: Math.random() < 0.8 ? ['/usr/bin/demo-proc', '--synthetic'] : null,
      cpu_percent: 0,
      mem_bytes: Math.round(memMb * 1024 * 1024),
      mem_mb: memMb,
      mem_percent: Math.min(100, (memMb / 7000) * 100),
      num_threads: Math.max(1, Math.round(Math.exp(rand(0, 2)))),
      status: 'running',
      create_time,
    })
    const busy = [0.2, 0.5, 1, 2, 4, 8, 30]
    this.base.set(identity, {
      cpu: Math.random() < 0.26 ? busy[Math.floor(Math.random() * busy.length)] : 0,
      mem: memMb,
    })
  }

  tick(): Snapshot {
    for (const p of this.procs.values()) {
      const b = this.base.get(p.identity)!
      p.cpu_percent = Math.max(0, Math.min(120, b.cpu + rand(-1, 1) * (b.cpu * 0.35 + 0.1)))
      p.mem_mb = Math.max(0.4, b.mem * rand(0.94, 1.06))
      p.mem_bytes = Math.round(p.mem_mb * 1024 * 1024)
    }
    for (let i = 0; i < 1 + Math.floor(Math.random() * 2); i++) this.spawn()
    for (let i = 0; i < 1 + Math.floor(Math.random() * 2); i++) {
      if (this.procs.size > 40) {
        const keys = [...this.procs.keys()]
        const k = keys[Math.floor(Math.random() * keys.length)]
        this.procs.delete(k)
        this.base.delete(k)
      }
    }
    const processes = [...this.procs.values()].sort((a, b) => b.mem_bytes - a.mem_bytes)
    const cores = Array.from({ length: 16 }, () => Math.max(0, Math.min(100, 18 + rand(-14, 16))))
    return {
      ts: Date.now() / 1000,
      demo: true,
      truncated: false,
      total_processes: processes.length,
      display_limit: 1000,
      interval_s: 1,
      system: {
        cpu_total: cores.reduce((a, b) => a + b, 0) / cores.length,
        cpu_per_core: cores.map((c) => Math.round(c * 10) / 10),
        ram_total_mb: 7000,
        ram_used_mb: 4200,
        ram_available_mb: 2800,
        ram_percent: 60.1,
        swap_total_mb: 4096,
        swap_used_mb: 300,
        process_count: processes.length,
        uptime_s: 3600 * 27,
        gpu: null,
      },
      processes,
    }
  }
}
