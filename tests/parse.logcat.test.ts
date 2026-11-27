import { describe, it, expect } from 'vitest'
import { LogParser, parseLine } from '../src/main/logcat/parse'
import { detectCrash, extractStack } from '../src/main/logcat/crash'
import { FilterEngine, compileQuery, parsePidof, parsePs } from '../src/main/logcat/filter'
import { RingBuffer } from '../src/main/logcat/stream'
import type { LogEntry } from '../src/shared/types'

const L = (pid: number, level: string, tag: string, msg: string, t = '14:08:51.204'): string =>
  `11-26 ${t}  ${pid}  ${pid} ${level} ${tag}: ${msg}`
const mk = (id: number, pid: number, level: LogEntry['level'], tag: string, msg: string): LogEntry => ({ id, date: '11-26', time: '14:08:51.204', pid, tid: pid, level, tag, msg })

describe('parseLine', () => {
  it('threadtime biasa', () => {
    expect(parseLine(L(1234, 'I', 'izamtv', 'halo dunia'))).toMatchObject({ pid: 1234, level: 'I', tag: 'izamtv', msg: 'halo dunia' })
  })
  it('tag berspasi', () => {
    expect(parseLine(L(1, 'D', 'My Tag', 'x'))?.tag).toBe('My Tag')
  })
  it('pesan berisi titik dua', () => {
    expect(parseLine(L(1, 'W', 'Net', 'url: http://a:80'))?.msg).toBe('url: http://a:80')
  })
  it('baris tidak cocok', () => expect(parseLine('\tat com.foo.Bar(Bar.java:1)')).toBeNull())
})

describe('LogParser', () => {
  it('menempelkan baris lanjutan', () => {
    const p = new LogParser()
    const out = [...p.push(L(1, 'E', 'T', 'baris 1') + '\nlanjutan 2\n' + L(1, 'I', 'T', 'lain') + '\n'), ...p.flush()]
    expect(out).toHaveLength(2)
    expect(out[0].msg).toBe('baris 1\nlanjutan 2')
    expect(out.map((e) => e.id)).toEqual([1, 2])
  })
  it('potongan baris di tengah chunk', () => {
    const p = new LogParser()
    const full = L(5, 'I', 'T', 'utuh') + '\n'
    const a = p.push(full.slice(0, 20))
    const b = p.push(full.slice(20))
    expect(a).toEqual([])
    expect(b).toEqual([])
    expect(p.flush()[0].msg).toBe('utuh')
  })
  it('melewati header "--------- beginning of"', () => {
    const p = new LogParser()
    const out = [...p.push('--------- beginning of main\n' + L(1, 'I', 'T', 'a') + '\n'), ...p.flush()]
    expect(out).toHaveLength(1)
  })
  it('CRLF', () => {
    const p = new LogParser()
    expect([...p.push(L(1, 'I', 'T', 'a') + '\r\n'), ...p.flush()][0].msg).toBe('a')
  })
})

describe('detectCrash', () => {
  it('FATAL EXCEPTION', () => expect(detectCrash(mk(1, 1, 'E', 'AndroidRuntime', 'FATAL EXCEPTION: main'))?.kind).toBe('crash'))
  it('ANR', () => expect(detectCrash(mk(1, 1, 'E', 'ActivityManager', 'ANR in com.izam.tv (x)'))?.kind).toBe('anr'))
  it('Fatal signal', () => expect(detectCrash(mk(1, 1, 'F', 'libc', 'Fatal signal 11 (SIGSEGV)'))?.kind).toBe('native'))
  it('log biasa bukan crash', () => expect(detectCrash(mk(1, 1, 'E', 'Net', 'timeout'))).toBeNull())
})
describe('extractStack', () => {
  it('berhenti di baris non-at dan melewati PID lain', () => {
    const e = [
      mk(1, 10, 'E', 'AndroidRuntime', 'FATAL EXCEPTION: main'),
      mk(2, 99, 'I', 'Other', 'noise'),
      mk(3, 10, 'E', 'AndroidRuntime', '\tat a.B.c(B.java:1)'),
      mk(4, 10, 'E', 'AndroidRuntime', 'Caused by: x.Y'),
      mk(5, 10, 'I', 'Foo', 'selesai')
    ]
    expect(extractStack(e, 0)).toBe('FATAL EXCEPTION: main\n\tat a.B.c(B.java:1)\nCaused by: x.Y')
  })
})

describe('FilterEngine', () => {
  const all = ['V', 'D', 'I', 'W', 'E', 'F'] as const
  it('level', () => {
    const f = new FilterEngine()
    f.set({ levels: ['E', 'F'] })
    expect(f.match(mk(1, 1, 'E', 'A', 'x'))).toBe(true)
    expect(f.match(mk(2, 1, 'I', 'A', 'x'))).toBe(false)
  })
  it('tag dan pengecualian tag', () => {
    const f = new FilterEngine()
    f.set({ levels: [...all], tags: ['Net', '-Chatty'] })
    expect(f.match(mk(1, 1, 'I', 'Net', 'x'))).toBe(true)
    expect(f.match(mk(2, 1, 'I', 'Other', 'x'))).toBe(false)
    f.set({ levels: [...all], tags: ['-Chatty'] })
    expect(f.match(mk(3, 1, 'I', 'Chatty', 'x'))).toBe(false)
    expect(f.match(mk(4, 1, 'I', 'Other', 'x'))).toBe(true)
  })
  it('pencarian teks dan regex', () => {
    const f = new FilterEngine()
    f.set({ levels: [...all], query: 'timeout' })
    expect(f.match(mk(1, 1, 'I', 'A', 'Read TIMEOUT'))).toBe(true)
    f.set({ levels: [...all], query: '/err(or)?\\s\\d+/' })
    expect(f.match(mk(2, 1, 'I', 'A', 'ERROR 42'))).toBe(true)
    expect(f.match(mk(3, 1, 'I', 'A', 'ok'))).toBe(false)
  })
  it('regex salah ditandai, bukan error', () => {
    expect(compileQuery('/(/').ok).toBe(false)
    const f = new FilterEngine()
    expect(f.set({ levels: [...all], query: '/(/' }).queryError).toBeTruthy()
  })
  it('filter aplikasi mengikuti pergantian PID saat restart', () => {
    const f = new FilterEngine()
    f.set({ levels: [...all], pkg: 'com.izam.tv' })
    f.setPids([100])
    expect(f.match(mk(1, 100, 'I', 'A', 'x'))).toBe(true)
    expect(f.match(mk(2, 200, 'I', 'A', 'x'))).toBe(false)
    f.observe(mk(3, 50, 'I', 'ActivityManager', 'Start proc 200:com.izam.tv/u0a123 for activity'))
    expect(f.match(mk(4, 200, 'I', 'A', 'x'))).toBe(true)
    f.observe(mk(5, 50, 'I', 'ActivityManager', 'Start proc 300:com.lain/u0a1 for service'))
    expect(f.match(mk(6, 300, 'I', 'A', 'x'))).toBe(false)
  })
})
describe('pid parser', () => {
  it('pidof', () => expect(parsePidof('123 456\n')).toEqual([123, 456]))
  it('pidof kosong', () => expect(parsePidof('')).toEqual([]))
  it('ps cadangan', () => expect(parsePs('PID NAME\n12 com.a.b\n34 com.c.d\n', 'com.a.b')).toEqual([12]))
})
describe('RingBuffer', () => {
  it('membuang yang paling lama', () => {
    const r = new RingBuffer<number>(3)
    r.push(1, 2, 3, 4)
    expect(r.toArray()).toEqual([2, 3, 4])
  })
})
