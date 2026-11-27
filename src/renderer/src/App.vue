<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useSettings } from './stores/settings'
import { useDevices } from './stores/devices'
import { useUi, type TabId } from './stores/ui'
import AdbMissing from './components/AdbMissing.vue'
import DeviceList from './components/DeviceList.vue'
import ToastHost from './components/ToastHost.vue'
import InfoTip from './components/InfoTip.vue'
import ShotPreview from './components/ShotPreview.vue'
import FloatingRemote from './components/FloatingRemote.vue'
import PerangkatView from './views/PerangkatView.vue'
import LogcatView from './views/LogcatView.vue'
import AplikasiView from './views/AplikasiView.vue'
import FileView from './views/FileView.vue'
import ShellView from './views/ShellView.vue'
import TesView from './views/TesView.vue'
import PengaturanView from './views/PengaturanView.vue'

const settings = useSettings()
const devices = useDevices()
const ui = useUi()
const ready = ref(false)
const isMac = window.dvncyzm.platform === 'darwin'

const tabs: Array<{ id: TabId; label: string }> = [
  { id: 'perangkat', label: 'Perangkat' },
  { id: 'logcat', label: 'Logcat' },
  { id: 'aplikasi', label: 'Aplikasi' },
  { id: 'file', label: 'File' },
  { id: 'shell', label: 'Shell' },
  { id: 'tes', label: 'Pengaturan tes' },
  { id: 'pengaturan', label: 'Pengaturan' }
]
const views = { perangkat: PerangkatView, logcat: LogcatView, aplikasi: AplikasiView, file: FileView, shell: ShellView, tes: TesView, pengaturan: PengaturanView }
const active = computed(() => views[ui.tab])

async function shot(): Promise<void> {
  const d = devices.current
  if (d?.state !== 'device') return
  const r = await ui.run(window.dvncyzm.screen.screenshot(d.serial, true))
  if (r) ui.showShot(r)
}
// galat tak tertangani tidak boleh diam: tampilkan sebagai toast
const onRejection = (e: PromiseRejectionEvent): void => ui.toast(`Terjadi galat: ${(e.reason as Error)?.message ?? e.reason}`, 'err')
const onError = (e: ErrorEvent): void => ui.toast(`Terjadi galat: ${e.message}`, 'err')
window.addEventListener('unhandledrejection', onRejection)
window.addEventListener('error', onError)
const offScrcpy = window.dvncyzm.on('scrcpy:exit', (e) => ui.toast(e.message, 'err'))
onBeforeUnmount(() => {
  offScrcpy()
  window.removeEventListener('unhandledrejection', onRejection)
  window.removeEventListener('error', onError)
  devices.stopDiscovery()
})
async function scrcpy(): Promise<void> {
  const d = devices.current
  if (d?.state !== 'device') return
  await ui.run(window.dvncyzm.screen.scrcpy(d.serial, { maxSize: 1280, bitRate: '8M', ...(settings.settings.scrcpy[d.serial] ?? {}) }))
}
function moveSelection(dir: 1 | -1): void {
  const l = devices.list.filter((d) => d.state !== 'disconnected')
  if (!l.length) return
  const i = l.findIndex((d) => d.serial === devices.selected)
  devices.selected = l[(i + dir + l.length) % l.length].serial
}

onMounted(async () => {
  await settings.init()
  if (settings.adb?.found) {
    await devices.start()
    devices.startDiscovery()
  }
  ready.value = true
  window.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey)) return
    if (e.shiftKey && e.key.toLowerCase() === 's') return (e.preventDefault(), void shot())
    if (e.shiftKey && e.key.toLowerCase() === 'r') return (e.preventDefault(), void (ui.remoteOpen = !ui.remoteOpen))
    if (e.shiftKey && e.key.toLowerCase() === 'm') return (e.preventDefault(), void scrcpy())
    if (e.shiftKey) return
    if (e.key === 'ArrowUp') return (e.preventDefault(), moveSelection(-1))
    if (e.key === 'ArrowDown') return (e.preventDefault(), moveSelection(1))
    const i = Number(e.key) - 1
    if (i >= 0 && i < tabs.length) {
      ui.tab = tabs[i].id
      e.preventDefault()
    }
  })
})

const themes = [
  { v: 'light', l: 'Terang' },
  { v: 'dark', l: 'Gelap' },
  { v: 'system', l: 'Sistem' }
] as const
</script>

<template>
  <div class="h-full flex flex-col">
    <header class="drag h-11 shrink-0 bg-rail border-b border-line flex items-center pr-3 gap-3"
      :class="isMac ? 'pl-20' : 'pl-3'">
      <span class="font-semibold text-sm">dvncyzm</span>
      <span v-if="settings.adb?.found" class="font-mono text-xs text-ink2">adb {{ settings.adb.version }}</span>
      <div class="ml-auto no-drag flex rounded-md border border-line overflow-hidden">
        <button v-for="t in themes" :key="t.v" class="px-2 py-1 text-xs" :class="settings.settings.theme === t.v ? 'bg-accent text-white' : 'text-ink2'" @click="settings.setTheme(t.v)">{{ t.l }}</button>
      </div>
    </header>

    <main v-if="ready && !settings.adb?.found" class="flex-1 min-h-0"><AdbMissing /></main>
    <div v-else-if="ready" class="flex-1 min-h-0 flex">
      <DeviceList />
      <section class="flex-1 min-w-0 flex flex-col">
        <nav class="h-10 shrink-0 border-b border-line bg-rail flex px-2 items-end gap-1">
          <button v-for="t in tabs" :key="t.id" class="px-3 py-2 text-sm border-b-2" :class="ui.tab === t.id ? 'border-accent text-ink font-medium' : 'border-transparent text-ink2'" @click="ui.tab = t.id">{{ t.label }}</button>
          <span class="ml-auto self-center pr-2 text-xs text-ink2">Apa ini?<InfoTip :k="'tab_' + ui.tab" right /></span>
        </nav>
        <div class="flex-1 min-h-0 overflow-auto">
          <KeepAlive><component :is="active" /></KeepAlive>
        </div>
      </section>
    </div>
    <FloatingRemote />
    <ShotPreview />
    <ToastHost />
  </div>
</template>
