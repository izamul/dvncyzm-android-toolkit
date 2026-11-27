<script setup lang="ts">
import { plain } from '../fmt'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { ALL_LEVELS, useLogcat } from '../stores/logcat'
import { useDevices } from '../stores/devices'
import { useSettings } from '../stores/settings'
import { useUi } from '../stores/ui'
import LogTable from '../components/LogTable.vue'
import type { LogLevel } from '../../../shared/types'

const lc = useLogcat()
const devices = useDevices()
const settings = useSettings()
const ui = useUi()

const ready = computed(() => devices.current?.state === 'device')
const pkgs = ref<string[]>([])
const tagsText = ref('')
const jumpTo = ref<number | null>(null)
const presetName = ref('')
const table = ref<InstanceType<typeof LogTable> | null>(null)

watch(
  () => (ready.value ? devices.current?.serial : null) ?? null,
  async (s) => {
    await lc.attach(s)
    if (s) loadPkgs(s)
  },
  { immediate: true }
)
// Dari macro "Pasang bersih": pindah ke Logcat dengan filter aplikasi itu
watch(() => ui.logcatPkg, (p) => {
  if (p) {
    lc.filter.pkg = p
    ui.logcatPkg = null
    lc.apply()
  }
}, { immediate: true })

async function loadPkgs(s: string): Promise<void> {
  const r = await window.dvncyzm.apps.list(s, 'user')
  pkgs.value = r.ok ? r.data.map((a) => a.pkg) : []
}
function toggleLevel(l: LogLevel): void {
  const set = new Set(lc.filter.levels)
  if (l === 'E') {
    // E dan F selalu satu kelompok
    if (set.has('E')) (set.delete('E'), set.delete('F'))
    else (set.add('E'), set.add('F'))
  } else if (set.has(l)) set.delete(l)
  else set.add(l)
  lc.filter.levels = ALL_LEVELS.filter((x) => set.has(x))
  lc.apply()
}
let qt: ReturnType<typeof setTimeout> | undefined
function onQuery(): void {
  clearTimeout(qt)
  qt = setTimeout(() => lc.apply(), 250)
}
function onTags(): void {
  lc.filter.tags = tagsText.value.split(/[\s,]+/).filter(Boolean)
  onQuery()
}
function filterTag(t: string): void {
  tagsText.value = t
  onTags()
}
function onPkg(): void {
  if (!lc.filter.pkg) lc.filter.pkg = undefined
  lc.apply()
}
function savePreset(): void {
  const name = presetName.value.trim()
  if (!name) return
  const list = settings.settings.logPresets.filter((p) => p.name !== name)
  list.push({ name, filter: JSON.parse(JSON.stringify(lc.filter)) })
  window.dvncyzm.store.set({ logPresets: plain(list) }).then((r) => r.ok && (settings.settings.logPresets = r.data.logPresets))
  presetName.value = ''
  ui.toast('Preset disimpan', 'ok')
}
function usePreset(name: string): void {
  const p = settings.settings.logPresets.find((x) => x.name === name)
  if (!p) return
  lc.filter = JSON.parse(JSON.stringify(p.filter))
  tagsText.value = (lc.filter.tags ?? []).join(' ')
  lc.apply()
}
function delPreset(name: string): void {
  window.dvncyzm.store.set({ logPresets: plain(settings.settings.logPresets.filter((p) => p.name !== name)) }).then((r) => r.ok && (settings.settings.logPresets = r.data.logPresets))
}
function jump(): void {
  const id = lc.crash?.ev.entryId ?? null
  jumpTo.value = null
  nextTick(() => (jumpTo.value = id))
}
onMounted(() => {
  window.addEventListener('keydown', (e) => {
    if (ui.tab !== 'logcat') return
    const t = e.target as HTMLElement
    const typing = t?.tagName === 'INPUT' || t?.tagName === 'SELECT' || t?.tagName === 'TEXTAREA'
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') (e.preventDefault(), lc.clear())
    else if ((e.metaKey || e.ctrlKey) && e.key === 'f') (e.preventDefault(), document.getElementById('log-search')?.focus())
    else if (e.key === ' ' && !typing) (e.preventDefault(), lc.togglePause())
  })
})
const LV: LogLevel[] = ['V', 'D', 'I', 'W', 'E']
const lvColor: Record<string, string> = { V: 'text-ink2', D: 'text-accent', I: 'text-ok', W: 'text-warn', E: 'text-err' }
const inp = 'px-2 py-1.5 rounded-md border border-inp bg-bg text-sm outline-none focus:border-accent'
const btn = 'px-2.5 py-1.5 rounded-md border border-inp text-xs hover:border-accent'
</script>

<template>
  <div v-if="!ready" class="p-6 text-sm text-ink2">Pilih perangkat yang terhubung untuk melihat log.</div>
  <div v-else class="h-full flex flex-col">
    <div v-if="lc.crash" class="flex items-center gap-3 px-3 py-2 text-sm bg-[var(--crash-bg)] text-err border-b border-line">
      <span class="font-semibold">{{ lc.crash.ev.kind === 'anr' ? 'ANR' : lc.crash.ev.kind === 'native' ? 'Crash native' : 'Crash' }}</span>
      <span class="truncate">{{ lc.crash.ev.title }}</span>
      <button class="ml-auto underline" @click="jump">Lompat ke error</button>
      <button class="underline" @click="lc.copyStack()">Salin stack trace</button>
      <button @click="lc.crash = null">×</button>
    </div>

    <div class="p-2 border-b border-line bg-rail flex flex-wrap gap-2 items-center">
      <select v-model="lc.filter.pkg" :class="inp + ' w-56 font-mono text-xs'" @change="onPkg">
        <option :value="undefined">Semua aplikasi</option>
        <option v-if="lc.filter.pkg && !pkgs.includes(lc.filter.pkg)" :value="lc.filter.pkg">{{ lc.filter.pkg }}</option>
        <option v-for="p in pkgs" :key="p" :value="p">{{ p }}</option>
      </select>
      <div class="flex rounded-md border border-inp overflow-hidden">
        <button v-for="l in LV" :key="l" class="px-2 py-1.5 text-xs font-mono font-semibold" :class="[lvColor[l], lc.filter.levels.includes(l) ? 'bg-card' : 'opacity-40']" @click="toggleLevel(l)">{{ l === 'E' ? 'E/F' : l }}</button>
      </div>
      <input v-model="tagsText" :class="inp + ' w-40 font-mono text-xs'" placeholder="tag, -tagKecuali" @input="onTags" />
      <input id="log-search" v-model="lc.filter.query" :class="inp + ' w-56 font-mono text-xs ' + (lc.queryError ? '!border-err' : '')" placeholder="cari atau /regex/" :title="lc.queryError ?? ''" @input="onQuery" />
      <div class="ml-auto flex gap-1.5">
        <button :class="btn" @click="lc.togglePause()">{{ lc.paused ? '▶ Lanjut' : '⏸ Jeda' }}</button>
        <button :class="btn" @click="lc.clear()">Bersihkan</button>
        <button :class="btn" @click="lc.loadHistory()">Muat 5.000 sebelumnya</button>
        <button :class="btn" @click="lc.save()">Simpan .txt</button>
      </div>
    </div>
    <div class="px-2 py-1 border-b border-line bg-rail flex gap-2 items-center text-xs">
      <span class="text-ink2">Preset:</span>
      <span v-for="p in settings.settings.logPresets" :key="p.name" class="border border-line rounded px-1.5 py-0.5">
        <button @click="usePreset(p.name)">{{ p.name }}</button>
        <button class="ml-1 text-ink2" @click="delPreset(p.name)">×</button>
      </span>
      <input v-model="presetName" :class="inp + ' !py-0.5 text-xs w-32'" placeholder="nama preset" @keyup.enter="savePreset" />
      <button :class="btn + ' !py-0.5'" @click="savePreset">Simpan filter</button>
      <span class="ml-auto text-ink2 font-mono">{{ lc.visible.length.toLocaleString('id-ID') }} baris<span v-if="lc.paused"> · dijeda</span></span>
    </div>
    <div class="flex-1 min-h-0"><LogTable ref="table" :rows="lc.visible" :jump-to="jumpTo" @tag="filterTag" /></div>
  </div>
</template>
