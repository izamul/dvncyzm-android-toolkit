import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Result } from '../../../shared/types'

export type TabId = 'perangkat' | 'logcat' | 'aplikasi' | 'file' | 'shell' | 'tes' | 'pengaturan'
export interface Toast { id: number; kind: 'ok' | 'err' | 'info'; text: string }

export const useUi = defineStore('ui', () => {
  const tab = ref<TabId>('perangkat')
  const toasts = ref<Toast[]>([])
  const logcatPkg = ref<string | null>(null)
  const appPkg = ref<string | null>(null)
  const remoteOpen = ref(false)
  const shot = ref<{ path: string; preview: string; copied: boolean } | null>(null)
  let shotTimer: ReturnType<typeof setTimeout> | undefined
  function showShot(v: { path: string; preview: string; copied: boolean }): void {
    shot.value = v
    clearTimeout(shotTimer)
    shotTimer = setTimeout(() => (shot.value = null), 15_000)
  }
  let n = 0

  function toast(text: string, kind: Toast['kind'] = 'info'): void {
    const id = ++n
    toasts.value.push({ id, kind, text })
    setTimeout(() => (toasts.value = toasts.value.filter((t) => t.id !== id)), kind === 'err' ? 7000 : 3500)
  }
  /** Buka hasil Result: tampilkan galat sebagai toast dan kembalikan null. */
  async function run<T>(p: Promise<Result<T>>, okText?: string): Promise<T | null> {
    const r = await p
    if (!r.ok) {
      toast(r.error.message, 'err')
      return null
    }
    if (okText) toast(okText, 'ok')
    return r.data
  }
  async function copy(text: string, label = 'Disalin'): Promise<void> {
    try {
      await navigator.clipboard.writeText(text)
      toast(label, 'ok')
    } catch {
      toast('Gagal menyalin', 'err')
    }
  }
  return { tab, toasts, logcatPkg, appPkg, remoteOpen, shot, showShot, toast, run, copy }
})
