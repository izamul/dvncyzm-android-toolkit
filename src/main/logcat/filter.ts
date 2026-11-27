import type { LogEntry, LogFilter } from '../../shared/types'

export type Matcher = { ok: true; test: (s: string) => boolean } | { ok: false; error: string }

/** Teks biasa (tanpa huruf besar/kecil) atau /regex/i. Regex salah tidak melempar. */
export function compileQuery(q: string | undefined): Matcher {
  if (!q) return { ok: true, test: () => true }
  const m = /^\/(.+)\/(i?)$/.exec(q)
  if (m) {
    try {
      const re = new RegExp(m[1], m[2] || 'i')
      return { ok: true, test: (s) => re.test(s) }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }
  const needle = q.toLowerCase()
  return { ok: true, test: (s) => s.toLowerCase().includes(needle) }
}

export const START_PROC = /Start proc (\d+):([\w.]+)\//

export class FilterEngine {
  private filter: LogFilter = { levels: ['V', 'D', 'I', 'W', 'E', 'F'] }
  private query: Matcher = { ok: true, test: () => true }
  private includeTags = new Set<string>()
  private excludeTags = new Set<string>()
  private pids = new Set<number>()

  set(f: LogFilter): { queryError?: string } {
    this.filter = f
    this.query = compileQuery(f.query)
    this.includeTags.clear()
    this.excludeTags.clear()
    for (const t of f.tags ?? []) {
      const s = t.trim()
      if (!s) continue
      if (s.startsWith('-')) this.excludeTags.add(s.slice(1).toLowerCase())
      else this.includeTags.add(s.toLowerCase())
    }
    this.pids.clear()
    return this.query.ok ? {} : { queryError: this.query.error }
  }
  get pkg(): string | undefined {
    return this.filter.pkg
  }
  setPids(pids: number[]): void {
    this.pids = new Set(pids)
  }
  pidCount(): number {
    return this.pids.size
  }
  /** Perhatikan baris ActivityManager agar PID baru masuk saat aplikasi menyala ulang. */
  observe(e: LogEntry): void {
    if (!this.filter.pkg || e.tag !== 'ActivityManager') return
    const m = START_PROC.exec(e.msg)
    if (m && m[2] === this.filter.pkg) this.pids.add(+m[1])
  }
  match(e: LogEntry): boolean {
    const f = this.filter
    if (!f.levels.includes(e.level === 'F' ? 'F' : e.level)) return false
    if (f.pkg && !this.pids.has(e.pid)) return false
    const tag = e.tag.toLowerCase()
    if (this.excludeTags.has(tag)) return false
    if (this.includeTags.size && !this.includeTags.has(tag)) return false
    if (this.query.ok && f.query && !this.query.test(`${e.tag} ${e.msg}`)) return false
    return true
  }
}

export function parsePidof(out: string): number[] {
  return out.trim().split(/\s+/).filter((x) => /^\d+$/.test(x)).map(Number)
}
export function parsePs(out: string, pkg: string): number[] {
  return out.split(/\r?\n/).flatMap((l) => {
    const [pid, name] = l.trim().split(/\s+/)
    return /^\d+$/.test(pid ?? '') && name === pkg ? [+pid] : []
  })
}
