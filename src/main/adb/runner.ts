import { execFile, spawn, type ChildProcess } from 'child_process'
import type { AppError, ErrorCode } from '../../shared/types'

export class AdbError extends Error {
  constructor(public code: ErrorCode, message: string) {
    super(message)
  }
  toAppError(): AppError {
    return { code: this.code, message: this.message }
  }
}

export const TIMEOUTS = { default: 20_000, install: 5 * 60_000, bugreport: 10 * 60_000 }

export interface RunOptions {
  timeoutMs?: number
  /** Kembalikan stdout sebagai Buffer (mis. exec-out screencap -p). */
  binary?: boolean
}

/** Terjemahkan stderr adb menjadi kode galat bertipe. */
export function classifyStderr(stderr: string): { code: ErrorCode; message: string } {
  const s = stderr.toLowerCase()
  if (s.includes('unauthorized')) return { code: 'UNAUTHORIZED', message: 'Izinkan debugging di layar perangkat.' }
  if (s.includes('offline') || /device (?:'[^']*' )?not found/.test(s) || s.includes('no devices') || s.includes('closed'))
    return { code: 'DEVICE_OFFLINE', message: 'Perangkat tidak terhubung atau offline.' }
  return { code: 'COMMAND_FAILED', message: stderr.trim() || 'Perintah adb gagal.' }
}

export class AdbRunner {
  private queues = new Map<string, Promise<unknown>>()
  constructor(private getAdbPath: () => string | undefined) {}

  private requirePath(): string {
    const p = this.getAdbPath()
    if (!p) throw new AdbError('ADB_NOT_FOUND', 'adb tidak ditemukan. Pilih lokasi adb di pengaturan.')
    return p
  }

  /** Jalankan `adb <args>` tanpa perangkat tertentu (devices, connect, pair, ...). */
  run(args: string[], opts: RunOptions = {}): Promise<string> {
    return this.exec(args, opts) as Promise<string>
  }

  /** Jalankan `adb -s <serial> <args>`; perintah ke serial yang sama berjalan berurutan. */
  runOn(serial: string, args: string[], opts: RunOptions = {}): Promise<string | Buffer> {
    const prev = this.queues.get(serial) ?? Promise.resolve()
    const next = prev.catch(() => undefined).then(() => this.exec(['-s', serial, ...args], opts))
    this.queues.set(serial, next)
    next.finally(() => {
      if (this.queues.get(serial) === next) this.queues.delete(serial)
    }).catch(() => undefined)
    return next
  }

  /** Proses berjalan lama (logcat, track-devices). Pemanggil yang mengelola proses. */
  spawnLong(args: string[]): ChildProcess {
    return spawn(this.requirePath(), args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'] })
  }

  private exec(args: string[], opts: RunOptions): Promise<string | Buffer> {
    let adb: string
    try {
      adb = this.requirePath()
    } catch (e) {
      return Promise.reject(e)
    }
    const timeout = opts.timeoutMs ?? TIMEOUTS.default
    return new Promise((resolve, reject) => {
      execFile(
        adb,
        args,
        { timeout, maxBuffer: 256 * 1024 * 1024, encoding: opts.binary ? 'buffer' : 'utf8', windowsHide: true },
        (err, stdout, stderr) => {
          if (err) {
            const e = err as NodeJS.ErrnoException & { killed?: boolean }
            if (e.code === 'ENOENT') return reject(new AdbError('ADB_NOT_FOUND', 'adb tidak ditemukan.'))
            if (e.killed) return reject(new AdbError('TIMEOUT', `Perintah melewati batas waktu ${Math.round(timeout / 1000)} detik.`))
            const c = classifyStderr(String(stderr || (opts.binary ? "" : stdout) || e.message))
            return reject(new AdbError(c.code, c.message))
          }
          resolve(stdout as string | Buffer)
        }
      )
    })
  }
}
