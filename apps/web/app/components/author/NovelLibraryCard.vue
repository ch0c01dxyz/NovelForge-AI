<script setup lang="ts">
import { useLocale } from "../../composables/useLocale";
defineProps<{ novel: { id: string; workspaceId: string; title: string; slug: string; status: string; coverUrl?: string }; mode: "grid" | "list" }>();
const { t } = useLocale();
</script>
<template>
  <NuxtLink :to="`/workspaces/${novel.workspaceId}/novels/${novel.id}`" class="nf-library-card group flex h-full min-w-0 items-center gap-4 rounded-[10px] border border-nf-border bg-nf-bg-1 transition-colors hover:border-nf-border-strong hover:bg-nf-bg-2 focus-visible:nf-focus" :class="mode === 'grid' ? 'p-4' : 'px-3 py-3'">
    <span class="relative aspect-[2/3] shrink-0 overflow-hidden rounded-md border border-nf-border bg-nf-bg-2" :class="mode === 'grid' ? 'w-[76px] sm:w-[88px]' : 'w-10'" aria-hidden="true">
      <img v-if="novel.coverUrl" :src="novel.coverUrl" alt="" class="absolute inset-0 size-full object-cover" loading="lazy" />
      <span v-else class="nf-cover-placeholder absolute inset-0 flex flex-col items-center justify-center gap-2 p-2">
        <svg class="size-5 text-nf-accent-hi/70" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M3 3.5h5a3 3 0 0 1 2 1 3 3 0 0 1 2-1h5v12h-5a3 3 0 0 0-2 1 3 3 0 0 0-2-1H3zM10 4.5v12" /></svg>
        <span v-if="mode === 'grid'" class="line-clamp-3 text-center font-nf-literary text-[12px] leading-snug text-nf-text-dim">{{ novel.title }}</span>
        <span v-else class="font-nf-literary text-sm text-nf-text-dim">{{ novel.title.slice(0, 1) }}</span>
      </span>
    </span>
    <span class="flex min-w-0 flex-1 flex-col items-start gap-2">
      <span class="rounded border px-1.5 py-0.5 text-[10px] font-medium" :class="novel.status === 'ACTIVE' ? 'border-nf-ok/30 bg-nf-ok/5 text-nf-ok' : 'border-nf-border-strong bg-nf-bg-2 text-nf-text-faint'">{{ t(novel.status === 'DRAFT' ? 'authorHome.statusDraft' : novel.status === 'ACTIVE' ? 'authorHome.statusActive' : novel.status === 'ARCHIVED' ? 'authorHome.statusArchived' : novel.status) }}</span>
      <span class="min-w-0 max-w-full break-words font-nf-literary font-semibold leading-snug text-nf-text group-hover:text-nf-accent-hi" :class="mode === 'grid' ? 'line-clamp-2 text-[19px]' : 'line-clamp-1 text-[16px]'">{{ novel.title }}</span>
      <span class="max-w-full truncate text-[11px] text-nf-text-faint">/{{ novel.slug }}</span>
      <span v-if="mode === 'grid'" class="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-nf-text-dim">{{ t('authorHome.openWorkspace') }} <span aria-hidden="true">→</span></span>
    </span>
    <svg v-if="mode === 'list'" class="size-4 shrink-0 text-nf-text-faint group-hover:text-nf-accent-hi" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m8 5 5 5-5 5" /></svg>
  </NuxtLink>
</template>
