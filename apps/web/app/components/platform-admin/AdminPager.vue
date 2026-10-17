<script setup lang="ts">
/**
 * Pager for the platform-admin tables. Dumb view: the parent owns the
 * usePagedList state and passes page/pageCount/total.
 */
import { useLocale } from "../../composables/useLocale";

defineProps<{ page: number; pageCount: number; total: number }>();
const emit = defineEmits<{ (e: "update:page", page: number): void }>();
const { t } = useLocale();
</script>

<template>
  <nav
    v-if="total > 0"
    class="mt-2 flex items-center justify-between gap-2"
    :aria-label="t('platformAdmin.pager.label')"
  >
    <button
      class="rounded-md border border-nf-border px-2 py-0.5 text-[12px] text-nf-text-dim hover:bg-nf-bg-2 focus-visible:nf-focus disabled:cursor-not-allowed disabled:opacity-40"
      :disabled="page <= 1"
      data-testid="pager-prev"
      @click="emit('update:page', page - 1)"
    >
      {{ t("platformAdmin.pager.prev") }}
    </button>
    <p class="text-[12px] text-nf-text-dim" data-testid="pager-status">
      {{ t("platformAdmin.pager.status", { page, pages: pageCount, total }) }}
    </p>
    <button
      class="rounded-md border border-nf-border px-2 py-0.5 text-[12px] text-nf-text-dim hover:bg-nf-bg-2 focus-visible:nf-focus disabled:cursor-not-allowed disabled:opacity-40"
      :disabled="page >= pageCount"
      data-testid="pager-next"
      @click="emit('update:page', page + 1)"
    >
      {{ t("platformAdmin.pager.next") }}
    </button>
  </nav>
</template>
