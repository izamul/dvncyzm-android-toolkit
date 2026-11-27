import type { AdbRunner } from '../adb/runner'
import type { ForegroundApp } from '../../shared/types'

// "u0 com.foo.bar/.MainActivity" atau "u0 com.foo.bar/com.foo.bar.Main}"
const COMPONENT = /\bu\d+\s+([A-Za-z][\w.]*)\/([\w.$]+)/

function fromLine(line: string): ForegroundApp | null {
  const m = COMPONENT.exec(line)
  if (!m) return null
  const pkg = m[1]
  const act = m[2].startsWith('.') ? pkg + m[2] : m[2]
  return { pkg, activity: act }
}

/**
 * Cari aplikasi di layar dari keluaran dumpsys. Urutan keyakinan:
 * mCurrentFocus (jendela fokus) > topResumedActivity (Android 10+) >
 * mFocusedApp > mResumedActivity. Jendela sistem tanpa "pkg/aktivitas"
 * (StatusBar, NotificationShade, null) dilewati.
 */
export function parseForeground(out: string): ForegroundApp | null {
  const lines = out.split('\n')
  const order = ['mCurrentFocus', 'topResumedActivity', 'mFocusedApp', 'mResumedActivity', 'ResumedActivity']
  for (const key of order) {
    for (const line of lines) {
      if (!line.includes(key)) continue
      const r = fromLine(line)
      if (r) return r
    }
  }
  return null
}

export async function readForeground(adb: AdbRunner, serial: string): Promise<ForegroundApp | null> {
  const attempts = [
    `dumpsys window windows | grep -E 'mCurrentFocus|mFocusedApp'`,
    `dumpsys window | grep -E 'mCurrentFocus|mFocusedApp'`,
    `dumpsys activity activities | grep -E 'topResumedActivity|mResumedActivity'`
  ]
  for (const cmd of attempts) {
    try {
      const out = (await adb.runOn(serial, ['shell', cmd], { timeoutMs: 8000 })) as string
      const r = parseForeground(out)
      if (r) return r
    } catch {
      /* coba cara berikutnya */
    }
  }
  return null
}
