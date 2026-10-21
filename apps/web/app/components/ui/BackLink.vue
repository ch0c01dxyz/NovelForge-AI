<script setup lang="ts">
defineProps<{ to: string; label: string }>();
</script>
<template>
  <NuxtLink :to="to" data-testid="workspace-back" class="inline-flex min-h-9 max-w-full items-center gap-2 rounded-lg border border-nf-border-strong bg-nf-bg-1 px-3 py-1.5 text-[13px] font-medium text-nf-text-dim transition-colors hover:border-nf-accent-border hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus">
    <svg class="size-4 shrink-0" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m8 5-5 5 5 5M3 10h14" /></svg>
    <span>{{ label }}</span>
  </NuxtLink>
</template>
