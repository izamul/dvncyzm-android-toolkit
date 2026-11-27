import { describe, it, expect } from 'vitest'
import { locateTool, type LocateEnv } from '../src/main/adb/locate'

const mk = (files: string[], over: Partial<LocateEnv> = {}): LocateEnv => ({
  platform: 'darwin', env: {}, home: '/Users/mac', isFile: (p) => files.includes(p), ...over
})

describe('locateTool adb', () => {
  it('pengaturan didahulukan', () => {
    const e = mk(['/x/adb', '/Users/mac/Library/Android/sdk/platform-tools/adb'])
    expect(locateTool('adb', '/x/adb', e)).toEqual({ path: '/x/adb', source: 'setting' })
  })
  it('ANDROID_HOME sebelum lokasi bawaan', () => {
    const e = mk(['/sdk/platform-tools/adb', '/Users/mac/Library/Android/sdk/platform-tools/adb'], { env: { ANDROID_HOME: '/sdk' } })
    expect(locateTool('adb', undefined, e)?.source).toBe('ANDROID_HOME')
  })
  it('lokasi SDK bawaan di Mac', () => {
    const e = mk(['/Users/mac/Library/Android/sdk/platform-tools/adb'])
    expect(locateTool('adb', undefined, e)?.source).toBe('sdk-default')
  })
  it('PATH sebagai cadangan', () => {
    const e = mk(['/usr/bin/adb'], { platform: 'linux', env: { PATH: '/bin:/usr/bin' } })
    expect(locateTool('adb', undefined, e)).toEqual({ path: '/usr/bin/adb', source: 'PATH' })
  })
  it('null kalau tidak ada', () => {
    expect(locateTool('adb', '/tidak/ada', mk([]))).toBeNull()
  })
  it('Windows memakai adb.exe', () => {
    const e = mk(['C:\\L\\Android\\Sdk\\platform-tools\\adb.exe'], { platform: 'win32', env: { LOCALAPPDATA: 'C:\\L' } })
    // path.join di Linux memakai '/', jadi hanya cek bahwa kandidat berekstensi .exe dicari
    expect(locateTool('adb', undefined, { ...e, isFile: (p) => p.endsWith('adb.exe') })?.path.endsWith('adb.exe')).toBe(true)
  })
})
