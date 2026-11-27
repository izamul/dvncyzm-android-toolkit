<script setup lang="ts">
import { plain } from '../fmt'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useDevices } from '../stores/devices'
import { useSettings } from '../stores/settings'
import { useUi } from '../stores/ui'

const devices = useDevices()
const settings = useSettings()
const ui = useUi()
const cur = computed(() => devices.current)
const ready = computed(() => cur.value?.state === 'device')

const host = ref<HTMLElement | null>(null)
interface Session { id: string | null; term: Terminal; fit: FitAddon; off: Array<() => void>; dead: boolean }
let session: Session | null = null
let token = 0
const favName = ref('')
const favCmd = ref('')

function cssVar(n: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim()
}
async function closeSession(): Promise<void> {
  const s = session
  session = null
  if (!s) return
  s.dead = true
  s.off.forEach((f) => f())
  const id = s.id
  s.term.dispose()
  if (id) await window.dvncyzm.shell.close(id)
}
async function openSession(): Promise<void> {
  const my = ++token
  await closeSession()
  if (my !== token || !ready.value || !cur.value || !host.value) return
  const serial = cur.value.serial

  // Elemen baru per sesi: tidak ada sisa tampilan dari sesi sebelumnya
  host.value.replaceChildren()
  const el = document.createElement('div')
  el.style.height = '100%'
  host.value.appendChild(el)
  const term = new Terminal({ fontFamily: 'IBM Plex Mono, monospace', fontSize: 13, cursorBlink: true, theme: { background: cssVar('--card'), foreground: cssVar('--ink') } })
  const fit = new FitAddon()
  term.loadAddon(fit)
  term.open(el)
  fit.fit()
  const s: Session = { id: null, term, fit, off: [], dead: false }
  session = s

  // Pendengar dipasang sebelum sesi dibuka supaya keluaran awal tidak hilang;
  // semuanya terikat ke sesi ini lewat closure (bukan variabel bersama).
  const queue: Array<{ id: string; data: string }> = []
  s.off.push(window.dvncyzm.on('shell:data', (p) => {
    if (s.dead) return
    if (s.id === null) queue.push(p)
    else if (p.id === s.id) term.write(p.data)
  }))
  s.off.push(window.dvncyzm.on('shell:exit', (p) => {
    if (!s.dead && p.id === s.id) term.write('\r\n[sesi selesai]\r\n')
  }))
  term.onData((d) => s.id && !s.dead && window.dvncyzm.shell.write(s.id, d))
  term.onResize(({ cols, rows }) => s.id && !s.dead && window.dvncyzm.shell.resize(s.id, cols, rows))

  const id = await ui.run(window.dvncyzm.shell.open(serial, term.cols, term.rows))
  if (!id || s.dead || my !== token) {
    if (id) await window.dvncyzm.shell.close(id)
    return
  }
  s.id = id
  for (const q of queue.splice(0)) if (q.id === id) term.write(q.data)
}
watch([() => cur.value?.serial, ready], () => nextTick(openSession), { immediate: true, flush: 'post' })
const ro = new ResizeObserver(() => session?.fit.fit())
watch(host, (h) => h && ro.observe(h))
onBeforeUnmount(() => {
  ro.disconnect()
  token++
  closeSession()
})

function runFav(cmd: string): void {
  const s = session
  if (s?.id) window.dvncyzm.shell.write(s.id, cmd + '\r')
  s?.term.focus()
}
async function addFav(): Promise<void> {
  if (!favName.value.trim() || !favCmd.value.trim()) return
  const list = [...settings.settings.favorites, { id: 'f' + Date.now().toString(36), name: favName.value.trim(), cmd: favCmd.value.trim() }]
  const r = await ui.run(window.dvncyzm.store.set({ favorites: plain(list) }))
  if (r) {
    settings.settings.favorites = r.favorites
    favName.value = favCmd.value = ''
  }
}
async function delFav(id: string): Promise<void> {
  const r = await ui.run(window.dvncyzm.store.set({ favorites: plain(settings.settings.favorites.filter((f) => f.id !== id)) }))
  if (r) settings.settings.favorites = r.favorites
}
const inp = 'px-2 py-1 rounded-md border border-inp bg-bg text-xs outline-none focus:border-accent'
</script>

<template>
  <div v-if="!ready" class="p-6 text-sm text-ink2">Pilih perangkat yang terhubung untuk membuka terminal.</div>
  <div v-else class="h-full flex flex-col">
    <div class="p-2 border-b border-line bg-rail flex flex-wrap items-center gap-2 text-xs">
      <span class="text-ink2">Perintah favorit:</span>
      <span v-for="f in settings.settings.favorites" :key="f.id" class="border border-line rounded px-1.5 py-0.5">
        <button :title="f.cmd" @click="runFav(f.cmd)">{{ f.name }}</button>
        <button class="ml-1 text-ink2" @click="delFav(f.id)">×</button>
      </span>
      <input v-model="favName" :class="inp + ' w-28'" placeholder="nama" />
      <input v-model="favCmd" :class="inp + ' w-72 font-mono'" placeholder="am start -n com.izam.tv/.ui.PlayerActivity" @keyup.enter="addFav" />
      <button class="px-2.5 py-1 rounded-md border border-inp hover:border-accent" @click="addFav">Simpan</button>
    </div>
    <div ref="host" class="flex-1 min-h-0 p-2 bg-card" />
  </div>
</template>
