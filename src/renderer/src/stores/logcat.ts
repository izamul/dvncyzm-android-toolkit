import { defineStore } from 'pinia'
import { computed, ref, shallowRef, triggerRef } from 'vue'
import type { CrashEvent, LogEntry, LogFilter, LogLevel } from '../../../shared/types'
import { useUi } from './ui'

const MAX = 50_000
export const ALL_LEVELS: LogLevel[] = ['V', 'D', 'I', 'W', 'E', 'F']

export const useLogcat = defineStore('logcat', () => {
  const ui = useUi()
  const serial = ref<string | null>(null)
  // shallowRef: array besar, jangan dibuat reaktif per elemen
  const entries = shallowRef<LogEntry[]>([])
  const paused = ref(false)
  const frozen = shallowRef<LogEntry[] | null>(null)
  const crash = ref<{ serial: string; ev: CrashEvent } | null>(null)
  const queryError = ref<string | null>(null)
  const filter = ref<LogFilter>({ levels: [...ALL_LEVELS] })
  const lastDev = ref<string | null>(null)
  let wired = false

  const visible = computed(() => (paused.value && frozen.value ? frozen.value : entries.value))

  function wire(): void {
    if (wired) return
    wired = true
    window.dvncyzm.on('logcat:lines', ({ serial: s, batch }) => {
      if (s !== serial.value) return
      const next = entries.value.concat(batch)
      entries.value = next.length > MAX ? next.slice(next.length - MAX) : next
      triggerRef(entries)
    })
    window.dvncyzm.on('logcat:reset', ({ serial: s, entries: e }) => {
      if (s !== serial.value) return
      entries.value = e
      if (paused.value) frozen.value = e
    })
    window.dvncyzm.on('logcat:crash', (p) => {
      crash.value = p
    })
  }

  async function attach(s: string | null): Promise<void> {
    wire()
    if (serial.value && serial.value !== s) await window.dvncyzm.logcat.stop(serial.value)
    if (!s) {
      serial.value = null
      entries.value = []
      return
    }
    if (serial.value === s) return
    serial.value = s
    entries.value = []
    crash.value = null
    paused.value = false
    frozen.value = null
    const r = await window.dvncyzm.logcat.start(s)
    if (!r.ok) {
      ui.toast(r.error.message, 'err')
      return
    }
    await apply()
  }
  async function apply(): Promise<void> {
    if (!serial.value) return
    const r = await window.dvncyzm.logcat.setFilter(serial.value, JSON.parse(JSON.stringify(filter.value)))
    queryError.value = r.ok ? (r.data.queryError ?? null) : r.error.message
  }
  function togglePause(): void {
    paused.value = !paused.value
    frozen.value = paused.value ? entries.value : null
  }
  async function clear(): Promise<void> {
    if (serial.value) await ui.run(window.dvncyzm.logcat.clear(serial.value))
  }
  async function loadHistory(): Promise<void> {
    if (serial.value) await ui.run(window.dvncyzm.logcat.loadHistory(serial.value, 5000))
  }
  async function save(): Promise<void> {
    if (!serial.value) return
    const r = await ui.run(window.dvncyzm.logcat.save(serial.value))
    if (r) ui.toast(`${r.count} baris disimpan ke ${r.path}`, 'ok')
  }
  async function copyStack(): Promise<void> {
    if (!serial.value || !crash.value) return
    const t = await ui.run(window.dvncyzm.logcat.stack(serial.value, crash.value.ev.entryId))
    if (t) await ui.copy(t, 'Stack trace disalin')
  }
  return { serial, entries, visible, paused, crash, queryError, filter, lastDev, attach, apply, togglePause, clear, loadHistory, save, copyStack }
})
