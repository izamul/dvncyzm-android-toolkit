import { spawn, type ChildProcess } from 'child_process'
import { mkdir, stat } from 'fs/promises'
import { join } from 'path'
import type { AdbRunner } from '../adb/runner'
import { TIMEOUTS, AdbError } from '../adb/runner'
import { validSerial, ValidationError } from '../validate'

export const REMOTE_REC = '/data/local/tmp/dvncyzm-rec.mp4'

export function stamp(d = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}
export function safeName(s: string): string {
  return s.replace(/[^\w.\-]+/g, '_').slice(0, 60)
}

export function explainRecordFailure(out: string): string {
  const low = out.toLowerCase()
  if (low.includes('not found') || low.includes('inaccessible')) return 'Perangkat ini tidak punya perintah screenrecord. Gunakan scrcpy dengan opsi rekam.'
  if (low.includes('permission denied') || low.includes('secure')) return 'Perangkat menolak perekaman (konten terlindungi atau izin ditolak).'
  if (low.includes('unable to get output buffers') || low.includes('configure') || low.includes('encoder') || low.includes('codec'))
    return 'Encoder video perangkat gagal dengan resolusi bawaan.'
  const tail = out.trim().split('\n').slice(-3).join(' ')
  return tail ? `screenrecord gagal: ${tail}` : 'screenrecord langsung berhenti tanpa pesan.'
}

interface Rec {
  proc: ChildProcess
  exited: Promise<number | null>
  output: () => string
  stopping: boolean
  final?: Promise<string>
}

export interface RecordDone {
  serial: string
  path?: string
  error?: string
}

/**
 * Perekaman layar lewat `screenrecord` di perangkat. Berhenti dengan SIGINT
 * yang dikirim ke proses DI PERANGKAT (membunuh klien adb tidak menghentikan
 * screenrecord sehingga file mp4 tidak pernah ditutup dengan benar).
 */
export class Recorder {
  private recs = new Map<string, Rec>()
  constructor(
    private adb: AdbRunner,
    private getAdbPath: () => string | undefined,
    private getDir: () => string,
    private onDone: (e: RecordDone) => void = () => undefined,
    private earlyMs = 1500,
    private stopWaitMs = 10_000
  ) {}

  private launch(adbPath: string, serial: string, seconds: number, extra: string[]): Rec {
    const proc = spawn(adbPath, ['-s', serial, 'shell', 'screenrecord', ...extra, '--time-limit', String(seconds), REMOTE_REC], {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let out = ''
    const grab = (d: Buffer): void => {
      out = (out + d.toString()).slice(-2000)
    }
    proc.stdout?.on('data', grab)
    proc.stderr?.on('data', grab)
    const exited = new Promise<number | null>((res) => {
      proc.once('exit', (c) => res(c))
      proc.once('error', (e) => {
        out += `\n${e.message}`
        res(-1)
      })
    })
    return { proc, exited, output: () => out, stopping: false }
  }

  async start(serial: string, alias: string, seconds: number): Promise<void> {
    validSerial(serial)
    const adbPath = this.getAdbPath()
    if (!adbPath) throw new AdbError('ADB_NOT_FOUND', 'adb tidak ditemukan.')
    if (this.recs.has(serial)) throw new ValidationError('Perekaman sedang berjalan')
    const s = Math.min(180, Math.max(1, Math.floor(seconds) || 30))
    await this.adb.runOn(serial, ['shell', 'rm', '-f', REMOTE_REC]).catch(() => undefined)

    // percobaan 1: bawaan perangkat; percobaan 2: 1280x720 / 4 Mbps (encoder yang rewel)
    const attempts: string[][] = [[], ['--size', '1280x720', '--bit-rate', '4000000']]
    let lastOut = ''
    for (const extra of attempts) {
      const rec = this.launch(adbPath, serial, s, extra)
      const early = await Promise.race([rec.exited.then((c) => ({ c })), new Promise<null>((r) => setTimeout(() => r(null), this.earlyMs))])
      if (early === null) {
        this.recs.set(serial, rec)
        // berhenti sendiri saat batas waktu tercapai -> tarik file otomatis
        void rec.exited.then(() => {
          if (rec.stopping) return
          this.finalize(serial, alias, rec).then(
            (path) => this.onDone({ serial, path }),
            (e: Error) => this.onDone({ serial, error: e.message })
          )
        })
        return
      }
      lastOut = rec.output()
      if (early.c === 0) {
        // selesai < 1,5 dtk: durasi sangat pendek; perlakukan sebagai rekaman selesai
        this.recs.set(serial, rec)
        void this.finalize(serial, alias, rec).then(
          (path) => this.onDone({ serial, path }),
          (e: Error) => this.onDone({ serial, error: e.message })
        )
        return
      }
    }
    throw new AdbError('COMMAND_FAILED', explainRecordFailure(lastOut))
  }

  private finalize(serial: string, alias: string, rec: Rec): Promise<string> {
    if (rec.final) return rec.final
    rec.final = (async () => {
      await rec.exited
      this.recs.delete(serial)
      const dir = this.getDir()
      await mkdir(dir, { recursive: true })
      const local = join(dir, `${safeName(alias || serial)}-${stamp()}.mp4`)
      try {
        await this.adb.runOn(serial, ['pull', REMOTE_REC, local], { timeoutMs: TIMEOUTS.install })
        const st = await stat(local).catch(() => null)
        if (!st || st.size < 1024) throw new Error('file rekaman kosong')
      } catch (e) {
        throw new AdbError('COMMAND_FAILED', `Gagal mengambil rekaman: ${(e as Error).message}. ${explainRecordFailure(rec.output())}`)
      } finally {
        await this.adb.runOn(serial, ['shell', 'rm', '-f', REMOTE_REC]).catch(() => undefined)
      }
      return local
    })()
    return rec.final
  }

  async stop(serial: string, alias: string): Promise<string> {
    validSerial(serial)
    const rec = this.recs.get(serial)
    if (!rec) throw new ValidationError('Tidak ada perekaman aktif')
    rec.stopping = true
    // SIGINT harus sampai ke screenrecord di perangkat
    await this.adb.runOn(serial, ['shell', 'pkill', '-2', 'screenrecord']).catch(() =>
      this.adb.runOn(serial, ['shell', 'kill', '-2', '$(pidof screenrecord)']).catch(() => undefined)
    )
    const timedOut = await Promise.race([rec.exited.then(() => false), new Promise<boolean>((r) => setTimeout(() => r(true), this.stopWaitMs))])
    if (timedOut) rec.proc.kill('SIGINT')
    return this.finalize(serial, alias, rec)
  }

  isRecording(serial: string): boolean {
    return this.recs.has(serial)
  }

  shutdown(): void {
    for (const r of this.recs.values()) {
      r.stopping = true
      r.proc.kill('SIGINT')
    }
  }
}
