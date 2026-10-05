<script setup lang="ts">
import { ref, computed, watch, onUnmounted, nextTick } from "vue";
/**
 * Proposals panel (NF-WF-007 output #5): extraction proposals as
 * Candidate Canon (Invariant 8).
 *
 * Each proposal renders with its citations[] under an explicit banner:
 * "Not canon. Applying proposals to canon is a separate step
 * (NF-WF-008)." This UI MUST NOT offer any "promote to canon" / "apply
 * proposal" action.
 */
import { useLocale } from "../../composables/useLocale";

export interface Proposal {
  kind: string;
  text: string;
  citations: Array<{ source: string; span: string }>;
}

defineProps<{
  proposals: Proposal[];
}>();

const { t } = useLocale();
</script>

<template>
  <section aria-label="Candidate canon" class="flex flex-col gap-2">
    <h2
      class="border-b border-nf-border pb-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-nf-text-faint"
    >
      {{ t("proposals.title") }}
    </h2>

    <p
      role="note"
      class="rounded-lg border border-nf-accent/40 bg-nf-accent/10 px-3 py-2 text-[12px] leading-relaxed text-nf-accent-hi"
    >
      {{ t("proposals.banner") }}
    </p>

    <p v-if="!proposals.length" class="text-[12.5px] text-nf-text-faint">
      {{ t("proposals.none") }}
    </p>

    <ul v-else class="flex flex-col gap-2">
      <li
        v-for="(p, i) in proposals"
        :key="i"
        class="rounded-lg border border-nf-border bg-nf-bg-2 px-3 py-2"
      >
        <div class="text-[12px] font-semibold text-nf-text">{{ p.kind }}</div>
        <p class="mt-0.5 text-[12.5px] leading-relaxed text-nf-text-dim">{{ p.text }}</p>
        <div v-if="p.citations.length" class="mt-1.5">
          <div class="text-[11px] font-medium uppercase tracking-wide text-nf-text-faint">
            {{ t("proposals.citationsLabel") }}
          </div>
          <ul class="mt-0.5 flex flex-col gap-0.5 font-mono text-[11px] text-nf-text-dim">
            <li v-for="(c, j) in p.citations" :key="j" class="break-all">
              {{ c.source }} <span class="text-nf-text-faint">{{ c.span }}</span>
            </li>
          </ul>
        </div>
      </li>
    </ul>
  </section>
</template>
