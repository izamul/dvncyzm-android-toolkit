<script setup lang="ts">
import InfoTip from '../components/InfoTip.vue'
import { computed, ref } from 'vue'
import { useDevices } from '../stores/devices'
import { useUi } from '../stores/ui'
import ConfirmDialog from '../components/ConfirmDialog.vue'

const devices = useDevices()
const ui = useUi()
const cur = computed(() => devices.current)
const ready = computed(() => cur.value?.state === 'device')
const s = (): string => cur.value!.serial

const size = ref('1280x720')
const dpi = ref(213)
const font = ref(1.3)
const proxy = ref('192.168.1.5:8888')
const date = ref(new Date(Date.now() + 86400000).toISOString().slice(0, 16))
const confirmDate = ref(false)

const presets = [
  { l: '720p TV', size: '1280x720', dpi: 213 },
  { l: '1080p TV', size: '1920x1080', dpi: 320 },
  { l: 'HP 1080×2400', size: '1080x2400', dpi: 420 }
]
function usePreset(p: (typeof presets)[number]): void {
  size.value = p.size
  dpi.value = p.dpi
}
const t = window.dvncyzm.tweaks
async function applyRes(): Promise<void> {
  if ((await ui.run(t.wmSize(s(), size.value))) !== null) await ui.run(t.wmDensity(s(), dpi.value), `Resolusi ${size.value} @ ${dpi.value} dpi`)
}
async function resetRes(): Promise<void> {
  await ui.run(t.wmSize(s(), 'reset'))
  await ui.run(t.wmDensity(s(), 'reset'), 'Resolusi dan density dikembalikan')
}
async function applyDate(): Promise<void> {
  confirmDate.value = false
  await ui.run(t.autoTime(s(), false))
  const out = await ui.run(t.setDate(s(), new Date(date.value).toISOString()))
  if (out !== null && /not permitted|denied|Operation|Unable/i.test(out)) ui.toast('Perangkat menolak: ubah jam butuh root atau emulator. ' + out.trim(), 'err')
  else if (out !== null) ui.toast('Jam diubah (jam otomatis dimatikan)', 'ok')
}
const card = 'bg-card border border-line rounded-xl p-4'
const btn = 'px-3 py-1.5 rounded-lg border border-inp text-sm hover:border-accent'
const inp = 'px-2 py-1.5 rounded-md border border-inp bg-bg text-sm outline-none focus:border-accent'
const tag = 'text-[10px] px-1.5 py-0.5 rounded border border-warn text-warn ml-2'
</script>

<template>
  <div v-if="!ready" class="p-6 text-sm text-ink2">Pilih perangkat yang terhubung untuk mengubah pengaturan tes.</div>
  <div v-else class="p-5 space-y-4 max-w-3xl">
    <div :class="card">
      <h3 class="font-semibold text-sm mb-2">Resolusi dan density<InfoTip k="resolusi" /></h3>
      <div class="flex flex-wrap gap-2 mb-2"><button v-for="p in presets" :key="p.l" :class="btn + ' !text-xs'" @click="usePreset(p)">{{ p.l }}</button></div>
      <div class="flex flex-wrap gap-2 items-center">
        <input v-model="size" :class="inp + ' w-32 font-mono'" /> <input v-model.number="dpi" type="number" :class="inp + ' w-24 font-mono'" />
        <button :class="btn" @click="applyRes">Terapkan</button>
        <button class="px-3 py-1.5 rounded-lg bg-err text-white text-sm font-medium" @click="resetRes">Reset ke bawaan</button>
      </div>
    </div>
    <div :class="card">
      <h3 class="font-semibold text-sm mb-2">Tampilan</h3>
      <div class="flex flex-wrap gap-2 items-center">
        <button :class="btn" @click="ui.run(t.darkMode(s(), true), 'Mode gelap nyala (Android 10+)')">Mode gelap nyala</button>
        <button :class="btn" @click="ui.run(t.darkMode(s(), false), 'Mode gelap mati')">Mode gelap mati</button>
        <span class="mx-2 text-ink2">|</span>
        <input v-model.number="font" type="number" step="0.1" min="0.5" max="3" :class="inp + ' w-20'" />
        <button :class="btn" @click="ui.run(t.fontScale(s(), font), `Ukuran huruf ${font}×`)">Ukuran huruf</button>
        <button :class="btn" @click="ui.run(t.fontScale(s(), 1), 'Ukuran huruf normal')">Reset</button>
      </div>
    </div>
    <div :class="card">
      <h3 class="font-semibold text-sm mb-2">Proxy HTTP<InfoTip k="proxy" /></h3>
      <div class="flex gap-2 items-center">
        <input v-model="proxy" :class="inp + ' w-56 font-mono'" placeholder="host:port" />
        <button :class="btn" @click="ui.run(t.proxy(s(), proxy), 'Proxy dipasang')">Pasang</button>
        <button :class="btn" @click="ui.run(t.proxy(s(), null), 'Proxy dihapus')">Hapus</button>
      </div>
    </div>
    <div :class="card">
      <h3 class="font-semibold text-sm mb-2">Jam dan tanggal <span :class="tag">emulator/root</span></h3>
      <div class="flex flex-wrap gap-2 items-center">
        <button :class="btn" @click="ui.run(t.autoTime(s(), false), 'Jam otomatis dimatikan')">Matikan jam otomatis</button>
        <button :class="btn" @click="ui.run(t.autoTime(s(), true), 'Jam otomatis dinyalakan')">Nyalakan</button>
        <input v-model="date" type="datetime-local" :class="inp" />
        <button :class="btn" @click="confirmDate = true">Ubah jam</button>
      </div>
      <p class="text-xs text-ink2 mt-2">Di perangkat biasa tanpa root, perintah ini ditolak. Galat aslinya akan ditampilkan.</p>
    </div>
    <div :class="card">
      <h3 class="font-semibold text-sm mb-2">Bahasa <span :class="tag">root untuk ubah langsung</span></h3>
      <button :class="btn" @click="ui.run(t.localeSettings(s()), 'Halaman bahasa dibuka di perangkat')">Buka halaman bahasa di perangkat</button>
      <p class="text-xs text-ink2 mt-2">Mengubah <span class="font-mono">persist.sys.locale</span> butuh root, jadi aplikasi membuka halaman pengaturan bahasa saja.</p>
    </div>
    <ConfirmDialog :open="confirmDate" title="Ubah jam perangkat?" :body="`Jam otomatis akan dimatikan dan jam diubah ke ${date.replace('T', ' ')}. Nyalakan lagi jam otomatis setelah selesai tes.`" confirm-label="Ubah jam" @ok="applyDate" @cancel="confirmDate = false" />
  </div>
</template>
