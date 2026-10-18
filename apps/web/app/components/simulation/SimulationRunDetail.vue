<template>
  <section
    aria-labelledby="sim-detail-title"
    class="rounded-xl border border-nf-border bg-nf-bg-1 p-5"
    data-testid="sim-run-detail"
  >
    <div class="flex items-center justify-between gap-3">
      <h2 id="sim-detail-title" class="text-[16px] font-semibold text-nf-text">
        {{ t("simulation.runDetail") }}
        <span class="font-mono text-[13px] text-nf-text-dim">{{ runId.slice(0, 8) }}</span>
      </h2>
      <button
        type="button"
        data-testid="sim-detail-back"
        class="rounded-lg border border-nf-border-strong px-3 py-1.5 text-[13px] text-nf-text hover:bg-nf-bg-2 focus-visible:nf-focus"
        @click="$emit('back')"
      >
        {{ t("simulation.back") }}
      </button>
    </div>

    <p v-if="loadError" role="alert" class="mt-3 text-[13px] text-nf-error" data-testid="sim-detail-error">
      {{ t("simulation.loadError") }}
    </p>

    <div v-if="run" class="mt-4">
      <!-- Status + lifecycle controls -->
      <div class="flex flex-wrap items-center gap-3">
        <span
          data-testid="sim-detail-status"
          class="rounded-full border px-2.5 py-1 text-[12px] font-medium"
          :class="statusBadgeClass(run.status)"
        >
          {{ t(`simulation.statusLabels.${run.status}`) }}
        </span>
        <span class="text-[13px] text-nf-text-dim">
          {{ t("simulation.currentTick") }}:
          <span class="font-mono tabular-nums text-nf-text">{{ run.currentTick }}/{{ run.maxTicks }}</span>
        </span>
      </div>

      <div class="mt-3 flex flex-wrap gap-2" role="group" :aria-label="t('simulation.actionsLabel')">
        <button
          v-if="run.status === 'DRAFT'"
          type="button"
          data-testid="sim-action-configure"
          :disabled="acting"
          class="rounded-lg bg-nf-accent px-3.5 py-1.5 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus disabled:opacity-50"
          @click="doAction('configure')"
        >
          {{ t("simulation.actions.configure") }}
        </button>
        <button
          v-if="run.status === 'CONFIGURED'"
          type="button"
          data-testid="sim-action-start"
          :disabled="acting"
          class="rounded-lg bg-nf-accent px-3.5 py-1.5 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus disabled:opacity-50"
          @click="doAction('start')"
        >
          {{ t("simulation.actions.start") }}
        </button>
        <button
          v-if="run.status === 'RUNNING'"
          type="button"
          data-testid="sim-action-step"
          :disabled="acting"
          class="rounded-lg border border-nf-border-strong px-3.5 py-1.5 text-[13px] text-nf-text hover:bg-nf-bg-2 focus-visible:nf-focus disabled:opacity-50"
          @click="doAction('step')"
        >
          {{ t("simulation.actions.step") }}
        </button>
        <button
          v-if="run.status === 'RUNNING'"
          type="button"
          data-testid="sim-action-pause"
          :disabled="acting"
          class="rounded-lg border border-nf-border-strong px-3.5 py-1.5 text-[13px] text-nf-text hover:bg-nf-bg-2 focus-visible:nf-focus disabled:opacity-50"
          @click="doAction('pause')"
        >
          {{ t("simulation.actions.pause") }}
        </button>
        <button
          v-if="run.status === 'PAUSED'"
          type="button"
          data-testid="sim-action-resume"
          :disabled="acting"
          class="rounded-lg border border-nf-border-strong px-3.5 py-1.5 text-[13px] text-nf-text hover:bg-nf-bg-2 focus-visible:nf-focus disabled:opacity-50"
          @click="doAction('resume')"
        >
          {{ t("simulation.actions.resume") }}
        </button>
        <button
          v-if="['RUNNING', 'PAUSED', 'PAUSED_PROPOSAL'].includes(run.status)"
          type="button"
          data-testid="sim-action-abort"
          :disabled="acting"
          class="rounded-lg border border-nf-error/40 px-3.5 py-1.5 text-[13px] text-nf-error hover:bg-nf-error/10 focus-visible:nf-focus disabled:opacity-50"
          @click="doAction('abort')"
        >
          {{ t("simulation.actions.abort") }}
        </button>
      </div>

      <p v-if="actionError" role="alert" class="mt-2 text-[13px] text-nf-error" data-testid="sim-action-error">
        {{ actionError }}
      </p>

      <!-- Tick history -->
      <h3 class="mt-6 text-[14px] font-semibold text-nf-text">{{ t("simulation.tickHistory") }}</h3>
      <div v-if="ticks.length === 0" class="mt-2 text-[13px] text-nf-text-dim" data-testid="sim-no-ticks">
        {{ t("simulation.noTicks") }}
      </div>
      <ul v-else class="mt-2 list-none p-0 m-0" :aria-label="t('simulation.tickHistory')">
        <li
          v-for="tick in ticks"
          :key="tick.tickNumber"
          :data-testid="`sim-tick-${tick.tickNumber}`"
          class="mt-2 rounded-lg border border-nf-border bg-nf-bg-2"
        >
          <button
            type="button"
            :data-testid="`sim-tick-toggle-${tick.tickNumber}`"
            class="flex w-full items-center justify-between px-4 py-2.5 text-left focus-visible:nf-focus"
            :aria-expanded="expandedTick === tick.tickNumber"
            @click="toggleTick(tick.tickNumber)"
          >
            <span class="text-[13px] font-medium text-nf-text">
              {{ t("simulation.tickN", { n: tick.tickNumber }) }}
              <span class="ml-2 text-[12px] text-nf-text-dim">
                {{ t("simulation.eventsCount", { n: tick.events.length }) }}
              </span>
            </span>
            <span class="text-nf-text-faint" aria-hidden="true">{{ expandedTick === tick.tickNumber ? "▾" : "▸" }}</span>
          </button>
          <div v-if="expandedTick === tick.tickNumber" class="border-t border-nf-border px-4 py-3">
            <div class="grid gap-4 md:grid-cols-2">
              <div>
                <h4 class="text-[12px] font-semibold uppercase tracking-wide text-nf-text-faint">
                  {{ t("simulation.stateBefore") }}
                </h4>
                <pre class="mt-1 max-h-48 overflow-auto rounded-lg bg-nf-bg-0 p-3 text-[12px] text-nf-text-dim" data-testid="sim-tick-state-before">{{ formatJson(tick.stateBefore) }}</pre>
              </div>
              <div>
                <h4 class="text-[12px] font-semibold uppercase tracking-wide text-nf-text-faint">
                  {{ t("simulation.stateAfter") }}
                </h4>
                <pre class="mt-1 max-h-48 overflow-auto rounded-lg bg-nf-bg-0 p-3 text-[12px] text-nf-text-dim" data-testid="sim-tick-state-after">{{ formatJson(tick.stateAfter) }}</pre>
              </div>
            </div>
            <div v-if="tick.events.length > 0" class="mt-3">
              <h4 class="text-[12px] font-semibold uppercase tracking-wide text-nf-text-faint">
                {{ t("simulation.events") }}
              </h4>
              <ul class="mt-1 list-none p-0 m-0">
                <li
                  v-for="ev in tick.events"
                  :key="ev.id"
                  :data-testid="`sim-tick-event-${ev.id}`"
                  class="mt-1 flex items-center justify-between gap-2 rounded-lg bg-nf-bg-0 px-3 py-2 text-[12px]"
                >
                  <span class="font-mono text-nf-text-dim">{{ ev.kind }}</span>
                  <button
                    type="button"
                    class="rounded border border-nf-border-strong px-2 py-0.5 text-nf-text hover:bg-nf-bg-2 focus-visible:nf-focus"
                    @click="$emit('inspect-event', ev.id)"
                  >
                    {{ t("simulation.viewCauses") }}
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * NF-WF-021D: Simulation run detail — status, lifecycle controls,
 * tick history with stateBefore/stateAfter diff view.
 *
 * Emits `inspect-event` when the author wants the causal chain for a
 * tick event (parent shows CausalChainView).
 */
import { ref, watch } from "vue";
import { useLocale } from "../../composables/useLocale";
import { useSimulationApi, type SimulationRunShape, type SimulationTickShape, type SimulationRunStatus } from "./simulationApi";
import { ApiError } from "../../composables/useApi";

const props = defineProps<{
  workspaceId: string;
  novelId: string;
  runId: string;
}>();

defineEmits<{
  (e: "back"): void;
  (e: "inspect-event", eventId: string): void;
  (e: "run-updated", run: SimulationRunShape): void;
}>();

const { t } = useLocale();
const simApi = useSimulationApi();

const run = ref<(SimulationRunShape & { scenario: unknown | null }) | null>(null);
const ticks = ref<SimulationTickShape[]>([]);
const loading = ref(true);
const loadError = ref(false);
const acting = ref(false);
const actionError = ref<string | null>(null);
const expandedTick = ref<number | null>(null);

async function load() {
  loading.value = true;
  loadError.value = false;
  try {
    run.value = await simApi.getRun(props.workspaceId, props.novelId, props.runId);
    // Load tick history (ticks 1..currentTick).
    ticks.value = [];
    for (let n = 1; n <= (run.value?.currentTick ?? 0); n++) {
      try {
        ticks.value.push(await simApi.getTick(props.workspaceId, props.novelId, props.runId, n));
      } catch {
        break;
      }
    }
  } catch {
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}

watch(() => props.runId, load, { immediate: true });

type Action = "configure" | "start" | "step" | "pause" | "resume" | "abort";

async function doAction(action: Action) {
  acting.value = true;
  actionError.value = null;
  try {
    let updated: SimulationRunShape;
    switch (action) {
      case "configure":
        updated = await simApi.configureRun(props.workspaceId, props.novelId, props.runId);
        break;
      case "start":
        updated = await simApi.startRun(props.workspaceId, props.novelId, props.runId);
        break;
      case "step": {
        const res = await simApi.stepRun(props.workspaceId, props.novelId, props.runId, 1);
        updated = res.run;
        ticks.value.push(...res.ticks);
        break;
      }
      case "pause":
        updated = await simApi.pauseRun(props.workspaceId, props.novelId, props.runId);
        break;
      case "resume":
        updated = await simApi.resumeRun(props.workspaceId, props.novelId, props.runId);
        break;
      case "abort":
        updated = await simApi.abortRun(props.workspaceId, props.novelId, props.runId);
        break;
    }
    run.value = { ...run.value!, ...updated };
  } catch (e) {
    actionError.value =
      e instanceof ApiError
        ? (t(`simulation.errors.${e.code}`) !== `simulation.errors.${e.code}`
            ? t(`simulation.errors.${e.code}`)
            : e.code)
        : String(e);
  } finally {
    acting.value = false;
  }
}

function toggleTick(n: number) {
  expandedTick.value = expandedTick.value === n ? null : n;
}

function formatJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function statusBadgeClass(status: SimulationRunStatus): string {
  switch (status) {
    case "RUNNING":
      return "border-nf-ok/40 bg-nf-ok/10 text-nf-ok";
    case "PAUSED_PROPOSAL":
      return "border-nf-accent-border bg-nf-accent-dim text-nf-accent-hi";
    case "PAUSED":
      return "border-nf-warn/40 bg-nf-warn-dim text-nf-warn";
    case "COMPLETED":
      return "border-nf-border-strong bg-nf-bg-3 text-nf-text-dim";
    case "ABORTED":
      return "border-nf-error/40 bg-nf-error/10 text-nf-error";
    default:
      return "border-nf-border-strong bg-nf-bg-3 text-nf-text-dim";
  }
}
</script>
