import type { AdbRunner } from '../adb/runner'
import { validPort, ValidationError } from '../validate'

export type RebootMode = 'normal' | 'recovery' | 'bootloader'

export function parseReverseList(out: string): Array<{ remote: string; local: string }> {
  // "(reverse) tcp:8081 tcp:8081"
  return out.split(/\r?\n/).flatMap((l) => {
    const m = /(?:\(reverse\)\s+)?(tcp:\d+)\s+(tcp:\d+)/.exec(l)
    return m ? [{ remote: m[1], local: m[2] }] : []
  })
}

export class TweaksService {
  constructor(private adb: AdbRunner) {}
  private sh(serial: string, ...cmd: string[]): Promise<string> {
    return this.adb.runOn(serial, ['shell', ...cmd]).then(String)
  }

  async reverse(serial: string, port: number): Promise<void> {
    const p = validPort(port)
    await this.adb.runOn(serial, ['reverse', `tcp:${p}`, `tcp:${p}`])
  }
  async unreverse(serial: string, port: number): Promise<void> {
    await this.adb.runOn(serial, ['reverse', '--remove', `tcp:${validPort(port)}`])
  }
  async reverseList(serial: string): Promise<Array<{ remote: string; local: string }>> {
    return parseReverseList(String(await this.adb.runOn(serial, ['reverse', '--list'])))
  }
  async forward(serial: string, local: number, remote: number): Promise<void> {
    await this.adb.runOn(serial, ['forward', `tcp:${validPort(local)}`, `tcp:${validPort(remote)}`])
  }
  async setAnimations(serial: string, on: boolean): Promise<void> {
    const v = on ? '1' : '0'
    for (const k of ['window_animation_scale', 'transition_animation_scale', 'animator_duration_scale']) {
      await this.sh(serial, 'settings', 'put', 'global', k, v)
    }
  }
  async layoutBounds(serial: string, on: boolean): Promise<void> {
    await this.sh(serial, 'setprop', 'debug.layout', on ? 'true' : 'false')
    // memaksa aplikasi menggambar ulang agar langsung berlaku
    await this.sh(serial, 'service', 'call', 'activity', '1599295570').catch(() => '')
  }
  async pointer(serial: string, on: boolean): Promise<void> {
    await this.sh(serial, 'settings', 'put', 'system', 'pointer_location', on ? '1' : '0')
  }
  async reboot(serial: string, mode: RebootMode): Promise<void> {
    const args = mode === 'normal' ? ['reboot'] : mode === 'recovery' || mode === 'bootloader' ? ['reboot', mode] : null
    if (!args) throw new ValidationError('Mode reboot tidak dikenal')
    await this.adb.runOn(serial, args)
  }

  // ---- Pengaturan tes (M4) ----
  async wmSize(serial: string, size: string | 'reset'): Promise<void> {
    if (size !== 'reset' && !/^\d{3,5}x\d{3,5}$/.test(size)) throw new ValidationError('Resolusi harus seperti 1280x720')
    await this.sh(serial, 'wm', 'size', size)
  }
  async wmDensity(serial: string, dpi: number | 'reset'): Promise<void> {
    if (dpi !== 'reset' && (!Number.isInteger(dpi) || dpi < 72 || dpi > 960)) throw new ValidationError('Density tidak valid')
    await this.sh(serial, 'wm', 'density', String(dpi))
  }
  async darkMode(serial: string, on: boolean): Promise<void> {
    await this.sh(serial, 'cmd', 'uimode', 'night', on ? 'yes' : 'no')
  }
  async fontScale(serial: string, scale: number): Promise<void> {
    if (!(scale >= 0.5 && scale <= 3)) throw new ValidationError('Ukuran huruf 0.5–3')
    await this.sh(serial, 'settings', 'put', 'system', 'font_scale', String(scale))
  }
  async proxy(serial: string, hostPort: string | null): Promise<void> {
    if (hostPort !== null && !/^[\w.\-]+:\d{1,5}$/.test(hostPort)) throw new ValidationError('Proxy harus host:port')
    await this.sh(serial, 'settings', 'put', 'global', 'http_proxy', hostPort ?? ':0')
  }
  async autoTime(serial: string, on: boolean): Promise<void> {
    await this.sh(serial, 'settings', 'put', 'global', 'auto_time', on ? '1' : '0')
  }
  /** Butuh root / emulator. Format MMDDhhmmYYYY.ss */
  async setDate(serial: string, d: Date): Promise<string> {
    const p = (n: number): string => String(n).padStart(2, '0')
    const f = `${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${d.getFullYear()}.${p(d.getSeconds())}`
    return this.sh(serial, 'date', f)
  }
  async openLocaleSettings(serial: string): Promise<void> {
    await this.sh(serial, 'am', 'start', '-a', 'android.settings.LOCALE_SETTINGS')
  }
}
