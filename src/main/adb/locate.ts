import { existsSync, statSync } from 'fs'
import { join, delimiter } from 'path'
import { homedir } from 'os'
import type { AdbStatus } from '../../shared/types'

export interface LocateEnv {
  platform: NodeJS.Platform
  env: NodeJS.ProcessEnv
  home: string
  isFile: (p: string) => boolean
}

const realEnv = (): LocateEnv => ({
  platform: process.platform,
  env: process.env,
  home: homedir(),
  isFile: (p) => {
    try {
      return existsSync(p) && statSync(p).isFile()
    } catch {
      return false
    }
  }
})

/** Urutan: pengaturan, ANDROID_HOME, lokasi SDK bawaan, PATH. */
export function locateTool(
  tool: 'adb' | 'scrcpy',
  settingPath?: string,
  e: LocateEnv = realEnv()
): { path: string; source: NonNullable<AdbStatus['source']> } | null {
  const exe = e.platform === 'win32' ? `${tool}.exe` : tool
  const candidates: Array<[string, NonNullable<AdbStatus['source']>]> = []
  if (settingPath) candidates.push([settingPath, 'setting'])
  if (tool === 'adb') {
    const home = e.env.ANDROID_HOME || e.env.ANDROID_SDK_ROOT
    if (home) candidates.push([join(home, 'platform-tools', exe), 'ANDROID_HOME'])
    if (e.platform === 'darwin') {
      candidates.push([join(e.home, 'Library', 'Android', 'sdk', 'platform-tools', exe), 'sdk-default'])
    } else if (e.platform === 'win32' && e.env.LOCALAPPDATA) {
      candidates.push([join(e.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', exe), 'sdk-default'])
    } else if (e.platform === 'linux') {
      candidates.push([join(e.home, 'Android', 'Sdk', 'platform-tools', exe), 'sdk-default'])
    }
  }
  // Windows: winget menaruh pintasan di folder Links yang belum tentu ada di PATH aplikasi GUI
  if (e.platform === 'win32' && e.env.LOCALAPPDATA) candidates.push([join(e.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links', exe), 'PATH'])
  for (const dir of (e.env.PATH ?? '').split(delimiter).filter(Boolean)) {
    candidates.push([join(dir, exe), 'PATH'])
  }
  // macOS: aplikasi GUI tidak mewarisi PATH shell, jadi cek lokasi Homebrew juga
  if (e.platform === 'darwin') {
    for (const dir of ['/opt/homebrew/bin', '/usr/local/bin']) candidates.push([join(dir, exe), 'PATH'])
  }
  // Linux: snap memasang ke /snap/bin yang sering tidak ada di PATH aplikasi GUI
  if (e.platform === 'linux') {
    for (const dir of ['/usr/local/bin', '/usr/bin', '/snap/bin']) candidates.push([join(dir, exe), 'PATH'])
  }
  for (const [p, source] of candidates) if (e.isFile(p)) return { path: p, source }
  return null
}
