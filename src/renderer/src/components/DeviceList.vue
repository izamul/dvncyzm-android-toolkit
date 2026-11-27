<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useUi } from '../stores/ui'
import { useDevices } from '../stores/devices'
import type { Device } from '../../../shared/types'

const devices = useDevices()
const ui = useUi()
const codes = ref<Record<string, string>>({})
const pairBusy = ref('')
const manual = ref(false)
onMounted(() => void devices.loadIps())
const addr = ref('')
const msg = ref<string | null>(null)
const busy = ref(false)

const transportLabel = { usb: 'USB', wifi: 'Wi-Fi', emulator: 'Emulator' } as const

function statusText(d: Device): string {
  if (d.state === 'unauthorized') return 'Izinkan debugging di layar perangkat'
  if (d.state === 'offline') return 'Offline'
  if (d.state === 'disconnected') return 'Terputus'
  return 'Terhubung'
}
function dot(d: Device): string {
  return d.state === 'device' ? 'bg-ok' : d.state === 'disconnected' ? 'bg-inp' : 'bg-warn'
}
async function connectFound(a: string): Promise<void> {
  const err = await devices.connect(a)
  if (err) ui.toast(err, 'err')
  else ui.toast(`Tersambung ke ${a}`, 'ok')
}
async function toWifi(serial: string): Promise<void> {
  const r = await ui.run(window.dvncyzm.devices.toWifi(serial))
  if (r) ui.toast(`Tersambung lewat Wi-Fi: ${r}. Kabel USB boleh dicabut.`, 'ok')
}
async function pairOne(addr: string): Promise<void> {
  pairBusy.value = addr
  const err = await devices.pairAndConnect(addr, codes.value[addr] ?? '')
  pairBusy.value = ''
  if (err) ui.toast(err, err.startsWith('Pairing berhasil') ? 'info' : 'err')
  else {
    ui.toast('Pairing dan sambungan berhasil', 'ok')
    codes.value[addr] = ''
  }
}
async function connect(): Promise<void> {
  if (!addr.value.trim()) return
  busy.value = true
  msg.value = await devices.connect(addr.value.trim())
  busy.value = false
  if (!msg.value) addr.value = ''
}
</script>

<template>
  <aside class="w-72 shrink-0 bg-rail border-r border-line flex flex-col">
    <div class="px-3 pt-3 pb-2 text-xs font-medium uppercase tracking-wide text-ink2">Perangkat</div>
    <div class="flex-1 overflow-auto px-2 space-y-1">
      <div v-if="!devices.list.length" class="px-2 py-6 text-sm text-ink2">
        Belum ada perangkat. Colok USB atau sambungkan lewat Wi-Fi di bawah.
      </div>
      <div
        v-for="d in devices.list"
        :key="d.serial"
        role="button"
        tabindex="0"
        class="w-full text-left rounded-lg px-3 py-2 border cursor-pointer"
        :class="[
          d.serial === devices.selected ? 'bg-card border-accent' : 'border-transparent hover:bg-card',
          d.state === 'disconnected' ? 'opacity-60' : ''
        ]"
        @click="devices.selected = d.serial"
        @keyup.enter="devices.selected = d.serial"
      >
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 rounded-full" :class="dot(d)" />
          <span class="text-sm font-medium truncate">{{ d.alias || d.model || d.serial }}</span>
          <span class="ml-auto text-[10px] px-1.5 py-0.5 rounded border border-line text-ink2">{{ transportLabel[d.transport] }}</span>
        </div>
        <div class="font-mono text-xs text-ink2 truncate mt-0.5">{{ d.serial }}</div>
        <div class="text-xs mt-0.5" :class="d.state === 'device' ? 'text-ok' : 'text-warn'">{{ statusText(d) }}</div>
        <button
          v-if="d.state === 'offline'"
          class="mt-1 text-xs px-2 py-0.5 rounded border border-inp"
          @click.stop="devices.reconnect(d.serial)"
        >
          Sambung ulang
        </button>
        <div v-if="d.transport === 'usb' && d.state === 'device' && devices.ips[d.serial]" class="mt-1 flex items-center gap-2">
          <span class="font-mono text-xs text-ink2" :title="'IP Wi-Fi/LAN perangkat'">{{ devices.ips[d.serial] }}</span>
          <button class="text-xs px-2 py-0.5 rounded border border-inp hover:border-accent" @click.stop="toWifi(d.serial)">Sambung Wi-Fi</button>
        </div>
      </div>

      <div class="pt-3">
        <div class="px-1 pb-1 flex items-center text-xs font-medium uppercase tracking-wide text-ink2">
          Di jaringan
          <button class="ml-auto normal-case text-[11px] px-1.5 py-0.5 rounded border border-line hover:border-accent" :disabled="devices.discovering" @click="devices.discover(true, true)">
            {{ devices.discovering ? 'mencari…' : 'cari ulang' }}
          </button>
        </div>
        <div v-for="f in devices.foundNew" :key="f.addr" class="rounded-lg border border-line bg-card px-3 py-2 mb-1" data-testid="found">
          <div class="font-mono text-xs truncate">{{ f.addr }}</div>
          <div class="text-[11px] text-ink2 truncate">{{ f.source === 'mdns' ? 'Debugging nirkabel' : 'Port 5555 terbuka' }}<span v-if="f.name"> · {{ f.name.replace(/^adb-/, '') }}</span></div>
          <button class="mt-1 text-xs px-2 py-0.5 rounded bg-accent text-white" @click="connectFound(f.addr)">Sambung</button>
        </div>
        <div v-for="p in devices.pairing" :key="p.addr" class="rounded-lg border border-warn/50 bg-card px-3 py-2 mb-1" data-testid="pairing">
          <div class="text-xs">Siap dipasangkan <span class="font-mono">{{ p.addr }}</span></div>
          <div class="text-[11px] text-ink2">Di ponsel: Debugging nirkabel → Pasangkan dengan kode, lalu ketik 6 angkanya.</div>
          <div class="mt-1 flex gap-1.5">
            <input v-model="codes[p.addr]" maxlength="6" inputmode="numeric" placeholder="kode 6 angka" class="w-24 px-2 py-1 rounded-md border border-inp bg-bg font-mono text-xs outline-none focus:border-accent" />
            <button class="text-xs px-2 rounded bg-accent text-white disabled:opacity-50" :disabled="(codes[p.addr] ?? '').length !== 6 || pairBusy === p.addr" @click="pairOne(p.addr)">
              {{ pairBusy === p.addr ? '…' : 'Pair' }}
            </button>
          </div>
        </div>
        <p v-if="!devices.foundNew.length && !devices.pairing.length" class="px-1 text-xs text-ink2">
          {{ devices.discovering ? 'Memindai jaringan…' : 'Belum ada. Android 11+: aktifkan Debugging nirkabel agar muncul di sini otomatis.' }}
        </p>
      </div>
    </div>
    <form class="p-3 border-t border-line space-y-2" @submit.prevent="connect">
      <button type="button" class="text-xs text-ink2 hover:text-ink" @click="manual = !manual">{{ manual ? '▾' : '▸' }} Masukkan alamat manual</button>
      <div v-if="manual" class="flex gap-2">
        <input
          v-model="addr"
          placeholder="192.168.1.20:5555"
          class="flex-1 min-w-0 px-2 py-1.5 rounded-md border border-inp bg-card font-mono text-xs outline-none focus:border-accent"
        />
        <button class="px-3 rounded-md bg-accent text-white text-xs font-medium disabled:opacity-50" :disabled="busy">Sambung</button>
      </div>
      <p v-if="msg && manual" class="text-xs text-err">{{ msg }}</p>
    </form>
  </aside>
</template>
