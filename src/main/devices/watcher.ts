import type { ChildProcess } from 'child_process'
import type { AdbRunner } from '../adb/runner'
import type { Device } from '../../shared/types'
import { parseDevicesL } from './parse'

/**
 * Memantau `adb track-devices`. Setiap kali ada perubahan, ambil `adb devices -l`
 * (berisi model dan transport_id) lalu laporkan daftar lengkap.
 */
export class DeviceWatcher {
  private proc?: ChildProcess
  private stopped = true
  private retry?: NodeJS.Timeout
  private buf = ''
  constructor(private adb: AdbRunner, private onChange: (devices: Device[]) => void, private onError: (msg: string) => void) {}

  async refresh(): Promise<Device[]> {
    const out = await this.adb.run(['devices', '-l'])
    const list = parseDevicesL(out)
    this.onChange(list)
    return list
  }

  start(): void {
    this.stop()
    this.stopped = false
    this.refresh().catch((e) => this.onError(e.message))
    try {
      this.proc = this.adb.spawnLong(['track-devices'])
    } catch (e) {
      this.onError((e as Error).message)
      return
    }
    this.proc.stdout?.on('data', (chunk: Buffer) => {
      // format: 4 hex digit panjang + muatan; kita hanya perlu tahu "ada perubahan"
      this.buf += chunk.toString('utf8')
      if (this.buf.length > 64 * 1024) this.buf = ''
      this.refresh().catch((e) => this.onError(e.message))
    })
    this.proc.on('exit', () => {
      this.proc = undefined
      if (!this.stopped) this.retry = setTimeout(() => this.start(), 2000)
    })
    this.proc.on('error', (e) => this.onError(e.message))
  }

  stop(): void {
    this.stopped = true
    if (this.retry) clearTimeout(this.retry)
    this.proc?.kill()
    this.proc = undefined
  }
}
