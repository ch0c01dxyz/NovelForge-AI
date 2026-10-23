<script setup lang="ts">
import { ref, watch } from "vue";
import { useLocale } from "../../composables/useLocale";
const props = defineProps<{ coverUrl?: string | null; title: string; eager?: boolean }>();
const { t } = useLocale();
const failed = ref(false);
watch(() => props.coverUrl, () => { failed.value = false; });
</script>

<template>
  <div class="relative aspect-[2/3] shrink-0 overflow-hidden rounded-lg border border-nf-border bg-nf-bg-2 shadow-nf-sm">
    <img v-if="coverUrl && !failed" :src="coverUrl" :alt="t('publicNovel.coverAlt', { title })" :loading="eager ? 'eager' : 'lazy'" decoding="async" width="400" height="600" class="h-full w-full object-cover" @error="failed = true" />
    <div v-else role="img" :aria-label="t('publicNovel.noCover')" class="flex h-full min-h-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-nf-bg-3 to-nf-bg-1 p-3 text-center text-nf-text-faint">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" class="size-8" aria-hidden="true"><path d="M4 4h7a3 3 0 0 1 3 3v14a4 4 0 0 0-4-3H4zM14 7h6v14h-2a4 4 0 0 0-4-3" /></svg>
      <span class="text-[11px] leading-snug">{{ t('publicNovel.noCover') }}</span>
    </div>
  </div>
</template>
