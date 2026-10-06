<template>
  <section
    aria-labelledby="sim-walkthrough-title"
    class="rounded-xl border border-nf-border bg-nf-bg-1 p-5"
    data-testid="sim-walkthrough"
  >
    <h2 id="sim-walkthrough-title" class="text-[16px] font-semibold text-nf-text">
      {{ t("simulation.walkthrough.title") }}
    </h2>
    <p class="mt-1 text-[13px] text-nf-text-dim">
      {{ t("simulation.walkthrough.subtitle") }}
    </p>

    <!-- Step progress -->
    <ol class="mt-4 flex flex-wrap gap-2" :aria-label="t('simulation.walkthrough.steps')">
      <li
        v-for="(step, i) in steps"
        :key="step.key"
        :data-testid="`sim-walkthrough-step-${step.key}`"
        class="flex items-center gap-2"
      >
        <button
          type="button"
          :disabled="!canGoTo(i)"
          class="rounded-full border px-3 py-1 text-[12px] focus-visible:nf-focus disabled:opacity-50"
          :class="stepClass(i)"
          :aria-current="currentStep === i ? 'step' : undefined"
          @click="goTo(i)"
        >
          {{ i + 1 }}. {{ t(`simulation.walkthrough.steps.${step.key}`) }}
        </button>
        <span v-if="i < steps.length - 1" aria-hidden="true" class="text-nf-text-faint">→</span>
      </li>
    </ol>

    <!-- Step content -->
    <div class="mt-6" :data-testid="`sim-walkthrough-content-${steps[currentStep]?.key ?? 'setup'}`">
      <!-- 0: Setup -->
      <div v-if="currentStep === 0">
        <h3 class="text-[14px] font-semibold text-nf-text">{{ t("simulation.walkthrough.steps.setup") }}</h3>
        <p class="mt-2 text-[13px] text-nf-text-dim">{{ t("simulation.walkthrough.setupBody") }}</p>
        <dl class="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div class="rounded-lg bg-nf-bg-2 p-3">
            <dt class="text-[12px] text-nf-text-faint">{{ t("simulation.walkthrough.population") }}</dt>
            <dd class="font-mono text-[18px] tabular-nums text-nf-text" data-testid="sim-walkthrough-initial-pop">{{ initial.population }}</dd>
          </div>
          <div class="rounded-lg bg-nf-bg-2 p-3">
            <dt class="text-[12px] text-nf-text-faint">{{ t("simulation.walkthrough.foodSecurity") }}</dt>
            <dd class="font-mono text-[18px] tabular-nums text-nf-text">{{ initial.foodSecurity.toFixed(2) }}</dd>
          </div>
          <div class="rounded-lg bg-nf-bg-2 p-3">
            <dt class="text-[12px] text-nf-text-faint">{{ t("simulation.walkthrough.grainSurplus") }}</dt>
            <dd class="font-mono text-[18px] tabular-nums text-nf-text">{{ initial.grainSurplus }}</dd>
          </div>
          <div class="rounded-lg bg-nf-bg-2 p-3">
            <dt class="text-[12px] text-nf-text-faint">{{ t("simulation.walkthrough.infrastructure") }}</dt>
            <dd class="font-mono text-[18px] tabular-nums text-nf-text">{{ initial.infrastructure.toFixed(2) }}</dd>
          </div>
        </dl>
        <div class="mt-4 flex gap-2">
          <button
            type="button"
            data-testid="sim-walkthrough-begin"
            class="rounded-lg bg-nf-accent px-4 py-2 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus"
            @click="begin"
          >
            {{ t("simulation.walkthrough.begin") }}
          </button>
        </div>
      </div>

      <!-- 1: Run (ticks 1-4) -->
      <div v-if="currentStep === 1">
        <h3 class="text-[14px] font-semibold text-nf-text">{{ t("simulation.walkthrough.steps.run") }}</h3>
        <p class="mt-2 text-[13px] text-nf-text-dim">{{ t("simulation.walkthrough.runBody") }}</p>
        <TickChart :ticks="earlyTicks" />
        <div class="mt-4 flex gap-2">
          <button
            type="button"
            data-testid="sim-walkthrough-to-drought"
            class="rounded-lg bg-nf-accent px-4 py-2 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus"
            @click="goTo(2)"
          >
            {{ t("simulation.walkthrough.continue") }}
          </button>
        </div>
      </div>

      <!-- 2: Drought (tick 5) -->
      <div v-if="currentStep === 2">
        <h3 class="text-[14px] font-semibold text-nf-text">{{ t("simulation.walkthrough.steps.drought") }}</h3>
        <div class="mt-2 rounded-lg border border-nf-warn/40 bg-nf-warn-dim p-4" data-testid="sim-walkthrough-drought-callout">
          <p class="text-[13px] text-nf-warn">{{ t("simulation.walkthrough.droughtBody") }}</p>
        </div>
        <div v-if="droughtTick" class="mt-3">
          <h4 class="text-[12px] font-semibold uppercase tracking-wide text-nf-text-faint">
            {{ t("simulation.causality.title") }}
          </h4>
          <ul class="mt-2 list-none p-0 m-0">
            <li
              v-for="link in droughtTick.causalLinks"
              :key="link.id"
              :data-testid="`sim-walkthrough-drought-link-${link.id}`"
              class="mt-1 flex items-center gap-2 rounded-lg bg-nf-bg-2 px-3 py-2 text-[12px]"
            >
              <span
                class="rounded-full border px-2 py-0.5 text-[11px] font-medium"
                :class="linkKindClass(link.kind)"
              >
                {{ t(`simulation.causality.kinds.${link.kind}`) }}
              </span>
              <span class="font-mono text-nf-text-dim">
                {{ eventLabel(link.causeEventId) }} → {{ eventLabel(link.eventId) }}
              </span>
            </li>
          </ul>
        </div>
        <TickChart :ticks="droughtTicks" />
        <div class="mt-4 flex gap-2">
          <button
            type="button"
            data-testid="sim-walkthrough-to-proposal"
            class="rounded-lg bg-nf-accent px-4 py-2 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus"
            @click="goTo(3)"
          >
            {{ t("simulation.walkthrough.continue") }}
          </button>
        </div>
      </div>

      <!-- 3: Proposal (tick 10) -->
      <div v-if="currentStep === 3">
        <h3 class="text-[14px] font-semibold text-nf-text">{{ t("simulation.walkthrough.steps.proposal") }}</h3>
        <div class="mt-2 rounded-lg border border-nf-accent-border bg-nf-accent-dim p-4" data-testid="sim-walkthrough-proposal-callout">
          <p class="text-[13px] text-nf-accent-hi">{{ t("simulation.walkthrough.proposalBody") }}</p>
        </div>
        <div v-if="pausedProposal" class="mt-4 grid gap-3 md:grid-cols-2">
          <div
            v-for="alt in pausedProposal.alternatives"
            :key="alt.id"
            :data-testid="`sim-walkthrough-alt-${alt.id}`"
            class="rounded-lg border p-4"
            :class="decision === alt.id ? 'border-nf-accent bg-nf-accent-dim' : 'border-nf-border bg-nf-bg-2'"
          >
            <h4 class="font-mono text-[13px] font-semibold text-nf-text">{{ alt.id }}</h4>
            <p class="mt-1 text-[13px] text-nf-text-dim">{{ alt.outcome }}</p>
            <p class="mt-2 text-[12px] text-nf-text-faint">
              {{ t("simulation.proposal.confidence", { pct: Math.round(alt.confidence * 100) }) }}
            </p>
            <button
              type="button"
              :data-testid="`sim-walkthrough-choose-${alt.id}`"
              :aria-pressed="decision === alt.id"
              class="mt-3 w-full rounded-lg border px-3 py-1.5 text-[13px] focus-visible:nf-focus"
              :class="
                decision === alt.id
                  ? 'border-nf-accent bg-nf-accent/20 font-semibold text-nf-accent-hi'
                  : 'border-nf-border-strong text-nf-text hover:bg-nf-bg-3'
              "
              @click="decision = alt.id"
            >
              {{ t("simulation.proposal.choose") }}
            </button>
          </div>
        </div>
        <div class="mt-4">
          <label for="sim-walkthrough-rationale" class="block text-[12px] font-medium text-nf-text-dim">
            {{ t("simulation.proposal.rationale") }}
            <span class="text-nf-text-faint">({{ t("simulation.optional") }})</span>
          </label>
          <textarea
            id="sim-walkthrough-rationale"
            v-model="rationale"
            rows="2"
            data-testid="sim-walkthrough-rationale"
            class="mt-1 w-full max-w-lg rounded-lg border border-nf-border-strong bg-nf-bg-2 px-3 py-2 text-[13px] text-nf-text focus-visible:nf-focus"
          />
        </div>
        <p v-if="decisionError" role="alert" class="mt-2 text-[13px] text-red-300" data-testid="sim-walkthrough-decision-error">
          {{ decisionError }}
        </p>
        <div class="mt-4 flex gap-2">
          <button
            type="button"
            data-testid="sim-walkthrough-decide"
            class="rounded-lg bg-nf-accent px-4 py-2 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus"
            @click="decide"
          >
            {{ t("simulation.walkthrough.decide") }}
          </button>
        </div>
      </div>

      <!-- 4: Outcomes (tick 20) -->
      <div v-if="currentStep === 4">
        <h3 class="text-[14px] font-semibold text-nf-text">{{ t("simulation.walkthrough.steps.outcomes") }}</h3>
        <p class="mt-2 text-[13px] text-nf-text-dim">
          {{ decision === "build-irrigation" ? t("simulation.walkthrough.outcomeIrrigation") : t("simulation.walkthrough.outcomeDry") }}
        </p>
        <dl class="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div class="rounded-lg bg-nf-bg-2 p-3">
            <dt class="text-[12px] text-nf-text-faint">{{ t("simulation.walkthrough.population") }}</dt>
            <dd class="font-mono text-[18px] tabular-nums text-nf-text" data-testid="sim-walkthrough-final-pop">{{ finalState.population }}</dd>
          </div>
          <div class="rounded-lg bg-nf-bg-2 p-3">
            <dt class="text-[12px] text-nf-text-faint">{{ t("simulation.walkthrough.foodSecurity") }}</dt>
            <dd class="font-mono text-[18px] tabular-nums text-nf-text" data-testid="sim-walkthrough-final-fs">{{ finalState.foodSecurity.toFixed(2) }}</dd>
          </div>
          <div class="rounded-lg bg-nf-bg-2 p-3">
            <dt class="text-[12px] text-nf-text-faint">{{ t("simulation.walkthrough.infrastructure") }}</dt>
            <dd class="font-mono text-[18px] tabular-nums text-nf-text">{{ finalState.infrastructure.toFixed(2) }}</dd>
          </div>
          <div class="rounded-lg bg-nf-bg-2 p-3">
            <dt class="text-[12px] text-nf-text-faint">{{ t("simulation.walkthrough.irrigation") }}</dt>
            <dd class="text-[14px] text-nf-text">
              {{ finalState.irrigationBuilt ? t("simulation.walkthrough.built") : t("simulation.walkthrough.notBuilt") }}
            </dd>
          </div>
        </dl>
        <TickChart :ticks="allTicks" show-drought show-proposal />
        <div class="mt-4 flex gap-2">
          <button
            type="button"
            data-testid="sim-walkthrough-restart"
            class="rounded-lg border border-nf-border-strong px-4 py-2 text-[13px] text-nf-text hover:bg-nf-bg-2 focus-visible:nf-focus"
            @click="restart"
          >
            {{ t("simulation.walkthrough.restart") }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * NF-WF-021D: Civilization guided walkthrough (021C).
 *
 * Drives the 021C `irrigation-scenario` domain functions DIRECTLY in the
 * browser (pure functions, no backend). This is the implementer's documented
 * choice per the 021D contract ("implementer chooses; document the choice"):
 *
 * - The scenario is deterministic pure functions — no DB, no routes needed.
 * - The walkthrough is a guided validation demo, not a live simulation run.
 * - Avoids provisioning a real backend run with civilization injections.
 *
 * Flow: setup → run (ticks 1-4) → drought (tick 5, causal chain) →
 * proposal (tick 10, explicit choice) → outcomes (tick 20, charts).
 */
import { computed, defineComponent, h, ref, type PropType, type VNode } from "vue";
import { useLocale } from "../../composables/useLocale";
import {
  createInitialState,
  runIrrigationScenario,
  resumeIrrigationScenario,
  DROUGHT_TICK,
  PROPOSAL_TICK,
  type CivilizationState,
  type ScenarioRunResult,
  type ScenarioTickResult,
} from "@novelforge/story-simulation";

const { t } = useLocale();

const steps = [
  { key: "setup" },
  { key: "run" },
  { key: "drought" },
  { key: "proposal" },
  { key: "outcomes" },
] as const;

const currentStep = ref(0);
const pausedResult = ref<ScenarioRunResult | null>(null);
const completedResult = ref<ScenarioRunResult | null>(null);
const decision = ref<string | null>(null);
const rationale = ref("");
const decisionError = ref<string | null>(null);

const initial: CivilizationState = createInitialState();

const earlyTicks = computed<ScenarioTickResult[]>(() =>
  (pausedResult.value?.ticks ?? []).filter((tk) => tk.tickNumber < DROUGHT_TICK),
);
const droughtTicks = computed<ScenarioTickResult[]>(() =>
  (pausedResult.value?.ticks ?? []).filter((tk) => tk.tickNumber <= PROPOSAL_TICK),
);
const allTicks = computed<ScenarioTickResult[]>(() => completedResult.value?.ticks ?? []);
const droughtTick = computed<ScenarioTickResult | null>(() =>
  (pausedResult.value?.ticks ?? []).find((tk) => tk.tickNumber === DROUGHT_TICK) ?? null,
);
const pausedProposal = computed(() => pausedResult.value?.proposals[0] ?? null);
const finalState = computed<CivilizationState>(() =>
  completedResult.value?.finalState ?? initial,
);

function canGoTo(i: number): boolean {
  if (i === 0) return true;
  if (i <= 3) return pausedResult.value !== null;
  return completedResult.value !== null;
}

function stepClass(i: number): string {
  if (i === currentStep.value)
    return "border-nf-accent bg-nf-accent-dim font-semibold text-nf-accent-hi";
  if (canGoTo(i)) return "border-nf-border-strong text-nf-text hover:bg-nf-bg-2";
  return "border-nf-border text-nf-text-faint";
}

function goTo(i: number) {
  if (canGoTo(i)) currentStep.value = i;
}

function begin() {
  pausedResult.value = runIrrigationScenario({
    runId: `walkthrough-${Date.now()}`,
    irrigationDecision: null,
  });
  currentStep.value = 1;
}

function decide() {
  if (!decision.value || !pausedResult.value) {
    decisionError.value = t("simulation.proposal.chooseRequired");
    return;
  }
  decisionError.value = null;
  completedResult.value = resumeIrrigationScenario(
    pausedResult.value,
    decision.value as "build-irrigation" | "maintain-dry-farming",
    rationale.value || undefined,
  );
  currentStep.value = 4;
}

function restart() {
  pausedResult.value = null;
  completedResult.value = null;
  decision.value = null;
  rationale.value = "";
  decisionError.value = null;
  currentStep.value = 0;
}

function eventLabel(id: string | null): string {
  if (!id) return t("simulation.walkthrough.stateCause");
  const all = [
    ...(pausedResult.value?.events ?? []),
    ...(completedResult.value?.events ?? []),
  ];
  const ev = all.find((e) => e.id === id);
  return ev ? ev.kind : id.slice(0, 8);
}

function linkKindClass(kind: string): string {
  switch (kind) {
    case "DIRECT":
      return "border-nf-ok/40 bg-nf-ok/10 text-nf-ok";
    case "ENABLING":
      return "border-nf-warn/40 bg-nf-warn-dim text-nf-warn";
    default:
      return "border-nf-accent-border bg-nf-accent-dim text-nf-accent-hi";
  }
}

// Simple SVG line chart for population + food security over ticks.
const TickChart = defineComponent({
  name: "TickChart",
  props: {
    ticks: { type: Array as PropType<ScenarioTickResult[]>, required: true },
    showDrought: { type: Boolean, default: false },
    showProposal: { type: Boolean, default: false },
  },
  setup(p) {
    const { t: tt } = useLocale();
    const W = 560;
    const H = 180;
    const PAD = 28;
    return () => {
      if (p.ticks.length === 0)
        return h("p", { class: "text-[13px] text-nf-text-dim" }, tt("simulation.walkthrough.noData"));
      const pops = p.ticks.map((tk) => tk.stateAfter.population);
      const fss = p.ticks.map((tk) => tk.stateAfter.foodSecurity);
      const maxPop = Math.max(...pops, 1);
      const x = (i: number) =>
        PAD + (i / Math.max(p.ticks.length - 1, 1)) * (W - PAD * 2);
      const yPop = (v: number) => H - PAD - (v / maxPop) * (H - PAD * 2);
      const yFs = (v: number) => H - PAD - v * (H - PAD * 2);
      const popPath = pops.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${yPop(v).toFixed(1)}`).join(" ");
      const fsPath = fss.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${yFs(v).toFixed(1)}`).join(" ");
      const markers: VNode[] = [];
      if (p.showDrought) {
        const idx = p.ticks.findIndex((tk) => tk.tickNumber === DROUGHT_TICK);
        if (idx >= 0)
          markers.push(
            h("line", {
              x1: x(idx), x2: x(idx), y1: PAD, y2: H - PAD,
              stroke: "#fbbf24", "stroke-dasharray": "4 3", "stroke-width": 1.5,
            }),
          );
      }
      if (p.showProposal) {
        const idx = p.ticks.findIndex((tk) => tk.tickNumber === PROPOSAL_TICK);
        if (idx >= 0)
          markers.push(
            h("line", {
              x1: x(idx), x2: x(idx), y1: PAD, y2: H - PAD,
              stroke: "#f97316", "stroke-dasharray": "4 3", "stroke-width": 1.5,
            }),
          );
      }
      return h(
        "figure",
        { class: "mt-3 rounded-lg border border-nf-border bg-nf-bg-0 p-3", "data-testid": "sim-walkthrough-chart" },
        [
          h(
            "svg",
            {
              viewBox: `0 0 ${W} ${H}`,
              class: "w-full",
              role: "img",
              "aria-label": tt("simulation.walkthrough.chartLabel"),
            },
            [
              ...markers,
              h("path", { d: popPath, fill: "none", stroke: "#4ade80", "stroke-width": 2 }),
              h("path", { d: fsPath, fill: "none", stroke: "#38bdf8", "stroke-width": 2, "stroke-dasharray": "6 3" }),
              ...p.ticks.map((tk, i) =>
                h("circle", { cx: x(i), cy: yPop(tk.stateAfter.population), r: 3, fill: "#4ade80" }),
              ),
            ],
          ),
          h("figcaption", { class: "mt-2 flex gap-4 text-[12px] text-nf-text-dim" }, [
            h("span", { class: "flex items-center gap-1" }, [
              h("span", { class: "inline-block h-0.5 w-4 bg-[#4ade80]" }),
              tt("simulation.walkthrough.population"),
            ]),
            h("span", { class: "flex items-center gap-1" }, [
              h("span", { class: "inline-block h-0.5 w-4 bg-[#38bdf8]" }),
              tt("simulation.walkthrough.foodSecurity"),
            ]),
          ]),
        ],
      );
    };
  },
});
</script>
