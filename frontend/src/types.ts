/** Shared data shapes matching the PROCITY backend API. */

export interface ProcessInfo {
  identity: string
  pid: number
  ppid: number
  name: string
  username: string | null
  uid: number | null
  cmdline: string[] | null
  cpu_percent: number
  mem_bytes: number
  mem_mb: number
  mem_percent: number
  num_threads: number | null
  status: string
  create_time: number
}

export interface GpuStats {
  utilization: number
  mem_used_mb: number
  mem_total_mb: number
  temperature_c: number
  power_w: number
  name: string
}

export interface SystemStats {
  cpu_total: number
  cpu_per_core: number[]
  ram_total_mb: number
  ram_used_mb: number
  ram_available_mb: number
  ram_percent: number
  swap_total_mb: number
  swap_used_mb: number
  process_count: number
  uptime_s: number
  gpu: GpuStats | null
}

export interface Snapshot {
  ts: number
  demo: boolean
  truncated: boolean
  total_processes: number
  display_limit: number
  interval_s: number
  system: SystemStats
  processes: ProcessInfo[]
}

export type Metric = 'mem' | 'cpu' | 'threads'
export type FilterKind = 'all' | 'highcpu' | 'highmem' | 'user' | 'system'
export type SortKey = 'cpu' | 'mem'
export type ConnStatus = 'connecting' | 'live' | 'reconnecting' | 'demo'
