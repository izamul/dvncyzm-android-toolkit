import type { AdbRunner } from '../adb/runner'
import { AdbError } from '../adb/runner'
import { validSerial } from '../validate'

interface Pty {
  onData(cb: (d: string) => void): void
  onExit(cb: (e: { exitCode: number }) => void): void
  write(d: string): void
  resize(c: number, r: number): void
  kill(): void
}

/** Terminal interaktif: satu-satunya tempat pengguna mengetik perintah shell sendiri. */
export class ShellService {
  private sessions = new Map<string, Pty>()
  private seq = 0
  constructor(
    private getAdbPath: () => string | undefined,
    private onData: (id: string, d: string) => void,
    private onExit: (id: string, code: number) => void
  ) {}

  open(serial: string, cols: number, rows: number): string {
    validSerial(serial)
    const adb = this.getAdbPath()
    if (!adb) throw new AdbError('ADB_NOT_FOUND', 'adb tidak ditemukan.')
    let pty: typeof import('node-pty')
    try {
      // dimuat saat dipakai: modul native, bisa belum terkompilasi untuk Electron
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      pty = require('node-pty')
    } catch (e) {
      throw new AdbError('COMMAND_FAILED', 'Modul terminal (node-pty) belum terpasang. Jalankan "npm run postinstall". ' + (e as Error).message)
    }
    const p = pty.spawn(adb, ['-s', serial, 'shell'], {
      name: 'xterm-256color',
      cols: Math.max(10, Math.min(500, cols | 0)),
      rows: Math.max(2, Math.min(200, rows | 0)),
      env: process.env as Record<string, string>
    }) as unknown as Pty
    const id = `sh${++this.seq}`
    p.onData((d) => this.onData(id, d))
    p.onExit((e) => {
      this.sessions.delete(id)
      this.onExit(id, e.exitCode)
    })
    this.sessions.set(id, p)
    return id
  }
  write(id: string, data: string): void {
    if (typeof data === 'string' && data.length < 100_000) this.sessions.get(id)?.write(data)
  }
  resize(id: string, cols: number, rows: number): void {
    this.sessions.get(id)?.resize(Math.max(10, Math.min(500, cols | 0)), Math.max(2, Math.min(200, rows | 0)))
  }
  close(id: string): void {
    this.sessions.get(id)?.kill()
    this.sessions.delete(id)
  }
  closeAll(): void {
    for (const id of [...this.sessions.keys()]) this.close(id)
  }
}
