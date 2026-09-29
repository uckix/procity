/** Backend connection: REST bootstrap + WebSocket stream + demo fallback. */
import type { ConnStatus, Snapshot } from '../types'
import { DemoSource } from './demo'

const API_BASE = `${location.protocol === 'https:' ? 'https' : 'http'}://${location.host}`
const WS_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`
const REST_TIMEOUT_MS = 2500
const RECONNECT_MS = 3000

export class ApiClient {
  status: ConnStatus = 'connecting'
  onSnapshot: (s: Snapshot) => void = () => {}
  onStatus: (s: ConnStatus) => void = () => {}

  private ws: WebSocket | null = null
  private demo = new DemoSource()
  private demoTimer: ReturnType<typeof setInterval> | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private stopped = false

  start() {
    this.setStatus('connecting')
    this.tryConnect()
  }

  stop() {
    this.stopped = true
    if (this.retryTimer) clearTimeout(this.retryTimer)
    if (this.demoTimer) clearInterval(this.demoTimer)
    this.ws?.close()
  }

  private setStatus(s: ConnStatus) {
    if (this.status === s) return
    this.status = s
    this.onStatus(s)
  }

  private async fetchSnapshot(): Promise<Snapshot | null> {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), REST_TIMEOUT_MS)
      const r = await fetch(`${API_BASE}/api/snapshot`, { signal: ctrl.signal })
      clearTimeout(t)
      if (!r.ok) return null
      return (await r.json()) as Snapshot
    } catch {
      return null
    }
  }

  private async tryConnect() {
    if (this.stopped) return
    const snap = await this.fetchSnapshot()
    if (this.stopped) return
    if (snap) {
      this.onSnapshot(snap)
      this.openSocket()
    } else {
      this.startDemo()
      this.scheduleReconnect()
    }
  }

  private openSocket() {
    this.stopDemo()
    this.ws?.close()
    const ws = new WebSocket(WS_URL)
    this.ws = ws
    this.setStatus('live')
    ws.onmessage = (ev) => {
      try {
        this.onSnapshot(JSON.parse(ev.data) as Snapshot)
      } catch {
        /* ignore malformed frame */
      }
    }
    ws.onclose = () => {
      if (this.stopped || this.ws !== ws) return
      this.ws = null
      this.startDemo()
      this.scheduleReconnect()
    }
    ws.onerror = () => ws.close()
  }

  private scheduleReconnect() {
    if (this.retryTimer || this.stopped) return
    this.setStatus(this.demoTimer ? 'demo' : 'reconnecting')
    this.retryTimer = setTimeout(async () => {
      this.retryTimer = null
      const snap = await this.fetchSnapshot()
      if (this.stopped) return
      if (snap) {
        this.onSnapshot(snap)
        this.openSocket()
      } else {
        this.scheduleReconnect()
      }
    }, RECONNECT_MS)
  }

  private startDemo() {
    if (this.demoTimer) return
    this.setStatus('demo')
    this.onSnapshot(this.demo.tick())
    this.demoTimer = setInterval(() => {
      if (this.status === 'demo') this.onSnapshot(this.demo.tick())
    }, 1000)
  }

  private stopDemo() {
    if (this.demoTimer) {
      clearInterval(this.demoTimer)
      this.demoTimer = null
    }
  }
}
