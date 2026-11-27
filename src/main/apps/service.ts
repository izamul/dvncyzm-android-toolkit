import { randomBytes } from 'crypto'
import { stat } from 'fs/promises'
import { statSync } from 'fs'
import { join } from 'path'
import type { AdbRunner } from '../adb/runner'
import { TIMEOUTS, AdbError } from '../adb/runner'
import type { AppInfo } from '../../shared/types'
import { validPackage, ValidationError } from '../validate'
import {
  parseDuTotal, parseDumpsysPackage, parsePackageList, parsePmPath, parseResolveActivity,
  parseTotalPss, parseByteCount, translateInstall
} from './parse'

export type AppKind = 'all' | 'user' | 'system'

const PERMISSION = /^[a-zA-Z][\w]*(\.[\w]+)+$/
const COMPONENT = /^[a-zA-Z][\w]*(\.[\w]+)*\/[\w.$]+$/
const ACTION = /^[a-zA-Z][\w]*(\.[\w]+)+$/

/** Bungkus nilai untuk shell perangkat (kutip tunggal). Dipakai hanya pada nilai yang sudah divalidasi. */
export function shq(v: string): string {
  return `'${v.replace(/'/g, `'\\''`)}'`
}

export function validApkPath(p: unknown): string {
  if (typeof p !== 'string' || !/\.apk$/i.test(p)) throw new ValidationError('Hanya file .apk yang bisa dipasang')
  let st
  try {
    st = statSync(p)
  } catch {
    throw new ValidationError('File APK tidak ditemukan')
  }
  if (!st.isFile()) throw new ValidationError('Bukan file APK')
  return p
}

export function validUri(u: unknown): string {
  if (typeof u !== 'string' || !u.length || u.length > 2000 || /[\u0000-\u001f]/.test(u)) throw new ValidationError('URI tidak valid')
  return u
}

export interface InstallStep {
  percent?: number
  phase: string
}

export class AppsService {
  constructor(private adb: AdbRunner) {}
  private sh(serial: string, args: string[], timeoutMs?: number): Promise<string> {
    return this.adb.runOn(serial, ['shell', ...args], { timeoutMs }).then(String)
  }

  async list(serial: string, kind: AppKind): Promise<AppInfo[]> {
    const flag = kind === 'user' ? ['-3'] : kind === 'system' ? ['-s'] : []
    const out = await this.sh(serial, ['pm', 'list', 'packages', '-f', '-U', ...flag])
    const [sysOut, ps] = await Promise.all([
      kind === 'all' ? this.sh(serial, ['pm', 'list', 'packages', '-s']).catch(() => '') : Promise.resolve(''),
      this.sh(serial, ['ps', '-A', '-o', 'NAME']).catch(() => '')
    ])
    const sys = new Set(sysOut.split(/\r?\n/).map((l) => l.replace('package:', '').trim()))
    const running = new Set(ps.split(/\r?\n/).map((l) => l.trim()))
    return parsePackageList(out)
      .map((p) => ({
        pkg: p.pkg,
        apkPaths: [p.apkPath],
        system: kind === 'system' ? true : kind === 'user' ? false : sys.has(p.pkg),
        running: running.has(p.pkg)
      }))
      .sort((a, b) => a.pkg.localeCompare(b.pkg))
  }

  async detail(serial: string, pkg: string): Promise<AppInfo> {
    validPackage(pkg)
    const [dump, path, pid] = await Promise.all([
      this.sh(serial, ['dumpsys', 'package', pkg], 30_000),
      this.sh(serial, ['pm', 'path', pkg]).catch(() => ''),
      this.sh(serial, ['pidof', pkg]).catch(() => '')
    ])
    const d = parseDumpsysPackage(dump)
    const apkPaths = parsePmPath(path)
    let sizeBytes: number | undefined
    if (apkPaths.length) {
      sizeBytes = parseDuTotal(await this.sh(serial, ['du', '-s', ...apkPaths.map(shq)]).catch(() => ''))
    }
    return {
      pkg,
      versionName: d.versionName,
      versionCode: d.versionCode,
      targetSdk: d.targetSdk,
      firstInstallTime: d.firstInstallTime,
      lastUpdateTime: d.lastUpdateTime,
      permissions: d.permissions,
      system: false,
      running: pid.trim().length > 0,
      apkPaths,
      sizeBytes
    }
  }

  async memory(serial: string, pkg: string): Promise<number | undefined> {
    return parseTotalPss(await this.sh(serial, ['dumpsys', 'meminfo', validPackage(pkg)], 30_000))
  }

  /**
   * Satu APK: kirim dulu ke perangkat (`adb push`, ukuran file di perangkat dipantau
   * untuk persen), lalu `pm install`. Banyak APK (split): `install-multiple` tanpa persen.
   */
  async install(
    serial: string,
    apks: string[],
    onProgress: (p: InstallStep) => void = () => undefined
  ): Promise<{ ok: boolean; message: string; code?: string }> {
    if (!apks.length) throw new ValidationError('Pilih file APK')
    const files = apks.map(validApkPath)
    if (files.length > 1) {
      onProgress({ phase: 'Memasang…' })
      try {
        return translateInstall(String(await this.adb.runOn(serial, ['install-multiple', '-r', '-d', '-t', '-g', ...files], { timeoutMs: TIMEOUTS.install })))
      } catch (e) {
        if (e instanceof AdbError) return translateInstall(e.message)
        throw e
      }
    }

    const file = files[0]
    const total = (await stat(file)).size
    const remote = `/data/local/tmp/dvncyzm-${randomBytes(4).toString('hex')}.apk`
    let pushing = true
    onProgress({ percent: 0, phase: 'Mengirim ke perangkat' })
    const poll = (async (): Promise<void> => {
      while (pushing) {
        await new Promise((r) => setTimeout(r, 400))
        if (!pushing) break
        try {
          const n = parseByteCount(await this.adb.run(['-s', serial, 'shell', `wc -c < ${remote}`], { timeoutMs: 5000 }))
          if (n !== undefined && total > 0) onProgress({ percent: Math.min(90, Math.round((n / total) * 90)), phase: 'Mengirim ke perangkat' })
        } catch {
          /* file belum ada atau perangkat sibuk: lewati */
        }
      }
    })()
    try {
      try {
        await this.adb.run(['-s', serial, 'push', file, remote], { timeoutMs: TIMEOUTS.install })
      } catch (e) {
        throw new AdbError('COMMAND_FAILED', `Gagal mengirim APK ke perangkat: ${(e as Error).message}`)
      } finally {
        pushing = false
        await poll
      }
      onProgress({ percent: 92, phase: 'Memasang…' })
      // flag yang tidak dikenal perangkat lama dilepas satu per satu
      let out = ''
      for (const flags of [['-r', '-d', '-t', '-g'], ['-r', '-d', '-t'], ['-r']]) {
        try {
          out = String(await this.adb.runOn(serial, ['shell', 'pm', 'install', ...flags, remote], { timeoutMs: TIMEOUTS.install }))
        } catch (e) {
          out = e instanceof AdbError ? e.message : String(e)
        }
        if (!/unknown option|unrecognized option|invalid option/i.test(out)) break
      }
      const r = translateInstall(out)
      if (r.ok) onProgress({ percent: 100, phase: 'Selesai' })
      return r
    } finally {
      await this.adb.run(['-s', serial, 'shell', 'rm', '-f', remote], { timeoutMs: 5000 }).catch(() => undefined)
    }
  }

  async uninstall(serial: string, pkg: string, keepData: boolean): Promise<string> {
    validPackage(pkg)
    const out = keepData ? await this.sh(serial, ['pm', 'uninstall', '-k', pkg]) : String(await this.adb.runOn(serial, ['uninstall', pkg]))
    if (!/Success/.test(out)) throw new AdbError('COMMAND_FAILED', out.trim() || 'Uninstall gagal.')
    return 'Berhasil dihapus.'
  }
  async forceStop(serial: string, pkg: string): Promise<void> {
    await this.sh(serial, ['am', 'force-stop', validPackage(pkg)])
  }
  async clearData(serial: string, pkg: string): Promise<void> {
    const out = await this.sh(serial, ['pm', 'clear', validPackage(pkg)])
    if (!/Success/.test(out)) throw new AdbError('COMMAND_FAILED', out.trim())
  }
  async launcherComponent(serial: string, pkg: string): Promise<string> {
    validPackage(pkg)
    for (const cat of ['android.intent.category.LEANBACK_LAUNCHER', 'android.intent.category.LAUNCHER']) {
      const out = await this.sh(serial, ['cmd', 'package', 'resolve-activity', '--brief', '-c', cat, pkg]).catch(() => '')
      const c = parseResolveActivity(out)
      if (c) return c
    }
    throw new AdbError('COMMAND_FAILED', 'Activity peluncur tidak ditemukan untuk aplikasi ini.')
  }
  async launch(serial: string, pkg: string): Promise<void> {
    const comp = await this.launcherComponent(serial, pkg)
    if (!COMPONENT.test(comp)) throw new ValidationError('Komponen tidak valid')
    await this.sh(serial, ['am', 'start', '-n', comp])
  }
  async restart(serial: string, pkg: string): Promise<void> {
    await this.forceStop(serial, pkg)
    await this.launch(serial, pkg)
  }
  async pullApk(serial: string, pkg: string, destDir: string): Promise<string[]> {
    const paths = parsePmPath(await this.sh(serial, ['pm', 'path', validPackage(pkg)]))
    const out: string[] = []
    for (const [i, p] of paths.entries()) {
      const local = join(destDir, paths.length === 1 ? `${pkg}.apk` : `${pkg}-${i}.apk`)
      await this.adb.runOn(serial, ['pull', p, local], { timeoutMs: TIMEOUTS.install })
      out.push(local)
    }
    return out
  }
  async grant(serial: string, pkg: string, perm: string): Promise<void> {
    if (!PERMISSION.test(perm)) throw new ValidationError('Nama izin tidak valid')
    await this.sh(serial, ['pm', 'grant', validPackage(pkg), perm])
  }
  async revoke(serial: string, pkg: string, perm: string): Promise<void> {
    if (!PERMISSION.test(perm)) throw new ValidationError('Nama izin tidak valid')
    await this.sh(serial, ['pm', 'revoke', validPackage(pkg), perm])
  }
  async deepLink(serial: string, uri: string): Promise<string> {
    return this.sh(serial, ['am', 'start', '-a', 'android.intent.action.VIEW', '-d', shq(validUri(uri))])
  }
  async broadcast(serial: string, action: string, component?: string): Promise<string> {
    if (!ACTION.test(action)) throw new ValidationError('Aksi tidak valid')
    const args = ['am', 'broadcast', '-a', action]
    if (component) {
      if (!COMPONENT.test(component)) throw new ValidationError('Komponen tidak valid')
      args.push('-n', component)
    }
    return this.sh(serial, args)
  }
}
