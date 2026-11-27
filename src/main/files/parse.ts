export interface FileEntry {
  name: string
  type: 'dir' | 'file' | 'link' | 'other'
  size: number
  modified: string
  perms: string
  linkTarget?: string
}

/** `ls -la` dari toybox/mksh. Contoh: drwxrwx--x 2 root sdcard_rw 4096 2024-01-01 10:00 Name */
export function parseLsLa(out: string): FileEntry[] {
  const res: FileEntry[] = []
  for (const raw of out.split(/\r?\n/)) {
    const line = raw.trimEnd()
    const m = /^([\-dlcbps])([rwxsStT\-]{9})\s+\d+\s+\S+\s+\S+\s+(?:\d+,\s*)?(\d+)\s+(\d{4}-\d\d-\d\d \d\d:\d\d)\s+(.+)$/.exec(line)
    if (!m) continue
    let name = m[5]
    let linkTarget: string | undefined
    if (m[1] === 'l') {
      const i = name.indexOf(' -> ')
      if (i >= 0) {
        linkTarget = name.slice(i + 4)
        name = name.slice(0, i)
      }
    }
    if (name === '.' || name === '..') continue
    res.push({
      name, linkTarget, size: +m[3], modified: m[4], perms: m[1] + m[2],
      type: m[1] === 'd' ? 'dir' : m[1] === 'l' ? 'link' : m[1] === '-' ? 'file' : 'other'
    })
  }
  return res.sort((a, b) => (a.type === 'dir' ? 0 : 1) - (b.type === 'dir' ? 0 : 1) || a.name.localeCompare(b.name))
}
