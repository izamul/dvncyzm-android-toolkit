import type { LogEntry, LogLevel } from '../../shared/types'

const RE = /^(\d\d-\d\d) (\d\d:\d\d:\d\d\.\d{3})\s+(\d+)\s+(\d+) ([VDIWEF]) (.*?)\s*: (.*)$/

export function parseLine(line: string): Omit<LogEntry, 'id'> | null {
  const m = RE.exec(line)
  if (!m) return null
  return { date: m[1], time: m[2], pid: +m[3], tid: +m[4], level: m[5] as LogLevel, tag: m[6], msg: m[7] }
}

/** Parser berstatus: menangani potongan baris dan baris lanjutan. */
export class LogParser {
  private partial = ''
  private pending: Omit<LogEntry, 'id'> | null = null
  private nextId = 1
  constructor(startId = 1) {
    this.nextId = startId
  }

  push(chunk: string): LogEntry[] {
    const text = this.partial + chunk
    const lines = text.split(/\r?\n/)
    this.partial = lines.pop() ?? ''
    const out: LogEntry[] = []
    for (const line of lines) this.line(line, out)
    return out
  }

  /** Keluarkan entri yang masih menunggu baris lanjutan. */
  flush(): LogEntry[] {
    if (!this.pending) return []
    const e = { ...this.pending, id: this.nextId++ }
    this.pending = null
    return [e]
  }

  private line(line: string, out: LogEntry[]): void {
    if (line.startsWith('--------- ')) return
    const e = parseLine(line)
    if (e) {
      if (this.pending) out.push({ ...this.pending, id: this.nextId++ })
      this.pending = e
    } else if (this.pending && line.length) {
      this.pending.msg += '\n' + line
    }
  }
}
