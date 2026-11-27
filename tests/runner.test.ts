import { describe, it, expect } from 'vitest'
import { writeFileSync, chmodSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { AdbRunner, AdbError, classifyStderr } from '../src/main/adb/runner'

// adb palsu: skrip shell yang bisa tidur, gagal, atau mencatat urutan
function fakeAdb(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'fakeadb-'))
  const p = join(dir, 'adb')
  writeFileSync(p, `#!/bin/sh\n${body}\n`)
  chmodSync(p, 0o755)
  return p
}

describe('classifyStderr', () => {
  it('unauthorized', () => expect(classifyStderr('error: device unauthorized.').code).toBe('UNAUTHORIZED'))
  it('offline', () => expect(classifyStderr("error: device 'x' not found").code).toBe('DEVICE_OFFLINE'))
  it('lainnya', () => expect(classifyStderr('boom').code).toBe('COMMAND_FAILED'))
})

describe('AdbRunner', () => {
  it('ADB_NOT_FOUND bila path kosong', async () => {
    const r = new AdbRunner(() => undefined)
    await expect(r.run(['devices'])).rejects.toMatchObject({ code: 'ADB_NOT_FOUND' })
  })
  it('mengembalikan stdout', async () => {
    const r = new AdbRunner(() => fakeAdb('echo hello'))
    expect(await r.run(['x'])).toContain('hello')
  })
  it('TIMEOUT', async () => {
    const r = new AdbRunner(() => fakeAdb('sleep 5'))
    await expect(r.run(['x'], { timeoutMs: 200 })).rejects.toMatchObject({ code: 'TIMEOUT' })
  })
  it('galat bertipe dari stderr', async () => {
    const r = new AdbRunner(() => fakeAdb('echo "error: device unauthorized." >&2; exit 1'))
    const e = await r.run(['x']).catch((x) => x)
    expect(e).toBeInstanceOf(AdbError)
    expect(e.code).toBe('UNAUTHORIZED')
  })
  it('perintah ke serial yang sama berurutan, serial berbeda paralel', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'log-'))
    const log = join(dir, 'log')
    // argumen: -s <serial> <nama>; catat mulai dan selesai
    const r = new AdbRunner(() => fakeAdb(`echo "start $3" >> ${log}; sleep 0.3; echo "end $3" >> ${log}`))
    await Promise.all([r.runOn('A', ['one']), r.runOn('A', ['two']), r.runOn('B', ['three'])])
    const { readFileSync } = await import('fs')
    const lines = readFileSync(log, 'utf8').trim().split('\n')
    expect(lines.indexOf('end one')).toBeLessThan(lines.indexOf('start two'))
    expect(lines.indexOf('start three')).toBeLessThan(lines.indexOf('end one'))
  })
  it('antrean lanjut setelah satu perintah gagal', async () => {
    const r = new AdbRunner(() => fakeAdb('if [ "$3" = bad ]; then echo nope >&2; exit 1; fi; echo ok'))
    const a = r.runOn('A', ['bad']).catch((e) => e)
    const b = r.runOn('A', ['good'])
    expect((await a).code).toBe('COMMAND_FAILED')
    expect(await b).toContain('ok')
  })
})
