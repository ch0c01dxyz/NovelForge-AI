<script setup lang="ts">
/**
 * Evaluation receipts (NF-WF-018C): the durable `FinalTextReview`
 * receipts per chapter version (verdict, violations, revision pin) via
 * the GAP-067 additive read route, plus story health as an explicitly
 * live computation.
 *
 * Receipts honesty (contract Invariant 4): health is labeled "computed
 * on demand, not a stored receipt" — it is never presented as a
 * durable receipt, and this surface never persists health results (Q2).
 */
import { ref, onMounted, watch } from "vue";
import {
  useReceipts,
  type FinalTextReviewRow,
  type NovelSummary,
} from "../../composables/useReceipts";
import { useLocale } from "../../composables/useLocale";

const props = defineProps<{
  workspaceId: string;
}>();

const { t } = useLocale();
const receipts = useReceipts();

const novels = ref<NovelSummary[]>([]);
const novelsLoading = ref(false);
const selectedNovelId = ref<string>("");

const rows = ref<FinalTextReviewRow[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const selectedId = ref<string | null>(null);

interface HealthView {
  findings: unknown[];
  unresolved: unknown[];
  sourceRevisionId: string;
}

const health = ref<HealthView | null>(null);
const healthLoading = ref(false);
const healthError = ref<string | null>(null);
const healthRan = ref(false);

function violationCount(row: FinalTextReviewRow): number {
  return Array.isArray(row.hardViolations) ? row.hardViolations.length : 0;
}

/**
 * SCALE review display (050B): legacy (null) vs current protocol 1.
 * Null scaleReview = legacy receipt, never new proof of SCALE completeness.
 */
function scaleStateLabel(row: FinalTextReviewRow): string {
  if (!row.scaleReview) return t("receipts.evaluations.scaleLegacy");
  return t(`receipts.evaluations.scaleState.${row.scaleReview.state}`);
}

function scaleStateClass(row: FinalTextReviewRow): string {
  if (!row.scaleReview) return "bg-nf-bg-2 text-nf-text-dim";
  if (row.scaleReview.blocking) return "bg-nf-danger/15 text-nf-danger";
  return "bg-nf-ok/15 text-nf-ok";
}

function verdictClass(verdict: string): string {
  return verdict === "PASS" ? "bg-nf-ok/15 text-nf-ok" : "bg-nf-warn/15 text-nf-warn";
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

function toJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

async function loadNovels() {
  novelsLoading.value = true;
  try {
    novels.value = await receipts.listNovels(props.workspaceId);
    if (novels.value.length > 0 && !selectedNovelId.value) {
      selectedNovelId.value = novels.value[0]!.id;
    }
  } catch {
    novels.value = [];
  } finally {
    novelsLoading.value = false;
  }
}

async function refresh() {
  if (!selectedNovelId.value) return;
  loading.value = true;
  error.value = null;
  try {
    rows.value = await receipts.listFinalTextReviews(props.workspaceId, selectedNovelId.value);
  } catch (err) {
    error.value = err instanceof Error ? err.message : "unknown";
  } finally {
    loading.value = false;
  }
}

async function runHealth() {
  if (!selectedNovelId.value) return;
  healthLoading.value = true;
  healthError.value = null;
  try {
    const raw = await receipts.getStoryHealth(props.workspaceId, selectedNovelId.value);
    health.value = {
      findings: Array.isArray(raw.findings) ? raw.findings : [],
      unresolved: Array.isArray(raw.unresolved) ? raw.unresolved : [],
      sourceRevisionId: typeof raw.sourceRevisionId === "string" ? raw.sourceRevisionId : "",
    };
    healthRan.value = true;
  } catch (err) {
    healthError.value = err instanceof Error ? err.message : "unknown";
  } finally {
    healthLoading.value = false;
  }
}

function selectRow(id: string) {
  selectedId.value = selectedId.value === id ? null : id;
}

onMounted(async () => {
  await loadNovels();
  await refresh();
});
watch(selectedNovelId, () => {
  selectedId.value = null;
  health.value = null;
  healthRan.value = false;
  refresh();
});
watch(() => props.workspaceId, async () => {
  await loadNovels();
  await refresh();
});
</script>

<template>
  <section aria-labelledby="eval-heading">
    <div class="mb-3 flex flex-wrap items-center gap-3">
      <h2 id="eval-heading" class="text-[15px] font-semibold text-nf-text">
        {{ t("receipts.evaluations.title") }}
      </h2>
      <div class="ml-auto flex items-center gap-2">
        <label for="eval-novel-select" class="text-[12.5px] text-nf-text-dim">
          {{ t("receipts.evaluations.novel") }}
        </label>
        <select
          id="eval-novel-select"
          v-model="selectedNovelId"
          class="rounded-lg border border-nf-border bg-nf-bg-0 px-2 py-1 text-[12.5px] text-nf-text focus-visible:nf-focus"
        >
          <option v-for="n in novels" :key="n.id" :value="n.id">{{ n.title }}</option>
        </select>
      </div>
    </div>

    <div v-if="novelsLoading" class="py-6 text-center text-nf-text-faint" role="status">{{ t("common.loading") }}</div>
    <p v-else-if="novels.length === 0" class="py-10 text-center text-[13px] text-nf-text-faint">
      {{ t("receipts.evaluations.noNovels") }}
    </p>
    <div v-else>
      <!-- Durable receipts -->
      <h3 class="mb-2 text-[13px] font-semibold text-nf-text">{{ t("receipts.evaluations.receiptsTitle") }}</h3>
      <div v-if="loading" class="py-6 text-center text-nf-text-faint" role="status">{{ t("common.loading") }}</div>
      <div v-else-if="error" class="py-6 text-center" role="alert"><p class="text-nf-warn">{{ error }}</p></div>
      <p v-else-if="rows.length === 0" class="py-6 text-center text-[13px] text-nf-text-faint">
        {{ t("receipts.evaluations.empty") }}
      </p>
      <div v-else class="overflow-x-auto rounded-xl border border-nf-border bg-nf-bg-1">
        <table class="w-full min-w-[680px] border-collapse text-left text-[12.5px]">
          <caption class="sr-only">{{ t("receipts.evaluations.receiptsTitle") }}</caption>
          <thead>
            <tr class="border-b border-nf-border bg-nf-bg-2/60">
              <th scope="col" class="px-3 py-2 font-semibold text-nf-text-dim">{{ t("receipts.evaluations.chapter") }}</th>
              <th scope="col" class="px-3 py-2 font-semibold text-nf-text-dim">{{ t("receipts.evaluations.verdict") }}</th>
              <th scope="col" class="px-3 py-2 font-semibold text-nf-text-dim">{{ t("receipts.evaluations.violations") }}</th>
              <th scope="col" class="px-3 py-2 font-semibold text-nf-text-dim">{{ t("receipts.evaluations.scale") }}</th>
              <th scope="col" class="px-3 py-2 font-semibold text-nf-text-dim">{{ t("receipts.evaluations.revisionPin") }}</th>
              <th scope="col" class="px-3 py-2 font-semibold text-nf-text-dim">{{ t("receipts.evaluations.created") }}</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="row in rows" :key="row.id">
              <tr
                class="cursor-pointer border-b border-nf-border/60 hover:bg-nf-bg-2/40 focus-visible:nf-focus"
                tabindex="0"
                @click="selectRow(row.id)"
                @keydown.enter="selectRow(row.id)"
                @keydown.space.prevent="selectRow(row.id)"
              >
                <td class="px-3 py-2 text-nf-text">
                  <span class="font-medium">{{ row.chapterNumber }}.</span> {{ row.chapterTitle }}
                </td>
                <td class="px-3 py-2">
                  <span class="rounded-full px-2 py-0.5 text-[11px] font-medium" :class="verdictClass(row.verdict)">
                    {{ row.verdict }}
                  </span>
                </td>
                <td class="px-3 py-2 text-nf-text-dim">{{ violationCount(row) }}</td>
                <td class="px-3 py-2">
                  <span class="rounded-full px-2 py-0.5 text-[11px] font-medium" :class="scaleStateClass(row)">
                    {{ scaleStateLabel(row) }}
                  </span>
                </td>
                <td class="px-3 py-2 font-mono text-[11.5px] text-nf-text-dim" :title="row.revisionId">
                  {{ row.revisionId.slice(0, 8) }}
                </td>
                <td class="whitespace-nowrap px-3 py-2 text-nf-text-dim">{{ formatDate(row.createdAt) }}</td>
              </tr>
              <tr v-if="selectedId === row.id" class="border-b border-nf-border/60 bg-nf-bg-2/40">
                <td colspan="6" class="px-4 py-3">
                  <p class="mb-1 text-[11.5px] font-semibold uppercase tracking-wide text-nf-text-dim">
                    {{ t("receipts.evaluations.violationsDetail") }}
                  </p>
                  <pre class="max-h-48 overflow-auto rounded-lg bg-nf-bg-0 p-3 font-mono text-[11px] text-nf-text">{{ toJson(row.hardViolations) }}</pre>
                  <p class="mb-1 mt-3 text-[11.5px] font-semibold uppercase tracking-wide text-nf-text-dim">
                    {{ t("receipts.evaluations.advisoryDetail") }}
                  </p>
                  <pre class="max-h-48 overflow-auto rounded-lg bg-nf-bg-0 p-3 font-mono text-[11px] text-nf-text">{{ toJson(row.advisory) }}</pre>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>

      <!-- Live health computation -->
      <h3 class="mb-2 mt-6 text-[13px] font-semibold text-nf-text">{{ t("receipts.evaluations.healthTitle") }}</h3>
      <div class="rounded-xl border border-nf-border bg-nf-bg-1 p-4">
        <div class="mb-3 flex flex-wrap items-center gap-3">
          <span class="rounded-full bg-nf-bg-2 px-2.5 py-1 text-[11.5px] text-nf-text-dim">
            {{ t("receipts.evaluations.healthLiveLabel") }}
          </span>
          <button
            class="rounded-lg border border-nf-border-strong px-3 py-1.5 text-[12.5px] text-nf-text focus-visible:nf-focus disabled:opacity-50"
            :disabled="healthLoading"
            @click="runHealth"
          >
            {{ t("receipts.evaluations.runHealth") }}
          </button>
        </div>
        <div v-if="healthLoading" class="py-4 text-center text-nf-text-faint" role="status">{{ t("common.loading") }}</div>
        <div v-else-if="healthError" class="py-4 text-center" role="alert"><p class="text-nf-warn">{{ healthError }}</p></div>
        <div v-else-if="health">
          <dl class="grid grid-cols-1 gap-2 text-[12.5px] sm:grid-cols-3">
            <div class="rounded-lg bg-nf-bg-2/60 px-3 py-2">
              <dt class="text-nf-text-dim">{{ t("receipts.evaluations.findings") }}</dt>
              <dd class="text-[16px] font-semibold text-nf-text">{{ health.findings.length }}</dd>
            </div>
            <div class="rounded-lg bg-nf-bg-2/60 px-3 py-2">
              <dt class="text-nf-text-dim">{{ t("receipts.evaluations.unresolved") }}</dt>
              <dd class="text-[16px] font-semibold text-nf-text">{{ health.unresolved.length }}</dd>
            </div>
            <div class="rounded-lg bg-nf-bg-2/60 px-3 py-2">
              <dt class="text-nf-text-dim">{{ t("receipts.evaluations.sourceRevision") }}</dt>
              <dd class="font-mono text-[12px] text-nf-text" :title="health.sourceRevisionId">
                {{ health.sourceRevisionId.slice(0, 8) }}
              </dd>
            </div>
          </dl>
        </div>
        <p v-else-if="healthRan === false" class="text-[12.5px] text-nf-text-faint">
          {{ t("receipts.evaluations.healthHint") }}
        </p>
      </div>
    </div>
  </section>
</template>
