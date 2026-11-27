<script setup lang="ts">
import { onMounted } from 'vue'
import TvRemote from './components/TvRemote.vue'
import ToastHost from './components/ToastHost.vue'
import { useSettings } from './stores/settings'

const serial = new URLSearchParams(location.search).get('remote')
const settings = useSettings()
onMounted(() => void settings.init())
</script>

<template>
  <div class="h-full bg-bg text-ink">
    <p class="px-3 pt-2 text-[11px] text-ink2 text-center">Selalu di atas jendela lain · tutup jendela ini bila selesai</p>
    <TvRemote :serial="serial" always />
    <ToastHost />
  </div>
</template>
