<script setup lang="ts">
/**
 * AI Studio page (NF-WF-018A): the management surface for the 004/005
 * backend — versioned agent/skill/workflow definitions, the run list +
 * run detail with step graph, and the approvals inbox.
 *
 * Authorization is enforced server-side; the tab visibility here is
 * progressive enhancement. A VIEWER sees nothing. NF-WF-018C adds a
 * fourth "receipts" tab to this shell.
 */
import { ref, computed, onMounted } from "vue";
import { useRoute } from "#app";
import {
  useAiStudio,
  canViewStudio,
  canManageDefinitions,
  canDecideApprovals,
  canLaunchRuns,
  type DefinitionKind,
  type RunDetail,
  type WorkspaceRole,
} from "../../../../composables/useAiStudio";
import {
  canReadReceipts,
  canReadEvaluations,
  canReadAuditTrail,
} from "../../../../composables/useReceipts";
import { useLocale } from "../../../../composables/useLocale";
import DefinitionList from "../../../../components/ai-studio/DefinitionList.vue";
import DefinitionDetail from "../../../../components/ai-studio/DefinitionDetail.vue";
import RunList from "../../../../components/ai-studio/RunList.vue";
import RunGraph from "../../../../components/ai-studio/RunGraph.vue";
import ApprovalsInbox from "../../../../components/ai-studio/ApprovalsInbox.vue";
import GenerationLedger from "../../../../components/ai-studio/GenerationLedger.vue";
import UsageAnalytics from "../../../../components/ai-studio/UsageAnalytics.vue";
import FailureLog from "../../../../components/ai-studio/FailureLog.vue";
import EvaluationReceipts from "../../../../components/ai-studio/EvaluationReceipts.vue";
import AuditTrail from "../../../../components/ai-studio/AuditTrail.vue";

const route = useRoute();
const workspaceId = computed(() => String(route.params.workspaceId ?? ""));
const { t } = useLocale();
const studio = useAiStudio();

type TabKey = "definitions" | "runs" | "approvals" | "receipts";
const tab = ref<TabKey>("definitions");
const role = ref<WorkspaceRole | null>(null);
const roleLoaded = ref(false);

const kind = ref<DefinitionKind>("agent");
const selectedDefinition = ref<string | null>(null);
const definitionListKey = ref(0);

const selectedRunId = ref<string | null>(null);
const runDetail = ref<RunDetail | null>(null);
const runDetailLoading = ref(false);
const runDetailError = ref<string | null>(null);

// NF-WF-018C: receipts sub-tabs, each capability-gated individually.
type ReceiptsTabKey = "ledger" | "usage" | "failures" | "evaluations" | "audit";
const receiptsTab = ref<ReceiptsTabKey>("ledger");

const tabs = computed<{ key: TabKey; labelKey: string; visible: boolean }[]>(() => [
  { key: "definitions" as const, labelKey: "aiStudio.tabs.definitions", visible: canViewStudio(role.value) },
  { key: "runs" as const, labelKey: "aiStudio.tabs.runs", visible: canViewStudio(role.value) },
  { key: "approvals" as const, labelKey: "aiStudio.tabs.approvals", visible: canDecideApprovals(role.value) },
  // NF-WF-018C: the receipts tab (ledger, failures, evaluations, audit).
  { key: "receipts" as const, labelKey: "receipts.tabs.receipts", visible: canReadReceipts(role.value) },
]);

// NF-WF-018C: the receipts sub-tabs are each capability-gated
// individually; the server enforces on every route.
const receiptsTabs = computed<{ key: ReceiptsTabKey; labelKey: string; visible: boolean }[]>(() => [
  { key: "usage" as const, labelKey: "usage.title", visible: canReadReceipts(role.value) },
  { key: "ledger" as const, labelKey: "receipts.tabs.ledger", visible: canReadReceipts(role.value) },
  { key: "failures" as const, labelKey: "receipts.tabs.failures", visible: canReadReceipts(role.value) },
  { key: "evaluations" as const, labelKey: "receipts.tabs.evaluations", visible: canReadEvaluations(role.value) },
  { key: "audit" as const, labelKey: "receipts.tabs.audit", visible: canReadAuditTrail(role.value) },
]);

const canManage = computed(() => canManageDefinitions(role.value));
const canDecide = computed(() => canDecideApprovals(role.value));
const canRun = computed(() => canLaunchRuns(role.value));

const kindLabel = computed(() => t(`aiStudio.kinds.${kind.value}`));

async function selectRun(runId: string) {
  selectedRunId.value = runId;
  runDetailLoading.value = true;
  runDetailError.value = null;
  try {
    runDetail.value = await studio.getRun(workspaceId.value, runId);
  } catch (err) {
    runDetailError.value = err instanceof Error ? err.message : "unknown";
  } finally {
    runDetailLoading.value = false;
  }
}

function backToRuns() {
  selectedRunId.value = null;
  runDetail.value = null;
}

function onDefinitionChanged() {
  // Refresh the list (version bumps) — the detail reloads itself.
  definitionListKey.value += 1;
}

function onRunLaunched(runId: string) {
  tab.value = "runs";
  selectRun(runId);
}

onMounted(async () => {
  try {
    role.value = await studio.getWorkspaceRole(workspaceId.value);
  } catch {
    role.value = null;
  } finally {
    roleLoaded.value = true;
  }
});
</script>

<template>
  <div class="min-h-screen bg-nf-bg-0">
    <header
      class="flex items-center gap-5 border-b border-nf-border bg-nf-bg-1 px-5 shadow-nf-sm"
    >
      <NuxtLink
        to="/"
        class="flex items-center gap-2.5 text-[14.5px] font-semibold tracking-tight hover:opacity-80 focus-visible:nf-focus"
      >
        <span
          class="grid size-6.5 place-items-center rounded-md bg-nf-accent font-nf-literary text-[15px] font-bold text-nf-accent-ink"
          >N</span
        >
        NovelForge
      </NuxtLink>
      <h1 class="text-[15px] font-semibold text-nf-text">
        {{ t("aiStudio.title") }}
      </h1>
    </header>

    <div v-if="!roleLoaded" class="px-5 py-10 text-center text-nf-text-faint" role="status">
      {{ t("common.loading") }}
    </div>
    <div v-else-if="!canViewStudio(role)" class="px-5 py-10 text-center" role="alert">
      <p class="text-[14px] text-nf-text-dim">{{ t("aiStudio.noAccess") }}</p>
    </div>
    <div v-else class="px-5 py-4">
      <nav
        class="mb-4 flex gap-1 border-b border-nf-border"
        :aria-label="t('aiStudio.title')"
      >
        <button
          v-for="item in tabs.filter((x) => x.visible)"
          :key="item.key"
          class="border-b-2 px-3 py-2 text-[13px] font-medium focus-visible:nf-focus"
          :class="
            tab === item.key
              ? 'border-nf-accent text-nf-accent-hi'
              : 'border-transparent text-nf-text-dim hover:text-nf-text'
          "
          :aria-selected="tab === item.key"
          role="tab"
          @click="tab = item.key"
        >
          {{ t(item.labelKey) }}
        </button>
      </nav>

      <!-- Definitions tab -->
      <div v-if="tab === 'definitions'" role="tabpanel">
        <div class="mb-3 flex gap-1" role="tablist" :aria-label="t('aiStudio.tabs.definitions')">
          <button
            v-for="k in (['agent', 'skill', 'workflow'] as const)"
            :key="k"
            class="rounded-lg px-3 py-1.5 text-[13px] focus-visible:nf-focus"
            :class="
              kind === k
                ? 'bg-nf-accent/15 font-semibold text-nf-accent-hi'
                : 'text-nf-text-dim hover:text-nf-text'
            "
            :aria-selected="kind === k"
            role="tab"
            @click="kind = k; selectedDefinition = null"
          >
            {{ t(`aiStudio.kinds.${k}`) }}
          </button>
        </div>
        <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div class="rounded-xl border border-nf-border bg-nf-bg-1 p-2">
            <DefinitionList
              :key="`${kind}-${definitionListKey}`"
              :workspace-id="workspaceId"
              :kind="kind"
              :can-manage="canManage"
              :can-run="canRun"
              @select="selectedDefinition = $event"
              @run-launched="onRunLaunched"
            />
          </div>
          <div class="rounded-xl border border-nf-border bg-nf-bg-1 p-4">
            <DefinitionDetail
              v-if="selectedDefinition"
              :key="selectedDefinition"
              :kind="kind"
              :id="selectedDefinition"
              :can-manage="canManage"
              @changed="onDefinitionChanged"
              @close="selectedDefinition = null"
            />
            <p v-else class="py-10 text-center text-[13px] text-nf-text-faint">
              {{ kindLabel }}
            </p>
          </div>
        </div>
      </div>

      <!-- Runs tab -->
      <div v-if="tab === 'runs'" role="tabpanel">
        <div v-if="selectedRunId">
          <button
            class="mb-3 rounded-lg border border-nf-border-strong px-3 py-1.5 text-[13px] text-nf-text-dim focus-visible:nf-focus"
            @click="backToRuns"
          >
            ← {{ t("aiStudio.runs.backToRuns") }}
          </button>
          <div v-if="runDetailLoading" class="py-10 text-center text-nf-text-faint" role="status">
            {{ t("common.loading") }}
          </div>
          <div v-else-if="runDetailError" class="py-10 text-center" role="alert">
            <p class="text-nf-warn">{{ runDetailError }}</p>
          </div>
          <RunGraph v-else-if="runDetail" :run="runDetail" />
        </div>
        <RunList v-else :workspace-id="workspaceId" @select="selectRun" />
      </div>

      <!-- Approvals tab -->
      <div v-if="tab === 'approvals'" role="tabpanel">
        <ApprovalsInbox
          :workspace-id="workspaceId"
          :can-decide="canDecide"
          @decided="() => {}"
        />
      </div>

      <!-- Receipts tab (NF-WF-018C) -->
      <div v-if="tab === 'receipts'" role="tabpanel">
        <div class="mb-4 flex gap-1" role="tablist" :aria-label="t('receipts.tabs.receipts')">
          <button
            v-for="item in receiptsTabs.filter((x) => x.visible)"
            :key="item.key"
            class="rounded-lg px-3 py-1.5 text-[13px] focus-visible:nf-focus"
            :class="
              receiptsTab === item.key
                ? 'bg-nf-accent/15 font-semibold text-nf-accent-hi'
                : 'text-nf-text-dim hover:text-nf-text'
            "
            :aria-selected="receiptsTab === item.key"
            role="tab"
            @click="receiptsTab = item.key"
          >
            {{ t(item.labelKey) }}
          </button>
        </div>
        <GenerationLedger v-if="receiptsTab === 'ledger'" :workspace-id="workspaceId" />
        <UsageAnalytics v-else-if="receiptsTab === 'usage'" :workspace-id="workspaceId" />
        <FailureLog v-else-if="receiptsTab === 'failures'" :workspace-id="workspaceId" />
        <EvaluationReceipts v-else-if="receiptsTab === 'evaluations'" :workspace-id="workspaceId" />
        <AuditTrail v-else-if="receiptsTab === 'audit'" :workspace-id="workspaceId" />
      </div>
    </div>
  </div>
</template>
