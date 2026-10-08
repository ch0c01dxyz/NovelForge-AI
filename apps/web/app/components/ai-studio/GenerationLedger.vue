<script setup lang="ts">
/**
 * Generation ledger (NF-WF-018C): the durable usage receipts —
 * `Generation` rows (task, profile, status, tokens, latency, error
 * category) from the frozen ledger routes. The detail panel shows the
 * per-attempt rows (`GenerationAttempt`: gateway, model, status,
 * latency).
 *
 * Receipts honesty (contract Invariant 4): there is NO cost field
 * anywhere on this surface — the header carries the honest label
 * "tokens and latency only — no cost accounting". Never invent a cost
 * column (Q3).
 */
import { ref, computed, onMounted, watch } from "vue";
import { useReceipts, type GenerationRow, type GenerationDetail } from "../../composables/useReceipts";
import { useLocale } from "../../composables/useLocale";

const props = defineProps<{
  workspaceId: string;
  /** Locks the status filter (the failure log pins FAILED). */
  lockedStatus?: string;
}>();

const { t } = useLocale();
const receipts = useReceipts();

const STATUS_OPTIONS = ["PENDING", "IN_PROGRESS", "SUCCEEDED", "INCOMPLETE", "FAILED"] as const;

const statusFilter = ref<string>(props.lockedStatus ?? "");
const rows = ref<GenerationRow[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const selectedId = ref<string | null>(null);
const detail = ref<GenerationDetail | null>(null);
const detailLoading = ref(false);
const detailError = ref<string | null>(null);

const filtered = computed(() =>
  statusFilter.value ? rows.value.filter((r) => r.status === statusFilter.value) : rows.value,
);

function statusLabel(status: string): string {
  return t(`receipts.ledger.statusValues.${status}`);
}

function statusClass(status: string): string {
  if (status === "SUCCEEDED") return "bg-nf-ok/15 text-nf-ok";
  if (status === "FAILED") return "bg-nf-warn/15 text-nf-warn";
  if (status === "IN_PROGRESS" || status === "PENDING") return "bg-nf-accent/10 text-nf-accent-hi";
  return "bg-nf-text-faint/15 text-nf-text-faint";
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

function formatMs(value: number | null): string {
  return value === null || value === undefined ? "—" : `${value} ms`;
}

function formatTokens(value: number | null): string {
  return value === null || value === undefined ? "—" : String(value);
}

async function refresh() {
  loading.value = true;
  error.value = null;
  try {
    rows.value = await receipts.listGenerations(props.workspaceId, { limit: 100 });
  } catch (err) {
    error.value = err instanceof Error ? err.message : "unknown";
  } finally {
    loading.value = false;
  }
}

async function selectRow(id: string) {
  if (selectedId.value === id) {
    selectedId.value = null;
    detail.value = null;
    return;
  }
  selectedId.value = id;
  detailLoading.value = true;
  detailError.value = null;
  try {
    detail.value = await receipts.getGeneration(props.workspaceId, id);
  } catch (err) {
    detailError.value = err instanceof Error ? err.message : "unknown";
  } finally {
    detailLoading.value = false;
  }
}

function closeDetail() {
  selectedId.value = null;
  detail.value = null;
}

onMounted(refresh);
watch(() => props.workspaceId, refresh);

defineExpose({ refresh });
</script>

<template>
  <section aria-labelledby="ledger-heading">
    <div class="mb-3 flex flex-wrap items-center gap-3">
      <h2 id="ledger-heading" class="text-[15px] font-semibold text-nf-text">
        {{ t("receipts.ledger.title") }}
      </h2>
      <span class="rounded-full bg-nf-bg-2 px-2.5 py-1 text-[11.5px] text-nf-text-dim">
        {{ t("receipts.ledger.noCostLabel") }}
      </span>
      <div v-if="!lockedStatus" class="ml-auto flex items-center gap-2">
        <label :for="`ledger-status-filter`" class="text-[12.5px] text-nf-text-dim">
          {{ t("receipts.ledger.statusFilter") }}
        </label>
        <select
          id="ledger-status-filter"
          v-model="statusFilter"
          class="rounded-lg border border-nf-border bg-nf-bg-0 px-2 py-1 text-[12.5px] text-nf-text focus-visible:nf-focus"
        >
          <option value="">{{ t("receipts.ledger.allStatuses") }}</option>
          <option v-for="s in STATUS_OPTIONS" :key="s" :value="s">{{ statusLabel(s) }}</option>
        </select>
      </div>
    </div>

    <div v-if="loading" class="py-10 text-center text-nf-text-faint" role="status">
      {{ t("common.loading") }}
    </div>
    <div v-else-if="error" class="py-10 text-center" role="alert">
      <p class="text-nf-warn">{{ error }}</p>
    </div>
    <p v-else-if="filtered.length === 0" class="py-10 text-center text-[13px] text-nf-text-faint">
      {{ t("receipts.ledger.empty") }}
    </p>
    <div v-else class="overflow-x-auto rounded-xl border border-nf-border bg-nf-bg-1">
      <table class="w-full min-w-[760px] border-collapse text-left text-[12.5px]">
        <caption class="sr-only">{{ t("receipts.ledger.title") }}</caption>
        <thead>
          <tr class="border-b border-nf-border bg-nf-bg-2/60">
            <th scope="col" class="px-3 py-2 font-semibold text-nf-text-dim">{{ t("receipts.ledger.created") }}</th>
            <th scope="col" class="px-3 py-2 font-semibold text-nf-text-dim">{{ t("receipts.ledger.task") }}</th>
            <th scope="col" class="px-3 py-2 font-semibold text-nf-text-dim">{{ t("receipts.ledger.profile") }}</th>
            <th scope="col" class="px-3 py-2 font-semibold text-nf-text-dim">{{ t("receipts.ledger.status") }}</th>
            <th scope="col" class="px-3 py-2 font-semibold text-nf-text-dim">{{ t("receipts.ledger.inTokens") }}</th>
            <th scope="col" class="px-3 py-2 font-semibold text-nf-text-dim">{{ t("receipts.ledger.outTokens") }}</th>
            <th scope="col" class="px-3 py-2 font-semibold text-nf-text-dim">{{ t("receipts.ledger.latency") }}</th>
            <th scope="col" class="px-3 py-2 font-semibold text-nf-text-dim">{{ t("receipts.ledger.errorCategory") }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in filtered"
            :key="row.id"
            class="cursor-pointer border-b border-nf-border/60 last:border-0 hover:bg-nf-bg-2/40 focus-visible:nf-focus"
            :class="selectedId === row.id ? 'bg-nf-bg-2/60' : ''"
            tabindex="0"
            @click="selectRow(row.id)"
            @keydown.enter="selectRow(row.id)"
            @keydown.space.prevent="selectRow(row.id)"
          >
            <td class="whitespace-nowrap px-3 py-2 text-nf-text-dim">{{ formatDate(row.createdAt) }}</td>
            <td class="px-3 py-2 font-mono text-[11.5px] text-nf-text">{{ row.task }}</td>
            <td class="whitespace-nowrap px-3 py-2 text-nf-text-dim">{{ row.modelProfile }}</td>
            <td class="px-3 py-2">
              <span class="rounded-full px-2 py-0.5 text-[11px] font-medium" :class="statusClass(row.status)">
                {{ statusLabel(row.status) }}
              </span>
            </td>
            <td class="px-3 py-2 text-nf-text-dim">{{ formatTokens(row.inputTokens) }}</td>
            <td class="px-3 py-2 text-nf-text-dim">{{ formatTokens(row.outputTokens) }}</td>
            <td class="whitespace-nowrap px-3 py-2 text-nf-text-dim">{{ formatMs(row.latencyMs) }}</td>
            <td class="px-3 py-2 text-nf-text-dim">{{ row.errorCategory ?? "—" }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="selectedId" class="mt-4 rounded-xl border border-nf-border bg-nf-bg-1 p-4" role="region" :aria-label="t('receipts.ledger.detailTitle')">
      <div class="mb-3 flex items-center justify-between">
        <h3 class="text-[13.5px] font-semibold text-nf-text">{{ t("receipts.ledger.detailTitle") }}</h3>
        <button
          class="rounded-lg border border-nf-border-strong px-2.5 py-1 text-[12px] text-nf-text-dim focus-visible:nf-focus"
          @click="closeDetail"
        >
          {{ t("common.close") }}
        </button>
      </div>
      <div v-if="detailLoading" class="py-6 text-center text-nf-text-faint" role="status">{{ t("common.loading") }}</div>
      <div v-else-if="detailError" class="py-6 text-center" role="alert"><p class="text-nf-warn">{{ detailError }}</p></div>
      <div v-else-if="detail">
        <p v-if="detail.errorMessage" class="mb-3 rounded-lg bg-nf-warn/10 px-3 py-2 text-[12.5px] text-nf-warn">
          {{ detail.errorMessage }}
        </p>
        <table class="w-full border-collapse text-left text-[12.5px]">
          <caption class="sr-only">{{ t("receipts.ledger.attempts") }}</caption>
          <thead>
            <tr class="border-b border-nf-border bg-nf-bg-2/60">
              <th scope="col" class="px-3 py-2 font-semibold text-nf-text-dim">#</th>
              <th scope="col" class="px-3 py-2 font-semibold text-nf-text-dim">{{ t("receipts.ledger.gateway") }}</th>
              <th scope="col" class="px-3 py-2 font-semibold text-nf-text-dim">{{ t("receipts.ledger.model") }}</th>
              <th scope="col" class="px-3 py-2 font-semibold text-nf-text-dim">{{ t("receipts.ledger.status") }}</th>
              <th scope="col" class="px-3 py-2 font-semibold text-nf-text-dim">{{ t("receipts.ledger.latency") }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in detail.attempts" :key="a.attemptNumber" class="border-b border-nf-border/60 last:border-0">
              <td class="px-3 py-2 text-nf-text-dim">{{ a.attemptNumber }}</td>
              <td class="px-3 py-2 font-mono text-[11.5px] text-nf-text-dim" :title="a.gatewayId ?? ''">
                {{ a.gatewayId ? a.gatewayId.slice(0, 8) : "—" }}
              </td>
              <td class="px-3 py-2 text-nf-text">
                <div>{{ t("usage.requestedModel") }}: {{ a.requestedModelId ?? t("usage.unknown") }}</div>
                <div>{{ t("usage.reportedModel") }}: {{ a.reportedModelId ?? t("usage.unknown") }}</div>
                <div v-if="!a.requestedModelId && !a.reportedModelId && a.modelId" class="text-[11.5px] text-nf-text-dim">{{ a.modelId }} — {{ t("usage.legacyModel") }}</div>
                <div class="text-[11.5px] text-nf-text-dim">{{ t("usage.inputTokens") }}: {{ formatTokens(a.inputTokens ?? null) }} / {{ t("usage.outputTokens") }}: {{ formatTokens(a.outputTokens ?? null) }}</div>
              </td>
              <td class="px-3 py-2">
                <span class="rounded-full px-2 py-0.5 text-[11px] font-medium" :class="statusClass(a.status)">
                  {{ a.status }}
                </span>
              </td>
              <td class="whitespace-nowrap px-3 py-2 text-nf-text-dim">{{ formatMs(a.latencyMs) }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="detail.attempts.length === 0" class="py-4 text-center text-[12.5px] text-nf-text-faint">
          {{ t("receipts.ledger.noAttempts") }}
        </p>
      </div>
    </div>
  </section>
</template>
