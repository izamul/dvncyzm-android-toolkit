<script setup lang="ts">
import { ref } from 'vue'
import { useSettings } from '../stores/settings'
const settings = useSettings()
const err = ref<string | null>(null)
async function pick(): Promise<void> {
  err.value = await settings.pickAdb()
}
function openDocs(): void {
  window.dvncyzm.openExternal('https://developer.android.com/tools/releases/platform-tools')
}
</script>

<template>
  <div class="h-full flex items-center justify-center p-8">
    <div class="max-w-md w-full bg-card border border-line rounded-xl p-6">
      <h1 class="text-lg font-semibold mb-1">adb tidak ditemukan</h1>
      <p class="text-ink2 text-sm mb-4">
        dvncyzm mencari adb di pengaturan, <span class="font-mono">$ANDROID_HOME</span>, folder SDK bawaan, lalu
        <span class="font-mono">PATH</span>. Pilih lokasinya secara manual, atau unduh Platform-Tools resmi.
      </p>
      <div class="flex gap-2">
        <button class="px-3 py-2 rounded-lg bg-accent text-white text-sm font-medium" @click="pick">Pilih lokasi adb</button>
        <button class="px-3 py-2 rounded-lg border border-inp text-sm" @click="openDocs">Unduh Platform-Tools</button>
        <button class="px-3 py-2 rounded-lg border border-inp text-sm" @click="settings.refreshAdb()">Cari lagi</button>
      </div>
      <p v-if="err" class="mt-3 text-sm text-err">{{ err }}</p>
    </div>
  </div>
</template>
