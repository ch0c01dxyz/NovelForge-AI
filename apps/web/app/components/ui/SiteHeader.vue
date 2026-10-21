<script setup lang="ts">
import { useLocale } from "../../composables/useLocale";
import LanguageMenu from "./LanguageMenu.vue";
const { t } = useLocale();
</script>

<template>
  <header
    class="flex min-h-[52px] flex-wrap items-center gap-x-5 gap-y-3 border-b border-nf-border bg-nf-bg-1 px-5 py-2 shadow-nf-sm"
  >
    <NuxtLink
      to="/"
      class="flex items-center gap-2.5 text-[14.5px] font-semibold tracking-tight focus-visible:nf-focus"
    >
      <span
        class="grid size-6.5 place-items-center rounded-md bg-nf-accent font-nf-literary text-[15px] font-bold text-nf-accent-ink"
        aria-hidden="true"
        >N</span
      >
      NovelForge
    </NuxtLink>
    <nav
      :aria-label="t('authorHome.navigation')"
      class="ml-auto flex flex-wrap items-center gap-4 text-[13px] text-nf-text-dim"
    >
      <NuxtLink to="/" class="hover:text-nf-text focus-visible:nf-focus">{{
        t("authorHome.title")
      }}</NuxtLink>
      <NuxtLink to="/browse" class="hover:text-nf-text focus-visible:nf-focus">{{
        t("discover.browseSection")
      }}</NuxtLink>
      <LanguageMenu />
    </nav>
  </header>
</template>
