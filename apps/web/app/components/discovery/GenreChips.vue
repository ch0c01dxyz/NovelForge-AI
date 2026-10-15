<script setup lang="ts">
/**
 * Genre facet chips for the discovery page (NF-WF-014, Invariant 6/8).
 *
 * Renders one chip per facet from GET /api/public/genres (keys with at
 * least one publicly-visible novel, count desc). The active facet is
 * marked with aria-current; chips are real buttons (keyboard operable,
 * visible focus). Labels come from the frozen taxonomy (`genre:` i18n
 * section) — never free text.
 */
import { useLocale } from "../../composables/useLocale";

export interface GenreFacet {
  key: string;
  count: number;
}

const props = defineProps<{
  facets: GenreFacet[];
  active: string | null;
}>();
const emit = defineEmits<{ (e: "select", key: string | null): void }>();
const { t } = useLocale();
</script>

<template>
  <div class="flex flex-wrap gap-2" role="group" :aria-label="t('discover.genreFacets')">
    <button
      type="button"
      class="rounded-full border px-3.5 py-1.5 text-[13px] transition-colors hover:bg-nf-bg-2 focus-visible:nf-focus"
      :class="props.active === null ? 'border-nf-accent-hi text-nf-text' : 'border-nf-border-focus text-nf-text-dim'"
      :aria-current="props.active === null ? 'true' : undefined"
      @click="emit('select', null)"
    >
      {{ t("discover.allGenres") }}
    </button>
    <button
      v-for="f in props.facets"
      :key="f.key"
      type="button"
      class="min-h-[44px] rounded-full border px-3.5 py-1.5 text-[13px] tabular-nums transition-colors hover:bg-nf-bg-2 focus-visible:nf-focus"
      :class="props.active === f.key ? 'border-nf-accent-hi text-nf-text' : 'border-nf-border-focus text-nf-text-dim'"
      :aria-current="props.active === f.key ? 'true' : undefined"
      @click="emit('select', f.key)"
    >
      {{ t(`genre.${f.key}`) }}
      <span class="text-nf-text-dim" aria-hidden="true">· {{ f.count }}</span>
      <span class="sr-only">{{ t("discover.facetCount", { n: f.count }) }}</span>
    </button>
  </div>
</template>
