import type { AdbRunner } from '../adb/runner'
import { TIMEOUTS, AdbError } from '../adb/runner'
import { shq } from '../apps/service'
import { validPackage, ValidationError } from '../validate'
import { parseLsLa, type FileEntry } from './parse'

export function validDevicePath(p: unknown): string {
  if (typeof p !== 'string' || !p.startsWith('/') || p.length > 4096 || /[\u0000-\u001f]/.test(p) || p.split('/').includes('..')) {
    throw new ValidationError('Path perangkat tidak valid')
  }
  return p
}
export function validFileName(n: unknown): string {
  if (typeof n !== 'string' || !n.length || n.length > 255 || /[\/\u0000-\u001f]/.test(n) || n === '.' || n === '..') {
    throw new ValidationError('Nama file tidak valid')
  }
  return n
}
const join = (dir: string, name: string): string => (dir.endsWith('/') ? dir : dir + '/') + name

export class FilesService {
  constructor(private adb: AdbRunner) {}
  private sh(serial: string, args: string[]): Promise<string> {
    return this.adb.runOn(serial, ['shell', ...args]).then(String)
  }

  async ls(serial: string, path: string, runAsPkg?: string): Promise<FileEntry[]> {
    const p = validDevicePath(path)
    const out = runAsPkg
      ? await this.sh(serial, ['run-as', validPackage(runAsPkg), 'ls', '-la', shq(p)])
      : await this.sh(serial, ['ls', '-la', shq(p)])
    if (/No such file|Permission denied|not debuggable|unknown package/i.test(out) && !parseLsLa(out).length) {
      throw new AdbError('COMMAND_FAILED', out.trim())
    }
    return parseLsLa(out)
  }
  async push(serial: string, local: string, remoteDir: string): Promise<void> {
    await this.adb.runOn(serial, ['push', local, validDevicePath(remoteDir)], { timeoutMs: TIMEOUTS.install })
  }
  async pull(serial: string, remote: string, local: string): Promise<void> {
    await this.adb.runOn(serial, ['pull', validDevicePath(remote), local], { timeoutMs: TIMEOUTS.install })
  }
  async rm(serial: string, path: string): Promise<void> {
    const p = validDevicePath(path)
    if (p === '/' || p.split('/').filter(Boolean).length < 2) throw new ValidationError('Menolak menghapus folder tingkat atas')
    await this.sh(serial, ['rm', '-rf', shq(p)])
  }
  async rename(serial: string, dir: string, from: string, to: string): Promise<void> {
    await this.sh(serial, ['mv', shq(join(validDevicePath(dir), validFileName(from))), shq(join(dir, validFileName(to)))])
  }
  async mkdir(serial: string, dir: string, name: string): Promise<void> {
    await this.sh(serial, ['mkdir', shq(join(validDevicePath(dir), validFileName(name)))])
  }
  /** Ambil file dari data aplikasi debug: exec-out run-as <pkg> cat <file> */
  async pullRunAs(serial: string, pkg: string, remote: string): Promise<Buffer> {
    return (await this.adb.runOn(serial, ['exec-out', 'run-as', validPackage(pkg), 'cat', shq(validDevicePath(remote))], { binary: true })) as Buffer
  }
}
