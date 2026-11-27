export function bytes(n?: number): string {
  if (n === undefined || !Number.isFinite(n)) return '-'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = n
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${u[i]}`
}
export function ago(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (s < 60) return `${s} dtk lalu`
  if (s < 3600) return `${Math.round(s / 60)} mnt lalu`
  if (s < 86400) return `${Math.round(s / 3600)} jam lalu`
  return `${Math.round(s / 86400)} hari lalu`
}

/**
 * Salin menjadi objek/array biasa sebelum dikirim lewat IPC. Proxy reaktif Vue
 * tidak bisa di-clone ("An object could not be cloned") sehingga panggilan gagal diam-diam.
 */
export function plain<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}
