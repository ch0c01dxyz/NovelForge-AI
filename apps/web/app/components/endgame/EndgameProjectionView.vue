<!--
  NF-WF-022C: endgame projection view — the Simulation tab of the endgame
  panel.

  "What if thread X stays OPEN?" The author picks a close plan (threads to
  close, in order) from the 022A closure ledger; the component builds a 021
  scenario with the pure `buildEndgameScenario` helper, drives the 021A run
  lifecycle routes (create → configure → start → step — no new API routes
  per the 022C contract), then interprets the final tick with
  `interpretEndgameProjection` and shows which MUSTs close under the
  scenario plus the projected gate verdict.

  READ-ONLY on the ledger: the projection never writes to it.

  Dependencies (documented):
  - 022A `GET .../endgame/ledger` (pinned route; 022A implements in
    parallel) — ledger entries.
  - 021A simulation routes — the projection run itself.
  - 020B branch list route — branch picker.
  - `endgame:read` gates the view (022A's route layer); running the
    projection additionally requires `simulation:manage` (enforced
    server-side by 021A; failures surface as inline errors).

  i18n: `endgame.projection.*` (en+id parity). Status badge labels live
  under `endgame.projection.statusLabels.*` (not `endgame.ledger.*`,
  which is 022A's scope) to avoid key collisions when 022A lands.
-->
<template>
  <section
    aria-labelledby="endgame-projection-title"
    class="rounded-xl border border-nf-border bg-nf-bg-1 p-5"
    data-testid="endgame-projection"
  >
    <h2 id="endgame-projection-title" class="text-[16px] font-semibold text-nf-text">
      {{ t("endgame.projection.title") }}
    </h2>
    <p class="mt-1 text-[13px] text-nf-text-dim">
      {{ t("endgame.projection.subtitle") }}
    </p>

    <p v-if="loadError" role="alert" class="mt-3 text-[13px] text-red-300" data-testid="endgame-projection-error">
      {{ loadError }}
    </p>

    <div v-if="loading && !ledger" class="mt-3 text-[13px] text-nf-text-dim">
      {{ t("endgame.projection.loading") }}
    </div>

    <template v-if="ledger">
      <div
        v-if="ledger.length === 0"
        class="mt-3 text-[13px] text-nf-text-dim"
        data-testid="endgame-projection-empty"
      >
        {{ t("endgame.projection.noEntries") }}
      </div>

      <template v-else>
        <!-- Close plan picker -->
        <fieldset class="mt-4" :disabled="running">
          <legend class="text-[13px] font-medium text-nf-text">
            {{ t("endgame.projection.closePlanLabel") }}
          </legend>
          <p class="mt-1 text-[12px] text-nf-text-dim">
            {{ t("endgame.projection.closePlanHint") }}
          </p>
          <ul class="mt-2 space-y-1.5">
            <li
              v-for="entry in selectableEntries"
              :key="entry.threadId"
              class="flex items-center gap-2 rounded-lg border border-nf-border bg-nf-bg-2 px-3 py-2"
            >
              <input
                :id="`endgame-plan-${entry.threadId}`"
                v-model="closePlan"
                type="checkbox"
                :value="entry.threadId"
                :data-testid="`endgame-plan-${entry.threadId}`"
                class="h-4 w-4 accent-nf-accent"
              />
              <label :for="`endgame-plan-${entry.threadId}`" class="flex flex-1 flex-wrap items-center gap-2 text-[13px]">
                <span class="font-mono text-[12px] text-nf-text">{{ entry.threadId }}</span>
                <span
                  class="rounded-full border px-2 py-0.5 text-[11px] font-medium"
                  :class="statusClass(entry.status)"
                >
                  {{ t(`endgame.projection.statusLabels.${entry.status}`) }}
                </span>
                <span v-if="entry.closed" class="text-[11px] text-nf-text-dim">
                  {{ t("endgame.projection.alreadyClosed") }}
                </span>
              </label>
            </li>
          </ul>
        </fieldset>

        <!-- Branch picker + run -->
        <div class="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label for="endgame-projection-branch" class="block text-[12px] font-medium text-nf-text-dim">
              {{ t("endgame.projection.branchLabel") }}
            </label>
            <select
              id="endgame-projection-branch"
              v-model="branchId"
              :disabled="running"
              class="mt-1 rounded-lg border border-nf-border bg-nf-bg-2 px-3 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
              data-testid="endgame-projection-branch"
            >
              <option value="">{{ t("endgame.projection.noBranch") }}</option>
              <option v-for="b in branches" :key="b.id" :value="b.id">{{ b.name }}</option>
            </select>
          </div>
          <button
            type="button"
            :disabled="running"
            class="rounded-lg bg-nf-accent px-4 py-2 text-[13px] font-semibold text-nf-accent-ink focus-visible:nf-focus disabled:opacity-50"
            data-testid="endgame-projection-run"
            @click="runProjection"
          >
            {{ running ? t("endgame.projection.running") : t("endgame.projection.runButton") }}
          </button>
        </div>

        <!-- Results -->
        <div v-if="result" class="mt-5 border-t border-nf-border pt-4" data-testid="endgame-projection-result">
          <div
            class="rounded-lg border px-4 py-3"
            :class="result.projectedGate === 'READY' ? 'border-green-700 bg-green-950/40' : 'border-amber-700 bg-amber-950/40'"
            data-testid="endgame-projection-gate"
          >
            <p class="text-[14px] font-semibold" :class="result.projectedGate === 'READY' ? 'text-green-300' : 'text-amber-300'">
              {{
                result.projectedGate === "READY"
                  ? t("endgame.projection.gateReady")
                  : t("endgame.projection.gateBlocked")
              }}
            </p>
            <p class="mt-1 text-[12px] text-nf-text-dim">
              {{ t("endgame.projection.ticksRun", { n: result.ticksRun }) }}
            </p>
          </div>

          <div class="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <h3 class="text-[13px] font-semibold text-nf-text">
                {{ t("endgame.projection.closedMusts") }} ({{ result.closedMusts.length }})
              </h3>
              <ul class="mt-2 space-y-1">
                <li
                  v-for="e in result.closedMusts"
                  :key="e.threadId"
                  class="text-[13px] text-nf-text-dim"
                  :data-testid="`endgame-closed-must-${e.threadId}`"
                >
                  <span class="font-mono text-[12px]">{{ e.threadId }}</span>
                </li>
                <li v-if="result.closedMusts.length === 0" class="text-[12px] text-nf-text-dim">—</li>
              </ul>
            </div>
            <div>
              <h3 class="text-[13px] font-semibold text-nf-text">
                {{ t("endgame.projection.openMusts") }} ({{ result.openMusts.length }})
              </h3>
              <ul class="mt-2 space-y-1">
                <li
                  v-for="e in result.openMusts"
                  :key="e.threadId"
                  class="text-[13px] text-amber-300"
                  :data-testid="`endgame-open-must-${e.threadId}`"
                >
                  <span class="font-mono text-[12px]">{{ e.threadId }}</span>
                </li>
                <li v-if="result.openMusts.length === 0" class="text-[12px] text-nf-text-dim">—</li>
              </ul>
            </div>
          </div>
          <p class="mt-3 text-[12px] text-nf-text-dim">
            {{ t("endgame.projection.projectionNote") }}
          </p>
        </div>
      </template>
    </template>
  </section>
</template>

<script setup lang="ts">
/**
 * Endgame projection view (022C). See the template comment for the
 * documented dependencies and design decisions.
 */
import { computed, onMounted, ref } from "vue";
import { useLocale } from "../../composables/useLocale";
import { ApiError } from "../../composables/useApi";
import { useEndgameApi } from "./endgameApi";
import {
  buildEndgameScenario,
  interpretEndgameProjection,
  type EndgameLedgerEntry,
  type EndgameProjectionResult,
} from "@novelforge/story-simulation";

const props = defineProps<{
  workspaceId: string;
  novelId: string;
}>();

const { t } = useLocale();
const endgameApi = useEndgameApi();

const ledger = ref<EndgameLedgerEntry[] | null>(null);
const branches = ref<Array<{ id: string; name: string }>>([]);
const closePlan = ref<string[]>([]);
const branchId = ref("");
const running = ref(false);
const loading = ref(true);
const loadError = ref<string | null>(null);
const result = ref<EndgameProjectionResult | null>(null);

const selectableEntries = computed(() =>
  (ledger.value ?? []).filter((e) => !e.closed),
);

function statusClass(status: EndgameLedgerEntry["status"]): string {
  switch (status) {
    case "MUST":
      return "border-red-700 text-red-300";
    case "SHOULD":
      return "border-amber-700 text-amber-300";
    case "MAY":
      return "border-sky-700 text-sky-300";
    case "OPEN":
      return "border-nf-border-strong text-nf-text-dim";
    case "SEQUEL":
      return "border-violet-700 text-violet-300";
  }
}

function toErrorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const key = `endgame.projection.errors.${e.code}`;
    const translated = t(key);
    return translated !== key ? translated : e.code;
  }
  return e instanceof Error ? e.message : String(e);
}

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = null;
  try {
    const [entries, branchOptions] = await Promise.all([
      endgameApi.fetchLedger(props.workspaceId, props.novelId),
      endgameApi.fetchBranches(props.workspaceId, props.novelId).catch(() => []),
    ]);
    ledger.value = entries;
    branches.value = branchOptions;
  } catch (e) {
    loadError.value = toErrorMessage(e);
  } finally {
    loading.value = false;
  }
}

async function runProjection(): Promise<void> {
  if (running.value || !ledger.value) return;
  running.value = true;
  loadError.value = null;
  result.value = null;
  try {
    // Pure scenario build (deterministic; throws INVALID_INPUT on a bad plan).
    const scenario = buildEndgameScenario(ledger.value, {
      closePlan: closePlan.value,
    });

    // Drive the 021A lifecycle — no new API routes (022C contract §Routes).
    const run = await endgameApi.createProjectionRun(
      props.workspaceId,
      props.novelId,
      {
        ...(branchId.value ? { branchId: branchId.value } : {}),
        scenario: {
          initialState: scenario.initialState,
          injections: scenario.injections,
          seed: scenario.seed,
          maxTicks: scenario.maxTicks,
        },
      },
    );
    // configure surfaces 021A prerequisites: NO_BRANCH / NO_SNAPSHOT /
    // MODULE_NOT_ENABLED (the 022C acceptance's clean-400 path).
    await endgameApi.configureRun(props.workspaceId, props.novelId, run.id);
    await endgameApi.startRun(props.workspaceId, props.novelId, run.id);
    const ticks = await endgameApi.stepRun(
      props.workspaceId,
      props.novelId,
      run.id,
      scenario.maxTicks,
    );

    const lastTick = ticks[ticks.length - 1];
    if (!lastTick) throw new Error("empty projection run");
    result.value = interpretEndgameProjection(
      lastTick.stateAfter as Record<string, unknown>,
      ledger.value,
      ticks.length,
    );
  } catch (e) {
    // buildEndgameScenario throws a bare Error("INVALID_INPUT: ...");
    // normalize it through the same i18n path as ApiError codes.
    if (e instanceof Error && e.message.startsWith("INVALID_INPUT")) {
      loadError.value = toErrorMessage(new ApiError("INVALID_INPUT", 400));
    } else {
      loadError.value = toErrorMessage(e);
    }
  } finally {
    running.value = false;
  }
}

onMounted(load);
</script>
