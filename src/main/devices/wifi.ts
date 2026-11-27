import net from 'net'
import os from 'os'
import type { AdbRunner } from '../adb/runner'
import { AdbError } from '../adb/runner'
import { parseIpWlan } from './info'
import type { Discovered, DiscoverResult } from '../../shared/types'
import { validAddress, validPort, ValidationError } from '../validate'

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Subnet /24 dari antarmuka IPv4 non-internal pertama. */
export function localSubnets(ifaces = os.networkInterfaces()): string[] {
  const out: string[] = []
  for (const list of Object.values(ifaces)) {
    for (const i of list ?? []) {
      if (i.family === 'IPv4' && !i.internal) out.push(i.address.split('.').slice(0, 3).join('.'))
    }
  }
  return [...new Set(out)]
}

export function probe(host: string, port: number, timeoutMs = 300): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect({ host, port })
    const done = (ok: boolean): void => {
      s.destroy()
      resolve(ok)
    }
    s.setTimeout(timeoutMs, () => done(false))
    s.once('connect', () => done(true))
    s.once('error', () => done(false))
  })
}

export async function scanSubnet(prefix: string, port = 5555, concurrency = 64, probeFn = probe): Promise<string[]> {
  const hosts = Array.from({ length: 254 }, (_, i) => `${prefix}.${i + 1}`)
  const found: string[] = []
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < hosts.length) {
      const h = hosts[next++]
      if (await probeFn(h, port)) found.push(`${h}:${port}`)
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
  return found.sort((a, b) => Number(a.split('.')[3].split(':')[0]) - Number(b.split('.')[3].split(':')[0]))
}

/**
 * Keluaran `adb mdns services`:
 *   adb-R5CT123-AbCdEf  _adb-tls-connect._tcp.  192.168.1.5:41234
 *   adb-R5CT123-AbCdEf  _adb-tls-pairing._tcp.  192.168.1.5:37000
 */
export function parseMdns(out: string): Discovered[] {
  const res: Discovered[] = []
  const seen = new Set<string>()
  for (const line of out.split('\n')) {
    const m = /^(\S+)\s+_adb(?:-tls-(connect|pairing))?\._tcp\.?\s+(\d{1,3}(?:\.\d{1,3}){3}):(\d{2,5})\b/.exec(line.trim())
    if (!m) continue
    const kind = m[2] === 'pairing' ? 'pairing' : 'connect'
    const addr = `${m[3]}:${m[4]}`
    const key = `${kind}:${addr}`
    if (seen.has(key)) continue
    seen.add(key)
    res.push({ addr, ip: m[3], kind, source: 'mdns', name: m[1] })
  }
  return res
}

export class WifiService {
  constructor(private adb: AdbRunner) {}

  async pair(addr: string, code: string): Promise<string> {
    const a = validAddress(addr)
    if (!/^\d{6}$/.test(code)) throw new ValidationError('Kode pairing harus 6 angka')
    const out = await this.adb.run(['pair', a, code], { timeoutMs: 20_000 })
    if (!/successfully paired/i.test(out)) throw new AdbError('COMMAND_FAILED', out.trim() || 'Pairing gagal')
    return out.trim()
  }

  /** USB ke Wi-Fi: ambil IP, tcpip 5555, tunggu, connect. */
  async usbToWifi(serial: string, port = 5555): Promise<string> {
    validPort(port)
    let ip: string | undefined
    for (const iface of ['wlan0', 'eth0']) {
      const out = String(await this.adb.runOn(serial, ['shell', 'ip', '-f', 'inet', 'addr', 'show', iface]).catch(() => ''))
      ip = parseIpWlan(out)
      if (ip) break
    }
    if (!ip) throw new AdbError('COMMAND_FAILED', 'IP perangkat tidak ditemukan. Pastikan perangkat terhubung ke Wi-Fi atau kabel LAN.')
    await this.adb.runOn(serial, ['tcpip', String(port)])
    await sleep(2000)
    const addr = `${ip}:${port}`
    const out = await this.adb.run(['connect', addr], { timeoutMs: 10_000 })
    if (!/connected to/i.test(out) || /cannot|failed/i.test(out)) throw new AdbError('COMMAND_FAILED', out.trim())
    return addr
  }

  async scan(): Promise<string[]> {
    const res = await Promise.all(localSubnets().map((p) => scanSubnet(p)))
    return res.flat()
  }

  async mdns(): Promise<Discovered[]> {
    const out = await this.adb.run(['mdns', 'services'], { timeoutMs: 8000 }).catch(() => '')
    return parseMdns(out)
  }

  /** Temukan perangkat tanpa perlu membaca IP di ponsel: mDNS (Android 11+) + sapuan port 5555. */
  async discover(sweep: boolean): Promise<DiscoverResult> {
    const [m, scanned] = await Promise.all([this.mdns(), sweep ? this.scan() : Promise.resolve([] as string[])])
    const connect = m.filter((d) => d.kind === 'connect')
    const pairing = m.filter((d) => d.kind === 'pairing')
    for (const addr of scanned) {
      if (!connect.some((d) => d.addr === addr)) connect.push({ addr, ip: addr.split(':')[0], kind: 'connect', source: 'scan' })
    }
    return { connect, pairing }
  }
}
