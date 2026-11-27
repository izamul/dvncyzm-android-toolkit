import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { AdbStatus, Settings } from '../../../shared/types'

export const useSettings = defineStore('settings', () => {
  const settings = ref<Settings>({ theme: 'system', aliases: {}, wifiHistory: [], lastSeen: {}, logPresets: [], scrcpy: {}, macros: [], favorites: [], autoReconnect: {} })
  const adb = ref<AdbStatus | null>(null)
  const systemDark = ref(window.matchMedia('(prefers-color-scheme: dark)').matches)

  function applyTheme(): void {
    const dark = settings.value.theme === 'dark' || (settings.value.theme === 'system' && systemDark.value)
    document.documentElement.classList.toggle('dark', dark)
  }

  async function init(): Promise<void> {
    const s = await window.dvncyzm.store.get()
    if (s.ok) settings.value = s.data
    applyTheme()
    window.dvncyzm.on('theme', (d) => {
      systemDark.value = d
      applyTheme()
    })
    await refreshAdb()
  }
  async function refreshAdb(): Promise<void> {
    const r = await window.dvncyzm.adb.status()
    adb.value = r.ok ? r.data : { found: false }
  }
  async function pickAdb(): Promise<string | null> {
    const r = await window.dvncyzm.adb.pickPath()
    if (r.ok) {
      adb.value = r.data
      return null
    }
    return r.error.message
  }
  async function setTheme(theme: Settings['theme']): Promise<void> {
    const r = await window.dvncyzm.store.set({ theme })
    if (r.ok) settings.value = r.data
    applyTheme()
  }
  return { settings, adb, init, refreshAdb, pickAdb, setTheme }
})
