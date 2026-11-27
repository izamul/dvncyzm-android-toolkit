import { app, clipboard, ClipboardItem, nativeImage } from 'electron'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import type { AdbRunner } from '../adb/runner'
import { AdbError } from '../adb/runner'
import { ScrcpyLauncher, type ScrcpyOptions, type ScrcpyExitEvent } from './scrcpy'
import { Recorder, stamp, safeName, type RecordDone } from './recorder'

export { buildScrcpyArgs, type ScrcpyOptions } from './scrcpy'
export { stamp, safeName } from './recorder'

export class ScreenService {
  private recorder: Recorder
  private launcher: ScrcpyLauncher
  constructor(
    private adb: AdbRunner,
    getAdbPath: () => string | undefined,
    getScrcpyPath: () => string | undefined,
    private getShotDir: () => string | undefined,
    emit: { record: (e: RecordDone) => void; scrcpyExit: (e: ScrcpyExitEvent) => void }
  ) {
    this.recorder = new Recorder(adb, getAdbPath, () => this.shotDir(), emit.record)
    this.launcher = new ScrcpyLauncher(getScrcpyPath, getAdbPath, emit.scrcpyExit)
  }

  private shotDir(): string {
    return this.getShotDir() || join(app.getPath('pictures'), 'dvncyzm')
  }

  async screenshot(serial: string, alias: string, copy: boolean): Promise<{ path: string; copied: boolean; preview: string }> {
    const buf = (await this.adb.runOn(serial, ['exec-out', 'screencap', '-p'], { binary: true })) as Buffer
    if (buf.length < 8 || buf[0] !== 0x89 || buf[1] !== 0x50) throw new AdbError('COMMAND_FAILED', 'Perangkat tidak mengembalikan gambar PNG.')
    const dir = this.shotDir()
    await mkdir(dir, { recursive: true })
    const path = join(dir, `${safeName(alias || serial)}-${stamp()}.png`)
    await writeFile(path, buf)
    if (copy) await clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(buf)], { type: 'image/png' }) })])
    const img = nativeImage.createFromBuffer(buf)
    const w = img.getSize().width
    const preview = (w > 640 ? img.resize({ width: 640, quality: 'good' }) : img).toDataURL()
    return { path, copied: copy, preview }
  }

  startRecord(serial: string, alias: string, seconds: number): Promise<void> {
    return this.recorder.start(serial, alias, seconds)
  }
  stopRecord(serial: string, alias: string): Promise<string> {
    return this.recorder.stop(serial, alias)
  }
  isRecording(serial: string): boolean {
    return this.recorder.isRecording(serial)
  }
  launchScrcpy(serial: string, alias: string, opts: ScrcpyOptions): Promise<void> {
    return this.launcher.launch(serial, alias, opts)
  }
  scrcpyVersion(): Promise<string | null> {
    return this.launcher.version().then((v) => v?.raw ?? null)
  }
  shutdown(): void {
    this.recorder.shutdown()
    this.launcher.shutdown()
  }
}
