import type { CrashEvent, LogEntry } from '../../shared/types'

export function detectCrash(e: LogEntry): CrashEvent | null {
  if (e.msg.includes('FATAL EXCEPTION')) return { entryId: e.id, kind: 'crash', title: e.msg.split('\n')[0].trim() }
  if (e.tag === 'AndroidRuntime' && e.level === 'E' && !/^Shutting down VM/.test(e.msg))
    return { entryId: e.id, kind: 'crash', title: e.msg.split('\n')[0].trim() }
  const anr = /^ANR in ([\w.]+)/.exec(e.msg)
  if (anr) return { entryId: e.id, kind: 'anr', title: `ANR di ${anr[1]}` }
  if (e.msg.includes('Fatal signal')) return { entryId: e.id, kind: 'native', title: e.msg.split('\n')[0].trim() }
  return null
}

/** Stack trace: entri berikutnya dengan PID yang sama sampai baris non-"at". */
export function extractStack(entries: LogEntry[], startIndex: number): string {
  const first = entries[startIndex]
  if (!first) return ''
  const lines = [first.msg]
  for (let i = startIndex + 1; i < entries.length; i++) {
    const e = entries[i]
    if (e.pid !== first.pid) continue
    const first1 = e.msg.split('\n')[0]
    if (/^\s*(at |Caused by:|\.\.\. \d+ more|Suppressed:)/.test(first1) || (e.tag === 'AndroidRuntime' && e.level === 'E' && lines.length < 3)) {
      lines.push(e.msg)
    } else break
  }
  return lines.join('\n')
}
