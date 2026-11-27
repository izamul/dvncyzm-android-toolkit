import type { ChildProcess } from 'child_process'
import { writeFile } from 'fs/promises'
import type { AdbRunner } from '../adb/runner'
import type { CrashEvent, LogEntry, LogFilter } from '../../shared/types'
import { LogParser } from './parse'
import { FilterEngine, parsePidof, parsePs } from './filter'
import { detectCrash, extractStack } from './crash'

export interface LogSink {
  lines(serial: string, batch: LogEntry[]): void
  reset(serial: string, entries: LogEntry[]): void
  crash(serial: string, ev: CrashEvent): void
}

export class RingBuffer<T> {
  private items: T[] = []
  constructor(public capacity: number) {}
  push(...xs: T[]): void {
    this.items.push(...xs)
    if (this.items.length > this.capacity) this.items.splice(0, this.items.length - this.capacity)
  }
  unshiftMany(xs: T[]): void {
    this.items = [...xs, ...this.items].slice(-this.capacity)
  }
  clear(): void {
    this.items = []
  }
  toArray(): T[] {
    return this.items
  }
  get length(): number {
    return this.items.length
  }
}

class DeviceLog {
  proc?: ChildProcess
  parser = new LogParser()
  ring: RingBuffer<LogEntry>
  engine = new FilterEngine()
  outBatch: LogEntry[] = []
  timer?: NodeJS.Timeout
  pidTimer?: NodeJS.Timeout
  constructor(capacity: number) {
    this.ring = new RingBuffer(capacity)
  }
}

export class LogcatStream {
  private logs = new Map<string, DeviceLog>()
  constructor(private adb: AdbRunner, private sink: LogSink, private capacity = 50_000) {}

  start(serial: string): void {
    this.stop(serial)
    const log = new DeviceLog(this.capacity)
    this.logs.set(serial, log)
    const proc = this.adb.spawnLong(['-s', serial, 'logcat', '-v', 'threadtime', '-T', '1'])
    log.proc = proc
    proc.stdout?.setEncoding('utf8')
    proc.stdout?.on('data', (c: string) => this.ingest(serial, log, log.parser.push(c)))
    // batch 100 ms supaya IPC tidak banjir
    log.timer = setInterval(() => {
      this.ingest(serial, log, log.parser.flush())
      this.flushBatch(serial, log)
    }, 100)
    log.pidTimer = setInterval(() => void this.refreshPids(serial, log), 3000)
  }

  stop(serial: string): void {
    const log = this.logs.get(serial)
    if (!log) return
    if (log.timer) clearInterval(log.timer)
    if (log.pidTimer) clearInterval(log.pidTimer)
    log.proc?.kill()
    this.logs.delete(serial)
  }
  stopAll(): void {
    for (const s of [...this.logs.keys()]) this.stop(s)
  }

  private ingest(serial: string, log: DeviceLog, entries: LogEntry[]): void {
    for (const e of entries) {
      log.engine.observe(e)
      const c = detectCrash(e)
      if (c) {
        e.crash = true
        this.sink.crash(serial, c)
      }
      log.ring.push(e)
      if (log.engine.match(e)) log.outBatch.push(e)
    }
  }
  private flushBatch(serial: string, log: DeviceLog): void {
    if (!log.outBatch.length) return
    const b = log.outBatch
    log.outBatch = []
    this.sink.lines(serial, b)
  }

  async setFilter(serial: string, f: LogFilter): Promise<{ queryError?: string }> {
    const log = this.logs.get(serial)
    if (!log) return {}
    const r = log.engine.set(f)
    await this.refreshPids(serial, log)
    log.outBatch = []
    this.sink.reset(serial, log.ring.toArray().filter((e) => log.engine.match(e)))
    return r
  }

  private async refreshPids(serial: string, log: DeviceLog): Promise<void> {
    const pkg = log.engine.pkg
    if (!pkg) return
    try {
      let pids = parsePidof(String(await this.adb.runOn(serial, ['shell', 'pidof', pkg]).catch(() => '')))
      if (!pids.length) pids = parsePs(String(await this.adb.runOn(serial, ['shell', 'ps', '-A', '-o', 'PID,NAME']).catch(() => '')), pkg)
      if (pids.length) log.engine.setPids(pids)
    } catch {
      /* cadangan saja; abaikan */
    }
  }

  /** Muat N baris sebelumnya: `logcat -d -t N`. */
  async loadHistory(serial: string, n = 5000): Promise<void> {
    const log = this.logs.get(serial)
    if (!log) return
    const out = String(await this.adb.runOn(serial, ['logcat', '-d', '-v', 'threadtime', '-t', String(Math.min(n, 50000))], { timeoutMs: 60_000 }))
    const p = new LogParser(-1_000_000)
    const entries = [...p.push(out + '\n'), ...p.flush()].map((e, i) => ({ ...e, id: -(1_000_000 - i) }))
    // id negatif tetap berurutan di depan entri baru
    const withCrash = entries.map((e) => (detectCrash(e) ? { ...e, crash: true } : e))
    // buang yang tumpang tindih dengan baris yang sudah mengalir (urut berdasarkan tanggal+jam)
    const firstLive = log.ring.toArray()[0]
    const cutoff = firstLive ? `${firstLive.date} ${firstLive.time}` : null
    log.ring.unshiftMany(cutoff ? withCrash.filter((e) => `${e.date} ${e.time}` < cutoff) : withCrash)
    this.sink.reset(serial, log.ring.toArray().filter((e) => log.engine.match(e)))
  }

  async clear(serial: string): Promise<void> {
    await this.adb.runOn(serial, ['logcat', '-c'])
    const log = this.logs.get(serial)
    log?.ring.clear()
    if (log) this.sink.reset(serial, [])
  }

  stack(serial: string, entryId: number): string {
    const arr = this.logs.get(serial)?.ring.toArray() ?? []
    return extractStack(arr, arr.findIndex((e) => e.id === entryId))
  }

  async save(serial: string, path: string): Promise<number> {
    const log = this.logs.get(serial)
    const rows = (log?.ring.toArray() ?? []).filter((e) => log!.engine.match(e))
    await writeFile(path, rows.map((e) => `${e.date} ${e.time} ${e.pid} ${e.tid} ${e.level} ${e.tag}: ${e.msg}`).join('\n') + '\n')
    return rows.length
  }
}
