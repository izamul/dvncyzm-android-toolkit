import { spawn, execFile, type ChildProcess } from 'child_process'
import { dirname, delimiter } from 'path'
import { AdbError } from '../adb/runner'
import { validSerial, ValidationError } from '../validate'

export interface ScrcpyOptions {
  maxSize?: number
  bitRate?: string
  turnScreenOff?: boolean
  stayAwake?: boolean
  alwaysOnTop?: boolean
  noAudio?: boolean
  record?: string
  /** Atasi layar hitam: render software + paksa X11 bila di bawah Wayland. Bawaan: nyala di Linux. */
  compat?: boolean
}

/**
 * Lingkungan untuk proses scrcpy. Layar hitam padahal input masuk berarti video
 * tidak tergambar oleh SDL/OpenGL (umum di Linux dengan Wayland atau driver GPU
 * tertentu), jadi mode kompatibilitas memaksa renderer software dan X11.
 */
export function buildScrcpyEnv(base: NodeJS.ProcessEnv, adbPath: string, compat: boolean, platform: NodeJS.Platform = process.platform): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base, ADB: adbPath, PATH: `${dirname(adbPath)}${delimiter}${base.PATH ?? ''}` }
  delete env.ELECTRON_RUN_AS_NODE
  if (compat && platform === 'linux') {
    env.SDL_RENDER_DRIVER = 'software'
    if (base.WAYLAND_DISPLAY && base.DISPLAY) env.SDL_VIDEODRIVER = 'x11'
  }
  return env
}

export interface ScrcpyVersion {
  major: number
  minor: number
  raw: string
}

/** "scrcpy 2.4 <https://...>" atau "scrcpy 1.25 ..." */
export function parseScrcpyVersion(out: string): ScrcpyVersion | null {
  const m = /scrcpy\s+v?(\d+)\.(\d+)/i.exec(out)
  return m ? { major: Number(m[1]), minor: Number(m[2]), raw: `${m[1]}.${m[2]}` } : null
}

/**
 * Argumen scrcpy. `major` dibutuhkan karena scrcpy 1.x (paket apt/Ubuntu lama)
 * memakai `--bit-rate` dan tidak mengenal `--no-audio`; flag yang tidak dikenal
 * membuat scrcpy langsung keluar.
 */
export function buildScrcpyArgs(serial: string, windowTitle: string, o: ScrcpyOptions, major = 2): string[] {
  validSerial(serial)
  const args = ['--serial', serial, '--window-title', windowTitle.replace(/[^\w .\-]/g, '_').slice(0, 60) || serial]
  if (o.maxSize !== undefined) {
    if (!Number.isInteger(o.maxSize) || o.maxSize < 100 || o.maxSize > 8192) throw new ValidationError('max-size tidak valid')
    args.push('--max-size', String(o.maxSize))
  }
  if (o.bitRate !== undefined) {
    if (!/^\d{1,3}[KM]$/.test(o.bitRate)) throw new ValidationError('bit rate tidak valid (contoh 8M)')
    args.push(major >= 2 ? '--video-bit-rate' : '--bit-rate', o.bitRate)
  }
  if (o.turnScreenOff) args.push('--turn-screen-off')
  if (o.stayAwake) args.push('--stay-awake')
  if (o.alwaysOnTop) args.push('--always-on-top')
  if (o.noAudio && major >= 2) args.push('--no-audio')
  if (o.record) args.push(`--record=${o.record}`)
  return args
}

/** Ubah keluaran galat scrcpy menjadi petunjuk yang bisa ditindaklanjuti. */
export function explainScrcpyFailure(output: string, code: number | null): string {
  const t = output.trim()
  const low = t.toLowerCase()
  let hint = ''
  if (low.includes('unauthorized')) hint = 'Izinkan debugging di layar perangkat, lalu coba lagi.'
  else if (low.includes('could not find any adb device') || low.includes('device not found') || low.includes('no devices'))
    hint = 'Perangkat tidak terdeteksi oleh scrcpy. Pastikan statusnya "device" di daftar.'
  else if (low.includes('unknown option') || low.includes('unrecognized option') || low.includes('invalid option'))
    hint = 'scrcpy yang terpasang terlalu lama untuk opsi ini. Perbarui scrcpy (brew upgrade scrcpy / snap install scrcpy).'
  else if (low.includes('cannot open display') || low.includes('could not initialize sdl') || low.includes('no available video device') || low.includes('could not create window'))
    hint = 'scrcpy tidak bisa membuka jendela (tampilan/SDL). Jalankan aplikasi dari sesi desktop, bukan SSH.'
  else if (low.includes('error while loading shared libraries') || low.includes('library not loaded'))
    hint = 'Pustaka scrcpy tidak lengkap. Pasang ulang scrcpy dari paket resmi.'
  else if (low.includes('scrcpy-server') && (low.includes('could not') || low.includes('not found')))
    hint = 'File scrcpy-server tidak ditemukan. Pasang ulang scrcpy.'
  else if (low.includes('permission denied')) hint = 'scrcpy tidak punya izin dijalankan (chmod +x).'
  const tail = t.split('\n').slice(-6).join('\n')
  return `scrcpy berhenti (kode ${code ?? '?'}).${hint ? ' ' + hint : ''}${tail ? '\n' + tail : ''}`
}

function versionOf(scrcpy: string): Promise<ScrcpyVersion | null> {
  return new Promise((res) => {
    execFile(scrcpy, ['--version'], { timeout: 5000, windowsHide: true }, (_e, stdout, stderr) => res(parseScrcpyVersion(`${stdout}\n${stderr}`)))
  })
}

export interface ScrcpyExitEvent {
  serial: string
  code: number | null
  message: string
}

export class ScrcpyLauncher {
  private procs = new Map<string, ChildProcess>()
  private versions = new Map<string, ScrcpyVersion | null>()
  constructor(
    private getScrcpyPath: () => string | undefined,
    private getAdbPath: () => string | undefined,
    private onLateExit: (e: ScrcpyExitEvent) => void = () => undefined,
    private startupMs = 2500
  ) {}

  async version(): Promise<ScrcpyVersion | null> {
    const p = this.getScrcpyPath()
    if (!p) return null
    if (!this.versions.has(p)) this.versions.set(p, await versionOf(p))
    return this.versions.get(p) ?? null
  }

  /**
   * Jalankan scrcpy dan tunggu beberapa detik pertama: kalau langsung keluar
   * dengan galat, lempar galat berisi keluarannya (bukan gagal diam-diam).
   */
  async launch(serial: string, alias: string, opts: ScrcpyOptions): Promise<void> {
    const scrcpy = this.getScrcpyPath()
    const adbPath = this.getAdbPath()
    if (!scrcpy) throw new AdbError('COMMAND_FAILED', 'scrcpy tidak ditemukan. Pasang scrcpy atau pilih lokasinya di Pengaturan.')
    if (!adbPath) throw new AdbError('ADB_NOT_FOUND', 'adb tidak ditemukan.')
    validSerial(serial)
    if (this.procs.has(serial)) throw new ValidationError('scrcpy untuk perangkat ini sudah berjalan')
    const v = await this.version()
    const args = buildScrcpyArgs(serial, alias || serial, opts, v?.major ?? 2)
    const env = buildScrcpyEnv(process.env, adbPath, opts.compat ?? process.platform === 'linux')

    let out = ''
    const proc = spawn(scrcpy, args, { shell: false, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: false })
    const grab = (d: Buffer): void => {
      out = (out + d.toString()).slice(-4000)
    }
    proc.stdout?.on('data', grab)
    proc.stderr?.on('data', grab)
    this.procs.set(serial, proc)

    await new Promise<void>((resolve, reject) => {
      let settled = false
      const timer = setTimeout(() => {
        settled = true
        resolve()
      }, this.startupMs)
      proc.once('error', (e) => {
        this.procs.delete(serial)
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(new AdbError('COMMAND_FAILED', `scrcpy tidak bisa dijalankan: ${e.message}`))
      })
      proc.once('exit', (code) => {
        this.procs.delete(serial)
        if (settled) {
          // berjalan normal lalu berhenti: lapor hanya bila galat
          if (code !== 0 && code !== null) this.onLateExit({ serial, code, message: explainScrcpyFailure(out, code) })
          return
        }
        settled = true
        clearTimeout(timer)
        if (code === 0) resolve()
        else reject(new AdbError('COMMAND_FAILED', explainScrcpyFailure(out, code)))
      })
    })
  }

  isRunning(serial: string): boolean {
    return this.procs.has(serial)
  }

  shutdown(): void {
    for (const p of this.procs.values()) p.kill()
    this.procs.clear()
  }
}
