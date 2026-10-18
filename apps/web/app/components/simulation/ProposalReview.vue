<template>
  <section
    aria-labelledby="sim-proposal-title"
    class="rounded-xl border border-nf-border bg-nf-bg-1 p-5"
    data-testid="sim-proposal-review"
  >
    <h2 id="sim-proposal-title" class="text-[16px] font-semibold text-nf-text">
      {{ t("simulation.proposal.title") }}
    </h2>

    <p v-if="loadError" role="alert" class="mt-3 text-[13px] text-nf-error" data-testid="sim-proposal-error">
      {{ t("simulation.loadError") }}
    </p>

    <div v-if="proposals.length === 0 && !loading" class="mt-3 text-[13px] text-nf-text-dim" data-testid="sim-no-proposals">
      {{ t("simulation.proposal.noProposals") }}
    </div>

    <div
      v-for="proposal in proposals"
      :key="proposal.id"
      :data-testid="`sim-proposal-${proposal.id}`"
      class="mt-4 rounded-lg border border-nf-accent-border bg-nf-bg-2 p-4"
    >
      <div class="flex flex-wrap items-center gap-2">
        <span
          class="rounded-full border px-2 py-0.5 text-[11px] font-medium"
          :class="proposalStatusClass(proposal.status)"
          :data-testid="`sim-proposal-status-${proposal.id}`"
        >
          {{ t(`simulation.proposal.statusLabels.${proposal.status}`) }}
        </span>
        <span class="text-[12px] text-nf-text-dim">
          {{ t("simulation.proposal.trigger") }}:
          {{ t(`simulation.proposal.triggers.${proposal.trigger}`) }}
        </span>
        <span class="text-[12px] text-nf-text-dim">
          {{ t("simulation.tickN", { n: proposal.tickNumber }) }}
        </span>
      </div>

      <p class="mt-2 text-[13px] text-nf-text">{{ proposal.reason }}</p>

      <!-- Alternatives side-by-side -->
      <div class="mt-3 grid gap-3 md:grid-cols-2" role="group" :aria-label="t('simulation.proposal.alternatives')">
        <div
          v-for="alt in proposal.alternatives"
          :key="alt.id"
          :data-testid="`sim-proposal-alt-${proposal.id}-${alt.id}`"
          class="rounded-lg border p-3"
          :class="
            selectedChoice[proposal.id] === alt.id
              ? 'border-nf-accent bg-nf-accent-dim'
              : 'border-nf-border bg-nf-bg-0'
          "
        >
          <div class="flex items-center justify-between gap-2">
            <h3 class="font-mono text-[12px] font-semibold text-nf-text">{{ alt.id }}</h3>
            <span class="text-[12px] text-nf-text-dim tabular-nums">
              {{ t("simulation.proposal.confidence", { pct: Math.round(alt.confidence * 100) }) }}
            </span>
          </div>
          <pre class="mt-2 max-h-28 overflow-auto text-[12px] text-nf-text-dim">{{ formatJson(alt.outcome) }}</pre>
          <details class="mt-2">
            <summary class="cursor-pointer text-[12px] text-nf-accent-hi focus-visible:nf-focus">
              {{ t("simulation.proposal.evidence") }}
            </summary>
            <pre class="mt-1 max-h-28 overflow-auto rounded bg-nf-bg-1 p-2 text-[12px] text-nf-text-dim">{{ formatJson(alt.evidence) }}</pre>
          </details>
          <button
            v-if="proposal.status === 'PROPOSED'"
            type="button"
            :data-testid="`sim-proposal-choose-${proposal.id}-${alt.id}`"
            :aria-pressed="selectedChoice[proposal.id] === alt.id"
            class="mt-2 w-full rounded-lg border px-3 py-1.5 text-[13px] focus-visible:nf-focus"
            :class="
              selectedChoice[proposal.id] === alt.id
                ? 'border-nf-accent bg-nf-accent/20 font-semibold text-nf-accent-hi'
                : 'border-nf-border-strong text-nf-text hover:bg-nf-bg-2'
            "
            @click="selectedChoice[proposal.id] = alt.id"
          >
            {{ t("simulation.proposal.choose") }}
          </button>
        </div>
      </div>

      <!-- Decision controls (explicit choice required — no silent default) -->
      <div v-if="proposal.status === 'PROPOSED'" class="mt-4 border-t border-nf-border pt-3">
        <label :for="`sim-rationale-${proposal.id}`" class="block text-[12px] font-medium text-nf-text-dim">
          {{ t("simulation.proposal.rationale") }}
          <span class="text-nf-text-faint">({{ t("simulation.optional") }})</span>
        </label>
        <textarea
          :id="`sim-rationale-${proposal.id}`"
          v-model="rationales[proposal.id]"
          rows="2"
          :data-testid="`sim-proposal-rationale-${proposal.id}`"
          class="mt-1 w-full rounded-lg border border-nf-border-strong bg-nf-bg-0 px-3 py-2 text-[13px] text-nf-text focus-visible:nf-focus"
        />
        <p v-if="decisionErrors[proposal.id]" role="alert" class="mt-2 text-[13px] text-nf-error" :data-testid="`sim-proposal-decide-error-${proposal.id}`">
          {{ decisionErrors[proposal.id] }}
        </p>
        <div class="mt-2 flex gap-2">
          <button
            type="button"
            :data-testid="`sim-proposal-approve-${proposal.id}`"
            :disabled="deciding[proposal.id]"
            class="rounded-lg bg-nf-accent px-4 py-2 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus disabled:opacity-50"
            @click="decide(proposal, true)"
          >
            {{ t("simulation.proposal.actions.approve") }}
          </button>
          <button
            type="button"
            :data-testid="`sim-proposal-reject-${proposal.id}`"
            :disabled="deciding[proposal.id]"
            class="rounded-lg border border-nf-border-strong px-4 py-2 text-[13px] text-nf-text hover:bg-nf-bg-2 focus-visible:nf-focus disabled:opacity-50"
            @click="decide(proposal, false)"
          >
            {{ t("simulation.proposal.actions.reject") }}
          </button>
        </div>
        <p class="mt-2 text-[12px] text-nf-text-faint">
          {{ t("simulation.proposal.explicitChoiceHint") }}
        </p>
      </div>

      <div v-else class="mt-3 text-[13px] text-nf-text-dim" :data-testid="`sim-proposal-decision-${proposal.id}`">
        {{ t("simulation.proposal.decidedChoice", { choice: proposal.chosenAlternativeId ?? "—" }) }}
        <span v-if="proposal.rationale" class="block mt-1 italic">“{{ proposal.rationale }}”</span>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * NF-WF-021D: Proposal review (021B) — alternatives side-by-side with
 * evidence/confidence; approve/reject REQUIRES an explicit choice
 * (mirrors the backend's 400-on-missing-choice; no silent default).
 */
import { reactive, ref, watch } from "vue";
import { useLocale } from "../../composables/useLocale";
import { useSimulationApi, type ProposalSummary, type ProposalStatus } from "./simulationApi";
import { ApiError } from "../../composables/useApi";

const props = defineProps<{
  workspaceId: string;
  novelId: string;
  runId: string;
}>();

const emit = defineEmits<{
  (e: "decided", runId: string): void;
}>();

const { t } = useLocale();
const simApi = useSimulationApi();

const proposals = ref<ProposalSummary[]>([]);
const loading = ref(true);
const loadError = ref(false);
const selectedChoice = reactive<Record<string, string>>({});
const rationales = reactive<Record<string, string>>({});
const deciding = reactive<Record<string, boolean>>({});
const decisionErrors = reactive<Record<string, string | null>>({});

async function load() {
  loading.value = true;
  loadError.value = false;
  try {
    proposals.value = await simApi.listProposals(props.workspaceId, props.novelId, props.runId);
  } catch {
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}

watch(() => props.runId, load, { immediate: true });

async function decide(proposal: ProposalSummary, approve: boolean) {
  // Explicit choice required for approve — no silent default.
  if (approve && !selectedChoice[proposal.id]) {
    decisionErrors[proposal.id] = t("simulation.proposal.chooseRequired");
    return;
  }
  deciding[proposal.id] = true;
  decisionErrors[proposal.id] = null;
  try {
    await simApi.decideProposal(props.workspaceId, props.novelId, props.runId, proposal.id, {
      approve,
      ...(approve && selectedChoice[proposal.id] ? { choice: selectedChoice[proposal.id] } : {}),
      ...(rationales[proposal.id] ? { rationale: rationales[proposal.id] } : {}),
    });
    await load();
    emit("decided", props.runId);
  } catch (e) {
    decisionErrors[proposal.id] =
      e instanceof ApiError
        ? (t(`simulation.proposal.errors.${e.code}`) !== `simulation.proposal.errors.${e.code}`
            ? t(`simulation.proposal.errors.${e.code}`)
            : e.code)
        : String(e);
  } finally {
    deciding[proposal.id] = false;
  }
}

function proposalStatusClass(status: ProposalStatus): string {
  switch (status) {
    case "PROPOSED":
      return "border-nf-accent-border bg-nf-accent-dim text-nf-accent-hi";
    case "APPROVED":
      return "border-nf-ok/40 bg-nf-ok/10 text-nf-ok";
    case "REJECTED":
      return "border-nf-border-strong bg-nf-bg-3 text-nf-text-dim";
  }
}

function formatJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}
</script>
