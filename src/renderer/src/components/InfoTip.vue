<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { TIPS } from '../tips'

const props = defineProps<{ k?: string; title?: string; text?: string; right?: boolean }>()
const open = ref(false)
const root = ref<HTMLElement | null>(null)
const tip = computed(() => (props.k ? TIPS[props.k] : undefined))
const title = computed(() => props.title ?? tip.value?.title ?? '')
const text = computed(() => props.text ?? tip.value?.text ?? '')

function onDoc(e: MouseEvent): void {
  if (root.value && !root.value.contains(e.target as Node)) close()
}
function toggle(): void {
  open.value = !open.value
  if (open.value) document.addEventListener('mousedown', onDoc)
  else document.removeEventListener('mousedown', onDoc)
}
function close(): void {
  open.value = false
  document.removeEventListener('mousedown', onDoc)
}
onBeforeUnmount(() => document.removeEventListener('mousedown', onDoc))
</script>

<template>
  <span ref="root" class="relative inline-flex align-middle ml-1" @mouseenter="open = true" @mouseleave="close()">
    <button
      type="button"
      class="w-4 h-4 rounded-full border border-inp text-[10px] leading-none text-ink2 hover:text-accent hover:border-accent flex items-center justify-center"
      :aria-label="`Info: ${title}`"
      data-testid="infotip"
      @click.stop="toggle"
      @keyup.esc="close"
    >
      i
    </button>
    <span
      v-if="open"
      role="tooltip"
      :class="right ? 'right-0' : 'left-0'"
      class="absolute z-50 top-5 w-64 rounded-lg border border-line bg-card shadow-lg p-3 text-xs font-normal normal-case tracking-normal text-ink text-left"
    >
      <span v-if="title" class="block font-semibold mb-1">{{ title }}</span>
      <span class="block text-ink2 leading-relaxed">{{ text }}</span>
    </span>
  </span>
</template>
