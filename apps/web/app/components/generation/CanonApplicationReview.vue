<script setup lang="ts">
import { ref, computed } from "vue";
/**
 * Canon application review dialog (NF-WF-008 output): the author-facing
 * surface for contracted extraction application. Extends the 007
 * ProposalsPanel review area (Q6).
 *
 * Flow: the dialog lists each extraction claim with its citations; the
 * author contracts each claim (entity picker incl. inline-new, predicate,
 * object, validFromChapter defaulting to the run's chapterNumber per Q3),
 * validates (POST create → verdicts), then approves selected items or
 * rejects. Verdict chips, CONFLICT side-by-side with the live fact +
 * explicit confirmation, STALE → revalidate affordance, and the applied
 * audit trail are all rendered here. No model call sits in this path.
 */
import { useLocale } from "../../composables/useLocale";
import { useApi, ApiError } from "../../composables/useApi";

export interface ExtractionProposal {
  kind: string;
  text: string;
  citations: Array<{ source: string; span: string }>;
}

interface Contracting {
  entityMode: "existing" | "inline";
  entityId: string;
  inlineKind: string;
  inlineName: string;
  predicate: string;
  objectText: string;
  validFromChapter: string;
  selected: boolean;
  confirmConflict: boolean;
}

interface ApplicationItem {
  id: string;
  claimIndex: number;
  kind: string;
  text: string;
  entityId: string | null;
  entityName: string | null;
  predicate: string;
  object: { entityId?: string; text?: string };
  validFromChapter: number | null;
  evidence: Array<{ inputName: string; quote: string; start: number; end: number }>;
  verdict: "APPLICABLE" | "CONFLICT" | "DUPLICATE" | "UNSUPPORTED";
  verdictReasons: string[];
  conflictsWith?: { factId: string; statement: string } | null;
}

interface ApplicationView {
  id: string;
  status: string;
  headRevisionId: string | null;
  items: ApplicationItem[];
}

const props = defineProps<{
  workspaceId: string;
  novelId: string;
  runId: string;
  chapterNumber: number | null;
  proposals: ExtractionProposal[];
}>();

const emit = defineEmits<{ (e: "close"): void; (e: "decided", status: "APPLIED" | "REJECTED"): void }>();

const { t } = useLocale();
const { api } = useApi();

/** Localised decide-error message; the raw English code is the fallback. */
function errMsg(code: string): string {
  const key = `canonReview.errors.${code}`;
  const msg = t(key);
  return msg === key ? code : msg;
}

/** Localised application status; the raw status is the fallback. */
function statusLabel(status: string): string {
  const key = `canonReview.status.${status}`;
  const msg = t(key);
  return msg === key ? status : msg;
}

const ENTITY_KINDS = ["CHARACTER", "LOCATION", "ITEM", "ORGANIZATION", "EVENT", "CONCEPT"];

const entities = ref<Array<{ id: string; kind: string; name: string }>>([]);
const contracting = ref<Contracting[]>([]);
const application = ref<ApplicationView | null>(null);
const creating = ref(false);
const deciding = ref(false);
const error = ref<string | null>(null);
const errorCode = ref<string | null>(null);
const appliedResult = ref<{
  appliedItems: Array<{ itemId: string; factId: string; entityId: string; supersededFactId: string | null }>;
  invalidatedScopes: string[];
} | null>(null);
const auditNote = ref<string | null>(null);

const base = computed(
  () => `/workspaces/${props.workspaceId}/novels/${props.novelId}/canon/applications`,
);

function defaultValidFrom(): string {
  return props.chapterNumber !== null ? String(props.chapterNumber) : "";
}

function initContracting() {
  contracting.value = props.proposals.map((p) => ({
    entityMode: "inline" as const,
    entityId: "",
    inlineKind: "CHARACTER",
    inlineName: "",
    predicate: "",
    objectText: p.text,
    validFromChapter: defaultValidFrom(),
    selected: true,
    confirmConflict: false,
  }));
}

async function loadEntities() {
  try {
    entities.value = await api<Array<{ id: string; kind: string; name: string }>>(
      `/workspaces/${props.workspaceId}/novels/${props.novelId}/canon/entities`,
    );
  } catch {
    entities.value = [];
  }
}

function buildItems() {
  return contracting.value.map((c, i) => {
    const vfc = c.validFromChapter.trim() === "" ? null : Number(c.validFromChapter);
    return {
      claimIndex: i,
      entity:
        c.entityMode === "existing"
          ? { id: c.entityId }
          : { kind: c.inlineKind, name: c.inlineName.trim() },
      predicate: c.predicate.trim(),
      object: { text: c.objectText.trim() },
      validFromChapter: Number.isFinite(vfc) ? vfc : null,
    };
  });
}

async function createApplication() {
  creating.value = true;
  error.value = null;
  errorCode.value = null;
  try {
    application.value = await api<ApplicationView>(base.value, {
      method: "POST",
      body: JSON.stringify({ runId: props.runId, items: buildItems() }),
    });
  } catch (e) {
    if (e instanceof ApiError) {
      errorCode.value = e.code;
      error.value = errMsg(e.code);
    } else {
      error.value = t("errors.network");
    }
  } finally {
    creating.value = false;
  }
}

async function revalidate() {
  if (!application.value) return;
  deciding.value = true;
  error.value = null;
  errorCode.value = null;
  try {
    application.value = await api<ApplicationView>(`${base.value}/${application.value.id}/revalidate`, {
      method: "POST",
    });
  } catch (e) {
    if (e instanceof ApiError) {
      errorCode.value = e.code;
      error.value = errMsg(e.code);
    } else {
      error.value = t("errors.network");
    }
  } finally {
    deciding.value = false;
  }
}

function selectedItems(): ApplicationItem[] {
  if (!application.value) return [];
  return application.value.items.filter((item) => {
    const c = contracting.value[item.claimIndex];
    return c?.selected;
  });
}

async function approve() {
  if (!application.value) return;
  const items = selectedItems();
  const needsConfirm = items.some((i) => i.verdict === "CONFLICT");
  const allConfirmed =
    !needsConfirm ||
    items
      .filter((i) => i.verdict === "CONFLICT")
      .every((i) => contracting.value[i.claimIndex]?.confirmConflict);
  if (needsConfirm && !allConfirmed) {
    errorCode.value = "CONFLICT_NOT_CONFIRMED";
    error.value = t("canonReview.errors.CONFLICT_NOT_CONFIRMED");
    return;
  }
  deciding.value = true;
  error.value = null;
  errorCode.value = null;
  try {
    const result = await api<{
      applicationId: string;
      status: string;
      appliedItems: Array<{ itemId: string; factId: string; entityId: string; supersededFactId: string | null }>;
      invalidatedScopes: string[];
    }>(`${base.value}/${application.value.id}/approve`, {
      method: "POST",
      body: JSON.stringify({
        itemIds: items.map((i) => i.id),
        confirmConflicts: needsConfirm,
      }),
    });
    appliedResult.value = {
      appliedItems: result.appliedItems,
      invalidatedScopes: result.invalidatedScopes,
    };
    application.value = { ...application.value, status: "APPLIED" };
    emit("decided", "APPLIED");
    auditNote.value = t("canonReview.appliedNote", {
      count: String(result.appliedItems.length),
    });
  } catch (e) {
    if (e instanceof ApiError) {
      errorCode.value = e.code;
      // STALE_APPLICATION carries the revalidate affordance (contract).
      error.value = errMsg(e.code);
    } else {
      error.value = t("errors.network");
    }
  } finally {
    deciding.value = false;
  }
}

async function reject() {
  if (!application.value) return;
  deciding.value = true;
  error.value = null;
  errorCode.value = null;
  try {
    await api(`${base.value}/${application.value.id}/reject`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    application.value = { ...application.value, status: "REJECTED" };
    emit("decided", "REJECTED");
  } catch (e) {
    if (e instanceof ApiError) {
      errorCode.value = e.code;
      error.value = errMsg(e.code);
    } else {
      error.value = t("errors.network");
    }
  } finally {
    deciding.value = false;
  }
}

function verdictClass(verdict: string): string {
  switch (verdict) {
    case "APPLICABLE":
      return "border-nf-ok/40 bg-nf-ok/10 text-nf-ok";
    case "CONFLICT":
      return "border-nf-warn/40 bg-nf-warn/10 text-nf-warn";
    case "DUPLICATE":
      return "border-nf-text-faint/40 bg-nf-bg-2 text-nf-text-faint";
    default:
      return "border-nf-error/40 bg-nf-error/10 text-nf-error";
  }
}

function itemByIndex(i: number): ApplicationItem | undefined {
  return application.value?.items.find((it) => it.claimIndex === i);
}

initContracting();
void loadEntities();
</script>

<template>
  <div
    role="dialog"
    aria-modal="true"
    :aria-label="t('canonReview.title')"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    @click.self="emit('close')"
  >
    <div
      class="flex max-h-[90vh] w-full max-w-[760px] flex-col gap-3 overflow-hidden rounded-xl border border-nf-border bg-nf-bg-1 p-5"
    >
      <div class="flex items-center gap-2">
        <h2 class="text-[14px] font-semibold text-nf-text">{{ t("canonReview.title") }}</h2>
        <div class="flex-1" />
        <button
          class="rounded-md px-2 py-1 text-[12.5px] text-nf-text-dim hover:bg-nf-bg-2 focus-visible:nf-focus"
          @click="emit('close')"
        >
          {{ t("common.close") }}
        </button>
      </div>

      <p class="text-[12.5px] leading-relaxed text-nf-text-dim">{{ t("canonReview.intro") }}</p>

      <div class="flex-1 overflow-y-auto">
        <ol class="flex flex-col gap-3">
          <li
            v-for="(p, i) in proposals"
            :key="i"
            class="rounded-lg border border-nf-border bg-nf-bg-2 px-3 py-2.5"
          >
            <div class="flex items-start gap-2">
              <div class="flex-1">
                <div class="text-[11px] font-medium uppercase tracking-wide text-nf-text-faint">
                  {{ t("canonReview.claim", { n: String(i + 1) }) }} · {{ p.kind }}
                </div>
                <p class="mt-0.5 text-[12.5px] text-nf-text">{{ p.text }}</p>
                <ul class="mt-1 flex flex-col gap-0.5 font-mono text-[11px] text-nf-text-dim">
                  <li v-for="(c, j) in p.citations" :key="j" class="break-all">
                    {{ c.source }} <span class="text-nf-text-faint">{{ c.span }}</span>
                  </li>
                </ul>
              </div>
              <span
                v-if="itemByIndex(i)"
                class="shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold"
                :class="verdictClass(itemByIndex(i)!.verdict)"
              >
                {{ itemByIndex(i)!.verdict }}
              </span>
            </div>

            <!-- Contracting controls (author binds; backend validates) -->
            <div v-if="!application" class="mt-2 grid grid-cols-2 gap-2">
              <label class="flex flex-col gap-1 text-[12px]">
                <span class="font-medium text-nf-text-dim">{{ t("canonReview.entity") }}</span>
                <div class="flex gap-1">
                  <select
                    v-model="contracting[i]!.entityMode"
                    class="rounded-md border border-nf-border-strong bg-nf-bg-1 px-2 py-1.5 text-[12.5px] text-nf-text focus-visible:nf-focus"
                  >
                    <option value="existing">{{ t("canonReview.existingEntity") }}</option>
                    <option value="inline">{{ t("canonReview.newEntity") }}</option>
                  </select>
                </div>
                <select
                  v-if="contracting[i]!.entityMode === 'existing'"
                  v-model="contracting[i]!.entityId"
                  class="rounded-md border border-nf-border-strong bg-nf-bg-1 px-2 py-1.5 text-[12.5px] text-nf-text focus-visible:nf-focus"
                >
                  <option value="">{{ t("canonReview.pickEntity") }}</option>
                  <option v-for="e in entities" :key="e.id" :value="e.id">
                    {{ e.name }} ({{ e.kind }})
                  </option>
                </select>
                <span v-else class="flex gap-1">
                  <select
                    v-model="contracting[i]!.inlineKind"
                    class="rounded-md border border-nf-border-strong bg-nf-bg-1 px-2 py-1.5 text-[12.5px] text-nf-text focus-visible:nf-focus"
                  >
                    <option v-for="k in ENTITY_KINDS" :key="k" :value="k">{{ k }}</option>
                  </select>
                  <input
                    v-model="contracting[i]!.inlineName"
                    :placeholder="t('canonReview.entityName')"
                    class="min-w-0 flex-1 rounded-md border border-nf-border-strong bg-nf-bg-1 px-2 py-1.5 text-[12.5px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
                  />
                </span>
              </label>
              <label class="flex flex-col gap-1 text-[12px]">
                <span class="font-medium text-nf-text-dim">{{ t("canonReview.predicate") }}</span>
                <input
                  v-model="contracting[i]!.predicate"
                  :placeholder="t('canonReview.predicatePlaceholder')"
                  class="rounded-md border border-nf-border-strong bg-nf-bg-1 px-2 py-1.5 text-[12.5px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
                />
              </label>
              <label class="flex flex-col gap-1 text-[12px]">
                <span class="font-medium text-nf-text-dim">{{ t("canonReview.object") }}</span>
                <input
                  v-model="contracting[i]!.objectText"
                  class="rounded-md border border-nf-border-strong bg-nf-bg-1 px-2 py-1.5 text-[12.5px] text-nf-text focus-visible:nf-focus"
                />
              </label>
              <label class="flex flex-col gap-1 text-[12px]">
                <span class="font-medium text-nf-text-dim">{{ t("canonReview.validFromChapter") }}</span>
                <input
                  v-model="contracting[i]!.validFromChapter"
                  type="number"
                  min="0"
                  :placeholder="t('canonReview.validFromPlaceholder')"
                  class="rounded-md border border-nf-border-strong bg-nf-bg-1 px-2 py-1.5 text-[12.5px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
                />
              </label>
            </div>

            <!-- Post-validation: verdict reasons, conflict side-by-side, selection -->
            <template v-if="itemByIndex(i)">
              <ul
                v-if="itemByIndex(i)!.verdictReasons.length"
                class="mt-1.5 flex flex-col gap-0.5 text-[12px] text-nf-warn"
              >
                <li v-for="(r, k) in itemByIndex(i)!.verdictReasons" :key="k">· {{ r }}</li>
              </ul>
              <div
                v-if="itemByIndex(i)!.verdict === 'CONFLICT' && itemByIndex(i)!.conflictsWith"
                class="mt-1.5 rounded-md border border-nf-warn/40 bg-nf-warn/10 px-2.5 py-2"
              >
                <div class="text-[11px] font-semibold uppercase tracking-wide text-nf-warn">
                  {{ t("canonReview.liveFact") }}
                </div>
                <p class="mt-0.5 text-[12.5px] text-nf-text">
                  {{ itemByIndex(i)!.conflictsWith!.statement }}
                </p>
                <p class="mt-0.5 text-[12px] text-nf-text-dim">
                  {{ t("canonReview.supersedesNote") }}
                </p>
                <label class="mt-1.5 flex items-start gap-2 text-[12.5px] text-nf-text">
                  <input
                    v-model="contracting[i]!.confirmConflict"
                    type="checkbox"
                    class="mt-0.5"
                  />
                  {{ t("canonReview.confirmConflict") }}
                </label>
              </div>
              <label
                v-if="application && application.status === 'VALIDATED'"
                class="mt-1.5 flex items-center gap-2 text-[12.5px] text-nf-text-dim"
              >
                <input v-model="contracting[i]!.selected" type="checkbox" />
                {{ t("canonReview.selectItem") }}
              </label>
              <p
                v-if="appliedResult"
                class="mt-1.5 text-[12px] text-nf-ok"
              >
                {{ t("canonReview.factLink", { id: appliedResult.appliedItems.find((a) => a.itemId === itemByIndex(i)!.id)?.factId?.slice(0, 8) ?? "—" }) }}
              </p>
            </template>
          </li>
        </ol>
      </div>

      <div v-if="error" role="alert" class="rounded-lg border border-nf-error/40 bg-nf-error/10 px-3 py-2 text-[12.5px] text-nf-error">
        {{ error }}
        <button
          v-if="errorCode === 'STALE_APPLICATION'"
          class="ml-2 underline underline-offset-2 hover:text-nf-text focus-visible:nf-focus"
          :disabled="deciding"
          @click="revalidate"
        >
          {{ t("canonReview.revalidate") }}
        </button>
      </div>

      <p v-if="auditNote" role="status" class="text-[12.5px] text-nf-ok">{{ auditNote }}</p>

      <div class="flex gap-2">
        <button
          v-if="!application"
          :disabled="creating"
          class="rounded-lg bg-nf-accent px-4 py-2 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus disabled:opacity-50"
          @click="createApplication"
        >
          {{ creating ? t("common.loading") : t("canonReview.validate") }}
        </button>
        <template v-else-if="application.status === 'VALIDATED' || application.status === 'STALE'">
          <button
            :disabled="deciding"
            class="rounded-lg bg-nf-accent px-4 py-2 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus disabled:opacity-50"
            @click="approve"
          >
            {{ t("canonReview.approveSelected") }}
          </button>
          <button
            :disabled="deciding"
            class="rounded-lg border border-nf-border-strong px-4 py-2 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 focus-visible:nf-focus disabled:opacity-50"
            @click="reject"
          >
            {{ t("canonReview.reject") }}
          </button>
          <button
            v-if="application.status === 'STALE'"
            :disabled="deciding"
            class="rounded-lg border border-nf-warn/40 px-4 py-2 text-[13px] text-nf-warn hover:bg-nf-warn/10 focus-visible:nf-focus disabled:opacity-50"
            @click="revalidate"
          >
            {{ t("canonReview.revalidate") }}
          </button>
        </template>
        <span
          v-else
          class="rounded-lg border px-4 py-2 text-[13px]"
          :class="application.status === 'APPLIED' ? 'border-nf-ok/40 text-nf-ok' : 'border-nf-border text-nf-text-dim'"
        >
          {{ statusLabel(application.status) }}
        </span>
      </div>
    </div>
  </div>
</template>
