import { describe, it, expect } from 'vitest'
import { writeFileSync, chmodSync, mkdtempSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { AdbRunner } from '../src/main/adb/runner'
import { AppsService, type InstallStep } from '../src/main/apps/service'
import { parseByteCount } from '../src/main/apps/parse'

function setup(pmBody: string) {
  const dir = mkdtempSync(join(tmpdir(), 'inst-'))
  const apk = join(dir, 'app.apk')
  writeFileSync(apk, Buffer.alloc(4000, 7))
  const adb = join(dir, 'adb')
  writeFileSync(
    adb,
    `#!/bin/sh
S="${dir}"
case "$*" in
  *" push "*)
    b=$(basename "$5"); : > "$S/$b"
    for i in 1 2 3 4; do head -c 1000 /dev/zero >> "$S/$b"; sleep 0.5; done
    echo "1 file pushed" ;;
  *"wc -c"*)
    b=$(basename "$(echo "$*" | sed 's/.*< //')")
    wc -c < "$S/$b" 2>/dev/null || { echo "No such file"; exit 1; } ;;
  *"pm install"*)
    echo "$*" >> "$S/log"
${pmBody}
    ;;
  *"rm -f"*) echo rm >> "$S/log" ;;
esac
exit 0
`
  )
  chmodSync(adb, 0o755)
  return { svc: new AppsService(new AdbRunner(() => adb)), apk, dir }
}

describe('parseByteCount', () => {
  it('angka dengan spasi', () => expect(parseByteCount('  1234\n')).toBe(1234))
  it('bukan angka', () => expect(parseByteCount('No such file')).toBeUndefined())
})

describe('install dengan progres', () => {
  it('persen naik, flag -g dilepas di perangkat lama, file sementara dihapus', async () => {
    const { svc, apk, dir } = setup(`    case "$*" in *" -g "*) echo "Exception: Unknown option: -g"; exit 1;; *) echo Success;; esac`)
    const steps: InstallStep[] = []
    const r = await svc.install('abc', [apk], (s) => steps.push(s))
    expect(r.ok).toBe(true)
    const pct = steps.map((s) => s.percent).filter((p): p is number => p !== undefined)
    expect(pct[0]).toBe(0)
    expect(pct.at(-1)).toBe(100)
    expect(pct.some((p) => p > 0 && p < 92)).toBe(true) // ada persen antara saat mengirim
    expect([...pct].sort((a, b) => a - b)).toEqual(pct)
    const log = readFileSync(join(dir, 'log'), 'utf8')
    expect(log).toMatch(/pm install -r -d -t -g /)
    expect(log).toMatch(/pm install -r -d -t \/data/)
    expect(log.trim().endsWith('rm')).toBe(true)
  })
  it('gagal: pesan diterjemahkan, tetap membersihkan', async () => {
    const { svc, apk, dir } = setup(`    echo "Failure [INSTALL_FAILED_UPDATE_INCOMPATIBLE: x]"; exit 1`)
    const r = await svc.install('abc', [apk])
    expect(r.ok).toBe(false)
    expect(r.message).toMatch(/Tanda tangan berbeda/)
    expect(readFileSync(join(dir, 'log'), 'utf8').trim().endsWith('rm')).toBe(true)
  })
})
