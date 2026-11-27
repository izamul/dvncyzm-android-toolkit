<script setup lang="ts">
import InfoTip from '../components/InfoTip.vue'
import { onMounted, ref } from 'vue'
import { useSettings } from '../stores/settings'
import { useUi } from '../stores/ui'

const settings = useSettings()
const ui = useUi()
const scrcpy = ref<string | null>(null)
const scrcpyVer = ref<string | null>(null)
async function loadScrcpy(): Promise<void> {
  const r = await ui.run(window.dvncyzm.scrcpyPath.status())
  scrcpy.value = r?.path ?? null
  scrcpyVer.value = r?.version ?? null
}
onMounted(loadScrcpy)

async function pickAdb(): Promise<void> {
  const err = await settings.pickAdb()
  if (err) ui.toast(err, 'err')
  else ui.toast('Lokasi adb diperbarui. Mulai ulang aplikasi bila daftar perangkat kosong.', 'ok')
}
async function pickScrcpy(): Promise<void> {
  await ui.run(window.dvncyzm.scrcpyPath.pick())
  await loadScrcpy()
}
async function pickShot(): Promise<void> {
  const d = await ui.run(window.dvncyzm.screen.pickDir())
  if (d) settings.settings.screenshotDir = d
}
const SRC: Record<string, string> = { setting: 'pengaturan aplikasi', ANDROID_HOME: '$ANDROID_HOME', 'sdk-default': 'folder SDK bawaan', PATH: 'PATH' }
const card = 'bg-card border border-line rounded-xl p-4'
const btn = 'px-3 py-1.5 rounded-lg border border-inp text-sm hover:border-accent'
</script>

<template>
  <div class="p-5 space-y-4 max-w-2xl">
    <div :class="card">
      <h3 class="font-semibold text-sm mb-2">adb<InfoTip k="adb" /></h3>
      <p class="font-mono text-xs break-all">{{ settings.adb?.path ?? 'tidak ditemukan' }}</p>
      <p class="text-xs text-ink2 mt-1">Versi {{ settings.adb?.version ?? '-' }} · ditemukan di {{ SRC[settings.adb?.source ?? ''] ?? '-' }}</p>
      <button :class="btn + ' mt-3'" @click="pickAdb">Pilih lokasi adb…</button>
      <p class="text-xs text-ink2 mt-2">scrcpy dijalankan dengan adb yang sama (<span class="font-mono">ADB=</span>) supaya server adb tidak saling mematikan.</p>
    </div>
    <div :class="card">
      <h3 class="font-semibold text-sm mb-2">scrcpy<InfoTip k="scrcpy" /></h3>
      <p class="font-mono text-xs break-all">{{ scrcpy ?? 'tidak ditemukan (Mac: brew install scrcpy · Linux: sudo apt install scrcpy)' }}</p>
      <p v-if="scrcpy" class="text-xs text-ink2 mt-1">Versi: {{ scrcpyVer ?? 'tidak terbaca' }}<span v-if="scrcpyVer && Number(scrcpyVer.split('.')[0]) < 2"> — versi lama (1.x): audio tidak tersedia, disarankan memperbarui.</span></p>
      <button :class="btn + ' mt-3'" @click="pickScrcpy">Pilih lokasi scrcpy…</button>
    </div>
    <div :class="card">
      <h3 class="font-semibold text-sm mb-2">Folder screenshot dan rekaman</h3>
      <p class="font-mono text-xs break-all">{{ settings.settings.screenshotDir ?? '~/Pictures/dvncyzm' }}</p>
      <button :class="btn + ' mt-3'" @click="pickShot">Ganti folder…</button>
    </div>
    <div :class="card">
      <h3 class="font-semibold text-sm mb-2">Pintasan keyboard</h3>
      <table class="text-sm w-full">
        <tbody>
          <tr v-for="[k, v] in [['Cmd+1 … Cmd+7', 'Pindah tab'], ['Cmd+Shift+S', 'Screenshot perangkat terpilih'], ['Cmd+Shift+M', 'Buka scrcpy'], ['Cmd+Shift+R', 'Buka/tutup remote TV melayang'], ['Cmd+F', 'Cari di logcat'], ['Cmd+K', 'Bersihkan logcat'], ['Spasi (di logcat)', 'Jeda / lanjut'], ['Cmd+↑ / Cmd+↓', 'Perangkat sebelumnya / berikutnya']]" :key="k">
            <td class="py-1 pr-4 font-mono text-xs text-ink2 whitespace-nowrap">{{ k }}</td><td>{{ v }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
