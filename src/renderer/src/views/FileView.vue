<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useDevices } from '../stores/devices'
import { useUi } from '../stores/ui'
import { bytes, plain } from '../fmt'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import type { FileEntry } from '../../../preload/index'

const devices = useDevices()
const ui = useUi()
const cur = computed(() => devices.current)
const ready = computed(() => cur.value?.state === 'device')

const path = ref('/sdcard')
const runAs = ref('')
const entries = ref<FileEntry[]>([])
const loading = ref(false)
const err = ref<string | null>(null)
const dropping = ref(false)
const delTarget = ref<FileEntry | null>(null)
const renaming = ref<{ name: string; to: string } | null>(null)
const newDir = ref('')

const crumbs = computed(() => {
  const parts = path.value.split('/').filter(Boolean)
  return parts.map((p, i) => ({ name: p, path: '/' + parts.slice(0, i + 1).join('/') }))
})
const join = (d: string, n: string): string => (d.endsWith('/') ? d : d + '/') + n

async function load(): Promise<void> {
  if (!cur.value || !ready.value) return
  loading.value = true
  err.value = null
  const r = await window.dvncyzm.files.ls(cur.value.serial, path.value, runAs.value.trim() || undefined)
  loading.value = false
  if (r.ok) entries.value = r.data
  else {
    entries.value = []
    err.value = r.error.message
  }
}
watch([() => cur.value?.serial, ready], () => {
  path.value = runAs.value ? '/data/data/' + runAs.value : '/sdcard'
  load()
}, { immediate: true })

function open(e: FileEntry): void {
  if (e.type === 'dir' || (e.type === 'link' && !e.name.includes('.'))) {
    path.value = e.linkTarget && e.type === 'link' ? e.linkTarget : join(path.value, e.name)
    load()
  }
}
function go(p: string): void {
  path.value = p
  load()
}
function up(): void {
  go('/' + path.value.split('/').filter(Boolean).slice(0, -1).join('/'))
}
function useRunAs(): void {
  path.value = runAs.value.trim() ? `/data/data/${runAs.value.trim()}` : '/sdcard'
  load()
}
async function pull(e: FileEntry): Promise<void> {
  if (!cur.value) return
  const full = join(path.value, e.name)
  if (runAs.value.trim()) {
    const p = await ui.run(window.dvncyzm.files.pullRunAs(cur.value.serial, runAs.value.trim(), full))
    if (p) ui.toast(`Disimpan: ${p}`, 'ok')
    return
  }
  const d = await ui.run(window.dvncyzm.files.pull(cur.value.serial, full))
  if (d) ui.toast(`Disimpan di ${d}`, 'ok')
}
async function pushPick(): Promise<void> {
  if (!cur.value) return
  const n = await ui.run(window.dvncyzm.files.pushPick(cur.value.serial, path.value))
  if (n) {
    ui.toast(`${n} file dikirim`, 'ok')
    load()
  }
}
async function onDrop(ev: DragEvent): Promise<void> {
  dropping.value = false
  if (!cur.value || runAs.value.trim()) return
  const files = [...(ev.dataTransfer?.files ?? [])].map((f) => window.dvncyzm.pathForFile(f)).filter(Boolean)
  if (!files.length) return
  if ((await ui.run(window.dvncyzm.files.push(cur.value.serial, plain([...files]), path.value), `${files.length} file dikirim ke ${path.value}`)) !== null) load()
}
async function doDelete(): Promise<void> {
  const t = delTarget.value
  delTarget.value = null
  if (t && cur.value && (await ui.run(window.dvncyzm.files.rm(cur.value.serial, join(path.value, t.name)), 'Dihapus')) !== null) load()
}
async function doRename(): Promise<void> {
  const r = renaming.value
  renaming.value = null
  if (r && cur.value && r.to && r.to !== r.name && (await ui.run(window.dvncyzm.files.rename(cur.value.serial, path.value, r.name, r.to), 'Nama diganti')) !== null) load()
}
async function mkdir(): Promise<void> {
  if (!cur.value || !newDir.value.trim()) return
  if ((await ui.run(window.dvncyzm.files.mkdir(cur.value.serial, path.value, newDir.value.trim()))) !== null) {
    newDir.value = ''
    load()
  }
}
const btn = 'px-2.5 py-1 rounded-md border border-inp text-xs hover:border-accent'
const inp = 'px-2 py-1 rounded-md border border-inp bg-bg text-xs outline-none focus:border-accent'
</script>

<template>
  <div v-if="!ready" class="p-6 text-sm text-ink2">Pilih perangkat yang terhubung untuk membuka file.</div>
  <div v-else class="h-full flex flex-col" @dragover.prevent="dropping = true" @dragleave.self="dropping = false" @drop.prevent="onDrop">
    <div class="p-2 border-b border-line bg-rail flex flex-wrap items-center gap-2">
      <button :class="btn" @click="up">↑</button>
      <nav class="font-mono text-xs flex items-center flex-wrap">
        <button class="hover:underline px-1" @click="go('/')">/</button>
        <template v-for="c in crumbs" :key="c.path"><span class="text-ink2">/</span><button class="hover:underline px-1" @click="go(c.path)">{{ c.name }}</button></template>
      </nav>
      <div class="ml-auto flex items-center gap-2">
        <input v-model="runAs" :class="inp + ' w-44 font-mono'" placeholder="run-as: com.paket.debug" @keyup.enter="useRunAs" />
        <button :class="btn" @click="useRunAs">{{ runAs.trim() ? 'Buka data aplikasi' : 'Ke /sdcard' }}</button>
        <input v-model="newDir" :class="inp + ' w-28'" placeholder="folder baru" @keyup.enter="mkdir" />
        <button :class="btn" :disabled="!!runAs.trim()" @click="pushPick">Kirim file…</button>
        <button :class="btn" @click="load">Segarkan</button>
      </div>
    </div>
    <div class="flex-1 overflow-auto relative">
      <div v-if="dropping" class="absolute inset-3 z-20 border-2 border-dashed border-accent rounded-xl bg-accent/10 flex items-center justify-center text-accent font-medium">Lepas untuk mengirim ke {{ path }}</div>
      <p v-if="err" class="p-4 text-sm text-err whitespace-pre-line">{{ err }}</p>
      <p v-else-if="loading" class="p-4 text-sm text-ink2">Memuat…</p>
      <p v-else-if="!entries.length" class="p-4 text-sm text-ink2">Folder kosong.</p>
      <table v-else class="w-full text-sm">
        <tbody>
          <tr v-for="e in entries" :key="e.name" class="border-b border-line hover:bg-card group">
            <td class="px-3 py-1.5 w-8">{{ e.type === 'dir' ? '📁' : e.type === 'link' ? '🔗' : '📄' }}</td>
            <td class="py-1.5"><button class="text-left" @dblclick="open(e)" @click="e.type === 'dir' && open(e)">{{ e.name }}<span v-if="e.linkTarget" class="text-ink2 text-xs"> → {{ e.linkTarget }}</span></button></td>
            <td class="px-3 text-xs text-ink2 text-right w-24">{{ e.type === 'file' ? bytes(e.size) : '' }}</td>
            <td class="px-3 text-xs text-ink2 w-40 font-mono">{{ e.modified }}</td>
            <td class="px-3 w-56 text-right opacity-0 group-hover:opacity-100">
              <button v-if="e.type === 'file'" :class="btn" @click="pull(e)">Unduh</button>
              <button v-if="!runAs.trim()" :class="btn + ' ml-1'" @click="renaming = { name: e.name, to: e.name }">Ganti nama</button>
              <button v-if="!runAs.trim()" :class="btn + ' ml-1 !border-err text-err'" @click="delTarget = e">Hapus</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <ConfirmDialog :open="!!delTarget" title="Hapus dari perangkat?" :body="`${delTarget ? join(path, delTarget.name) : ''}\nDi ${cur?.alias || cur?.model || cur?.serial}. Tidak bisa dikembalikan.`" danger confirm-label="Hapus" @ok="doDelete" @cancel="delTarget = null" />
    <div v-if="renaming" class="fixed inset-0 z-40 bg-black/40 flex items-center justify-center" @click.self="renaming = null">
      <form class="bg-card border border-line rounded-xl p-5 w-[24rem] space-y-3" @submit.prevent="doRename">
        <h3 class="font-semibold">Ganti nama</h3>
        <input v-model="renaming.to" :class="inp + ' w-full !py-1.5 text-sm'" autofocus />
        <div class="flex justify-end gap-2"><button type="button" :class="btn" @click="renaming = null">Batal</button><button class="px-3 py-1 rounded-md bg-accent text-white text-xs">Simpan</button></div>
      </form>
    </div>
  </div>
</template>
