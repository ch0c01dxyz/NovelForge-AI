<script setup lang="ts">
import { ref, computed, watch, onUnmounted, nextTick } from "vue";
/**
 * Draft diff view (NF-WF-007 output #3): generated draft vs the pinned
 * chapter version, line granularity (implementer choice per contract).
 *
 * The diff cites the pinned chapter version it was computed against.
 * Navigable text (no canvas) per Invariant 10.
 */
import { diffLines, type DiffLine } from "../../utils/lineDiff";
import { useLocale } from "../../composables/useLocale";

const props = defineProps<{
  /** The generated draft prose (null when the producing stage is pending). */
  draftProse: string | null;
  /** The chapter text the diff was computed against. */
  baseText: string;
  /** The chapter version the diff was computed against. */
  pinnedVersion: number | null;
  /** Ordinal/total for the "Draft n of m" label. */
  ordinal: number;
  total: number;
}>();

const { t } = useLocale();

const lines = computed<DiffLine[]>(() =>
  props.draftProse === null ? [] : diffLines(props.baseText, props.draftProse),
);

const added = computed(() => lines.value.filter((l) => l.op === "add").length);
const removed = computed(() => lines.value.filter((l) => l.op === "del").length);

function lineClass(op: DiffLine["op"]): string {
  if (op === "add") return "bg-nf-ok/10 text-nf-text";
  if (op === "del") return "bg-nf-warn/10 text-nf-text-dim line-through";
  return "text-nf-text-faint";
}

function linePrefix(op: DiffLine["op"]): string {
  if (op === "add") return "+";
  if (op === "del") return "−";
  return " ";
}
</script>

<template>
  <section aria-label="Draft diff" class="flex flex-col gap-2">
    <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2 class="text-[13px] font-semibold text-nf-text">
        {{
          total > 1
            ? t("review.draftWon", { n: ordinal, total })
            : t("review.draftSingle")
        }}
      </h2>
      <span
        v-if="pinnedVersion !== null"
        class="text-[11.5px] tabular-nums text-nf-text-faint"
      >
        {{ t("review.diffAgainst", { version: pinnedVersion }) }}
      </span>
      <span class="ml-auto text-[11.5px] tabular-nums text-nf-text-faint">
        +{{ added }} / −{{ removed }}
      </span>
    </div>

    <p
      v-if="draftProse === null"
      role="status"
      class="rounded-lg border border-nf-border bg-nf-bg-1 px-4 py-6 text-center text-[13px] text-nf-text-faint"
    >
      {{ t("review.pendingStage") }}
    </p>

    <div
      v-else
      role="document"
      aria-label="Draft diff"
      tabindex="0"
      class="max-h-[420px] overflow-y-auto rounded-lg border border-nf-border bg-nf-bg-1 p-3 font-mono text-[12.5px] leading-relaxed focus-visible:nf-focus"
    >
      <div
        v-for="(l, i) in lines"
        :key="i"
        class="flex gap-2 whitespace-pre-wrap rounded px-1"
        :class="lineClass(l.op)"
      >
        <span class="w-4 shrink-0 select-none text-right opacity-60" aria-hidden="true">{{
          linePrefix(l.op)
        }}</span>
        <span class="min-w-0">{{ l.text || " " }}</span>
      </div>
    </div>
  </section>
</template>
