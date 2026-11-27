<script setup lang="ts">
import { useUi } from '../stores/ui'

const ui = useUi()
function reveal(): void {
  if (ui.shot) void window.dvncyzm.screen.reveal(ui.shot.path)
}
</script>

<template>
  <div v-if="ui.shot" class="fixed right-4 bottom-20 z-40 w-72 rounded-xl border border-line bg-card shadow-xl p-2" data-testid="shot-preview">
    <img :src="ui.shot.preview" alt="Pratinjau screenshot" class="w-full rounded-lg border border-line" />
    <p class="mt-1.5 px-1 text-[11px] text-ink2 break-all">{{ ui.shot.path }}</p>
    <p v-if="ui.shot.copied" class="px-1 text-[11px] text-ok">Sudah disalin ke clipboard</p>
    <div class="mt-1.5 flex gap-1.5">
      <button class="text-xs px-2 py-1 rounded border border-inp hover:border-accent" @click="reveal">Tampilkan di folder</button>
      <button class="text-xs px-2 py-1 rounded border border-inp hover:border-accent" @click="ui.copy(ui.shot.path, 'Lokasi file disalin')">Salin lokasi</button>
      <button class="ml-auto text-xs px-2 py-1 rounded text-ink2 hover:text-ink" @click="ui.shot = null">Tutup</button>
    </div>
  </div>
</template>
