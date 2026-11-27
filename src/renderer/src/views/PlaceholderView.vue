<script setup lang="ts">
defineProps<{ title: string; milestone: string }>()
</script>
<template>
  <div class="p-6 text-sm text-ink2">
    <span class="font-medium text-ink">{{ title }}</span> dikerjakan di {{ milestone }}.
  </div>
</template>
