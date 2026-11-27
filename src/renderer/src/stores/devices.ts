import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Device, Discovered } from '../../../shared/types'
import { useSettings } from './settings'

export const useDevices = defineStore('devices', () => {
  const live = ref<Device[]>([])
  const selected = ref<string | null>(null)
  const error = ref<string | null>(null)
  const settings = useSettings()
  const found = ref<Discovered[]>([])
  const pairing = ref<Discovered[]>([])
  const discovering = ref(false)
  const ips = ref<Record<string, string>>({})
  let timers: ReturnType<typeof setInterval>[] = []

  /** Perangkat aktif + perangkat terputus dari riwayat (abu-abu). */
  const list = computed<Device[]>(() => {
    const aliases = settings.settings.aliases
    const now = new Set(live.value.map((d) => d.serial))
    const gone: Device[] = Object.entries(settings.settings.lastSeen)
      .filter(([serial]) => !now.has(serial))
      .map(([serial, v]) => ({
        serial,
        state: 'disconnected' as const,
        transport: serial.includes(':') ? ('wifi' as const) : ('usb' as const),
        lastSeenAt: v.at
      }))
    return [...live.value, ...gone].map((d) => ({ ...d, alias: aliases[d.serial] ?? d.alias }))
  })
  const current = computed(() => list.value.find((d) => d.serial === selected.value) ?? null)

  async function start(): Promise<void> {
    window.dvncyzm.on('devices', (p) => {
      if (JSON.stringify(p) !== JSON.stringify(live.value)) live.value = p
      window.dvncyzm.store.get().then((r) => {
        if (r.ok && JSON.stringify(r.data) !== JSON.stringify(settings.settings)) settings.settings = r.data
      })
      error.value = null
      if (!selected.value || !live.value.some((d) => d.serial === selected.value)) {
        selected.value = live.value.find((d) => d.state === 'device')?.serial ?? live.value[0]?.serial ?? null
      }
    })
    window.dvncyzm.on('devices:error', (m) => (error.value = m))
    await window.dvncyzm.devices.watch()
  }
  async function connect(addr: string): Promise<string | null> {
    const r = await window.dvncyzm.devices.connect(addr)
    return r.ok ? null : r.error.message
  }
  async function reconnect(serial: string): Promise<void> {
    await window.dvncyzm.devices.reconnect(serial)
  }

  /** Hasil penemuan yang belum tersambung (disaring terhadap perangkat yang sudah ada). */
  const foundNew = computed(() => {
    const serials = live.value.map((d) => d.serial)
    const taken = (d: Discovered): boolean =>
      serials.some((s) => s === d.addr || s.startsWith(`${d.ip}:`) || (d.name !== undefined && s.startsWith(d.name)))
    return found.value.filter((d) => !taken(d))
  })
  // manual=true: tampilkan status "mencari…"; polling latar tidak mengubah tampilan sama sekali
  let inflight = false
  async function discover(sweep: boolean, manual = false): Promise<void> {
    if (inflight) return
    inflight = true
    if (manual) discovering.value = true
    const r = await window.dvncyzm.devices.discover(sweep)
    inflight = false
    discovering.value = false
    if (!r.ok) return
    // ganti hanya bila isinya berubah supaya daftar tidak dirender ulang (berkedip)
    if (JSON.stringify(r.data.connect) !== JSON.stringify(found.value)) found.value = r.data.connect
    if (JSON.stringify(r.data.pairing) !== JSON.stringify(pairing.value)) pairing.value = r.data.pairing
  }
  /** IP LAN untuk perangkat USB, diambil sekali per perangkat. */
  async function loadIps(): Promise<void> {
    for (const d of live.value) {
      if (d.transport !== 'usb' || d.state !== 'device' || ips.value[d.serial] !== undefined) continue
      ips.value[d.serial] = ''
      const r = await window.dvncyzm.devices.ip(d.serial)
      ips.value[d.serial] = r.ok && r.data ? r.data : ''
    }
  }
  function startDiscovery(): void {
    stopDiscovery()
    void discover(true)
    timers = [
      setInterval(() => document.visibilityState === 'visible' && void discover(false), 12_000),
      setInterval(() => document.visibilityState === 'visible' && void discover(true), 90_000),
      setInterval(() => void loadIps(), 5_000)
    ]
  }
  function stopDiscovery(): void {
    timers.forEach(clearInterval)
    timers = []
  }
  /** Pair lalu langsung sambung ke layanan connect di IP yang sama (tanpa mengetik port lagi). */
  async function pairAndConnect(addr: string, code: string): Promise<string | null> {
    const r = await window.dvncyzm.devices.pair(addr, code)
    if (!r.ok) return r.error.message
    const ip = addr.split(':')[0]
    for (let i = 0; i < 6; i++) {
      await new Promise((res) => setTimeout(res, 1000))
      await discover(false)
      const hit = found.value.find((d) => d.ip === ip && d.kind === 'connect')
      if (hit) return connect(hit.addr)
    }
    return 'Pairing berhasil. Pilih perangkat di daftar "Di jaringan" untuk menyambung.'
  }
  return { list, current, selected, error, found, foundNew, pairing, discovering, ips, start, connect, reconnect, discover, loadIps, startDiscovery, stopDiscovery, pairAndConnect }
})
