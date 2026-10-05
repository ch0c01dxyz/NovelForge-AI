<script setup lang="ts">
import { ref, computed, watch, onUnmounted, nextTick } from "vue";
/**
 * Findings panel (NF-WF-007 output #4): findings + evidence.
 *
 * Renders from the snapshot material's findings-schema outcomes as
 * {category, severity, rule, remediation} with each finding's evidence
 * {source, version, span} expandable in place (Invariant 4: evidence is
 * one click from every claim). Validator failures surface as failed
 * state with the rejection detail.
 */
import { useLocale } from "../../composables/useLocale";

export interface Finding {
  category: string;
  severity: string;
  rule: string;
  remediation: string;
  evidence: { source: string; version: string; span: string };
}

defineProps<{
  findings: Finding[];
}>();

const { t } = useLocale();
const open = ref<Set<number>>(new Set());

function toggle(i: number) {
  const next = new Set(open.value);
  if (next.has(i)) next.delete(i);
  else next.add(i);
  open.value = next;
}

function severityClass(severity: string): string {
  const s = severity.toLowerCase();
  if (s === "error" || s === "high") return "text-nf-warn";
  if (s === "warning" || s === "medium") return "text-nf-accent-hi";
  return "text-nf-text-faint";
}
</script>

<template>
  <section aria-label="Findings" class="flex flex-col gap-2">
    <h2
      class="border-b border-nf-border pb-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-nf-text-faint"
    >
      {{ t("findings.title") }}
    </h2>

    <p v-if="!findings.length" class="text-[12.5px] text-nf-text-faint">
      {{ t("findings.none") }}
    </p>

    <ul v-else class="flex flex-col gap-2">
      <li
        v-for="(f, i) in findings"
        :key="i"
        class="rounded-lg border border-nf-border bg-nf-bg-2 px-3 py-2"
      >
        <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px]">
          <span class="font-semibold text-nf-text">{{ f.category || f.rule }}</span>
          <span class="font-medium" :class="severityClass(f.severity)">{{ f.severity }}</span>
        </div>
        <p v-if="f.rule && f.rule !== f.category" class="mt-0.5 text-[12px] text-nf-text-dim">
          <span class="text-nf-text-faint">{{ t("findings.ruleLabel") }}:</span> {{ f.rule }}
        </p>
        <p v-if="f.remediation" class="mt-0.5 text-[12px] text-nf-text-dim">
          <span class="text-nf-text-faint">{{ t("findings.remediationLabel") }}:</span>
          {{ f.remediation }}
        </p>
        <button
          class="mt-1 text-[12px] text-nf-accent-hi underline underline-offset-2 hover:text-nf-text focus-visible:nf-focus"
          :aria-expanded="open.has(i)"
          @click="toggle(i)"
        >
          {{ t("findings.evidence") }}
        </button>
        <dl
          v-if="open.has(i)"
          class="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 rounded bg-nf-bg-0 px-2 py-1.5 font-mono text-[11.5px] text-nf-text-dim"
        >
          <dt class="text-nf-text-faint">source</dt>
          <dd class="break-all">{{ f.evidence.source || "—" }}</dd>
          <dt class="text-nf-text-faint">version</dt>
          <dd>{{ f.evidence.version || "—" }}</dd>
          <dt class="text-nf-text-faint">span</dt>
          <dd class="break-all">{{ f.evidence.span || "—" }}</dd>
        </dl>
      </li>
    </ul>
  </section>
</template>
