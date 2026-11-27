import { readdirSync, statSync } from 'fs'
import { join } from 'path'
import type { AppsService } from '../apps/service'
import { validPackage, ValidationError } from '../validate'

export interface Macro {
  id: string
  name: string
  pkg: string
  apkDir: string
  grant: string[]
}
export type StepStatus = 'pending' | 'running' | 'ok' | 'error'
export interface MacroStep {
  id: string
  label: string
  status: StepStatus
  detail?: string
}

/** APK terbaru (mtime) di folder. */
export function latestApk(dir: string): string | undefined {
  let best: { p: string; t: number } | undefined
  for (const f of readdirSync(dir)) {
    if (!/\.apk$/i.test(f)) continue
    const p = join(dir, f)
    const t = statSync(p).mtimeMs
    if (!best || t > best.t) best = { p, t }
  }
  return best?.p
}

export async function runMacro(
  apps: AppsService,
  serial: string,
  macro: Macro,
  emit: (steps: MacroStep[]) => void
): Promise<{ ok: boolean; openLogcatFor?: string }> {
  validPackage(macro.pkg)
  const steps: MacroStep[] = [
    { id: 'uninstall', label: `Uninstall ${macro.pkg}`, status: 'pending' },
    { id: 'install', label: 'Install APK terbaru', status: 'pending' },
    ...macro.grant.map((g) => ({ id: `grant:${g}`, label: `Beri izin ${g.split('.').pop()}`, status: 'pending' as StepStatus })),
    { id: 'launch', label: 'Buka aplikasi', status: 'pending' },
    { id: 'logcat', label: 'Pindah ke Logcat', status: 'pending' }
  ]
  emit(steps)
  const run = async (id: string, fn: () => Promise<string | void>): Promise<boolean> => {
    const s = steps.find((x) => x.id === id)!
    s.status = 'running'
    emit(steps)
    try {
      s.detail = (await fn()) || undefined
      s.status = 'ok'
    } catch (e) {
      s.status = 'error'
      s.detail = (e as Error).message
    }
    emit(steps.map((x) => ({ ...x })))
    return s.status === 'ok'
  }
  // uninstall gagal karena belum terpasang bukan masalah
  await run('uninstall', async () => {
    try {
      return await apps.uninstall(serial, macro.pkg, false)
    } catch {
      return 'Belum terpasang, dilewati.'
    }
  })
  if (!(await run('install', async () => {
    const apk = latestApk(macro.apkDir)
    if (!apk) throw new ValidationError('Tidak ada file .apk di folder yang dipilih')
    const r = await apps.install(serial, [apk])
    if (!r.ok) throw new Error(r.message)
    return apk
  }))) return { ok: false }
  for (const g of macro.grant) if (!(await run(`grant:${g}`, () => apps.grant(serial, macro.pkg, g)))) return { ok: false }
  if (!(await run('launch', () => apps.launch(serial, macro.pkg)))) return { ok: false }
  await run('logcat', async () => undefined)
  return { ok: true, openLogcatFor: macro.pkg }
}
