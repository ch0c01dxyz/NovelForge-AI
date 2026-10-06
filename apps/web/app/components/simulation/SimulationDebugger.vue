<template>
  <section
    aria-labelledby="sim-debug-title"
    class="rounded-xl border border-nf-border bg-nf-bg-1 p-5"
    data-testid="sim-debugger"
  >
    <div class="flex items-center justify-between gap-3">
      <h2 id="sim-debug-title" class="text-[16px] font-semibold text-nf-text">
        {{ t("simulation.debugger.title") }}
        <span v-if="runId" class="font-mono text-[13px] text-nf-text-dim">{{ runId.slice(0, 8) }}</span>
      </h2>
      <span
        v-if="run"
        data-testid="sim-debug-status"
        class="rounded-full border px-2.5 py-1 text-[12px] font-medium"
        :class="statusBadgeClass(run.status)"
      >
        {{ t(`simulation.statusLabels.${run.status}`) }}
      </span>
    </div>

    <p v-if="!runId" class="mt-3 text-[13px] text-nf-text-dim" data-testid="sim-debug-no-run">
      {{ t("simulation.debugger.noRun") }}
    </p>

    <p v-if="loadError" role="alert" class="mt-3 text-[13px] text-red-300" data-testid="sim-debug-error">
      {{ t("simulation.loadError") }}
    </p>

    <div v-if="run" class="mt-4 space-y-6">
      <!-- Pause reason banner -->
      <div
        v-if="run.status === 'PAUSED' && pauseReason"
        role="status"
        data-testid="sim-debug-pause-reason"
        class="rounded-lg border border-nf-warn/40 bg-nf-warn-dim px-4 py-2.5 text-[13px] text-nf-warn"
      >
        {{ t("simulation.debugger.pauseReason", { reason: pauseReason }) }}
      </div>

      <!-- Debug step -->
      <div class="flex flex-wrap items-center gap-2">
        <button
          v-if="run.status === 'RUNNING' || run.status === 'PAUSED'"
          type="button"
          data-testid="sim-debug-step"
          :disabled="acting"
          class="rounded-lg bg-nf-accent px-3.5 py-1.5 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus disabled:opacity-50"
          @click="doDebugStep"
        >
          {{ acting ? t("simulation.debugger.stepping") : t("simulation.debugger.debugStep") }}
        </button>
        <span v-if="lastHit" data-testid="sim-debug-hit" class="text-[13px] text-nf-accent-hi">
          {{ t("simulation.debugger.breakpointHit") }}: {{ lastHit.reason }}
        </span>
      </div>

      <p v-if="actionError" role="alert" class="text-[13px] text-red-300" data-testid="sim-debug-action-error">
        {{ actionError }}
      </p>

      <!-- Breakpoints -->
      <div>
        <h3 class="text-[14px] font-semibold text-nf-text">{{ t("simulation.debugger.breakpoints") }}</h3>
        <div v-if="breakpoints.length === 0" class="mt-2 text-[13px] text-nf-text-dim" data-testid="sim-debug-no-bps">
          {{ t("simulation.debugger.noBreakpoints") }}
        </div>
        <ul v-else class="mt-2 list-none p-0 m-0 space-y-2">
          <li
            v-for="bp in breakpoints"
            :key="bp.id"
            :data-testid="`sim-debug-bp-${bp.id}`"
            class="flex items-center justify-between gap-2 rounded-lg border border-nf-border bg-nf-bg-2 px-3 py-2"
          >
            <span class="text-[13px] text-nf-text">
              <span class="rounded border border-nf-border-strong px-1.5 py-0.5 text-[11px] font-mono">
                {{ t(`simulation.debugger.kinds.${bp.kind}`) }}
              </span>
              <span class="ml-2 font-mono text-[12px] text-nf-text-dim">{{ describeBreakpoint(bp) }}</span>
              <span v-if="bp.watch" class="ml-2 text-[11px] text-nf-accent-hi">watch</span>
              <span v-if="!bp.enabled" class="ml-2 text-[11px] text-nf-text-faint">disabled</span>
            </span>
            <button
              type="button"
              :data-testid="`sim-debug-bp-del-${bp.id}`"
              class="rounded border border-nf-border-strong px-2 py-0.5 text-[12px] text-nf-text hover:bg-nf-bg-3 focus-visible:nf-focus"
              @click="deleteBp(bp.id)"
            >
              {{ t("simulation.debugger.delete") }}
            </button>
          </li>
        </ul>

        <!-- Add breakpoint form -->
        <div class="mt-3 rounded-lg border border-nf-border bg-nf-bg-2 p-3">
          <h4 class="text-[13px] font-semibold text-nf-text">{{ t("simulation.debugger.addBreakpoint") }}</h4>
          <div class="mt-2 grid gap-2 md:grid-cols-2">
            <label class="text-[12px] text-nf-text-dim">
              {{ t("simulation.debugger.kind") }}
              <select
                v-model="newKind"
                data-testid="sim-debug-new-kind"
                class="mt-1 w-full rounded-lg border border-nf-border-strong bg-nf-bg-0 px-2 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
              >
                <option value="TICK">{{ t("simulation.debugger.kinds.TICK") }}</option>
                <option value="PREDICATE">{{ t("simulation.debugger.kinds.PREDICATE") }}</option>
                <option value="ON_PROPOSAL">{{ t("simulation.debugger.kinds.ON_PROPOSAL") }}</option>
              </select>
            </label>
            <label v-if="newKind === 'TICK'" class="text-[12px] text-nf-text-dim">
              {{ t("simulation.debugger.tickNumber") }}
              <input
                v-model.number="newTickNumber"
                type="number"
                min="1"
                data-testid="sim-debug-new-tick"
                class="mt-1 w-full rounded-lg border border-nf-border-strong bg-nf-bg-0 px-2 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
              />
            </label>
            <template v-if="newKind === 'PREDICATE'">
              <label class="text-[12px] text-nf-text-dim">
                {{ t("simulation.debugger.path") }}
                <input
                  v-model="newPath"
                  type="text"
                  :placeholder="t('simulation.debugger.pathPlaceholder')"
                  data-testid="sim-debug-new-path"
                  class="mt-1 w-full rounded-lg border border-nf-border-strong bg-nf-bg-0 px-2 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
                />
              </label>
              <label class="text-[12px] text-nf-text-dim">
                {{ t("simulation.debugger.op") }}
                <select
                  v-model="newOp"
                  data-testid="sim-debug-new-op"
                  class="mt-1 w-full rounded-lg border border-nf-border-strong bg-nf-bg-0 px-2 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
                >
                  <option value=">">&gt;</option>
                  <option value="<">&lt;</option>
                  <option value=">=">&gt;=</option>
                  <option value="<=">&lt;=</option>
                  <option value="==">==</option>
                  <option value="!=">!=</option>
                </select>
              </label>
              <label class="text-[12px] text-nf-text-dim">
                {{ t("simulation.debugger.value") }}
                <input
                  v-model="newValue"
                  type="text"
                  :placeholder="t('simulation.debugger.valuePlaceholder')"
                  data-testid="sim-debug-new-value"
                  class="mt-1 w-full rounded-lg border border-nf-border-strong bg-nf-bg-0 px-2 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
                />
              </label>
              <label class="flex items-center gap-2 text-[12px] text-nf-text-dim">
                <input
                  v-model="newWatch"
                  type="checkbox"
                  data-testid="sim-debug-new-watch"
                  class="rounded border-nf-border-strong"
                />
                {{ t("simulation.debugger.watch") }}
              </label>
            </template>
          </div>
          <button
            type="button"
            data-testid="sim-debug-new-create"
            :disabled="acting"
            class="mt-3 rounded-lg bg-nf-accent px-3.5 py-1.5 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus disabled:opacity-50"
            @click="createBp"
          >
            {{ t("simulation.debugger.create") }}
          </button>
        </div>
      </div>

      <!-- Watch strip -->
      <div>
        <h3 class="text-[14px] font-semibold text-nf-text">{{ t("simulation.debugger.watchStrip") }}</h3>
        <div v-if="watches.length === 0" class="mt-2 text-[13px] text-nf-text-dim" data-testid="sim-debug-no-watches">
          {{ t("simulation.debugger.noWatches") }}
        </div>
        <div v-else class="mt-2 space-y-3">
          <div
            v-for="w in watches"
            :key="w.breakpointId"
            :data-testid="`sim-debug-watch-${w.breakpointId}`"
            class="rounded-lg border border-nf-border bg-nf-bg-2 p-3"
          >
            <div class="font-mono text-[12px] text-nf-text-dim">{{ w.path }}</div>
            <div class="mt-2 flex flex-wrap gap-1" role="img" :aria-label="`watch ${w.path}`">
              <span
                v-for="v in w.values"
                :key="v.tickNumber"
                :title="`tick ${v.tickNumber}: ${JSON.stringify(v.value)}`"
                class="rounded bg-nf-bg-0 px-1.5 py-0.5 font-mono text-[11px] text-nf-text tabular-nums"
              >
                {{ v.tickNumber }}:{{ formatWatchValue(v.value) }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Time-travel replay -->
      <div>
        <h3 class="text-[14px] font-semibold text-nf-text">{{ t("simulation.debugger.replay") }}</h3>
        <p class="mt-1 text-[12px] text-nf-text-dim">{{ t("simulation.debugger.replayHint") }}</p>
        <div class="mt-2 flex flex-wrap items-center gap-2">
          <label class="text-[13px] text-nf-text-dim">
            {{ t("simulation.debugger.replayTo") }}
            <input
              v-model.number="replayTick"
              type="range"
              :min="1"
              :max="Math.max(1, run.currentTick)"
              data-testid="sim-debug-replay-slider"
              class="mx-2 align-middle"
              :aria-label="t('simulation.debugger.replayTo')"
            />
            <span class="font-mono tabular-nums text-nf-text">{{ replayTick }}</span>
          </label>
          <button
            type="button"
            data-testid="sim-debug-replay-go"
            :disabled="acting || run.currentTick === 0"
            class="rounded-lg border border-nf-border-strong px-3.5 py-1.5 text-[13px] text-nf-text hover:bg-nf-bg-2 focus-visible:nf-focus disabled:opacity-50"
            @click="doReplay"
          >
            {{ acting ? t("simulation.debugger.replaying") : t("simulation.debugger.replayButton") }}
          </button>
        </div>
        <div
          v-if="replayResult"
          data-testid="sim-debug-fidelity"
          role="status"
          class="mt-2 rounded-lg border px-3 py-2 text-[13px]"
          :class="
            replayResult.fidelity.matches
              ? 'border-nf-ok/40 bg-nf-ok/10 text-nf-ok'
              : 'border-red-400/40 bg-red-400/10 text-red-300'
          "
        >
          {{
            replayResult.fidelity.matches
              ? t("simulation.debugger.fidelityOk")
              : t("simulation.debugger.fidelityFail")
          }}
        </div>
      </div>

      <!-- Event trace -->
      <div>
        <h3 class="text-[14px] font-semibold text-nf-text">{{ t("simulation.debugger.eventTrace") }}</h3>
        <p class="mt-1 text-[12px] text-nf-text-dim">{{ t("simulation.debugger.eventTraceHint") }}</p>
        <!-- F2 fix: event picker makes the trace panel reachable from the UI. -->
        <div v-if="!traceEventId" class="mt-2">
          <p v-if="tickEvents.length === 0" class="text-[13px] text-nf-text-dim" data-testid="sim-debug-no-trace">
            {{ tickEventsTick > 0 ? t("simulation.debugger.noTickEvents") : t("simulation.debugger.selectEvent") }}
          </p>
          <div v-else>
            <p class="text-[12px] font-medium text-nf-text-dim" data-testid="sim-debug-tick-events-label">
              {{ t("simulation.debugger.tickEvents", { tick: tickEventsTick }) }}
            </p>
            <ul class="mt-1.5 list-none p-0 m-0 space-y-1.5">
              <li
                v-for="ev in tickEvents"
                :key="ev.id"
                :data-testid="`sim-debug-event-${ev.id}`"
                class="flex items-center justify-between gap-2 rounded-lg border border-nf-border bg-nf-bg-2 px-3 py-1.5"
              >
                <span class="text-[13px] text-nf-text">
                  <span class="rounded border border-nf-border-strong px-1.5 py-0.5 text-[11px] font-mono">
                    {{ ev.kind }}
                  </span>
                  <span v-if="ev.entityId" class="ml-2 font-mono text-[12px] text-nf-text-dim">{{ ev.entityId }}</span>
                </span>
                <button
                  type="button"
                  :data-testid="`sim-debug-trace-${ev.id}`"
                  class="rounded border border-nf-border-strong px-2 py-0.5 text-[12px] text-nf-accent-hi hover:bg-nf-bg-3 focus-visible:nf-focus"
                  @click="setTraceEvent(ev.id)"
                >
                  {{ t("simulation.debugger.traceButton") }}
                </button>
              </li>
            </ul>
          </div>
        </div>
        <div v-if="traceEventId" class="mt-2">
          <button
            type="button"
            data-testid="sim-debug-trace-back"
            class="mb-2 rounded border border-nf-border-strong px-2 py-0.5 text-[12px] text-nf-text hover:bg-nf-bg-2 focus-visible:nf-focus"
            @click="traceEventId = null"
          >
            ← {{ t("simulation.debugger.tickEvents", { tick: tickEventsTick }) }}
          </button>
          <CausalChainView
            :workspace-id="workspaceId"
            :novel-id="novelId"
            :run-id="runId!"
            :event-id="traceEventId"
            @close="traceEventId = null"
          />
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * NF-WF-024B: Simulation debugger — breakpoints, watch, time-travel
 * replay, event trace. Built on the 021D Simulation Center.
 *
 * 021D already provides step/pause/resume and tick state diffs. This adds
 * what a stepper cannot do: stop *on condition* (breakpoints), observe
 * *across* ticks (watch strip), go *backwards* (deterministic replay),
 * and walk *causality* (event trace via 021B).
 *
 * Invariant 5: the debugger never mutates history. Breakpoints pause;
 * watch observes; replay is non-persisting.
 */
import { ref, watch } from "vue";
import { useLocale } from "../../composables/useLocale";
import {
  useSimulationApi,
  type BreakpointShape,
  type BreakpointKind,
  type BreakpointHit,
  type ReplayResult,
  type WatchValue,
  type SimulationEventShape,
  type SimulationRunShape,
  type SimulationRunStatus,
} from "./simulationApi";
import { ApiError } from "../../composables/useApi";
import CausalChainView from "./CausalChainView.vue";

const props = defineProps<{
  workspaceId: string;
  novelId: string;
  runId: string | null;
}>();

const emit = defineEmits<{
  (e: "run-updated", run: SimulationRunShape): void;
}>();

const { t } = useLocale();
const simApi = useSimulationApi();

const run = ref<SimulationRunShape | null>(null);
const pauseReason = ref<string | null>(null);
const breakpoints = ref<BreakpointShape[]>([]);
const watches = ref<WatchValue[]>([]);
const loading = ref(false);
const loadError = ref(false);
const acting = ref(false);
const actionError = ref<string | null>(null);
const lastHit = ref<BreakpointHit | null>(null);

// New breakpoint form.
const newKind = ref<BreakpointKind>("TICK");
const newTickNumber = ref(1);
const newPath = ref("");
type PredicateOp = ">" | "<" | ">=" | "<=" | "==" | "!=";
const newOp = ref<PredicateOp>(">");
const newValue = ref("");
const newWatch = ref(false);

// Replay.
const replayTick = ref(1);
const replayResult = ref<ReplayResult | null>(null);

// Event trace.
const traceEventId = ref<string | null>(null);
// NF-WF-024B F2 fix: event picker — fetch the current tick's events so the
// trace panel is reachable from the UI (previously setTraceEvent was only
// exposed for the parent and never called).
const tickEvents = ref<SimulationEventShape[]>([]);
const tickEventsTick = ref<number>(0);

async function load() {
  if (!props.runId) {
    run.value = null;
    return;
  }
  loading.value = true;
  loadError.value = false;
  try {
    const r = await simApi.getRun(props.workspaceId, props.novelId, props.runId);
    run.value = r;
    pauseReason.value = r.pauseReason;
    breakpoints.value = await simApi.listBreakpoints(props.workspaceId, props.novelId, props.runId);
    watches.value = await simApi.getWatchValues(props.workspaceId, props.novelId, props.runId);
    replayTick.value = Math.max(1, r.currentTick);
    lastHit.value = null;
    replayResult.value = null;
    traceEventId.value = null;
    // Load the current tick's events for the trace event picker (F2 fix).
    // Non-fatal: the picker stays empty if the tick fetch fails.
    tickEvents.value = [];
    tickEventsTick.value = 0;
    if (r.currentTick > 0) {
      try {
        const tick = await simApi.getTick(props.workspaceId, props.novelId, props.runId, r.currentTick);
        tickEvents.value = tick.events;
        tickEventsTick.value = tick.tickNumber;
      } catch {
        // Leave the picker empty; trace remains reachable via parent setTraceEvent.
      }
    }
  } catch {
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}

watch(() => props.runId, load, { immediate: true });

function describeBreakpoint(bp: BreakpointShape): string {
  const p = bp.predicate as Record<string, unknown> | null;
  if (bp.kind === "TICK") return `tick == ${String(p?.tickNumber ?? "?")}`;
  if (bp.kind === "PREDICATE") {
    const pp = p as { path?: string; op?: string; value?: unknown } | null;
    return `${pp?.path ?? "?"} ${pp?.op ?? "?"} ${JSON.stringify(pp?.value)}`;
  }
  return "on proposal";
}

function parseValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === "") return trimmed;
  const num = Number(trimmed);
  if (trimmed !== "" && !Number.isNaN(num)) return num;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  return trimmed;
}

async function createBp() {
  if (!props.runId) return;
  acting.value = true;
  actionError.value = null;
  try {
    let predicate: { tickNumber: number } | { path: string; op: typeof newOp.value; value: unknown } | null = null;
    if (newKind.value === "TICK") {
      predicate = { tickNumber: newTickNumber.value };
    } else if (newKind.value === "PREDICATE") {
      predicate = { path: newPath.value.trim(), op: newOp.value, value: parseValue(newValue.value) };
    }
    await simApi.createBreakpoint(props.workspaceId, props.novelId, props.runId, {
      kind: newKind.value,
      predicate,
      watch: newKind.value === "PREDICATE" ? newWatch.value : undefined,
    });
    breakpoints.value = await simApi.listBreakpoints(props.workspaceId, props.novelId, props.runId);
    watches.value = await simApi.getWatchValues(props.workspaceId, props.novelId, props.runId);
  } catch (e) {
    actionError.value = e instanceof ApiError ? e.code : String(e);
  } finally {
    acting.value = false;
  }
}

async function deleteBp(id: string) {
  if (!props.runId) return;
  acting.value = true;
  actionError.value = null;
  try {
    await simApi.deleteBreakpoint(props.workspaceId, props.novelId, props.runId, id);
    breakpoints.value = await simApi.listBreakpoints(props.workspaceId, props.novelId, props.runId);
    watches.value = await simApi.getWatchValues(props.workspaceId, props.novelId, props.runId);
  } catch (e) {
    actionError.value = e instanceof ApiError ? e.code : String(e);
  } finally {
    acting.value = false;
  }
}

async function doDebugStep() {
  if (!props.runId) return;
  acting.value = true;
  actionError.value = null;
  try {
    const res = await simApi.debugStep(props.workspaceId, props.novelId, props.runId);
    lastHit.value = res.breakpointHit;
    pauseReason.value = res.pauseReason;
    if (run.value) {
      run.value = { ...run.value, status: res.runStatus, currentTick: res.tickNumber };
    }
    watches.value = await simApi.getWatchValues(props.workspaceId, props.novelId, props.runId);
    emit("run-updated", run.value as SimulationRunShape);
  } catch (e) {
    actionError.value =
      e instanceof ApiError
        ? (t(`simulation.debugger.errors.${e.code}`) !== `simulation.debugger.errors.${e.code}`
            ? t(`simulation.debugger.errors.${e.code}`)
            : e.code)
        : String(e);
  } finally {
    acting.value = false;
  }
}

async function doReplay() {
  if (!props.runId) return;
  acting.value = true;
  actionError.value = null;
  try {
    replayResult.value = await simApi.replayRun(
      props.workspaceId,
      props.novelId,
      props.runId,
      replayTick.value,
    );
  } catch (e) {
    actionError.value = e instanceof ApiError ? e.code : String(e);
  } finally {
    acting.value = false;
  }
}

function formatWatchValue(v: unknown): string {
  if (v === null || v === undefined) return "–";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2);
  return String(v);
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
      return "border-red-400/40 bg-red-400/10 text-red-300";
    default:
      return "border-nf-border-strong bg-nf-bg-3 text-nf-text-dim";
  }
}

/** Parent can set the event to trace (from tick history). */
function setTraceEvent(eventId: string | null) {
  traceEventId.value = eventId;
}

defineExpose({ setTraceEvent, reload: load });
</script>
