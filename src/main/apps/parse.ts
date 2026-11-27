export interface ParsedPackage {
  pkg: string
  apkPath: string
  uid?: number
}

/** `pm list packages -f -U`: package:/data/app/.../base.apk=com.foo uid:10123 */
export function parsePackageList(out: string): ParsedPackage[] {
  const res: ParsedPackage[] = []
  for (const line of out.split(/\r?\n/)) {
    const m = /^package:(.+)=([a-zA-Z][\w]*(?:\.[a-zA-Z][\w]*)+)(?:\s+uid:(\d+))?\s*$/.exec(line.trim())
    if (m) res.push({ apkPath: m[1], pkg: m[2], uid: m[3] ? +m[3] : undefined })
  }
  return res
}

export function parsePmPath(out: string): string[] {
  return out.split(/\r?\n/).flatMap((l) => (l.startsWith('package:') ? [l.slice(8).trim()] : []))
}

export interface PackageDetail {
  versionName?: string
  versionCode?: number
  targetSdk?: number
  firstInstallTime?: string
  lastUpdateTime?: string
  permissions: Array<{ name: string; granted: boolean }>
}

export function parseDumpsysPackage(out: string): PackageDetail {
  const g = (re: RegExp): string | undefined => re.exec(out)?.[1]
  const permissions: PackageDetail['permissions'] = []
  const lines = out.split(/\r?\n/)
  const start = lines.findIndex((l) => /^\s*runtime permissions:\s*$/.test(l))
  if (start >= 0) {
    const indent = (lines[start].match(/^\s*/) ?? [''])[0].length
    for (let i = start + 1; i < lines.length; i++) {
      const l = lines[i]
      if (!l.trim()) continue
      if ((l.match(/^\s*/) ?? [''])[0].length <= indent) break
      const m = /^\s*([\w.]+):\s*granted=(true|false)/.exec(l)
      if (m) permissions.push({ name: m[1], granted: m[2] === 'true' })
    }
  }
  return {
    versionName: g(/versionName=(\S+)/),
    versionCode: g(/versionCode=(\d+)/) ? Number(g(/versionCode=(\d+)/)) : undefined,
    targetSdk: g(/targetSdk=(\d+)/) ? Number(g(/targetSdk=(\d+)/)) : undefined,
    firstInstallTime: g(/firstInstallTime=(.+)/)?.trim(),
    lastUpdateTime: g(/lastUpdateTime=(.+)/)?.trim(),
    permissions
  }
}

export function parseResolveActivity(out: string): string | undefined {
  const lines = out.split(/\r?\n/).map((l) => l.trim()).filter((l) => /^[\w.]+\/[\w.$]+$/.test(l))
  return lines[lines.length - 1]
}

export function parseDuTotal(out: string): number | undefined {
  // `du -s` menghasilkan blok 1K per baris: "1234\t/path"
  let total = 0
  let any = false
  for (const l of out.split(/\r?\n/)) {
    const m = /^(\d+)\s+/.exec(l.trim())
    if (m) {
      total += +m[1] * 1024
      any = true
    }
  }
  return any ? total : undefined
}

export function parseTotalPss(out: string): number | undefined {
  const m = /TOTAL PSS:\s*(\d+)/.exec(out) ?? /^\s*TOTAL\s+(\d+)/m.exec(out)
  return m ? +m[1] * 1024 : undefined
}

const INSTALL_ERRORS: Array<[RegExp, string]> = [
  [/INSTALL_FAILED_UPDATE_INCOMPATIBLE/, 'Tanda tangan berbeda dengan yang terpasang. Uninstall dulu, lalu pasang lagi.'],
  [/INSTALL_FAILED_VERSION_DOWNGRADE/, 'Versi lebih lama dari yang terpasang. Sudah memakai -d; kalau tetap gagal, uninstall dulu.'],
  [/INSTALL_FAILED_INSUFFICIENT_STORAGE/, 'Penyimpanan perangkat penuh.'],
  [/INSTALL_PARSE_FAILED_\w+/, 'File APK rusak atau bukan untuk Android ini.'],
  [/INSTALL_FAILED_TEST_ONLY/, 'APK bertanda test-only. Pasang lewat Android Studio atau tambahkan -t.'],
  [/INSTALL_FAILED_OLDER_SDK/, 'APK membutuhkan versi Android yang lebih baru dari perangkat ini.'],
  [/INSTALL_FAILED_ALREADY_EXISTS/, 'Aplikasi sudah terpasang.'],
  [/INSTALL_FAILED_NO_MATCHING_ABIS/, 'APK tidak mendukung arsitektur CPU perangkat ini.']
]

export function translateInstall(out: string): { ok: boolean; code?: string; message: string } {
  if (/^\s*Success\s*$/m.test(out)) return { ok: true, message: 'Berhasil dipasang.' }
  const code = /\[(INSTALL_[A-Z_]+)[^\]]*\]/.exec(out)?.[1] ?? /(INSTALL_[A-Z_]+)/.exec(out)?.[1]
  for (const [re, msg] of INSTALL_ERRORS) if (re.test(out)) return { ok: false, code, message: msg }
  return { ok: false, code, message: out.trim() || 'Install gagal.' }
}

/** Keluaran `wc -c < file`: jumlah byte, atau undefined bila bukan angka (file belum ada). */
export function parseByteCount(out: string): number | undefined {
  const m = /^\s*(\d+)\s*$/m.exec(out)
  return m ? Number(m[1]) : undefined
}
