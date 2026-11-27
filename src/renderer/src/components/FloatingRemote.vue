<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useDevices } from '../stores/devices'
import { useUi } from '../stores/ui'
import TvRemote from './TvRemote.vue'
import InfoTip from './InfoTip.vue'

const devices = useDevices()
const ui = useUi()
const serial = computed(() => (devices.current?.state === 'device' ? devices.current.serial : null))
const label = computed(() => devices.current?.alias || devices.current?.model || devices.current?.serial || '')

const KEY = 'dvncyzm.remote'
const pos = ref({ x: -1, y: -1 })
function clamp(): void {
  pos.value = {
    x: Math.min(Math.max(0, pos.value.x), Math.max(0, window.innerWidth - 260)),
    y: Math.min(Math.max(0, pos.value.y), Math.max(0, window.innerHeight - 120))
  }
}
function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...pos.value, open: ui.remoteOpen }))
  } catch {
    /* penyimpanan tidak tersedia: abaikan */
  }
}
onMounted(() => {
  pos.value = { x: window.innerWidth - 300, y: 90 }
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { x: number; y: number; open: boolean } | null
    if (v) {
      pos.value = { x: v.x, y: v.y }
      ui.remoteOpen = !!v.open
    }
  } catch {
    /* abaikan */
  }
  clamp()
  window.addEventListener('resize', clamp)
})
onBeforeUnmount(() => window.removeEventListener('resize', clamp))

function toggle(): void {
  ui.remoteOpen = !ui.remoteOpen
  save()
}
async function popout(): Promise<void> {
  if (!serial.value) return
  const ok = await ui.run(window.dvncyzm.input.popout(serial.value))
  if (ok !== null) {
    ui.remoteOpen = false
    save()
    ui.toast('Remote dipindah ke jendela yang selalu di atas', 'ok')
  }
}
let drag: { dx: number; dy: number } | null = null
function down(e: PointerEvent): void {
  if ((e.target as HTMLElement).closest('button')) return
  drag = { dx: e.clientX - pos.value.x, dy: e.clientY - pos.value.y }
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}
function move(e: PointerEvent): void {
  if (!drag) return
  pos.value = { x: e.clientX - drag.dx, y: e.clientY - drag.dy }
  clamp()
}
function up(): void {
  if (drag) save()
  drag = null
}
</script>

<template>
  <button
    v-if="!ui.remoteOpen"
    class="fixed right-4 bottom-4 z-30 h-11 px-4 rounded-full bg-accent text-white text-sm shadow-lg hover:opacity-90"
    title="Buka remote TV (Shift+R)"
    data-testid="remote-fab"
    @click="toggle"
  >
    🎮 Remote
  </button>
  <div
    v-show="ui.remoteOpen"
    class="fixed z-30 w-64 rounded-xl border border-line bg-card shadow-2xl"
    :style="{ left: pos.x + 'px', top: pos.y + 'px' }"
    data-testid="remote-panel"
  >
    <div class="flex items-center gap-1 px-3 py-2 border-b border-line cursor-move select-none rounded-t-xl" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up">
      <span class="text-sm font-semibold">Remote TV<InfoTip k="remote" /></span>
      <span class="ml-1 text-[11px] text-ink2 truncate max-w-[6rem]" :title="label">{{ serial ? label : '' }}</span>
      <button v-if="serial" class="ml-auto text-ink2 hover:text-accent px-1" title="Pin di atas semua jendela (jendela terpisah)" aria-label="Pin di atas semua jendela" data-testid="remote-pin" @click="popout">📌</button>
      <button class="text-ink2 hover:text-ink px-1" :class="serial ? '' : 'ml-auto'" title="Tutup (Shift+R)" aria-label="Tutup remote" @click="toggle">✕</button>
    </div>
    <TvRemote v-if="serial" :serial="serial" />
    <p v-else class="p-4 text-xs text-ink2">Pilih perangkat yang tersambung di daftar kiri untuk memakai remote.</p>
  </div>
</template>
