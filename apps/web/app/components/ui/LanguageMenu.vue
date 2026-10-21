<script setup lang="ts">
import ActionMenu from "./ActionMenu.vue";
import { useLocale } from "../../composables/useLocale";
const { t, locale, setLocale } = useLocale();
</script>
<template>
  <ActionMenu :label="t('authorHome.language')" class="nf-language-menu" data-testid="language-menu">
    <template #trigger>
      <svg class="size-4 shrink-0" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="10" cy="10" r="7" /><ellipse cx="10" cy="10" rx="3" ry="7" /><path d="M3 10h14" /></svg>
      <span class="uppercase">{{ locale }}</span>
    </template>
    <button v-for="option in (['en', 'id'] as const)" :key="option" type="button" :lang="option" :aria-pressed="locale === option" class="items-center justify-between gap-3" @click="setLocale(option)">
      <span>{{ option === 'en' ? 'English' : 'Bahasa Indonesia' }}</span>
      <svg v-if="locale === option" class="size-4 text-nf-accent-hi" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 10 4 4 8-8" /></svg>
    </button>
  </ActionMenu>
</template>
