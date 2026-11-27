<script setup lang="ts">
defineProps<{ open: boolean; title: string; body: string; danger?: boolean; confirmLabel?: string }>()
defineEmits<{ ok: []; cancel: [] }>()
</script>
<template>
  <div v-if="open" class="fixed inset-0 z-40 bg-black/40 flex items-center justify-center" @click.self="$emit('cancel')">
    <div class="bg-card border border-line rounded-xl p-5 w-[26rem] max-w-[90vw]">
      <h3 class="font-semibold mb-1">{{ title }}</h3>
      <p class="text-sm text-ink2 mb-4 whitespace-pre-line">{{ body }}</p>
      <div class="flex justify-end gap-2">
        <button class="px-3 py-1.5 rounded-lg border border-inp text-sm" @click="$emit('cancel')">Batal</button>
        <button class="px-3 py-1.5 rounded-lg text-sm text-white" :class="danger ? 'bg-err' : 'bg-accent'" @click="$emit('ok')">
          {{ confirmLabel ?? 'Lanjut' }}
        </button>
      </div>
    </div>
  </div>
</template>
