<template>
  <section
    aria-labelledby="whatif-title"
    class="rounded-xl border border-nf-border bg-nf-bg-1 p-5"
    data-testid="whatif-panel"
  >
    <div class="flex items-center justify-between gap-3">
      <div>
        <h2 id="whatif-title" class="text-[16px] font-semibold text-nf-text">
          {{ t("whatif.title") }}
        </h2>
        <p class="mt-1 text-[13px] text-nf-text-dim">
          {{ t("whatif.subtitle") }}
        </p>
      </div>
      <button
        type="button"
        data-testid="whatif-create-open"
        class="rounded-lg border border-nf-border-strong bg-nf-bg-3 px-4 py-2 text-[13px] font-semibold text-nf-text hover:bg-nf-bg-2 focus-visible:nf-focus"
        @click="showCreate = !showCreate"
      >
        {{ t("whatif.create") }}
      </button>
    </div>

    <!-- Create form -->
    <div v-if="showCreate" class="mt-4 rounded-lg border border-nf-border bg-nf-bg-2 p-4" data-testid="whatif-create-form">
      <h3 class="text-[14px] font-semibold text-nf-text">{{ t("whatif.createTitle") }}</h3>
      <p class="mt-1 text-[12px] text-nf-text-dim">{{ t("whatif.createHint") }}</p>

      <!-- Outline version picker (any status) -->
      <fieldset class="mt-3">
        <legend class="text-[13px] font-medium text-nf-text">{{ t("whatif.pickVersions") }}</legend>
        <p class="mt-1 text-[12px] text-nf-text-faint">{{ t("whatif.anyStatusHint") }}</p>
        <div v-if="versionsLoading" class="mt-2 text-[13px] text-nf-text-dim">{{ t("whatif.loadingVersions") }}</div>
        <ul v-else class="mt-2 space-y-1">
          <li v-for="v in outlineVersions" :key="v.id" class="flex items-center gap-2">
            <input
              :id="`whatif-version-${v.id}`"
              type="checkbox"
              :value="v.id"
              v-model="selectedVersions"
              class="h-4 w-4 rounded border-nf-border-strong focus-visible:nf-focus"
            />
            <label :for="`whatif-version-${v.id}`" class="text-[13px] text-nf-text">
              {{ t("whatif.versionLabel", { number: v.number }) }}
              <span class="ml-1 rounded bg-nf-bg-3 px-1.5 py-0.5 text-[11px] text-nf-text-dim">
                {{ v.status }}
              </span>
            </label>
          </li>
        </ul>
      </fieldset>

      <!-- Budget controls -->
      <div class="mt-3 grid grid-cols-2 gap-3">
        <div>
          <label for="whatif-max-chapters" class="block text-[13px] font-medium text-nf-text">
            {{ t("whatif.maxChapters") }}
          </label>
          <input
            id="whatif-max-chapters"
            v-model.number="maxChapters"
            type="number"
            min="1"
            max="10"
            class="mt-1 w-full rounded-lg border border-nf-border-strong bg-nf-bg-1 px-3 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
          />
        </div>
        <div>
          <label for="whatif-token-budget" class="block text-[13px] font-medium text-nf-text">
            {{ t("whatif.tokenBudget") }}
          </label>
          <input
            id="whatif-token-budget"
            v-model.number="tokenBudget"
            type="number"
            min="1"
            max="100000"
            step="1000"
            class="mt-1 w-full rounded-lg border border-nf-border-strong bg-nf-bg-1 px-3 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
          />
        </div>
      </div>

      <!-- Explicit confirmation (Invariant 3) -->
      <div class="mt-3 flex items-start gap-2">
        <input
          id="whatif-confirm"
          v-model="confirmed"
          type="checkbox"
          class="mt-0.5 h-4 w-4 rounded border-nf-border-strong focus-visible:nf-focus"
        />
        <label for="whatif-confirm" class="text-[13px] text-nf-text">
          {{ t("whatif.confirmLabel") }}
        </label>
      </div>

      <p v-if="createError" role="alert" class="mt-2 text-[13px] text-nf-error" data-testid="whatif-create-error">
        {{ createError }}
      </p>

      <div class="mt-3 flex gap-2">
        <button
          type="button"
          data-testid="whatif-create-submit"
          :disabled="!canCreate"
          class="rounded-lg bg-nf-accent px-4 py-2 text-[13px] font-semibold text-nf-accent-ink hover:opacity-90 disabled:opacity-50 focus-visible:nf-focus"
          @click="createAndRun"
        >
          {{ t("whatif.createAndRun") }}
        </button>
        <button
          type="button"
          class="rounded-lg border border-nf-border px-4 py-2 text-[13px] text-nf-text hover:bg-nf-bg-3 focus-visible:nf-focus"
          @click="showCreate = false"
        >
          {{ t("whatif.cancel") }}
        </button>
      </div>
    </div>

    <!-- Comparison list -->
    <div class="mt-4" data-testid="whatif-items">
      <p v-if="loadError" role="alert" class="text-[13px] text-nf-error" data-testid="whatif-list-error">
        {{ t("whatif.listError") }}
      </p>
      <p v-else-if="comparisons.length === 0 && !loading" class="text-[13px] text-nf-text-dim" data-testid="whatif-no-items">
        {{ t("whatif.noComparisons") }}
      </p>
      <ul v-else class="space-y-3">
        <li
          v-for="c in comparisons"
          :key="c.id"
          class="rounded-lg border border-nf-border bg-nf-bg-2 p-4"
          :data-testid="`whatif-item-${c.id}`"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="text-[13px] font-medium text-nf-text">
              {{ t("whatif.comparisonLabel", { count: c.outlineVersionIds.length }) }}
            </span>
            <span
              class="rounded px-2 py-0.5 text-[11px] font-medium"
              :class="statusClass(c.status)"
              :data-testid="`whatif-status-${c.id}`"
            >
              {{ t(`whatif.statusLabels.${c.status}`) }}
            </span>
          </div>

          <!-- Divergence timeline -->
          <div v-if="c.divergencePoints.length > 0" class="mt-3" data-testid="whatif-divergence-timeline">
            <h3 class="text-[12px] font-semibold uppercase tracking-wide text-nf-text-faint">
              {{ t("whatif.divergencePoints") }}
            </h3>
            <ul class="mt-1 space-y-1">
              <li
                v-for="(p, idx) in c.divergencePoints"
                :key="idx"
                class="text-[13px] text-nf-text"
              >
                <span class="font-medium">{{ t("whatif.tickLabel", { tick: p.tickNumber }) }}:</span>
                {{ p.summary }}
              </li>
            </ul>
          </div>
          <p v-else-if="c.status === 'COMPLETED'" class="mt-2 text-[13px] text-nf-text-dim">
            {{ t("whatif.noDivergence") }}
          </p>

          <!-- Budget -->
          <p class="mt-2 text-[12px] text-nf-text-faint" data-testid="whatif-budget">
            {{ t("whatif.budgetLabel", { spent: c.tokenSpent, budget: c.tokenBudget }) }}
          </p>

          <!-- NF-WF-024A F3: side-by-side trajectory view (007 diff patterns) -->
          <div v-if="c.status === 'COMPLETED' && c.runIds.length > 0" class="mt-3">
            <button
              type="button"
              class="rounded-lg border border-nf-border-strong bg-nf-bg-3 px-3 py-1.5 text-[12px] font-semibold text-nf-text hover:bg-nf-bg-2 focus-visible:nf-focus"
              :data-testid="`whatif-trajectories-${c.id}`"
              :aria-expanded="!!trajectoriesExpanded[c.id]"
              @click="toggleTrajectories(c)"
            >
              {{ trajectoriesExpanded[c.id] ? t("whatif.hideTrajectories") : t("whatif.viewTrajectories") }}
            </button>

            <div v-if="trajectoriesExpanded[c.id]" class="mt-2" data-testid="whatif-trajectory-view">
              <h3 class="text-[12px] font-semibold uppercase tracking-wide text-nf-text-faint">
                {{ t("whatif.trajectoryTitle") }}
              </h3>
              <p v-if="trajectoriesLoading[c.id]" class="mt-1 text-[13px] text-nf-text-dim">
                {{ t("whatif.trajectoryLoading") }}
              </p>
              <p
                v-else-if="trajectoriesError[c.id]"
                role="alert"
                class="mt-1 text-[13px] text-nf-error"
              >
                {{ trajectoriesError[c.id] }}
              </p>
              <div v-else class="mt-1 overflow-x-auto">
                <table class="w-full border-collapse text-[12px]">
                  <thead>
                    <tr>
                      <th
                        scope="col"
                        class="border border-nf-border bg-nf-bg-3 px-2 py-1 text-left font-semibold text-nf-text"
                      >
                        {{ t("whatif.tickLabel", { tick: "" }).trim() }}
                      </th>
                      <th
                        v-for="(runId, rIdx) in c.runIds"
                        :key="runId"
                        scope="col"
                        class="border border-nf-border bg-nf-bg-3 px-2 py-1 text-left font-semibold text-nf-text"
                      >
                        {{ versionLabelFor(c, rIdx) }}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="tickNum in tickNumbersFor(c)" :key="tickNum">
                      <th
                        scope="row"
                        class="border border-nf-border bg-nf-bg-2 px-2 py-1 text-left font-medium text-nf-text-dim"
                      >
                        {{ t("whatif.tickLabel", { tick: tickNum }) }}
                        <span
                          v-if="isDivergentTick(c, tickNum)"
                          class="ml-1 rounded bg-nf-warn/15 px-1.5 py-0.5 text-[10px] font-semibold text-nf-warn"
                        >
                          {{ t("whatif.divergentTick") }}
                        </span>
                      </th>
                      <td
                        v-for="runId in c.runIds"
                        :key="runId"
                        class="border border-nf-border px-2 py-1 align-top"
                        :class="isDivergentTick(c, tickNum) ? 'bg-nf-warn/10' : 'bg-nf-bg-1'"
                      >
                        <pre
                          v-if="getTickState(c.id, runId, tickNum)"
                          class="whitespace-pre-wrap break-words font-mono text-[11px] text-nf-text"
                        >{{ formatTickState(getTickState(c.id, runId, tickNum)!.stateAfter) }}</pre>
                        <span v-else class="text-nf-text-faint">—</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <button
            v-if="c.status === 'DRAFT' || c.status === 'READY'"
            type="button"
            class="mt-2 rounded-lg border border-nf-border-strong bg-nf-bg-3 px-3 py-1.5 text-[12px] font-semibold text-nf-text hover:bg-nf-bg-2 focus-visible:nf-focus"
            :data-testid="`whatif-run-${c.id}`"
            @click="runExisting(c.id)"
          >
            {{ t("whatif.run") }}
          </button>
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useLocale } from "../../composables/useLocale";
import { useWhatifApi, type OutlineVersionShape, type WhatifComparisonShape } from "./whatifApi";
import { useSimulationApi, type SimulationTickShape } from "./simulationApi";

const props = defineProps<{ workspaceId: string; novelId: string }>();
const { t } = useLocale();
const api = useWhatifApi(props.workspaceId, props.novelId);
const simApi = useSimulationApi();

const comparisons = ref<WhatifComparisonShape[]>([]);
const outlineVersions = ref<OutlineVersionShape[]>([]);
const loading = ref(true);
const versionsLoading = ref(true);
const loadError = ref("");
const showCreate = ref(false);
const selectedVersions = ref<string[]>([]);
const maxChapters = ref(3);
const tokenBudget = ref(20000);
const confirmed = ref(false);
const createError = ref("");

// --- NF-WF-024A F3: side-by-side trajectory view ---
// Per-comparison expansion state and fetched tick data.
// comparisonId -> runId -> ticks (ordered by tickNumber).
const trajectoriesExpanded = ref<Record<string, boolean>>({});
const trajectoriesLoading = ref<Record<string, boolean>>({});
const trajectoriesError = ref<Record<string, string>>({});
const trajectoryTicks = ref<Record<string, Record<string, SimulationTickShape[]>>>({});

function versionNumberFor(outlineVersionId: string): number | null {
  const v = outlineVersions.value.find((ov) => ov.id === outlineVersionId);
  return v ? v.number : null;
}

function versionLabelFor(c: WhatifComparisonShape, rIdx: number): string {
  const versionId = c.outlineVersionIds[rIdx] ?? "";
  const num = versionNumberFor(versionId);
  return num !== null ? t("whatif.versionLabel", { number: num }) : `Path ${rIdx + 1}`;
}

function tickNumbersFor(c: WhatifComparisonShape): number[] {
  const nums: number[] = [];
  for (let i = 1; i <= c.maxChapters; i++) nums.push(i);
  return nums;
}

function getTickState(
  comparisonId: string,
  runId: string,
  tickNumber: number,
): SimulationTickShape | null {
  const byRun = trajectoryTicks.value[comparisonId];
  const ticks = byRun?.[runId];
  return ticks?.find((tk) => tk.tickNumber === tickNumber) ?? null;
}

function isDivergentTick(c: WhatifComparisonShape, tickNumber: number): boolean {
  return c.divergencePoints.some((p) => p.tickNumber === tickNumber);
}

function formatTickState(state: unknown): string {
  try {
    const s = JSON.stringify(state, null, 2);
    // Keep cells readable: truncate very large states.
    return s.length > 800 ? `${s.slice(0, 800)}…` : s;
  } catch {
    return String(state);
  }
}

async function toggleTrajectories(c: WhatifComparisonShape) {
  const id = c.id;
  trajectoriesExpanded.value[id] = !trajectoriesExpanded.value[id];
  if (!trajectoriesExpanded.value[id]) return;
  // Already loaded?
  if (trajectoryTicks.value[id]) return;
  trajectoriesLoading.value[id] = true;
  trajectoriesError.value[id] = "";
  try {
    const byRun: Record<string, SimulationTickShape[]> = {};
    for (const runId of c.runIds) {
      const ticks: SimulationTickShape[] = [];
      for (let n = 1; n <= c.maxChapters; n++) {
        try {
          const tick = await simApi.getTick(props.workspaceId, props.novelId, runId, n);
          ticks.push(tick);
        } catch {
          // A missing tick (e.g., incomplete run) ends the trajectory
          // for this path — not an error for the whole view.
          break;
        }
      }
      byRun[runId] = ticks;
    }
    trajectoryTicks.value[id] = byRun;
  } catch {
    trajectoriesError.value[id] = t("whatif.trajectoryError");
  } finally {
    trajectoriesLoading.value[id] = false;
  }
}

const canCreate = computed(
  () => selectedVersions.value.length >= 2 && confirmed.value && !createError.value,
);

function statusClass(status: string): string {
  switch (status) {
    case "COMPLETED":
      return "bg-nf-ok/10 text-nf-ok";
    case "RUNNING":
      return "bg-nf-info/10 text-nf-info";
    case "INCOMPLETE_BUDGET_EXHAUSTED":
      return "bg-nf-warn/10 text-nf-warn";
    case "ABORTED":
      return "bg-nf-error/10 text-nf-error";
    default:
      return "bg-nf-bg-3 text-nf-text-dim";
  }
}

async function load() {
  loading.value = true;
  loadError.value = "";
  try {
    comparisons.value = await api.listComparisons();
  } catch {
    loadError.value = t("whatif.listError");
  } finally {
    loading.value = false;
  }
}

async function loadVersions() {
  versionsLoading.value = true;
  try {
    outlineVersions.value = await api.listOutlineVersions();
  } catch {
    outlineVersions.value = [];
  } finally {
    versionsLoading.value = false;
  }
}

async function createAndRun() {
  createError.value = "";
  try {
    const comparison = await api.createComparison({
      outlineVersionIds: selectedVersions.value,
      maxChapters: maxChapters.value,
      tokenBudget: tokenBudget.value,
      confirmed: true,
    });
    const result = await api.runComparison(comparison.id);
    comparisons.value.unshift(result);
    showCreate.value = false;
    selectedVersions.value = [];
    confirmed.value = false;
  } catch (e) {
    createError.value = e instanceof Error ? e.message : t("whatif.createError");
  }
}

async function runExisting(comparisonId: string) {
  try {
    const result = await api.runComparison(comparisonId);
    const idx = comparisons.value.findIndex((c) => c.id === comparisonId);
    if (idx >= 0) comparisons.value[idx] = result;
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : t("whatif.listError");
  }
}

onMounted(async () => {
  await Promise.all([load(), loadVersions()]);
});
</script>
