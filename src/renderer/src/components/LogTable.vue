<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { LogEntry } from '../../../shared/types'

const props = defineProps<{ rows: LogEntry[]; jumpTo?: number | null }>()
const emit = defineEmits<{ tag: [string] }>()

const ROW = 20
const el = ref<HTMLElement | null>(null)
const top = ref(0)
const height = ref(600)
const follow = ref(true)

const start = computed(() => Math.max(0, Math.floor(top.value / ROW) - 10))
const end = computed(() => Math.min(props.rows.length, Math.ceil((top.value + height.value) / ROW) + 10))
const slice = computed(() => props.rows.slice(start.value, end.value))

function onScroll(): void {
  const e = el.value
  if (!e) return
  top.value = e.scrollTop
  // Ikuti log terbaru mati saat menggulir ke atas, hidup lagi saat kembali ke bawah
  follow.value = e.scrollHeight - e.scrollTop - e.clientHeight < ROW * 2
}
function toBottom(): void {
  nextTick(() => {
    if (el.value) el.value.scrollTop = el.value.scrollHeight
  })
}
watch(() => props.rows.length, () => follow.value && toBottom())
watch(() => props.jumpTo, (id) => {
  if (id == null) return
  const i = props.rows.findIndex((r) => r.id === id)
  if (i >= 0 && el.value) {
    follow.value = false
    el.value.scrollTop = Math.max(0, i * ROW - height.value / 3)
  }
})
onMounted(() => {
  if (el.value) {
    height.value = el.value.clientHeight
    new ResizeObserver(() => el.value && (height.value = el.value.clientHeight)).observe(el.value)
  }
  toBottom()
})
defineExpose({ toBottom, follow })

const COLOR: Record<string, string> = { V: 'text-ink2', D: 'text-accent', I: 'text-ok', W: 'text-warn', E: 'text-err', F: 'text-err' }
</script>

<template>
  <div ref="el" class="relative h-full overflow-auto font-mono text-xs bg-card" @scroll.passive="onScroll">
    <div :style="{ height: rows.length * ROW + 'px' }" class="relative">
      <div :style="{ transform: `translateY(${start * ROW}px)` }" class="absolute left-0 right-0 top-0">
        <div
          v-for="r in slice"
          :key="r.id"
          class="flex gap-2 px-2 whitespace-nowrap overflow-hidden"
          :class="[COLOR[r.level], r.crash ? 'bg-[var(--crash-bg)]' : '']"
          :style="{ height: ROW + 'px', lineHeight: ROW + 'px' }"
          :title="r.msg"
        >
          <span class="text-ink2 shrink-0">{{ r.time }}</span>
          <span class="text-ink2 shrink-0 w-12 text-right">{{ r.pid }}</span>
          <span class="font-semibold shrink-0 w-3">{{ r.level }}</span>
          <button class="shrink-0 w-40 text-left truncate hover:underline" @click="emit('tag', r.tag)">{{ r.tag }}</button>
          <span class="truncate">{{ r.msg.split('\n')[0] }}</span>
        </div>
      </div>
    </div>
    <button
      v-if="!follow"
      class="fixed bottom-6 right-6 px-3 py-1.5 rounded-full bg-accent text-white text-xs shadow"
      @click="(follow = true), toBottom()"
    >
      ↓ Ikuti log terbaru
    </button>
  </div>
</template>
