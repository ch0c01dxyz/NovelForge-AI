<template>
  <div class="mx-auto max-w-5xl px-5 py-10 sm:px-8" data-testid="endgame-panel">
    <BackLink :to="`/workspaces/${workspaceId}/novels/${novelId}`" :label="t('recovery.backToWorkspace')" class="mb-4" />
    <header class="mb-6">
      <h1 class="font-nf-literary text-[30px] font-semibold text-nf-text">{{ t("endgame.title") }}</h1>
      <p class="mt-1 text-[13px] text-nf-text-dim">{{ t("endgame.subtitle") }}</p>
    </header>

    <p v-if="forbidden" role="alert" class="rounded-xl border border-nf-error/40 bg-nf-error/5 p-5 text-[13px] text-nf-error" data-testid="endgame-forbidden">
      {{ t("endgame.forbidden") }}
    </p>

    <div v-else class="space-y-6">
      <EndgameGateBanner
        v-if="gate"
        :gate="gate"
        :approving="approving"
        :approve-error="approveError"
        @approve="onApprove"
      />

      <EndgameLedgerList
        :entries="entries"
        :loading="ledgerLoading"
        :load-error="ledgerError"
        :updating-id="updatingId"
        @create="createOpen = true"
        @change-status="onChangeStatus"
      />

      <EndgameDebtReport :report="report" :load-error="debtError" />

      <!-- NF-WF-022B: callbacks + legacy sections (additive; 022A owns the
           ledger/gate/debt sections above). -->
      <EndgameCallbackList
        :callbacks="callbacks"
        :loading="callbacksLoading"
        :load-error="callbacksError"
        @create="callbackCreateOpen = true"
      />

      <EndgameLegacyList
        :legacies="legacies"
        :loading="legaciesLoading"
        :load-error="legaciesError"
        @create="legacyCreateOpen = true"
      />

      <!-- NF-WF-022C: projection (simulation tab) section (additive; 022A owns the
           ledger/gate/debt sections above). -->
      <EndgameProjectionView
        :workspace-id="workspaceId"
        :novel-id="novelId"
      />
    </div>

    <EndgameCallbackCreate
      v-if="callbackCreateOpen"
      :workspace-id="workspaceId"
      :novel-id="novelId"
      @close="callbackCreateOpen = false"
      @created="onCallbackCreated"
    />

    <EndgameLegacyCreate
      v-if="legacyCreateOpen"
      :workspace-id="workspaceId"
      :novel-id="novelId"
      @close="legacyCreateOpen = false"
      @created="onLegacyCreated"
    />

    <EndgameLedgerCreate
      v-if="createOpen"
      :threads="threads"
      :creating="creating"
      :error="createError"
      @close="createOpen = false"
      @submit="onCreate"
    />
  </div>
</template>

<script setup lang="ts">
import BackLink from "../../../../../components/ui/BackLink.vue";
/**
 * NF-WF-022A: Endgame panel page.
 *
 * Closure ledger (MUST/SHOULD/MAY/OPEN/SEQUEL) with status badges and
 * explicit status changes, the condition-based ending gate banner with
 * author sign-off, and the debt report. §15 foundational design; en+id;
 * axe.
 */
import { onMounted, ref } from "vue";
import { useLocale } from "../../../../../composables/useLocale";
import {
  useEndgameLedgerApi,
  type DebtReportShape,
  type EndgameClosureStatus,
  type EndgameLedgerShape,
  type EndingGateShape,
  type StoryThreadOption,
} from "../../../../../components/endgame/endgameLedgerApi";
import EndgameLedgerList from "../../../../../components/endgame/EndgameLedgerList.vue";
import EndgameLedgerCreate from "../../../../../components/endgame/EndgameLedgerCreate.vue";
import EndgameGateBanner from "../../../../../components/endgame/EndgameGateBanner.vue";
import EndgameDebtReport from "../../../../../components/endgame/EndgameDebtReport.vue";
// NF-WF-022B: callbacks + legacy.
import {
  useEndgameCallbackApi,
  type EndgameCallbackShape,
  type EndgameLegacyShape,
} from "../../../../../components/endgame/endgameCallbackApi";
import EndgameCallbackList from "../../../../../components/endgame/EndgameCallbackList.vue";
import EndgameCallbackCreate from "../../../../../components/endgame/EndgameCallbackCreate.vue";
import EndgameLegacyList from "../../../../../components/endgame/EndgameLegacyList.vue";
import EndgameLegacyCreate from "../../../../../components/endgame/EndgameLegacyCreate.vue";
// NF-WF-022C: endgame projection (simulation tab).
import EndgameProjectionView from "../../../../../components/endgame/EndgameProjectionView.vue";

const route = useRoute();
const { t } = useLocale();

const workspaceId = String(route.params.workspaceId ?? "");
const novelId = String(route.params.novelId ?? "");
const ledgerApi = useEndgameLedgerApi(workspaceId, novelId);

const entries = ref<EndgameLedgerShape[]>([]);
const ledgerLoading = ref(true);
const ledgerError = ref(false);
const gate = ref<EndingGateShape | null>(null);
const approving = ref(false);
const approveError = ref<string | null>(null);
const report = ref<DebtReportShape | null>(null);
const debtError = ref(false);
const forbidden = ref(false);
const createOpen = ref(false);
const threads = ref<StoryThreadOption[]>([]);
const creating = ref(false);
const createError = ref<string | null>(null);
const updatingId = ref<string | null>(null);

// NF-WF-022B: callbacks + legacy state.
const callbackApi = useEndgameCallbackApi(workspaceId, novelId);
const callbacks = ref<EndgameCallbackShape[]>([]);
const callbacksLoading = ref(true);
const callbacksError = ref(false);
const callbackCreateOpen = ref(false);
const legacies = ref<EndgameLegacyShape[]>([]);
const legaciesLoading = ref(true);
const legaciesError = ref(false);
const legacyCreateOpen = ref(false);

async function loadCallbacks(): Promise<void> {
  callbacksLoading.value = true;
  callbacksError.value = false;
  try {
    callbacks.value = await callbackApi.listCallbacks();
  } catch (e) {
    if (isForbidden(e)) forbidden.value = true;
    else callbacksError.value = true;
  } finally {
    callbacksLoading.value = false;
  }
}

async function loadLegacies(): Promise<void> {
  legaciesLoading.value = true;
  legaciesError.value = false;
  try {
    legacies.value = await callbackApi.listLegacies();
  } catch (e) {
    if (isForbidden(e)) forbidden.value = true;
    else legaciesError.value = true;
  } finally {
    legaciesLoading.value = false;
  }
}

async function onCallbackCreated(): Promise<void> {
  callbackCreateOpen.value = false;
  await loadCallbacks();
}

async function onLegacyCreated(): Promise<void> {
  legacyCreateOpen.value = false;
  await loadLegacies();
}

function isForbidden(e: unknown): boolean {
  return e instanceof Error && (e as { code?: string }).code === "FORBIDDEN";
}

async function loadLedger(): Promise<void> {
  ledgerLoading.value = true;
  ledgerError.value = false;
  try {
    entries.value = (await ledgerApi.listLedger()).entries;
  } catch (e) {
    if (isForbidden(e)) forbidden.value = true;
    else ledgerError.value = true;
  } finally {
    ledgerLoading.value = false;
  }
}

async function loadGate(): Promise<void> {
  try {
    gate.value = (await ledgerApi.getGate()).gate;
  } catch (e) {
    if (isForbidden(e)) forbidden.value = true;
  }
}

async function loadDebt(): Promise<void> {
  debtError.value = false;
  try {
    report.value = (await ledgerApi.getDebtReport()).report;
  } catch (e) {
    if (isForbidden(e)) forbidden.value = true;
    else debtError.value = true;
  }
}

async function loadThreads(): Promise<void> {
  try {
    threads.value = (await ledgerApi.listThreads()).threads;
  } catch {
    threads.value = [];
  }
}

async function onCreate(body: {
  threadId: string;
  status: EndgameClosureStatus;
  criteria?: string;
  rationale?: string;
}): Promise<void> {
  creating.value = true;
  createError.value = null;
  try {
    await ledgerApi.createLedger(body);
    createOpen.value = false;
    await Promise.all([loadLedger(), loadGate(), loadDebt()]);
  } catch (e) {
    createError.value = e instanceof Error ? e.message : String(e);
  } finally {
    creating.value = false;
  }
}

async function onChangeStatus(entry: EndgameLedgerShape, status: string): Promise<void> {
  if (status === entry.status) return;
  updatingId.value = entry.id;
  try {
    await ledgerApi.updateLedger(entry.id, { status: status as EndgameClosureStatus });
    await Promise.all([loadLedger(), loadGate(), loadDebt()]);
  } finally {
    updatingId.value = null;
  }
}

async function onApprove(): Promise<void> {
  approving.value = true;
  approveError.value = null;
  try {
    gate.value = (await ledgerApi.approveGate()).gate;
  } catch (e) {
    approveError.value = e instanceof Error ? e.message : String(e);
  } finally {
    approving.value = false;
  }
}

onMounted(() => {
  void loadLedger();
  void loadGate();
  void loadDebt();
  void loadThreads();
  // NF-WF-022B.
  void loadCallbacks();
  void loadLegacies();
});
</script>
