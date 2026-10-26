<script setup lang="ts">
/**
 * Run graph (NF-WF-018A): the run detail with its step rows in execution
 * order. The vertical step list IS the screen-reader text equivalent of
 * the graph (Invariant 6): every step is a listitem carrying key, kind,
 * status, agent/skill version pins, latency, and outcome/error text.
 * Reads the frozen `GET .../workflow-runs/:runId` rows.
 */
import { computed } from "vue";
import type { RunDetail, StepView } from "../../composables/useAiStudio";
import { useLocale } from "../../composables/useLocale";
import WorkflowRetryAction from "../generation/WorkflowRetryAction.vue";

const props = defineProps<{
  run: RunDetail;
  workspaceId?: string;
}>();
const emit = defineEmits<{ (e: "retried", payload: { runId: string; statusUrl: string }): void }>();

const { t } = useLocale();

function stepStatusLabel(status: string): string {
  return t(`aiStudio.steps.stepStatus.${status}`);
}

function stepStatusClass(status: string): string {
  if (status === "SUCCEEDED") return "bg-nf-ok/15 text-nf-ok";
  if (status === "FAILED") return "bg-nf-warn/15 text-nf-warn";
  if (status === "AWAITING_APPROVAL") return "bg-nf-accent/15 text-nf-accent-hi";
  if (status === "RUNNING") return "bg-nf-accent/10 text-nf-accent-hi";
  if (status === "SKIPPED") return "bg-nf-text-faint/15 text-nf-text-faint";
  return "bg-nf-text-faint/10 text-nf-text-dim";
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

function outcomeText(step: StepView): string {
  if (typeof step.output === "string") return step.output;
  if (step.output == null) return "";
  try {
    return JSON.stringify(step.output);
  } catch {
    return "";
  }
}

function truncated(text: string, max = 240): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

const pinnedAgents = computed(() => {
  const seen = new Map<string, number | null>();
  for (const s of props.run.steps) {
    if (s.agentKey && !seen.has(s.agentKey)) seen.set(s.agentKey, s.agentVersionNumber);
  }
  return [...seen.entries()];
});

const pinnedSkills = computed(() => {
  const seen = new Map<string, number | null>();
  for (const s of props.run.steps) {
    if (s.skillKey && !seen.has(s.skillKey)) seen.set(s.skillKey, s.skillVersionNumber);
  }
  return [...seen.entries()];
});
</script>

<template>
  <section :aria-label="t('aiStudio.steps.title')">
    <WorkflowRetryAction v-if="workspaceId" class="mb-3" :workspace-id="workspaceId" :run="run" @retried="emit('retried', $event)" />
    <div class="mb-4 rounded-xl border border-nf-border bg-nf-bg-1 p-4">
      <div class="flex flex-wrap items-center gap-2">
        <h2 class="text-[16px] font-semibold text-nf-text">
          {{ props.run.workflowKey }}
        </h2>
        <span
          class="rounded px-1.5 py-0.5 text-[11px] font-semibold"
          :class="stepStatusClass(props.run.status)"
        >
          {{ stepStatusLabel(props.run.status) }}
        </span>
      </div>
      <dl class="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] sm:grid-cols-4">
        <div>
          <dt class="text-nf-text-faint">{{ t("aiStudio.runs.workflow") }}</dt>
          <dd class="text-nf-text-dim">
            {{ t("aiStudio.runs.workflowVersion", { version: props.run.workflowVersionNumber ?? "—" }) }}
          </dd>
        </div>
        <div>
          <dt class="text-nf-text-faint">{{ t("aiStudio.runs.startedAt") }}</dt>
          <dd class="text-nf-text-dim">{{ formatDate(props.run.startedAt) }}</dd>
        </div>
        <div>
          <dt class="text-nf-text-faint">{{ t("aiStudio.runs.completedAt") }}</dt>
          <dd class="text-nf-text-dim">{{ formatDate(props.run.completedAt) }}</dd>
        </div>
        <div>
          <dt class="text-nf-text-faint">{{ t("aiStudio.steps.title") }}</dt>
          <dd class="text-nf-text-dim">{{ props.run.steps.length }}</dd>
        </div>
      </dl>
      <div class="mt-3 border-t border-nf-border/60 pt-2">
        <h3 class="text-[12px] font-semibold text-nf-text">
          {{ t("aiStudio.runs.pinnedVersions") }}
        </h3>
        <ul class="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-nf-text-dim">
          <li v-for="[key, version] in pinnedAgents" :key="`a-${key}`">
            {{ t("aiStudio.runs.agentVersion", { key, version: version ?? t("aiStudio.runs.noVersionPin") }) }}
          </li>
          <li v-for="[key, version] in pinnedSkills" :key="`s-${key}`">
            {{ t("aiStudio.runs.skillVersion", { key, version: version ?? t("aiStudio.runs.noVersionPin") }) }}
          </li>
          <li v-if="pinnedAgents.length === 0 && pinnedSkills.length === 0">
            {{ t("aiStudio.runs.noVersionPin") }}
          </li>
        </ul>
      </div>
    </div>

    <h3 class="mb-2 text-[13px] font-semibold text-nf-text">
      {{ t("aiStudio.steps.title") }}
    </h3>
    <ol class="relative space-y-0">
      <li
        v-for="(step, i) in props.run.steps"
        :key="step.stepKey"
        class="relative flex gap-3 pb-4"
        :data-testid="`step-${step.stepKey}`"
      >
        <div class="flex flex-col items-center" aria-hidden="true">
          <span
            class="grid size-6 shrink-0 place-items-center rounded-full border text-[10px] font-bold"
            :class="stepStatusClass(step.status)"
          >
            {{ i + 1 }}
          </span>
          <span
            v-if="i < props.run.steps.length - 1"
            class="w-px flex-1 bg-nf-border"
          />
        </div>
        <div class="min-w-0 flex-1 rounded-lg border border-nf-border bg-nf-bg-1 p-3">
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-mono text-[13px] font-semibold text-nf-text">
              {{ step.stepKey }}
            </span>
            <span class="rounded bg-nf-bg-2 px-1.5 py-0.5 text-[11px] text-nf-text-dim">
              {{ step.kind }}
            </span>
            <span
              class="rounded px-1.5 py-0.5 text-[11px] font-semibold"
              :class="stepStatusClass(step.status)"
            >
              {{ stepStatusLabel(step.status) }}
            </span>
            <span
              v-if="step.latencyMs !== null"
              class="text-[11px] text-nf-text-faint"
            >
              {{ t("aiStudio.steps.latency", { ms: step.latencyMs }) }}
            </span>
          </div>
          <p
            v-if="step.agentKey || step.skillKey"
            class="mt-1 text-[12px] text-nf-text-faint"
          >
            <template v-if="step.agentKey">
              {{ t("aiStudio.runs.agentVersion", { key: step.agentKey, version: step.agentVersionNumber ?? t("aiStudio.runs.noVersionPin") }) }}
            </template>
            <template v-if="step.agentKey && step.skillKey"> · </template>
            <template v-if="step.skillKey">
              {{ t("aiStudio.runs.skillVersion", { key: step.skillKey, version: step.skillVersionNumber ?? t("aiStudio.runs.noVersionPin") }) }}
            </template>
          </p>
          <template v-if="step.errorMessage">
            <p class="mt-1.5 text-[12px] text-nf-warn" role="alert">{{ t(step.errorMessage?.includes('AI_CHAPTER_TOO_SHORT') ? "run.tooShortMessage" : "run.failedMessage") }}</p>
            <details class="mt-2 text-[12px] text-nf-text-dim">
              <summary class="cursor-pointer focus-visible:nf-focus">{{ t("run.technicalDetails") }}</summary>
              <p class="mt-2 whitespace-pre-wrap break-words font-mono">{{ step.errorMessage }}</p>
            </details>
          </template>
          <p
            v-else-if="outcomeText(step)"
            class="mt-1.5 whitespace-pre-wrap break-words font-mono text-[12px] text-nf-text-dim"
            :class="{ 'text-nf-warn': step.status === 'FAILED' }"
          >
            {{ truncated(outcomeText(step)) }}
          </p>
        </div>
      </li>
    </ol>
  </section>
</template>
