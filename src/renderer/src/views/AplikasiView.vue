<script setup lang="ts">
import InfoTip from '../components/InfoTip.vue'
import { computed, ref, watch } from 'vue'
import { useDevices } from '../stores/devices'
import { useSettings } from '../stores/settings'
import { useUi } from '../stores/ui'
import { bytes, plain } from '../fmt'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import type { AppInfo } from '../../../shared/types'
import type { InstallResult, MacroStep } from '../../../preload/index'

const devices = useDevices()
const settings = useSettings()
const ui = useUi()

const cur = computed(() => devices.current)
const ready = computed(() => cur.value?.state === 'device')
const kind = ref<'user' | 'all' | 'system'>('user')
const search = ref('')
const list = ref<AppInfo[]>([])
const loading = ref(false)
const sel = ref<AppInfo | null>(null)
const detail = ref<AppInfo | null>(null)
const pss = ref<number | undefined>()

async function load(): Promise<void> {
  if (!cur.value || !ready.value) {
    list.value = []
    return
  }
  loading.value = true
  list.value = (await ui.run(window.dvncyzm.apps.list(cur.value.serial, kind.value))) ?? []
  loading.value = false
  if (sel.value && !list.value.some((a) => a.pkg === sel.value?.pkg)) sel.value = null
  pickRequested()
}
// dari kartu "Sedang dibuka": pilih paket itu begitu daftar tersedia
function pickRequested(): void {
  const want = ui.appPkg
  if (!want || !list.value.length) return
  const hit = list.value.find((a) => a.pkg === want)
  if (hit) {
    sel.value = hit
    search.value = want
  } else if (kind.value !== 'all') kind.value = 'all'
  ui.appPkg = null
}
watch(() => ui.appPkg, pickRequested)
watch([() => cur.value?.serial, ready, kind], load, { immediate: true })
watch(sel, async (a) => {
  detail.value = null
  pss.value = undefined
  if (!a || !cur.value) return
  const serial = cur.value.serial
  const d = await ui.run(window.dvncyzm.apps.detail(serial, a.pkg))
  if (d && sel.value?.pkg === a.pkg) detail.value = d
})
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return q ? list.value.filter((a) => a.pkg.toLowerCase().includes(q)) : list.value
})

const serial = (): string => cur.value!.serial
async function act<T>(p: Promise<{ ok: boolean }>, ok: string): Promise<void> {
  const r = await ui.run(p as never, ok)
  void r
  if (sel.value) {
    const d = await ui.run(window.dvncyzm.apps.detail(serial(), sel.value.pkg))
    if (d) detail.value = d
  }
}
const stop = (): Promise<void> => act(window.dvncyzm.apps.forceStop(serial(), sel.value!.pkg), 'Dihentikan')
const launch = (): Promise<void> => act(window.dvncyzm.apps.launch(serial(), sel.value!.pkg), 'Dibuka')
const restart = (): Promise<void> => act(window.dvncyzm.apps.restart(serial(), sel.value!.pkg), 'Dimulai ulang')
async function pull(): Promise<void> {
  const r = await ui.run(window.dvncyzm.apps.pullApk(serial(), sel.value!.pkg))
  if (r?.length) ui.toast(`${r.length} file APK disimpan`, 'ok')
}
async function toggleGrant(perm: { name: string; granted: boolean }): Promise<void> {
  const fn = perm.granted ? window.dvncyzm.apps.revoke : window.dvncyzm.apps.grant
  if ((await ui.run(fn(serial(), sel.value!.pkg, perm.name))) !== null) perm.granted = !perm.granted
}
async function showMemory(): Promise<void> {
  pss.value = (await ui.run(window.dvncyzm.apps.memory(serial(), sel.value!.pkg))) ?? undefined
}

// ---- konfirmasi aksi berbahaya ----
const confirm = ref<null | { kind: 'uninstall' | 'uninstallKeep' | 'clear' }>(null)
const confirmText = computed(() => {
  const name = `${sel.value?.pkg} di ${cur.value?.alias || cur.value?.model || cur.value?.serial}`
  return confirm.value?.kind === 'clear' ? `Semua data ${name} akan dihapus dan tidak bisa dikembalikan.` : `${name} akan di-uninstall${confirm.value?.kind === 'uninstallKeep' ? ' (data disimpan)' : ' beserta datanya'}.`
})
async function doConfirm(): Promise<void> {
  const c = confirm.value
  confirm.value = null
  if (!c || !sel.value) return
  if (c.kind === 'clear') await ui.run(window.dvncyzm.apps.clearData(serial(), sel.value.pkg), 'Data dihapus')
  else {
    const r = await ui.run(window.dvncyzm.apps.uninstall(serial(), sel.value.pkg, c.kind === 'uninstallKeep'), 'Di-uninstall')
    if (r !== null) {
      sel.value = null
      load()
    }
  }
}

// ---- install ----
const dropping = ref(false)
const results = ref<Record<string, { state: string; message?: string; percent?: number; phase?: string }>>({})
const targets = ref<string[]>([])
const readyDevices = computed(() => devices.list.filter((d) => d.state === 'device'))
watch(readyDevices, (l) => {
  if (!targets.value.length && cur.value && ready.value) targets.value = [cur.value.serial]
  targets.value = targets.value.filter((t) => l.some((d) => d.serial === t))
}, { immediate: true })
window.dvncyzm.on('install:progress', (p) => (results.value = { ...results.value, [p.serial]: { state: p.state, message: p.message, percent: p.percent ?? results.value[p.serial]?.percent, phase: p.phase ?? results.value[p.serial]?.phase } }))

async function install(apks: string[]): Promise<void> {
  if (!apks.length) return
  const t = targets.value.length ? targets.value : cur.value ? [cur.value.serial] : []
  if (!t.length) return ui.toast('Pilih perangkat tujuan', 'err')
  results.value = {}
  let r: InstallResult[] = []
  try {
    r = (await ui.run<InstallResult[]>(window.dvncyzm.apps.install(plain([...t]), plain([...apks])))) ?? []
  } catch (e) {
    return ui.toast(`Install gagal dimulai: ${(e as Error).message}`, 'err')
  }
  const okN = r.filter((x) => x.ok).length
  ui.toast(`${okN} dari ${r.length} perangkat berhasil`, okN === r.length ? 'ok' : 'err')
  load()
}
async function pick(): Promise<void> {
  install((await ui.run(window.dvncyzm.apps.pickApks())) ?? [])
}
function onDrop(e: DragEvent): void {
  dropping.value = false
  const files = [...(e.dataTransfer?.files ?? [])].map((f) => window.dvncyzm.pathForFile(f)).filter((p) => /\.apk$/i.test(p))
  if (!files.length) return ui.toast('Hanya file .apk yang bisa dipasang', 'err')
  install(files)
}

// ---- deep link dan broadcast ----
const deep = ref('')
const bAction = ref('')
const bComp = ref('')
async function sendDeep(): Promise<void> {
  if (deep.value) await ui.run(window.dvncyzm.apps.deepLink(serial(), deep.value), 'Deep link dikirim')
}
async function sendBroadcast(): Promise<void> {
  if (bAction.value) await ui.run(window.dvncyzm.apps.broadcast(serial(), bAction.value, bComp.value || undefined), 'Broadcast dikirim')
}

// ---- macro ----
const macroOpen = ref(false)
const draft = ref({ name: '', pkg: '', apkDir: '', grant: '' })
const steps = ref<MacroStep[]>([])
window.dvncyzm.on('macro:step', (p) => (steps.value = p.steps))
async function pickDir(): Promise<void> {
  const d = await ui.run(window.dvncyzm.macros.pickDir())
  if (d) draft.value.apkDir = d
}
async function saveMacro(): Promise<void> {
  const d = draft.value
  const m = { id: 'm' + Date.now().toString(36), name: d.name.trim(), pkg: d.pkg.trim(), apkDir: d.apkDir, grant: d.grant.split(/[\s,]+/).filter(Boolean) }
  if (!m.name || !m.pkg || !m.apkDir) return ui.toast('Isi nama, paket, dan folder APK', 'err')
  const r = await ui.run(window.dvncyzm.macros.save(plain([...settings.settings.macros, m])))
  if (r) {
    settings.settings.macros = r
    draft.value = { name: '', pkg: '', apkDir: '', grant: '' }
  }
}
async function delMacro(id: string): Promise<void> {
  const r = await ui.run(window.dvncyzm.macros.save(plain(settings.settings.macros.filter((m) => m.id !== id))))
  if (r) settings.settings.macros = r
}
async function runMacro(id: string): Promise<void> {
  steps.value = []
  const r = await ui.run(window.dvncyzm.macros.run(serial(), id))
  if (r?.ok && r.openLogcatFor) {
    ui.logcatPkg = r.openLogcatFor
    ui.tab = 'logcat'
  }
  load()
}
const card = 'bg-card border border-line rounded-xl p-4'
const btn = 'px-3 py-1.5 rounded-lg border border-inp text-sm hover:border-accent disabled:opacity-50'
const inp = 'px-2 py-1.5 rounded-md border border-inp bg-bg text-sm outline-none focus:border-accent'
</script>

<template>
  <div v-if="!ready" class="p-6 text-sm text-ink2">Pilih perangkat yang terhubung untuk mengelola aplikasi.</div>
  <div v-else class="h-full flex" @dragover.prevent="dropping = true" @dragleave.self="dropping = false" @drop.prevent="onDrop">
    <div class="w-[22rem] shrink-0 border-r border-line flex flex-col min-h-0">
      <div class="p-2 space-y-2 border-b border-line bg-rail">
        <input v-model="search" :class="inp + ' w-full font-mono text-xs'" placeholder="Cari nama paket" />
        <div class="flex rounded-md border border-inp overflow-hidden text-xs">
          <button v-for="k in [['user', 'Pasangan sendiri'], ['all', 'Semua'], ['system', 'Sistem']] as const" :key="k[0]" class="flex-1 py-1.5" :class="kind === k[0] ? 'bg-accent text-white' : 'text-ink2'" @click="kind = k[0]">{{ k[1] }}</button>
        </div>
        <div class="text-xs text-ink2">{{ loading ? 'Memuat…' : `${filtered.length} aplikasi` }}</div>
      </div>
      <div class="flex-1 overflow-auto">
        <button v-for="a in filtered" :key="a.pkg" class="w-full text-left px-3 py-1.5 border-b border-line hover:bg-card flex items-center gap-2" :class="sel?.pkg === a.pkg ? 'bg-card' : ''" @click="sel = a">
          <span class="w-2 h-2 rounded-full shrink-0" :class="a.running ? 'bg-ok' : 'bg-inp'" :title="a.running ? 'Sedang berjalan' : 'Tidak berjalan'" />
          <span class="font-mono text-xs truncate">{{ a.pkg }}</span>
        </button>
      </div>
    </div>

    <div class="flex-1 min-w-0 overflow-auto p-5 space-y-4 relative">
      <div v-if="dropping" class="absolute inset-3 z-20 border-2 border-dashed border-accent rounded-xl bg-accent/10 flex items-center justify-center text-accent font-medium">Lepas file .apk untuk dipasang</div>

      <div :class="card">
        <div class="flex items-center gap-3 flex-wrap">
          <h3 class="font-semibold text-sm">Install APK<InfoTip k="apk" /></h3>
          <button :class="btn" @click="pick">Pilih APK…</button>
          <span class="text-xs text-ink2">atau tarik-lepas file .apk ke jendela ini</span>
        </div>
        <div v-if="readyDevices.length > 1" class="mt-2 flex flex-wrap gap-3 text-sm">
          <label v-for="d in readyDevices" :key="d.serial" class="flex items-center gap-1.5"><input v-model="targets" type="checkbox" :value="d.serial" /> {{ d.alias || d.model || d.serial }}</label>
        </div>
        <ul v-if="Object.keys(results).length" class="mt-2 text-sm space-y-2" data-testid="install-list">
          <li v-for="(r, s) in results" :key="s">
            <div class="flex items-center gap-2">
              <span class="font-mono text-xs">{{ s }}</span>
              <span :class="r.state === 'ok' ? 'text-ok' : r.state === 'error' ? 'text-err' : 'text-ink2'" class="text-xs">
                {{ r.state === 'running' ? `${r.phase ?? 'memasang…'}${r.percent !== undefined ? ` ${r.percent}%` : ''}` : r.message }}
              </span>
            </div>
            <div v-if="r.state === 'running' || (r.state === 'ok' && r.percent !== undefined)" class="mt-1 h-2 rounded-full bg-line overflow-hidden" role="progressbar" :aria-valuenow="r.percent ?? 0" aria-valuemin="0" aria-valuemax="100">
              <div v-if="r.percent !== undefined" class="h-full bg-accent transition-all duration-300" :class="r.state === 'ok' ? '!bg-ok' : ''" :style="{ width: `${r.percent}%` }" data-testid="install-bar"></div>
              <div v-else class="h-full w-1/3 bg-accent animate-pulse"></div>
            </div>
          </li>
        </ul>
      </div>

      <div v-if="sel" :class="card">
        <div class="flex items-center gap-2">
          <h3 class="font-mono text-sm font-semibold break-all">{{ sel.pkg }}</h3>
          <span v-if="detail?.running" class="text-xs text-ok">berjalan</span>
        </div>
        <dl v-if="detail" class="mt-2 grid grid-cols-[8rem_1fr] gap-y-1 text-sm">
          <dt class="text-ink2">Versi</dt><dd>{{ detail.versionName ?? '-' }} <span class="text-ink2">({{ detail.versionCode ?? '-' }})</span></dd>
          <dt class="text-ink2">Target SDK</dt><dd>{{ detail.targetSdk ?? '-' }}</dd>
          <dt class="text-ink2">Dipasang</dt><dd>{{ detail.firstInstallTime ?? '-' }}</dd>
          <dt class="text-ink2">Diperbarui</dt><dd>{{ detail.lastUpdateTime ?? '-' }}</dd>
          <dt class="text-ink2">Ukuran APK</dt><dd>{{ bytes(detail.sizeBytes) }}</dd>
          <dt class="text-ink2">Memori (PSS)</dt><dd>{{ pss ? bytes(pss) : '' }} <button class="underline text-xs" @click="showMemory">{{ pss ? 'segarkan' : 'ukur' }}</button></dd>
        </dl>
        <div class="mt-3 flex flex-wrap gap-2">
          <button :class="btn" @click="launch">Buka</button>
          <button :class="btn" @click="stop">Force stop</button>
          <button :class="btn" @click="restart">Restart</button>
          <button :class="btn" @click="pull">Ambil APK</button>
          <button :class="btn" @click="confirm = { kind: 'clear' }">Hapus data</button>
          <button :class="btn + ' !border-err text-err'" @click="confirm = { kind: 'uninstall' }">Uninstall</button>
          <button :class="btn + ' !border-err text-err'" @click="confirm = { kind: 'uninstallKeep' }">Uninstall (simpan data)</button>
          <button :class="btn" @click="ui.logcatPkg = sel.pkg; ui.tab = 'logcat'">Lihat log</button>
        </div>
        <div v-if="detail?.permissions?.length" class="mt-3">
          <div class="text-xs text-ink2 mb-1">Izin runtime (klik untuk beri/cabut)</div>
          <div class="flex flex-wrap gap-1.5">
            <button v-for="p in detail.permissions" :key="p.name" class="font-mono text-[11px] px-2 py-1 rounded border" :class="p.granted ? 'border-ok text-ok' : 'border-line text-ink2'" @click="toggleGrant(p)">{{ p.name.replace('android.permission.', '') }}</button>
          </div>
        </div>
      </div>

      <div :class="card">
        <h3 class="font-semibold text-sm mb-2">Uji deep link dan broadcast<InfoTip k="deeplink" /></h3>
        <div class="flex gap-2"><input v-model="deep" :class="inp + ' flex-1 font-mono text-xs'" placeholder="izamtv://play?id=1" @keyup.enter="sendDeep" /><button :class="btn" @click="sendDeep">Buka deep link</button></div>
        <div class="flex gap-2 mt-2">
          <input v-model="bAction" :class="inp + ' flex-1 font-mono text-xs'" placeholder="aksi, mis. com.izam.tv.REFRESH" />
          <input v-model="bComp" :class="inp + ' w-64 font-mono text-xs'" placeholder="komponen (opsional) pkg/.Receiver" />
          <button :class="btn" @click="sendBroadcast">Kirim broadcast</button>
        </div>
      </div>

      <div :class="card">
        <div class="flex items-center gap-2 mb-2">
          <h3 class="font-semibold text-sm">Macro "Pasang bersih"<InfoTip k="macro" /></h3>
          <button class="text-xs underline text-ink2" @click="macroOpen = !macroOpen">{{ macroOpen ? 'tutup' : 'tambah / ubah' }}</button>
        </div>
        <p class="text-xs text-ink2 mb-2">Uninstall → install APK terbaru dari folder → beri izin → buka aplikasi → pindah ke Logcat.</p>
        <div v-for="m in settings.settings.macros" :key="m.id" class="flex items-center gap-2 py-1">
          <button :class="btn" @click="runMacro(m.id)">▶ {{ m.name }}</button>
          <span class="font-mono text-xs text-ink2 truncate">{{ m.pkg }} · {{ m.apkDir }}</span>
          <button class="ml-auto text-xs text-err" @click="delMacro(m.id)">hapus</button>
        </div>
        <ul v-if="steps.length" class="mt-2 text-sm space-y-0.5">
          <li v-for="s in steps" :key="s.id" class="flex gap-2">
            <span class="w-4" :class="s.status === 'ok' ? 'text-ok' : s.status === 'error' ? 'text-err' : 'text-ink2'">{{ s.status === 'ok' ? '✓' : s.status === 'error' ? '✗' : s.status === 'running' ? '…' : '○' }}</span>
            <span>{{ s.label }}</span>
            <span v-if="s.detail" class="text-xs text-ink2 truncate">{{ s.detail }}</span>
          </li>
        </ul>
        <form v-if="macroOpen" class="mt-3 grid grid-cols-2 gap-2" @submit.prevent="saveMacro">
          <input v-model="draft.name" :class="inp" placeholder="Nama macro" />
          <input v-model="draft.pkg" :class="inp + ' font-mono text-xs'" placeholder="com.izam.tv" />
          <div class="flex gap-2"><input v-model="draft.apkDir" :class="inp + ' flex-1 font-mono text-xs'" placeholder="Folder APK" readonly /><button type="button" :class="btn" @click="pickDir">Pilih…</button></div>
          <input v-model="draft.grant" :class="inp + ' font-mono text-xs'" placeholder="izin (pisah koma), mis. android.permission.POST_NOTIFICATIONS" />
          <button class="col-span-2 px-3 py-1.5 rounded-lg bg-accent text-white text-sm">Simpan macro</button>
        </form>
      </div>
    </div>

    <ConfirmDialog :open="!!confirm" :title="confirm?.kind === 'clear' ? 'Hapus data aplikasi?' : 'Uninstall aplikasi?'" :body="confirmText" danger :confirm-label="confirm?.kind === 'clear' ? 'Hapus data' : 'Uninstall'" @ok="doConfirm" @cancel="confirm = null" />
  </div>
</template>
