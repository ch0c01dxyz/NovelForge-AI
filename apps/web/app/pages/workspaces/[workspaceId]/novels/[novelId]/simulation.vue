<template>
  <div class="mx-auto max-w-5xl px-4 py-6" data-testid="simulation-center">
    <header class="mb-6">
      <h1 class="text-[22px] font-semibold text-nf-text">{{ t("simulation.title") }}</h1>
      <p class="mt-1 text-[13px] text-nf-text-dim">{{ t("simulation.subtitle") }}</p>
    </header>

    <!-- Tabs -->
    <div class="mb-6 flex gap-1 border-b border-nf-border" role="tablist" :aria-label="t('simulation.title')">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        type="button"
        role="tab"
        :data-testid="`sim-tab-${tab.key}`"
        :aria-selected="activeTab === tab.key"
        class="px-4 py-2 text-[14px] focus-visible:nf-focus"
        :class="
          activeTab === tab.key
            ? 'border-b-2 border-nf-accent font-semibold text-nf-accent-hi'
            : 'text-nf-text-dim hover:text-nf-text'
        "
        @click="activeTab = tab.key"
      >
        {{ t(`simulation.tabs.${tab.key}`) }}
      </button>
    </div>

    <!-- Runs tab -->
    <div v-if="activeTab === 'runs'" role="tabpanel">
      <SimulationRunList
        v-if="!selectedRunId"
        :runs="runs"
        :loading="runsLoading"
        :load-error="runsError"
        @create="createOpen = true"
        @select="selectedRunId = $event"
      />
      <div v-else class="space-y-4">
        <SimulationRunDetail
          :workspace-id="workspaceId"
          :novel-id="novelId"
          :run-id="selectedRunId"
          @back="selectedRunId = null; loadRuns()"
          @inspect-event="inspectEventId = $event"
        />
        <CausalChainView
          v-if="inspectEventId"
          :workspace-id="workspaceId"
          :novel-id="novelId"
          :run-id="selectedRunId"
          :event-id="inspectEventId"
          @close="inspectEventId = null"
        />
        <ProposalReview
          :workspace-id="workspaceId"
          :novel-id="novelId"
          :run-id="selectedRunId"
          @decided="loadRuns"
        />
      </div>
    </div>

    <!-- Walkthrough tab -->
    <div v-if="activeTab === 'walkthrough'" role="tabpanel">
      <CivilizationWalkthrough />
    </div>

    <SimulationRunCreate
      :open="createOpen"
      :workspace-id="workspaceId"
      :novel-id="novelId"
      :branches="branches"
      @close="createOpen = false"
      @created="onRunCreated"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * NF-WF-021D: Simulation Center page.
 *
 * Two tabs: "Runs" (021A run list/create/detail + step controls, 021B
 * causal chain + proposal review for the selected run) and "Walkthrough"
 * (021C civilization guided demo, driven by the domain functions).
 *
 * §15 foundational design; en+id; axe.
 */
import { computed, onMounted, ref } from "vue";
import { useLocale } from "../../../../../composables/useLocale";
import { useApi } from "../../../../../composables/useApi";
import { useSimulationApi, type SimulationRunShape } from "../../../../../components/simulation/simulationApi";
import SimulationRunList from "../../../../../components/simulation/SimulationRunList.vue";
import SimulationRunCreate from "../../../../../components/simulation/SimulationRunCreate.vue";
import SimulationRunDetail from "../../../../../components/simulation/SimulationRunDetail.vue";
import CausalChainView from "../../../../../components/simulation/CausalChainView.vue";
import ProposalReview from "../../../../../components/simulation/ProposalReview.vue";
import CivilizationWalkthrough from "../../../../../components/simulation/CivilizationWalkthrough.vue";

const route = useRoute();
const { t } = useLocale();
const { api } = useApi();
const simApi = useSimulationApi();

const workspaceId = computed(() => String(route.params.workspaceId ?? ""));
const novelId = computed(() => String(route.params.novelId ?? ""));

const tabs = [{ key: "runs" }, { key: "walkthrough" }] as const;
const activeTab = ref<"runs" | "walkthrough">("runs");

const runs = ref<SimulationRunShape[]>([]);
const runsLoading = ref(true);
const runsError = ref(false);
const selectedRunId = ref<string | null>(null);
const inspectEventId = ref<string | null>(null);
const createOpen = ref(false);
const branches = ref<Array<{ id: string; name: string }>>([]);

async function loadRuns() {
  runsLoading.value = true;
  runsError.value = false;
  try {
    runs.value = await simApi.listRuns(workspaceId.value, novelId.value);
  } catch {
    runsError.value = true;
  } finally {
    runsLoading.value = false;
  }
}

async function loadBranches() {
  try {
    // 020B branch list route (consumed, not modified).
    const res = await api<{ branches: Array<{ id: string; name: string }> }>(
      `/workspaces/${workspaceId.value}/novels/${novelId.value}/branches`,
    );
    branches.value = res.branches;
  } catch {
    branches.value = [];
  }
}

function onRunCreated(runId: string) {
  createOpen.value = false;
  selectedRunId.value = runId;
  loadRuns();
}

onMounted(() => {
  loadRuns();
  loadBranches();
});
</script>
