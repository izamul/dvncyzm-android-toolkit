import type { AdbRunner } from '../adb/runner'

export interface DeviceInfo {
  model?: string
  manufacturer?: string
  android?: string
  sdk?: number
  size?: { w: number; h: number }
  dpi?: number
  battery?: { level: number; charging: boolean } | null
  storage?: { freeBytes: number; totalBytes: number }
  memory?: { availBytes: number; totalBytes: number }
  ip?: string
  clockSkewMs?: number
}

export function parseWmSize(out: string): { w: number; h: number } | undefined {
  // "Physical size: 1080x2340" dan kemungkinan "Override size: ..."; pakai override bila ada
  const o = /Override size:\s*(\d+)x(\d+)/.exec(out) ?? /Physical size:\s*(\d+)x(\d+)/.exec(out)
  return o ? { w: +o[1], h: +o[2] } : undefined
}
export function parseWmDensity(out: string): number | undefined {
  const m = /Override density:\s*(\d+)/.exec(out) ?? /Physical density:\s*(\d+)/.exec(out)
  return m ? +m[1] : undefined
}
export function parseBattery(out: string): { level: number; charging: boolean } | null {
  const level = /level:\s*(\d+)/.exec(out)
  if (!level) return null
  const status = /status:\s*(\d+)/.exec(out)
  // 2 = charging, 5 = full (masih tercolok)
  const ac = /AC powered:\s*true/.test(out) || /USB powered:\s*true/.test(out)
  return { level: +level[1], charging: status ? status[1] === '2' || (status[1] === '5' && ac) : ac }
}
export function parseDf(out: string): { freeBytes: number; totalBytes: number } | undefined {
  // Filesystem 1K-blocks Used Available Use% Mounted on
  const lines = out.trim().split(/\r?\n/).filter((l) => !/^Filesystem/i.test(l))
  const last = lines[lines.length - 1]?.trim().split(/\s+/)
  if (!last || last.length < 4) return undefined
  const total = Number(last[1]), avail = Number(last[3])
  if (!Number.isFinite(total) || !Number.isFinite(avail)) return undefined
  return { totalBytes: total * 1024, freeBytes: avail * 1024 }
}
export function parseMeminfo(out: string): { availBytes: number; totalBytes: number } | undefined {
  const t = /MemTotal:\s*(\d+)\s*kB/.exec(out)
  const a = /MemAvailable:\s*(\d+)\s*kB/.exec(out) ?? /MemFree:\s*(\d+)\s*kB/.exec(out)
  return t && a ? { totalBytes: +t[1] * 1024, availBytes: +a[1] * 1024 } : undefined
}
export function parseIps(out: string): string[] {
  return [...out.matchAll(/inet (\d+\.\d+\.\d+\.\d+)\/\d+/g)].map((m) => m[1]).filter((ip) => !ip.startsWith('127.'))
}
export function parseIpWlan(out: string): string | undefined {
  return /inet (\d+\.\d+\.\d+\.\d+)\//.exec(out)?.[1]
}

export class DeviceInfoService {
  constructor(private adb: AdbRunner) {}
  private sh(serial: string, ...cmd: string[]): Promise<string> {
    return this.adb.runOn(serial, ['shell', ...cmd]).then((v) => String(v)).catch(() => '')
  }
  async get(serial: string): Promise<DeviceInfo> {
    const [model, manu, rel, sdk, size, dens, bat, df, mem, ip, date] = await Promise.all([
      this.sh(serial, 'getprop', 'ro.product.model'),
      this.sh(serial, 'getprop', 'ro.product.manufacturer'),
      this.sh(serial, 'getprop', 'ro.build.version.release'),
      this.sh(serial, 'getprop', 'ro.build.version.sdk'),
      this.sh(serial, 'wm', 'size'),
      this.sh(serial, 'wm', 'density'),
      this.sh(serial, 'dumpsys', 'battery'),
      this.sh(serial, 'df', '/data'),
      this.sh(serial, 'cat', '/proc/meminfo'),
      this.sh(serial, 'ip', '-f', 'inet', 'addr', 'show'),
      this.sh(serial, 'date', '+%s')
    ])
    const dev = Number(date.trim())
    return {
      model: model.trim() || undefined,
      manufacturer: manu.trim() || undefined,
      android: rel.trim() || undefined,
      sdk: Number(sdk.trim()) || undefined,
      size: parseWmSize(size),
      dpi: parseWmDensity(dens),
      battery: parseBattery(bat),
      storage: parseDf(df),
      memory: parseMeminfo(mem),
      ip: parseIps(ip)[0],
      clockSkewMs: Number.isFinite(dev) && dev > 0 ? dev * 1000 - Date.now() : undefined
    }
  }
  /** IP LAN perangkat (untuk tombol sambung Wi-Fi tanpa membuka pengaturan ponsel). */
  async ip(serial: string): Promise<string | null> {
    const out = await this.sh(serial, 'ip', '-f', 'inet', 'addr', 'show')
    return parseIps(out)[0] ?? null
  }
  /** Bagian yang disegarkan tiap 10 detik. */
  async live(serial: string): Promise<Pick<DeviceInfo, 'battery' | 'memory' | 'clockSkewMs'>> {
    const [bat, mem, date] = await Promise.all([
      this.sh(serial, 'dumpsys', 'battery'),
      this.sh(serial, 'cat', '/proc/meminfo'),
      this.sh(serial, 'date', '+%s')
    ])
    const dev = Number(date.trim())
    return { battery: parseBattery(bat), memory: parseMeminfo(mem), clockSkewMs: dev > 0 ? dev * 1000 - Date.now() : undefined }
  }
}
