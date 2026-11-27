import { describe, it, expect } from 'vitest'
import { parseWmSize, parseWmDensity, parseBattery, parseDf, parseMeminfo, parseIps, parseIpWlan } from '../src/main/devices/info'
import { parsePackageList, parseDumpsysPackage, parseResolveActivity, translateInstall, parseDuTotal, parseTotalPss, parsePmPath } from '../src/main/apps/parse'
import { parseLsLa } from '../src/main/files/parse'
import { parseReverseList } from '../src/main/tweaks/service'
import { buildScrcpyArgs } from '../src/main/screen/service'
import { shq, validUri } from '../src/main/apps/service'
import { validDevicePath, validFileName } from '../src/main/files/service'
import { scanSubnet, localSubnets } from '../src/main/devices/wifi'

describe('info', () => {
  it('wm size memakai override', () => {
    expect(parseWmSize('Physical size: 1920x1080\nOverride size: 1280x720')).toEqual({ w: 1280, h: 720 })
    expect(parseWmSize('Physical size: 1920x1080')).toEqual({ w: 1920, h: 1080 })
  })
  it('wm density', () => expect(parseWmDensity('Physical density: 320\nOverride density: 213')).toBe(213))
  it('baterai', () => {
    const o = 'Current Battery Service state:\n  AC powered: false\n  USB powered: true\n  status: 2\n  level: 87\n  scale: 100'
    expect(parseBattery(o)).toEqual({ level: 87, charging: true })
    expect(parseBattery('')).toBeNull()
  })
  it('df', () => {
    const o = 'Filesystem       1K-blocks     Used Available Use% Mounted on\n/dev/block/dm-9   57071356 12000000  45000000  22% /data'
    expect(parseDf(o)).toEqual({ totalBytes: 57071356 * 1024, freeBytes: 45000000 * 1024 })
  })
  it('meminfo', () => expect(parseMeminfo('MemTotal:  2000000 kB\nMemFree: 100 kB\nMemAvailable:  900000 kB')).toEqual({ totalBytes: 2000000 * 1024, availBytes: 900000 * 1024 }))
  it('ip', () => {
    const o = '1: lo: <LOOPBACK>\n    inet 127.0.0.1/8 scope host lo\n2: wlan0:\n    inet 192.168.1.20/24 brd 192.168.1.255 scope global wlan0'
    expect(parseIps(o)).toEqual(['192.168.1.20'])
    expect(parseIpWlan('2: wlan0:\n    inet 192.168.1.20/24 brd 192.168.1.255 scope global wlan0')).toBe('192.168.1.20')
  })
})

describe('apps parse', () => {
  it('pm list packages -f -U', () => {
    const o = 'package:/data/app/~~abc==/com.izam.tv-xyz==/base.apk=com.izam.tv uid:10123\npackage:/system/app/X/X.apk=com.android.x uid:1000\nsampah'
    expect(parsePackageList(o)).toEqual([
      { apkPath: '/data/app/~~abc==/com.izam.tv-xyz==/base.apk', pkg: 'com.izam.tv', uid: 10123 },
      { apkPath: '/system/app/X/X.apk', pkg: 'com.android.x', uid: 1000 }
    ])
  })
  it('pm path', () => expect(parsePmPath('package:/a/base.apk\npackage:/a/split.apk\n')).toEqual(['/a/base.apk', '/a/split.apk']))
  it('dumpsys package', () => {
    const o = [
      'Packages:', '  Package [com.izam.tv] (abc):', '    versionCode=12 minSdk=24 targetSdk=34', '    versionName=1.2.0',
      '    firstInstallTime=2025-01-01 10:00:00', '    lastUpdateTime=2025-02-01 11:00:00', '    install permissions:',
      '      android.permission.INTERNET: granted=true', '    User 0: ceDataInode=1',
      '      runtime permissions:', '        android.permission.CAMERA: granted=false', '        android.permission.RECORD_AUDIO: granted=true, flags=[ x]',
      '    User 10: foo'
    ].join('\n')
    const d = parseDumpsysPackage(o)
    expect(d).toMatchObject({ versionName: '1.2.0', versionCode: 12, targetSdk: 34, firstInstallTime: '2025-01-01 10:00:00' })
    expect(d.permissions).toEqual([
      { name: 'android.permission.CAMERA', granted: false },
      { name: 'android.permission.RECORD_AUDIO', granted: true }
    ])
  })
  it('resolve-activity', () => expect(parseResolveActivity('priority=0 preferredOrder=0\ncom.izam.tv/.ui.MainActivity\n')).toBe('com.izam.tv/.ui.MainActivity'))
  it('du dan pss', () => {
    expect(parseDuTotal('1000\t/a\n24\t/b')).toBe(1024 * 1024)
    expect(parseTotalPss('       TOTAL PSS:    51234            TOTAL RSS: 1')).toBe(51234 * 1024)
  })
})
describe('translateInstall', () => {
  it('sukses', () => expect(translateInstall('Performing Streamed Install\nSuccess\n').ok).toBe(true))
  it.each([
    ['Failure [INSTALL_FAILED_UPDATE_INCOMPATIBLE: x]', 'Tanda tangan'],
    ['Failure [INSTALL_FAILED_VERSION_DOWNGRADE]', 'Versi lebih lama'],
    ['Failure [INSTALL_FAILED_INSUFFICIENT_STORAGE]', 'Penyimpanan'],
    ['Failure [INSTALL_PARSE_FAILED_NOT_APK: x]', 'rusak']
  ])('%s', (o, frag) => {
    const r = translateInstall(o)
    expect(r.ok).toBe(false)
    expect(r.message).toContain(frag)
  })
  it('galat lain diteruskan', () => expect(translateInstall('adb: failed to stat x.apk').message).toContain('failed to stat'))
})

describe('files', () => {
  it('ls -la toybox', () => {
    const o = [
      'total 20', 'drwxrwx--x  2 root sdcard_rw 4096 2024-01-01 10:00 .', 'drwxrwx--x  2 root sdcard_rw 4096 2024-01-01 10:00 ..',
      'drwxrwx--x  2 root sdcard_rw 4096 2024-01-02 11:30 Download', '-rw-rw----  1 root sdcard_rw 12345 2024-01-03 12:00 foto liburan.jpg',
      'lrwxrwxrwx  1 root root       21 2024-01-04 09:00 sdcard -> /storage/self/primary'
    ].join('\n')
    const r = parseLsLa(o)
    expect(r.map((x) => [x.name, x.type, x.size])).toEqual([['Download', 'dir', 4096], ['foto liburan.jpg', 'file', 12345], ['sdcard', 'link', 21]])
    expect(r[2].linkTarget).toBe('/storage/self/primary')
  })
  it('validasi path', () => {
    expect(validDevicePath('/sdcard/Download')).toBe('/sdcard/Download')
    for (const p of ['sdcard', '/sdcard/../data', '/a\nb', 5]) expect(() => validDevicePath(p)).toThrow()
    for (const n of ['a/b', '..', '', 'a\u0000']) expect(() => validFileName(n)).toThrow()
  })
})

describe('shq dan uri', () => {
  it('shq mengamankan kutip tunggal', () => expect(shq(`a'b;rm`)).toBe(`'a'\\''b;rm'`))
  it('URI kontrol ditolak', () => {
    expect(validUri('izamtv://play?id=1&x=2')).toBeTruthy()
    expect(() => validUri('a\nb')).toThrow()
  })
})
describe('tweaks dan scrcpy', () => {
  it('reverse --list', () => expect(parseReverseList('host-19 tcp:8081 tcp:8081\n')).toEqual([{ remote: 'tcp:8081', local: 'tcp:8081' }]))
  it('argumen scrcpy', () => {
    const a = buildScrcpyArgs('192.168.1.20:5555', 'TV Masjid', { maxSize: 1280, bitRate: '8M', stayAwake: true, record: '/tmp/a.mp4' })
    expect(a).toEqual(['--serial', '192.168.1.20:5555', '--window-title', 'TV Masjid', '--max-size', '1280', '--video-bit-rate', '8M', '--stay-awake', '--record=/tmp/a.mp4'])
  })
  it('scrcpy menolak nilai aneh', () => {
    expect(() => buildScrcpyArgs('a;b', 'x', {})).toThrow()
    expect(() => buildScrcpyArgs('abc', 'x', { bitRate: '8M;ls' })).toThrow()
    expect(() => buildScrcpyArgs('abc', 'x', { maxSize: 5 })).toThrow()
  })
})
describe('scan jaringan', () => {
  it('memindai 254 host dengan probe palsu', async () => {
    const r = await scanSubnet('10.0.0', 5555, 64, async (h) => h === '10.0.0.7' || h === '10.0.0.200')
    expect(r).toEqual(['10.0.0.7:5555', '10.0.0.200:5555'])
  })
  it('subnet lokal /24', () => {
    expect(localSubnets({ en0: [{ address: '192.168.1.5', family: 'IPv4', internal: false } as never], lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true } as never] })).toEqual(['192.168.1.5'.split('.').slice(0, 3).join('.')])
  })
})

import { parseForeground } from '../src/main/devices/foreground'
describe('parseForeground', () => {
  it('mCurrentFocus (Android 9-14)', () => {
    const out = '  mCurrentFocus=Window{4f2a1c u0 com.android.settings/com.android.settings.Settings}\n  mFocusedApp=ActivityRecord{1 u0 com.android.settings/.Settings t12}'
    expect(parseForeground(out)).toEqual({ pkg: 'com.android.settings', activity: 'com.android.settings.Settings' })
  })
  it('aktivitas relatif diubah jadi nama penuh', () => {
    expect(parseForeground('  mFocusedApp=ActivityRecord{a1 u0 com.foo.bar/.MainActivity t5}')).toEqual({ pkg: 'com.foo.bar', activity: 'com.foo.bar.MainActivity' })
  })
  it('jendela sistem tanpa komponen dilewati, pakai mFocusedApp', () => {
    const out = '  mCurrentFocus=Window{9 u0 NotificationShade}\n  mFocusedApp=AppWindowToken{x token=Token{y ActivityRecord{z u0 com.tv.launcher/.Home t3}}}'
    expect(parseForeground(out)?.pkg).toBe('com.tv.launcher')
  })
  it('topResumedActivity (Android 10+)', () => {
    expect(parseForeground('  topResumedActivity=ActivityRecord{c0ffee u0 com.google.android.youtube.tv/com.google.android.apps.youtube.tv.activity.ShellActivity t99}')?.pkg).toBe('com.google.android.youtube.tv')
  })
  it('null / kosong', () => {
    expect(parseForeground('  mCurrentFocus=null\n  mFocusedApp=null')).toBeNull()
    expect(parseForeground('')).toBeNull()
  })
})

import { parseMdns } from '../src/main/devices/wifi'
describe('parseMdns', () => {
  const out = `List of discovered mdns services
adb-R5CT123-AbCdEf\t_adb-tls-connect._tcp.\t192.168.1.5:41234
adb-R5CT123-AbCdEf\t_adb-tls-pairing._tcp.\t192.168.1.5:37000
adb-R5CT123-AbCdEf\t_adb-tls-connect._tcp.\t192.168.1.5:41234
tvbox-1   _adb._tcp.   192.168.1.9:5555
adb-X\t_adb-tls-connect._tcp.\tfe80::1:5000
`
  it('memisahkan connect dan pairing, membuang duplikat dan IPv6', () => {
    const r = parseMdns(out)
    expect(r.map((d) => `${d.kind}:${d.addr}`)).toEqual(['connect:192.168.1.5:41234', 'pairing:192.168.1.5:37000', 'connect:192.168.1.9:5555'])
    expect(r[0].name).toBe('adb-R5CT123-AbCdEf')
  })
  it('kosong', () => expect(parseMdns('List of discovered mdns services\n')).toEqual([]))
})
