<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useUi } from '../stores/ui'

const props = defineProps<{ serial: string | null; always?: boolean }>()
const ui = useUi()
const text = ref('')
const nonAscii = ref(false)
const active = ref(!!props.always)
let holdTimer: ReturnType<typeof setTimeout> | undefined

const send = (key: string, long = false): Promise<unknown> => (props.serial ? ui.run(window.dvncyzm.input.key(props.serial, key, long)) : Promise.resolve(null))

const KEYMAP: Record<string, string> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'ok', Escape: 'back', Backspace: 'delete'
}
function onKey(e: KeyboardEvent): void {
  if (!active.value) return
  const t = e.target as HTMLElement
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
  const k = KEYMAP[e.key]
  if (!k) return
  e.preventDefault()
  send(k)
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

function onText(): void {
  nonAscii.value = /[^\x00-\x7F]/.test(text.value)
}
async function sendText(): Promise<void> {
  if (!text.value || nonAscii.value || !props.serial) return
  const ok = await ui.run(window.dvncyzm.input.text(props.serial, text.value))
  if (ok !== null) text.value = ''
}
// Tahan OK: tekan lama > 600 ms mengirim longpress
function okDown(): void {
  holdTimer = setTimeout(() => {
    holdTimer = undefined
    send('ok', true)
  }, 600)
}
function okUp(): void {
  if (holdTimer) {
    clearTimeout(holdTimer)
    holdTimer = undefined
    send('ok')
  }
}
function okCancel(): void {
  if (holdTimer) clearTimeout(holdTimer)
  holdTimer = undefined
}
const btn = 'h-10 rounded-lg border border-inp bg-card hover:border-accent text-sm select-none'
</script>

<template>
  <div class="p-3" tabindex="0" @focus="active = true" @blur="active = !!always" @mouseenter="active = true" @mouseleave="active = !!always">
    <p class="text-[11px] text-ink2 mb-2 text-center">{{ active ? 'Keyboard aktif: panah, Enter, Esc, Backspace' : 'Arahkan kursor ke sini untuk memakai keyboard' }}</p>
    <div class="grid grid-cols-3 gap-2 w-48 mx-auto">
      <span /><button :class="btn" @click="send('up')">▲</button><span />
      <button :class="btn" @click="send('left')">◀</button>
      <button :class="btn + ' bg-accent text-white border-accent font-medium'" title="Klik = OK, tahan = tekan lama" @mousedown="okDown" @mouseup="okUp" @mouseleave="okCancel">OK</button>
      <button :class="btn" @click="send('right')">▶</button>
      <span /><button :class="btn" @click="send('down')">▼</button><span />
    </div>
    <div class="grid grid-cols-4 gap-2 mt-3">
      <button :class="btn" @click="send('back')">Back</button>
      <button :class="btn" @click="send('home')">Home</button>
      <button :class="btn" @click="send('menu')">Menu</button>
      <button :class="btn" @click="send('playpause')">⏯</button>
      <button :class="btn" @click="send('voldown')">Vol −</button>
      <button :class="btn" @click="send('volup')">Vol +</button>
      <button :class="btn" @click="send('mute')">Mute</button>
      <button :class="btn" @click="send('power')">Power</button>
    </div>
    <form class="mt-3" @submit.prevent="sendText">
      <label class="text-xs text-ink2">Kirim ketikan ke perangkat</label>
      <div class="flex gap-2 mt-1">
        <input v-model="text" class="flex-1 min-w-0 px-2 py-1.5 rounded-md border border-inp bg-bg font-mono text-xs outline-none focus:border-accent" placeholder="teks…" @input="onText" />
        <button class="px-3 rounded-md bg-accent text-white text-xs disabled:opacity-50" :disabled="!text || nonAscii">Kirim</button>
      </div>
      <p v-if="nonAscii" class="text-xs text-warn mt-1">Huruf non-ASCII (é, 日本語, emoji) tidak didukung oleh <span class="font-mono">input text</span>.</p>
    </form>
  </div>
</template>
