<script setup lang="ts">
import { useUi } from '../stores/ui'
const ui = useUi()
</script>
<template>
  <div class="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm">
    <div
      v-for="t in ui.toasts"
      :key="t.id"
      class="px-3 py-2 rounded-lg border text-sm shadow bg-card"
      :class="t.kind === 'err' ? 'border-err text-err' : t.kind === 'ok' ? 'border-ok text-ok' : 'border-line'"
    >
      {{ t.text }}
    </div>
  </div>
</template>
