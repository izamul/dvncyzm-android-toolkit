import { describe, it, expect } from 'vitest'
import { writeFileSync, chmodSync, mkdtempSync, existsSync, readFileSync, statSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { AdbRunner } from '../src/main/adb/runner'
import { parseScrcpyVersion, buildScrcpyArgs, explainScrcpyFailure, ScrcpyLauncher } from '../src/main/screen/scrcpy'
import { Recorder, explainRecordFailure, type RecordDone } from '../src/main/screen/recorder'

function script(name: string, body: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'fake-'))
  const p = join(dir, name)
  writeFileSync(p, `#!/bin/sh\n${body}\n`)
  chmodSync(p, 0o755)
  return p
}
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

describe('scrcpy: versi dan argumen', () => {
  it('membaca versi', () => {
    expect(parseScrcpyVersion('scrcpy 2.4 <https://github.com/Genymobile/scrcpy>')).toMatchObject({ major: 2, minor: 4 })
    expect(parseScrcpyVersion('scrcpy 1.25 <https://x>')).toMatchObject({ major: 1, minor: 25 })
    expect(parseScrcpyVersion('bukan scrcpy')).toBeNull()
  })
  it('2.x memakai --video-bit-rate dan --no-audio', () => {
    const a = buildScrcpyArgs('abc', 't', { bitRate: '8M', noAudio: true }, 2)
    expect(a).toContain('--video-bit-rate')
    expect(a).toContain('--no-audio')
  })
  it('1.x memakai --bit-rate dan tidak mengirim --no-audio', () => {
    const a = buildScrcpyArgs('abc', 't', { bitRate: '8M', noAudio: true }, 1)
    expect(a).toContain('--bit-rate')
    expect(a).not.toContain('--video-bit-rate')
    expect(a).not.toContain('--no-audio')
  })
  it('petunjuk galat', () => {
    expect(explainScrcpyFailure('ERROR: Unknown option --foo', 1)).toMatch(/terlalu lama/)
    expect(explainScrcpyFailure('Could not initialize SDL: No available video device', 1)).toMatch(/jendela/)
    expect(explainScrcpyFailure('adb: device unauthorized', 1)).toMatch(/Izinkan/)
  })
})

describe('ScrcpyLauncher', () => {
  const adb = script('adb', 'exit 0')
  it('galat langsung keluar dilaporkan dengan keluaran scrcpy', async () => {
    const sc = script('scrcpy', '[ "$1" = "--version" ] && { echo "scrcpy 1.25"; exit 0; }\necho "scrcpy: unrecognized option" >&2\nexit 1')
    const l = new ScrcpyLauncher(() => sc, () => adb, undefined, 1500)
    await expect(l.launch('abc', 'tv', {})).rejects.toMatchObject({ code: 'COMMAND_FAILED', message: expect.stringContaining('unrecognized option') })
    expect(l.isRunning('abc')).toBe(false)
  })
  it('berjalan lama dianggap sukses; ADB dan argumen diteruskan', async () => {
    const out = join(mkdtempSync(join(tmpdir(), 'o-')), 'args.txt')
    const sc = script('scrcpy', `[ "$1" = "--version" ] && { echo "scrcpy 2.4"; exit 0; }\necho "$ADB $@" > ${out}\nsleep 5`)
    const l = new ScrcpyLauncher(() => sc, () => adb, undefined, 600)
    await l.launch('abc', 'tv', { bitRate: '4M' })
    expect(l.isRunning('abc')).toBe(true)
    await expect(l.launch('abc', 'tv', {})).rejects.toThrow(/sudah berjalan/)
    const txt = readFileSync(out, 'utf8')
    expect(txt).toContain(adb)
    expect(txt).toContain('--video-bit-rate 4M')
    l.shutdown()
  })
  it('scrcpy tidak ada', async () => {
    const l = new ScrcpyLauncher(() => undefined, () => adb)
    await expect(l.launch('abc', 'tv', {})).rejects.toThrow(/tidak ditemukan/)
  })
})

describe('Recorder', () => {
  function setup(opts: { auto?: boolean; failFirst?: boolean }) {
    const state = mkdtempSync(join(tmpdir(), 'st-'))
    writeFileSync(join(state, 'video.mp4'), Buffer.alloc(4096, 1))
    const adb = script(
      'adb',
      `S="${state}"
case "$*" in
  *"shell rm"*) exit 0 ;;
  *"shell pkill"*) kill -INT $(cat "$S/pid") 2>/dev/null; echo pkill >> "$S/log"; exit 0 ;;
  *"shell screenrecord"*)
    ${opts.failFirst ? 'case "$*" in *--size*) ;; *) echo "WARNING: unable to get output buffers" ; exit 1 ;; esac' : ''}
    echo $$ > "$S/pid"
    ${opts.auto ? 'sleep 2; exit 0' : 'trap "exit 0" INT; sleep 30 & wait'}
    ;;
  *" pull "*) cp "$S/video.mp4" "$5"; exit 0 ;;
esac
exit 0`
    )
    const dir = mkdtempSync(join(tmpdir(), 'rec-'))
    const done: RecordDone[] = []
    const rec = new Recorder(new AdbRunner(() => adb), () => adb, () => dir, (e) => done.push(e), 400, 3000)
    return { rec, dir, done, state }
  }

  it('mulai, berhenti lewat SIGINT di perangkat, file ditarik', async () => {
    const { rec, state } = setup({})
    await rec.start('abc', 'tv', 30)
    expect(rec.isRecording('abc')).toBe(true)
    const path = await rec.stop('abc', 'tv')
    expect(existsSync(path)).toBe(true)
    expect(statSync(path).size).toBe(4096)
    expect(readFileSync(join(state, 'log'), 'utf8')).toContain('pkill')
    expect(rec.isRecording('abc')).toBe(false)
  })
  it('percobaan ulang 1280x720 bila bawaan gagal', async () => {
    const { rec } = setup({ failFirst: true })
    await rec.start('abc', 'tv', 30)
    expect(rec.isRecording('abc')).toBe(true)
    await rec.stop('abc', 'tv')
  })
  it('gagal total: pesan jelas', async () => {
    const adb = script('adb', 'echo "/system/bin/sh: screenrecord: not found"; exit 127')
    const rec = new Recorder(new AdbRunner(() => adb), () => adb, () => tmpdir(), undefined, 300)
    await expect(rec.start('abc', 'tv', 10)).rejects.toThrow(/tidak punya perintah screenrecord/)
    expect(rec.isRecording('abc')).toBe(false)
  })
  it('batas waktu tercapai: file ditarik otomatis dan dilaporkan', async () => {
    const { rec, done } = setup({ auto: true })
    await rec.start('abc', 'tv', 1)
    for (let i = 0; i < 40 && !done.length; i++) await sleep(100)
    expect(done[0]?.path).toBeTruthy()
    expect(existsSync(done[0].path!)).toBe(true)
    expect(rec.isRecording('abc')).toBe(false)
  })
  it('petunjuk galat rekam', () => {
    expect(explainRecordFailure('screenrecord: not found')).toMatch(/scrcpy/)
    expect(explainRecordFailure('Unable to get output buffers')).toMatch(/Encoder/)
  })
})

import { buildScrcpyEnv } from '../src/main/screen/scrcpy'
describe('buildScrcpyEnv (layar hitam di Linux)', () => {
  it('compat di Linux/Wayland: renderer software dan X11', () => {
    const e = buildScrcpyEnv({ PATH: '/usr/bin', DISPLAY: ':0', WAYLAND_DISPLAY: 'wayland-0', ELECTRON_RUN_AS_NODE: '1' }, '/opt/adb/adb', true, 'linux')
    expect(e.SDL_RENDER_DRIVER).toBe('software')
    expect(e.SDL_VIDEODRIVER).toBe('x11')
    expect(e.ADB).toBe('/opt/adb/adb')
    expect(e.ELECTRON_RUN_AS_NODE).toBeUndefined()
  })
  it('tanpa Wayland: hanya renderer software', () => {
    const e = buildScrcpyEnv({ PATH: '/usr/bin', DISPLAY: ':0' }, '/a/adb', true, 'linux')
    expect(e.SDL_RENDER_DRIVER).toBe('software')
    expect(e.SDL_VIDEODRIVER).toBeUndefined()
  })
  it('compat mati atau bukan Linux: tidak menyentuh SDL', () => {
    expect(buildScrcpyEnv({ PATH: '' }, '/a/adb', false, 'linux').SDL_RENDER_DRIVER).toBeUndefined()
    expect(buildScrcpyEnv({ PATH: '' }, '/a/adb', true, 'darwin').SDL_RENDER_DRIVER).toBeUndefined()
  })
})
