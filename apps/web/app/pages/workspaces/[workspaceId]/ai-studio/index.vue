<script setup lang="ts">
import BackLink from "../../../../components/ui/BackLink.vue";
import BrandLogo from "../../../../components/ui/BrandLogo.vue";
import { studioReturnTo } from "../../../../utils/studioReturnTo";
/**
 * AI Studio page (NF-WF-018A): the management surface for the 004/005
 * backend — versioned agent/skill/workflow definitions, the run list +
 * run detail with step graph, and the approvals inbox.
 *
 * Authorization is enforced server-side; the tab visibility here is
 * progressive enhancement. A VIEWER sees nothing. NF-WF-018C adds a
 * fourth "receipts" tab to this shell.
 */
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from "vue";
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
import DefinitionCreateDialog from "../../../../components/ai-studio/DefinitionCreateDialog.vue";
import StarterPackInstall from "../../../../components/ai-studio/StarterPackInstall.vue";
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
const returnTo = computed(() => studioReturnTo(workspaceId.value, route.query.novelId));
const { t } = useLocale();
const studio = useAiStudio();

type TabKey = "definitions" | "runs" | "approvals" | "receipts";
const tab = ref<TabKey>("definitions");
const role = ref<WorkspaceRole | null>(null);
const roleLoaded = ref(false);

const kind = ref<DefinitionKind>("agent");
const selectedDefinition = ref<string | null>(null);
const definitionListKey = ref(0);
const createOpen = ref(false);
const createOpener = ref<HTMLElement | null>(null);
function openCreate(event: MouseEvent) { createOpener.value = event.currentTarget as HTMLElement;createOpen.value = true; }
async function closeCreate() { const opener = createOpener.value;createOpen.value = false;createOpener.value = null;await nextTick();if (opener?.isConnected) opener.focus(); }
function onCreated(value: { id: string; kind: DefinitionKind; workspaceId: string }) {
  if (value.workspaceId !== workspaceId.value || value.kind !== kind.value) return;
  void closeCreate();selectedDefinition.value = value.id;definitionListKey.value++;
}
function onStarterInstalled(value: { workspaceId: string; workflowId: string }) {
  if (value.workspaceId !== workspaceId.value || !canManage.value) return;
  kind.value = "workflow";selectedDefinition.value = value.workflowId;definitionListKey.value++;
}

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
watch(() => [workspaceId.value, kind.value, canManage.value], () => { createOpen.value = false;createOpener.value = null; });
const canDecide = computed(() => canDecideApprovals(role.value));
const canRun = computed(() => canLaunchRuns(role.value));

const kindLabel = computed(() => t(`aiStudio.kinds.${kind.value}`));

let roleRequest = 0;
let runRequest = 0;
let runPollTimer: ReturnType<typeof setTimeout> | undefined;
onUnmounted(() => { clearTimeout(runPollTimer); });
let mounted = false;
async function selectRun(runId: string, background = false) {
  clearTimeout(runPollTimer);
  const request = ++runRequest;const target = workspaceId.value;
  selectedRunId.value = runId;
  if (!background) runDetailLoading.value = true;
  runDetailError.value = null;
  try {
    const detail = await studio.getRun(target, runId);
    if (request === runRequest && target === workspaceId.value) runDetail.value = detail;
  } catch (err) {
    if (request === runRequest && target === workspaceId.value) runDetailError.value = err instanceof Error ? err.message : "unknown";
  } finally {
    if (request === runRequest && target === workspaceId.value) {
      runDetailLoading.value = false;
      if (["PENDING", "RUNNING"].includes(runDetail.value?.status ?? "")) {
        const poll = () => {
          if (!mounted || selectedRunId.value !== runId || workspaceId.value !== target) return;
          if (document.hidden) runPollTimer = setTimeout(poll, 2000);
          else void selectRun(runId, true);
        };
        runPollTimer = setTimeout(poll, 2000);
      }
    }
  }
}

function backToRuns() {
  clearTimeout(runPollTimer);
  runRequest++;
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

async function loadRole() {
  const request = ++roleRequest;const target = workspaceId.value;
  role.value = null;roleLoaded.value = false;
  try {
    const current = await studio.getWorkspaceRole(target);
    if (request === roleRequest) role.value = current;
  } catch {
    if (request === roleRequest) role.value = null;
  } finally {
    if (request === roleRequest) roleLoaded.value = true;
  }
}
onMounted(() => { mounted = true;void loadRole(); });
watch(workspaceId, () => {
  selectedDefinition.value = null;selectedRunId.value = null;runDetail.value = null;runDetailError.value = null;runDetailLoading.value = false;runRequest++;
  if (mounted) void loadRole();
});
onUnmounted(() => { mounted = false;roleRequest++;runRequest++; });
</script>

<template>
  <div class="min-h-screen bg-nf-bg-0">
    <header
      class="flex min-h-[52px] flex-wrap items-center gap-5 border-b border-nf-border bg-nf-bg-1 px-5 py-2 shadow-nf-sm"
    >
      <NuxtLink
        to="/author"
        class="flex items-center gap-2.5 text-[14.5px] font-semibold tracking-tight hover:opacity-80 focus-visible:nf-focus"
      >
        <BrandLogo compact />
      </NuxtLink>
      <h1 class="text-[15px] font-semibold text-nf-text">
        {{ t("aiStudio.title") }}
      </h1>
    </header>

    <div class="mx-auto max-w-[1280px] px-5 pt-6"><BackLink :to="returnTo" :label="t(returnTo === '/author' ? 'authorHome.backHome' : 'recovery.backToWorkspace')" /></div>
    <div v-if="!roleLoaded" class="px-5 py-10 text-center text-nf-text-faint" role="status">
      {{ t("common.loading") }}
    </div>
    <div v-else-if="!canViewStudio(role)" class="px-5 py-10 text-center" role="alert">
      <p class="text-[14px] text-nf-text-dim">{{ t("aiStudio.noAccess") }}</p>
    </div>
    <div v-else class="mx-auto max-w-[1280px] px-5 py-6">
      <nav
        class="mb-4 flex flex-wrap gap-1 border-b border-nf-border"
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
        <button v-if="canManage" data-testid="create-definition" class="mb-4 rounded-lg bg-nf-accent px-3.5 py-2 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus" @click="openCreate">{{ t('aiStudio.creation.open') }} · {{ kindLabel }}</button>
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
        <DefinitionCreateDialog v-if="createOpen && canManage" :key="`${workspaceId}-${kind}`" :workspace-id="workspaceId" :kind="kind" @close="closeCreate" @created="onCreated" />
        <StarterPackInstall v-if="canManage" :key="workspaceId" :workspace-id="workspaceId" @installed="onStarterInstalled" />
        <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div class="min-w-0 rounded-xl border border-nf-border bg-nf-bg-1 p-2">
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
          <div class="min-w-0 rounded-xl border border-nf-border bg-nf-bg-1 p-4">
            <DefinitionDetail
              v-if="selectedDefinition"
              :key="selectedDefinition"
              :kind="kind"
              :id="selectedDefinition"
              :workspace-id="workspaceId"
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
          <RunGraph v-else-if="runDetail" :run="runDetail" :workspace-id="workspaceId" @retried="selectRun($event.runId)" />
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
