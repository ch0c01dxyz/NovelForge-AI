<script setup lang="ts">
import { ref, computed, watch, onUnmounted, nextTick } from "vue";
/**
 * Outline-moved notice (NF-WF-007, Q2 as amended by the author
 * 2026-10-05).
 *
 * At review time, when the approved outline version differs from the
 * one the run started from, this notice is NON-BLOCKING: the decision
 * still binds to the parked snapshot. It fetches the current approved
 * outline version, diffs its content against the run's outline version,
 * and HIGHLIGHTS the changed sections/parts so the author can see
 * exactly what moved.
 */
import type { OutlineChange } from "../../utils/outlineDiff";
import { useLocale } from "../../composables/useLocale";

defineProps<{
  fromVersionNumber: number | null;
  toVersionNumber: number | null;
  changes: OutlineChange[];
  truncated: boolean;
}>();

const { t } = useLocale();
const expanded = ref(false);

function kindClass(kind: OutlineChange["kind"]): string {
  if (kind === "added") return "text-nf-ok";
  if (kind === "removed") return "text-nf-warn";
  return "text-nf-accent-hi";
}

function kindLabel(kind: OutlineChange["kind"]): string {
  return kind === "added" ? "+" : kind === "removed" ? "−" : "~";
}
</script>

<template>
  <div
    role="note"
    aria-label="Outline moved"
    class="rounded-lg border border-nf-accent/40 bg-nf-accent/10 px-3 py-2.5"
  >
    <p class="text-[12.5px] font-medium leading-relaxed text-nf-accent-hi">
      {{ t("outlineMoved.title") }}: {{ t("outlineMoved.message") }}
    </p>

    <button
      class="mt-1.5 text-[12px] text-nf-accent-hi underline underline-offset-2 hover:text-nf-text focus-visible:nf-focus"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      {{ t("outlineMoved.changedParts") }}
      <span v-if="fromVersionNumber !== null && toVersionNumber !== null">
        (v{{ fromVersionNumber }} → v{{ toVersionNumber }})
      </span>
    </button>

    <div v-if="expanded" class="mt-1.5">
      <p v-if="!changes.length" class="text-[12px] text-nf-text-dim">
        {{ t("outlineMoved.noChanges") }}
      </p>
      <ul v-else class="flex max-h-48 flex-col gap-1 overflow-y-auto">
        <li
          v-for="(c, i) in changes"
          :key="i"
          class="rounded bg-nf-bg-0 px-2 py-1 font-mono text-[11.5px] leading-relaxed"
        >
          <span class="font-bold" :class="kindClass(c.kind)">{{ kindLabel(c.kind) }}</span>
          <span class="text-nf-text-dim">{{ c.path || "(root)" }}</span>
          <span v-if="c.kind === 'changed'" class="block break-all text-nf-text-faint">
            <span class="line-through">{{ c.before }}</span>
            <span class="text-nf-text-dim"> → {{ c.after }}</span>
          </span>
          <span v-else class="block break-all text-nf-text-faint">
            {{ c.kind === "added" ? c.after : c.before }}
          </span>
        </li>
      </ul>
      <p v-if="truncated" class="mt-1 text-[11.5px] text-nf-text-faint">…</p>
    </div>
  </div>
</template>
