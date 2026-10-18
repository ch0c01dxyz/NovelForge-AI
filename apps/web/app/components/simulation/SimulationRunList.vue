<template>
  <section
    aria-labelledby="sim-run-list-title"
    class="rounded-xl border border-nf-border bg-nf-bg-1 p-5"
    data-testid="sim-run-list"
  >
    <div class="flex items-center justify-between gap-3">
      <h2 id="sim-run-list-title" class="text-[16px] font-semibold text-nf-text">
        {{ t("simulation.runs") }}
      </h2>
      <button
        type="button"
        data-testid="sim-run-create-open"
        class="rounded-lg border border-nf-border-strong bg-nf-bg-3 px-4 py-2 text-[13px] font-semibold text-nf-text hover:bg-nf-bg-2 focus-visible:nf-focus"
        @click="$emit('create')"
      >
        {{ t("simulation.create") }}
      </button>
    </div>

    <p v-if="loadError" role="alert" class="mt-3 text-[13px] text-nf-error" data-testid="sim-run-list-error">
      {{ t("simulation.listError") }}
    </p>

    <!-- Status filter -->
    <div class="mt-4 flex flex-wrap items-center gap-2" role="group" :aria-label="t('simulation.status')">
      <label class="text-[12px] text-nf-text-faint" for="sim-status-filter">
        {{ t("simulation.status") }}
      </label>
      <select
        id="sim-status-filter"
        data-testid="sim-status-filter"
        v-model="statusFilter"
        class="rounded-lg border border-nf-border-strong bg-nf-bg-2 px-3 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
      >
        <option value="">{{ t("simulation.filterAll") }}</option>
        <option v-for="s in statuses" :key="s" :value="s">
          {{ t(`simulation.statusLabels.${s}`) }}
        </option>
      </select>
    </div>

    <div class="mt-4" data-testid="sim-run-items">
      <p v-if="filteredRuns.length === 0 && !loading" class="text-[13px] text-nf-text-dim" data-testid="sim-no-runs">
        {{ t("simulation.noRuns") }}
      </p>
      <ul v-else :aria-label="t('simulation.runs')" class="list-none p-0 m-0">
        <li
          v-for="run in filteredRuns"
          :key="run.id"
          :data-testid="`sim-run-${run.id}`"
          class="mt-2 rounded-lg border border-nf-border bg-nf-bg-2 p-4"
        >
          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0">
              <h3 class="flex items-center gap-2 text-[14px] font-semibold text-nf-text">
                <span class="truncate font-mono text-[13px]">{{ run.id.slice(0, 8) }}</span>
                <span
                  :data-testid="`sim-run-status-${run.id}`"
                  class="rounded-full border px-2 py-0.5 text-[11px] font-medium"
                  :class="statusBadgeClass(run.status)"
                >
                  {{ t(`simulation.statusLabels.${run.status}`) }}
                </span>
              </h3>
              <dl class="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-nf-text-dim">
                <div class="flex gap-1">
                  <dt>{{ t("simulation.currentTick") }}:</dt>
                  <dd class="font-mono tabular-nums">{{ run.currentTick }}/{{ run.maxTicks }}</dd>
                </div>
                <div v-if="run.branchId" class="flex gap-1">
                  <dt>{{ t("simulation.branch") }}:</dt>
                  <dd class="font-mono">{{ run.branchId.slice(0, 8) }}</dd>
                </div>
                <div class="flex gap-1">
                  <dt>{{ t("simulation.seed") }}:</dt>
                  <dd class="font-mono">{{ run.seed || "—" }}</dd>
                </div>
              </dl>
            </div>
            <button
              type="button"
              :data-testid="`sim-run-open-${run.id}`"
              class="shrink-0 rounded-lg border border-nf-border-strong px-3 py-1.5 text-[13px] text-nf-text hover:bg-nf-bg-3 focus-visible:nf-focus"
              @click="$emit('select', run.id)"
            >
              {{ t("simulation.open") }}
            </button>
          </div>
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * NF-WF-021D: Simulation run list with status filter.
 *
 * §15 foundational design (stone surfaces, orange restricted to primary
 * CTA). All strings via i18n (en+id). Emits `create` and `select` — the
 * parent page owns data fetching and navigation.
 */
import { computed, ref } from "vue";
import { useLocale } from "../../composables/useLocale";
import type { SimulationRunShape, SimulationRunStatus } from "./simulationApi";

const props = defineProps<{
  runs: SimulationRunShape[];
  loading: boolean;
  loadError: boolean;
}>();

defineEmits<{
  (e: "create"): void;
  (e: "select", runId: string): void;
}>();

const { t } = useLocale();

const statuses: SimulationRunStatus[] = [
  "DRAFT",
  "CONFIGURED",
  "RUNNING",
  "PAUSED",
  "PAUSED_PROPOSAL",
  "COMPLETED",
  "ABORTED",
];

const statusFilter = ref<string>("");

const filteredRuns = computed(() =>
  statusFilter.value
    ? props.runs.filter((r) => r.status === statusFilter.value)
    : props.runs,
);

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
