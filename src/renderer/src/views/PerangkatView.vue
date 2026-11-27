<script setup lang="ts">
import InfoTip from '../components/InfoTip.vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useDevices } from '../stores/devices'
import { useSettings } from '../stores/settings'
import { useUi } from '../stores/ui'
import { bytes } from '../fmt'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import type { DeviceInfo } from '../../../preload/index'
import type { ScrcpyPrefs, ForegroundApp } from '../../../shared/types'

const devices = useDevices()
const settings = useSettings()
const ui = useUi()

const cur = computed(() => devices.current)
const ready = computed(() => cur.value?.state === 'device')
const info = ref<DeviceInfo | null>(null)
const recording = ref(false)
const reverseList = ref<Array<{ remote: string; local: string }>>([])
const aliasDraft = ref('')
let timer: ReturnType<typeof setInterval> | undefined

async function load(): Promise<void> {
  info.value = null
  if (!cur.value || !ready.value) return
  const serial = cur.value.serial
  const r = await ui.run(window.dvncyzm.devices.info(serial))
  if (r && cur.value?.serial === serial) info.value = r
}
async function tick(): Promise<void> {
  if (!cur.value || !ready.value || !info.value) return
  const serial = cur.value.serial
  const r = await window.dvncyzm.devices.live(serial)
  if (r.ok && cur.value?.serial === serial && info.value) info.value = { ...info.value, ...r.data }
}
watch(
  [() => cur.value?.serial, () => cur.value?.state],
  () => {
    aliasDraft.value = cur.value?.alias ?? ''
    recording.value = false
    reverseList.value = []
    load()
    refreshReverse()
    if (cur.value) window.dvncyzm.screen.recording(cur.value.serial).then((r) => r.ok && (recording.value = r.data))
  },
  { immediate: true }
)
timer = setInterval(tick, 10_000)

// ---- app yang sedang dibuka (polling 3 dtk hanya saat tab ini aktif) ----
const fg = ref<ForegroundApp | null>(null)
const fgFirst = ref(true)
let fgBusy = false
async function pollFg(): Promise<void> {
  if (fgBusy || ui.tab !== 'perangkat' || !cur.value || !ready.value) return
  fgBusy = true
  const serial = cur.value.serial
  const r = await window.dvncyzm.devices.foreground(serial)
  fgBusy = false
  if (cur.value?.serial !== serial) return
  if (r.ok) fg.value = r.data
  fgFirst.value = false
}
watch([() => cur.value?.serial, ready, () => ui.tab], () => {
  fg.value = null
  fgFirst.value = true
  void pollFg()
}, { immediate: true })
const fgTimer = setInterval(pollFg, 3000)
async function fgStop(): Promise<void> {
  if (!cur.value || !fg.value) return
  await ui.run(window.dvncyzm.apps.forceStop(cur.value.serial, fg.value.pkg), `${fg.value.pkg} dihentikan`)
  void pollFg()
}
function fgLog(): void {
  if (!fg.value) return
  ui.logcatPkg = fg.value.pkg
  ui.tab = 'logcat'
}
function fgApp(): void {
  if (!fg.value) return
  ui.appPkg = fg.value.pkg
  ui.tab = 'aplikasi'
}
// rekaman berhenti sendiri di batas waktu -> file ditarik otomatis oleh main
const offRec = window.dvncyzm.on('record:done', (e) => {
  if (e.serial === cur.value?.serial) recording.value = false
  if (e.path) ui.toast(`Rekaman selesai: ${e.path}`, 'ok')
  else ui.toast(e.error ?? 'Rekaman gagal', 'err')
})
onBeforeUnmount(() => {
  clearInterval(fgTimer)
  if (timer) clearInterval(timer)
  offRec()
})

async function saveAlias(): Promise<void> {
  if (!cur.value) return
  const a = await ui.run(window.dvncyzm.devices.setAlias(cur.value.serial, aliasDraft.value))
  if (a) settings.settings.aliases = a
}

// ---- screenshot dan rekam ----
const busy = ref('')
async function shot(copy: boolean): Promise<void> {
  if (!cur.value) return
  busy.value = 'shot'
  const r = await ui.run(window.dvncyzm.screen.screenshot(cur.value.serial, copy))
  busy.value = ''
  if (r) ui.showShot(r)
}
const recSeconds = ref(60)
async function recStart(): Promise<void> {
  if (!cur.value) return
  const ok = await ui.run(window.dvncyzm.screen.recordStart(cur.value.serial, recSeconds.value))
  if (ok !== null) recording.value = true
}
async function recStop(): Promise<void> {
  if (!cur.value) return
  busy.value = 'rec'
  const p = await ui.run(window.dvncyzm.screen.recordStop(cur.value.serial))
  busy.value = ''
  recording.value = false
  if (p) ui.toast(`Rekaman disimpan: ${p}`, 'ok')
}
async function pickShotDir(): Promise<void> {
  const d = await ui.run(window.dvncyzm.screen.pickDir())
  if (d) settings.settings.screenshotDir = d
}

// ---- scrcpy ----
const scrcpyOpen = ref(false)
const scrcpyOpts = ref<ScrcpyPrefs>({})
function openScrcpy(): void {
  scrcpyOpts.value = { maxSize: 1280, bitRate: '8M', compat: window.dvncyzm.platform === 'linux', ...(settings.settings.scrcpy[cur.value?.serial ?? ''] ?? {}) }
  scrcpyOpen.value = true
}
async function launchScrcpy(): Promise<void> {
  if (!cur.value) return
  busy.value = 'scrcpy'
  const ok = await ui.run(window.dvncyzm.screen.scrcpy(cur.value.serial, { ...scrcpyOpts.value }))
  busy.value = ''
  if (ok !== null) {
    scrcpyOpen.value = false
    settings.settings.scrcpy[cur.value.serial] = { ...scrcpyOpts.value }
  }
}

// ---- Wi-Fi ----
async function toWifi(): Promise<void> {
  if (!cur.value) return
  busy.value = 'wifi'
  const a = await ui.run(window.dvncyzm.devices.toWifi(cur.value.serial))
  busy.value = ''
  if (a) ui.toast(`Tersambung lewat Wi-Fi: ${a}. Cabut kabel USB.`, 'ok')
}
async function toggleAuto(): Promise<void> {
  if (!cur.value) return
  const on = !settings.settings.autoReconnect[cur.value.serial]
  const r = await ui.run(window.dvncyzm.devices.setAutoReconnect(cur.value.serial, on))
  if (r) settings.settings.autoReconnect = r
}

// ---- aksi cepat ----
const port = ref(8081)
async function refreshReverse(): Promise<void> {
  if (!cur.value || !ready.value) return
  reverseList.value = (await ui.run(window.dvncyzm.tweaks.reverseList(cur.value.serial))) ?? []
}
async function addReverse(): Promise<void> {
  if (!cur.value) return
  if ((await ui.run(window.dvncyzm.tweaks.reverse(cur.value.serial, port.value), `reverse tcp:${port.value} aktif`)) !== null) refreshReverse()
}
async function delReverse(remote: string): Promise<void> {
  if (!cur.value) return
  const p = Number(remote.replace('tcp:', ''))
  if ((await ui.run(window.dvncyzm.tweaks.unreverse(cur.value.serial, p))) !== null) refreshReverse()
}
const fwdLocal = ref(9000)
const fwdRemote = ref(8080)
async function addForward(): Promise<void> {
  if (cur.value) await ui.run(window.dvncyzm.tweaks.forward(cur.value.serial, fwdLocal.value, fwdRemote.value), `forward tcp:${fwdLocal.value} → tcp:${fwdRemote.value} aktif`)
}
const toggles = ref({ anim: true, layout: false, pointer: false })
async function setAnim(): Promise<void> {
  if (!cur.value) return
  toggles.value.anim = !toggles.value.anim
  await ui.run(window.dvncyzm.tweaks.animations(cur.value.serial, toggles.value.anim), toggles.value.anim ? 'Animasi dinyalakan' : 'Animasi dimatikan')
}
async function setLayout(): Promise<void> {
  if (!cur.value) return
  toggles.value.layout = !toggles.value.layout
  await ui.run(window.dvncyzm.tweaks.layoutBounds(cur.value.serial, toggles.value.layout))
}
async function setPointer(): Promise<void> {
  if (!cur.value) return
  toggles.value.pointer = !toggles.value.pointer
  await ui.run(window.dvncyzm.tweaks.pointer(cur.value.serial, toggles.value.pointer))
}
const rebootMode = ref<'normal' | 'recovery' | 'bootloader' | null>(null)
async function doReboot(): Promise<void> {
  if (!cur.value || !rebootMode.value) return
  const m = rebootMode.value
  rebootMode.value = null
  await ui.run(window.dvncyzm.tweaks.reboot(cur.value.serial, m), 'Perintah reboot dikirim')
}

const skewText = computed(() => {
  const s = info.value?.clockSkewMs
  if (s === undefined) return '-'
  const a = Math.abs(s) / 1000
  if (a < 5) return 'cocok dengan jam komputer'
  return `${a < 120 ? a.toFixed(0) + ' detik' : (a / 60).toFixed(1) + ' menit'} ${s > 0 ? 'lebih cepat' : 'lebih lambat'}`
})
const card = 'bg-card border border-line rounded-xl p-4'
const btn = 'px-3 py-1.5 rounded-lg border border-inp text-sm hover:border-accent disabled:opacity-50'
const inp = 'px-2 py-1.5 rounded-md border border-inp bg-bg text-sm outline-none focus:border-accent'
</script>

<template>
  <div class="p-5 space-y-4 max-w-5xl">
    <div v-if="!cur" class="text-ink2 text-sm">Pilih perangkat di sebelah kiri, atau sambungkan lewat Wi-Fi.</div>

    <template v-else>
      <div :class="card">
        <div class="flex items-center gap-3 flex-wrap">
          <h2 class="text-lg font-semibold">{{ cur.alias || info?.model || cur.model || cur.serial }}</h2>
          <input v-model="aliasDraft" placeholder="Nama panggilan" :class="inp + ' w-48'" @change="saveAlias" @keyup.enter="saveAlias" />
          <span class="font-mono text-xs text-ink2">{{ cur.serial }}</span>
        </div>
        <p v-if="cur.state === 'unauthorized'" class="mt-2 text-sm text-warn">Izinkan debugging di layar perangkat, lalu pilih "Selalu izinkan dari komputer ini".</p>
        <p v-else-if="cur.state === 'offline'" class="mt-2 text-sm text-warn">Perangkat offline. Coba tombol "Sambung ulang" di daftar.</p>
        <p v-else-if="cur.state === 'disconnected'" class="mt-2 text-sm text-ink2">Perangkat sedang terputus.</p>

        <div v-if="ready" class="mt-3 flex items-center gap-3 flex-wrap rounded-lg bg-bg border border-line px-3 py-2" data-testid="fg-card">
          <span class="text-xs text-ink2">Sedang dibuka<InfoTip k="foreground" /></span>
          <template v-if="fg">
            <span class="font-mono text-sm" data-testid="fg-pkg">{{ fg.pkg }}</span>
            <span class="font-mono text-xs text-ink2 truncate max-w-[22rem]" :title="fg.activity">{{ fg.activity.replace(fg.pkg, '') }}</span>
            <span class="flex gap-1.5 ml-auto">
              <button :class="btn + ' !py-1 !text-xs'" @click="fgLog">Lihat log</button>
              <button :class="btn + ' !py-1 !text-xs'" @click="fgApp">Buka di Aplikasi</button>
              <button :class="btn + ' !py-1 !text-xs'" @click="ui.copy(fg.pkg, 'Nama paket disalin')">Salin paket</button>
              <button :class="btn + ' !py-1 !text-xs !border-err text-err'" @click="fgStop">Force stop</button>
            </span>
          </template>
          <span v-else class="text-sm text-ink2">{{ fgFirst ? 'membaca…' : 'tidak terbaca (layar mati atau di layar kunci)' }}</span>
        </div>

        <dl v-if="ready" class="mt-3 grid grid-cols-[9rem_1fr_9rem_1fr] gap-y-1.5 gap-x-4 text-sm">
          <dt class="text-ink2">Model</dt><dd>{{ [info?.manufacturer, info?.model].filter(Boolean).join(' ') || '-' }}</dd>
          <dt class="text-ink2">Android</dt><dd>{{ info?.android ?? '-' }} <span v-if="info?.sdk" class="text-ink2">(API {{ info.sdk }})</span></dd>
          <dt class="text-ink2">Layar</dt><dd>{{ info?.size ? `${info.size.w}×${info.size.h}` : '-' }} <span v-if="info?.dpi" class="text-ink2">· {{ info.dpi }} dpi</span></dd>
          <dt class="text-ink2">IP</dt><dd class="font-mono">{{ info?.ip ?? '-' }}</dd>
          <dt class="text-ink2">Baterai</dt><dd>{{ info?.battery ? `${info.battery.level}%${info.battery.charging ? ' (mengisi)' : ''}` : 'tidak ada (TV/box)' }}</dd>
          <dt class="text-ink2">Penyimpanan</dt><dd>{{ info?.storage ? `${bytes(info.storage.freeBytes)} kosong dari ${bytes(info.storage.totalBytes)}` : '-' }}</dd>
          <dt class="text-ink2">Memori</dt><dd>{{ info?.memory ? `${bytes(info.memory.availBytes)} tersedia dari ${bytes(info.memory.totalBytes)}` : '-' }}</dd>
          <dt class="text-ink2">Jam perangkat</dt><dd :class="Math.abs(info?.clockSkewMs ?? 0) > 5000 ? 'text-warn' : ''">{{ skewText }}</dd>
        </dl>
      </div>

      <div v-if="ready" class="grid grid-cols-1 lg:grid-cols-[1fr_20rem] gap-4">
        <div class="space-y-4">
          <div :class="card">
            <h3 class="font-semibold text-sm mb-2">Layar<InfoTip k="layar" /></h3>
            <div class="flex flex-wrap gap-2 items-center">
              <button :class="btn" :disabled="busy === 'shot'" @click="shot(false)">Screenshot</button>
              <button :class="btn" :disabled="busy === 'shot'" @click="shot(true)">Screenshot + salin</button>
              <button :class="btn" :disabled="busy === 'scrcpy'" @click="openScrcpy">scrcpy…</button>
              <template v-if="!recording">
                <input v-model.number="recSeconds" type="number" min="1" max="180" :class="inp + ' w-20'" title="Detik (maks 180)" />
                <button :class="btn" @click="recStart">Rekam layar</button>
              </template>
              <button v-else :class="btn + ' !border-err text-err'" :disabled="busy === 'rec'" @click="recStop">■ Berhenti dan simpan</button>
            </div>
            <p class="text-xs text-ink2 mt-2">
              Disimpan di <span class="font-mono">{{ settings.settings.screenshotDir ?? '~/Pictures/dvncyzm' }}</span>
              <button class="underline ml-1" @click="pickShotDir">ganti folder</button>
            </p>
          </div>

          <div :class="card">
            <h3 class="font-semibold text-sm mb-2">Aksi cepat<InfoTip k="aksi_cepat" /></h3>
            <div class="flex flex-wrap gap-2 items-center">
              <button :class="btn" @click="setAnim">Animasi: {{ toggles.anim ? 'nyala' : 'mati' }}</button>
              <button :class="btn" @click="setLayout">Batas layout: {{ toggles.layout ? 'nyala' : 'mati' }}</button>
              <button :class="btn" @click="setPointer">Lokasi sentuhan: {{ toggles.pointer ? 'nyala' : 'mati' }}</button>
            </div>
            <div class="mt-3 flex flex-wrap gap-2 items-center">
              <span class="text-sm text-ink2">Backend laptop ke perangkat</span>
              <input v-model.number="port" type="number" min="1" max="65535" :class="inp + ' w-24 font-mono'" />
              <button :class="btn" @click="addReverse">reverse</button>
            </div>
            <div v-if="reverseList.length" class="mt-2 flex flex-wrap gap-2">
              <span v-for="r in reverseList" :key="r.remote" class="font-mono text-xs border border-line rounded px-2 py-1">
                {{ r.remote }} → {{ r.local }} <button class="ml-1 text-err" @click="delReverse(r.remote)">×</button>
              </span>
            </div>
            <div class="mt-3 flex flex-wrap gap-2 items-center">
              <span class="text-sm text-ink2">Port forward</span>
              <input v-model.number="fwdLocal" type="number" :class="inp + ' w-24 font-mono'" title="Port laptop" />
              <span>→</span>
              <input v-model.number="fwdRemote" type="number" :class="inp + ' w-24 font-mono'" title="Port perangkat" />
              <button :class="btn" @click="addForward">forward</button>
            </div>
            <div class="mt-3 flex gap-2">
              <button :class="btn" @click="rebootMode = 'normal'">Reboot</button>
              <button :class="btn" @click="rebootMode = 'recovery'">Recovery</button>
              <button :class="btn" @click="rebootMode = 'bootloader'">Bootloader</button>
            </div>
          </div>

          <div :class="card">
            <h3 class="font-semibold text-sm mb-2">Sambungan Wi-Fi<InfoTip k="wifi" /></h3>
            <div class="flex flex-wrap gap-2 items-center">
              <button v-if="cur.transport === 'usb'" :class="btn" :disabled="busy === 'wifi'" @click="toWifi">USB → Wi-Fi (1 klik)</button>
              <button v-if="cur.transport === 'wifi'" :class="btn" @click="toggleAuto">
                Sambung ulang otomatis: {{ settings.settings.autoReconnect[cur.serial] ? 'nyala' : 'mati' }}
              </button>
              <button :class="btn" :disabled="devices.discovering" @click="devices.discover(true, true)">{{ devices.discovering ? 'Mencari…' : 'Cari ulang di jaringan' }}</button>
            </div>
            <p class="mt-2 text-xs text-ink2">Perangkat di jaringan yang sama muncul otomatis di daftar kiri (bagian "Di jaringan"), lengkap dengan IP dan port, tanpa perlu membuka pengaturan ponsel.</p>
          </div>
        </div>
        <div :class="card" class="flex items-center gap-3 flex-wrap">
          <h3 class="font-semibold text-sm">Remote TV<InfoTip k="remote" /></h3>
          <button :class="btn" @click="ui.remoteOpen = !ui.remoteOpen">{{ ui.remoteOpen ? 'Tutup remote melayang' : 'Buka remote melayang' }}</button>
          <span class="text-xs text-ink2">Remote ini melayang dan bisa dipakai dari tab mana pun (Shift+R). Seret judulnya untuk memindahkan.</span>
        </div>
      </div>
    </template>

    <div v-if="scrcpyOpen" class="fixed inset-0 z-40 bg-black/40 flex items-center justify-center" @click.self="scrcpyOpen = false">
      <form class="bg-card border border-line rounded-xl p-5 w-[24rem] space-y-3" @submit.prevent="launchScrcpy">
        <h3 class="font-semibold">scrcpy<InfoTip k="scrcpy" /></h3>
        <label class="flex items-center justify-between text-sm">Ukuran maks <input v-model.number="scrcpyOpts.maxSize" type="number" :class="inp + ' w-28'" /></label>
        <label class="flex items-center justify-between text-sm">Bit rate video <input v-model="scrcpyOpts.bitRate" :class="inp + ' w-28 font-mono'" placeholder="8M" /></label>
        <label class="flex items-center gap-2 text-sm"><input v-model="scrcpyOpts.turnScreenOff" type="checkbox" /> Matikan layar perangkat</label>
        <label class="flex items-center gap-2 text-sm"><input v-model="scrcpyOpts.stayAwake" type="checkbox" /> Tetap menyala</label>
        <label class="flex items-center gap-2 text-sm"><input v-model="scrcpyOpts.alwaysOnTop" type="checkbox" /> Selalu di atas</label>
        <label class="flex items-center gap-2 text-sm"><input v-model="scrcpyOpts.noAudio" type="checkbox" /> Tanpa audio</label>
        <label class="flex items-center gap-2 text-sm"><input v-model="scrcpyOpts.compat" type="checkbox" /> Atasi layar hitam (mode kompatibilitas)<InfoTip title="Layar hitam?" text="Kalau jendela scrcpy muncul tapi hitam padahal sentuhan/ketikan masuk ke perangkat, centang ini. Aplikasi memakai penggambaran software dan memaksa X11 (Linux). Sedikit lebih berat tapi lebih aman." /></label>
        <div class="flex justify-end gap-2 pt-1">
          <button type="button" :class="btn" @click="scrcpyOpen = false">Batal</button>
          <button class="px-3 py-1.5 rounded-lg bg-accent text-white text-sm">Buka</button>
        </div>
      </form>
    </div>
    <ConfirmDialog
      :open="!!rebootMode"
      :title="`Reboot ${cur?.alias || cur?.model || cur?.serial}?`"
      :body="`Perangkat akan dimulai ulang${rebootMode === 'recovery' ? ' ke mode recovery' : rebootMode === 'bootloader' ? ' ke bootloader' : ''}.`"
      danger
      confirm-label="Reboot"
      @ok="doReboot"
      @cancel="rebootMode = null"
    />
  </div>
</template>
