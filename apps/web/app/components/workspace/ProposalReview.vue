<template>
  <section aria-labelledby="proposal-review-title">
    <div class="mb-3 flex items-center justify-between gap-3">
      <h3 id="proposal-review-title" class="text-[15px] font-semibold text-nf-text">
        {{ t("workspace.canon.proposals.title") }}
      </h3>
      <label class="flex items-center gap-1.5 text-[12px] text-nf-text-dim">
        {{ t("workspace.canon.proposals.statusFilter") }}
        <select
          v-model="statusFilter"
          class="rounded-md border border-nf-border bg-nf-bg-2 px-2 py-1 text-[12px] text-nf-text focus-visible:nf-focus"
          @change="load"
        >
          <option v-for="s in statuses" :key="s" :value="s">
            {{ t(`workspace.canon.proposals.status.${s}`) }}
          </option>
        </select>
      </label>
    </div>

    <div v-if="loading" class="py-6 text-center text-[13px] text-nf-text-dim" role="status">
      {{ t("common.loading") }}
    </div>
    <div v-else-if="error" class="rounded-lg border border-nf-border bg-nf-bg-2 p-4 text-center">
      <p role="alert" class="text-[13px] text-nf-warn">{{ error }}</p>
      <button
        type="button"
        class="mt-2 rounded-md border border-nf-border-strong px-3 py-1.5 text-[13px] text-nf-text hover:bg-nf-bg-3 focus-visible:nf-focus"
        @click="load"
      >
        {{ t("common.retry") }}
      </button>
    </div>
    <p v-else-if="proposals.length === 0" class="py-6 text-center text-[13px] text-nf-text-faint">
      {{ t("workspace.canon.proposals.empty") }}
    </p>
    <ul v-else class="space-y-3">
      <li
        v-for="p in proposals"
        :key="p.id"
        class="rounded-lg border border-nf-border bg-nf-bg-2 p-3"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <p class="text-[13px] text-nf-text">
              <span class="font-medium text-nf-accent-hi">{{ p.predicate }}</span>
            </p>
            <p class="mt-0.5 text-[13px] text-nf-text-dim">{{ p.statement }}</p>
            <p v-if="p.conflictKind" class="mt-1.5 flex items-center gap-1.5 text-[12px] text-nf-warn">
              <span aria-hidden="true">⚠</span>
              <span>
                {{ t(`workspace.canon.proposals.conflict.${p.conflictKind}`) }}
                <span v-if="p.conflictsWithFactId" class="text-nf-text-faint">
                  ({{ t("workspace.canon.proposals.conflictsWith", { id: shortId(p.conflictsWithFactId) }) }})
                </span>
              </span>
            </p>
            <p v-if="p.canonFactId" class="mt-1 text-[12px] text-nf-ok">
              {{ t("workspace.canon.proposals.mintedFact", { id: shortId(p.canonFactId) }) }}
            </p>
          </div>
          <span
            class="shrink-0 rounded-full border px-2 py-0.5 text-[11px]"
            :class="statusClass(p.status)"
          >
            {{ t(`workspace.canon.proposals.status.${p.status}`) }}
          </span>
        </div>

        <!-- Per-row decisions (bulk list, Q4). Only undecided proposals act. -->
        <template v-if="p.status === 'PROPOSED'">
          <div v-if="deciding !== p.id" class="mt-2 flex gap-2">
            <button
              type="button"
              class="rounded-md bg-nf-accent px-3 py-1 text-[12px] font-medium text-nf-accent-ink hover:brightness-110 focus-visible:nf-focus"
              @click="openApprove(p)"
            >
              {{ t("workspace.canon.proposals.approve") }}
            </button>
            <button
              type="button"
              class="rounded-md border border-nf-border px-3 py-1 text-[12px] text-nf-text-dim hover:border-nf-warn hover:text-nf-warn focus-visible:nf-focus"
              @click="openReject(p)"
            >
              {{ t("workspace.canon.proposals.reject") }}
            </button>
          </div>

          <!-- Approve confirmation -->
          <div
            v-else-if="decisionMode === 'approve'"
            class="mt-2 rounded-md border border-nf-border-strong bg-nf-bg-1 p-2.5"
            role="alertdialog"
            :aria-label="t('workspace.canon.proposals.approve')"
          >
            <details class="text-[12px] text-nf-text-dim">
              <summary class="cursor-pointer hover:text-nf-text focus-visible:nf-focus">
                {{ t("workspace.canon.proposals.advanced") }}
              </summary>
              <div class="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label class="block">
                  <span class="mb-1 block">{{ t("workspace.canon.proposals.availableFromChapter") }}</span>
                  <input
                    v-model="approveForm.availableFromChapter"
                    type="number" min="0" max="100000" placeholder="—"
                    class="w-full rounded-md border border-nf-border bg-nf-bg-2 px-2 py-1 text-[12px] text-nf-text focus-visible:nf-focus"
                  />
                </label>
                <label class="block">
                  <span class="mb-1 block">{{ t("workspace.canon.proposals.expectedHead") }}</span>
                  <input
                    v-model="approveForm.expectedHeadRevisionId"
                    type="text"
                    :placeholder="t('workspace.canon.proposals.expectedHeadHint')"
                    class="w-full rounded-md border border-nf-border bg-nf-bg-2 px-2 py-1 font-mono text-[11px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
                  />
                </label>
              </div>
            </details>
            <label v-if="p.conflictKind" class="mt-2 flex items-start gap-2 text-[12px] text-nf-warn">
              <input v-model="approveForm.ackConflict" type="checkbox" class="mt-0.5 accent-[#f97316] focus-visible:nf-focus" />
              {{ t("workspace.canon.proposals.supersedeAcknowledge") }}
            </label>
            <p v-if="actionError" role="alert" class="mt-1.5 text-[13px] text-nf-warn">{{ actionError }}</p>
            <div class="mt-2 flex gap-2">
              <button
                type="button"
                :disabled="working || (p.conflictKind !== null && !approveForm.ackConflict)"
                class="rounded-md bg-nf-accent px-3 py-1.5 text-[13px] font-medium text-nf-accent-ink hover:brightness-110 disabled:opacity-50 focus-visible:nf-focus"
                @click="approve(p)"
              >
                {{ working ? t("workspace.canon.proposals.approving") : t("workspace.canon.proposals.approve") }}
              </button>
              <button
                type="button"
                class="rounded-md border border-nf-border px-3 py-1.5 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 focus-visible:nf-focus"
                @click="cancelDecision"
              >
                {{ t("common.cancel") }}
              </button>
            </div>
          </div>

          <!-- Reject confirmation -->
          <div
            v-else
            class="mt-2 rounded-md border border-nf-border-strong bg-nf-bg-1 p-2.5"
            role="alertdialog"
            :aria-label="t('workspace.canon.proposals.reject')"
          >
            <label class="block">
              <span class="mb-1 block text-[12px] text-nf-text-dim">{{ t("workspace.canon.proposals.rejectNote") }}</span>
              <input
                v-model="rejectNote"
                type="text"
                maxlength="2000"
                :placeholder="t('workspace.canon.proposals.rejectNotePlaceholder')"
                class="w-full rounded-md border border-nf-border bg-nf-bg-2 px-2.5 py-1.5 text-[13px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
              />
            </label>
            <p v-if="actionError" role="alert" class="mt-1.5 text-[13px] text-nf-warn">{{ actionError }}</p>
            <div class="mt-2 flex gap-2">
              <button
                type="button"
                :disabled="working"
                class="rounded-md border border-nf-warn px-3 py-1.5 text-[13px] text-nf-warn hover:bg-nf-bg-2 disabled:opacity-50 focus-visible:nf-focus"
                @click="reject(p)"
              >
                {{ working ? t("workspace.canon.proposals.rejecting") : t("workspace.canon.proposals.rejectConfirm") }}
              </button>
              <button
                type="button"
                class="rounded-md border border-nf-border px-3 py-1.5 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 focus-visible:nf-focus"
                @click="cancelDecision"
              >
                {{ t("common.cancel") }}
              </button>
            </div>
          </div>
        </template>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
/**
 * Proposal review (NF-WF-016, Canon review): bulk list with per-row
 * approve/reject (Q4). Approve/reject are WORKSPACE-scoped (F4 pin).
 * conflictKind is surfaced; a conflicting claim needs explicit
 * acknowledgment before approval — nothing becomes canon silently
 * (services/canon.ts header rules 1-2).
 */
import { onMounted, ref } from "vue";
import { useApi, ApiError } from "../../composables/useApi";
import { useLocale } from "../../composables/useLocale";
import { UUID_RE, type CanonProposal } from "./canon-types";

const props = defineProps<{
  workspaceId: string;
  novelId: string;
}>();

const { t } = useLocale();
const { api } = useApi();

const statuses = ["PROPOSED", "APPROVED", "REJECTED", "SUPERSEDED"] as const;
const statusFilter = ref<(typeof statuses)[number]>("PROPOSED");
const proposals = ref<CanonProposal[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const deciding = ref<string | null>(null);
const decisionMode = ref<"approve" | "reject" | null>(null);
const working = ref(false);
const actionError = ref<string | null>(null);
const rejectNote = ref("");
const approveForm = ref({ availableFromChapter: "", expectedHeadRevisionId: "", ackConflict: false });

function errText(e: unknown): string {
  if (e instanceof ApiError) {
    const key = `workspace.canon.errors.${e.code}`;
    const msg = t(key);
    return msg === key ? e.code : msg;
  }
  return t("workspace.canon.errors.network");
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

function statusClass(status: string): string {
  if (status === "APPROVED") return "border-nf-ok/40 text-nf-ok";
  if (status === "REJECTED") return "border-nf-border text-nf-text-faint";
  if (status === "SUPERSEDED") return "border-nf-warn/40 text-nf-warn";
  return "border-nf-accent/50 text-nf-accent-hi";
}

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const qs = new URLSearchParams({ status: statusFilter.value });
    proposals.value = await api<CanonProposal[]>(
      `/workspaces/${props.workspaceId}/novels/${props.novelId}/canon/proposals?${qs}`,
    );
  } catch (e) {
    error.value = errText(e);
  } finally {
    loading.value = false;
  }
}

function openApprove(_p: CanonProposal) {
  deciding.value = _p.id;
  decisionMode.value = "approve";
  actionError.value = null;
  approveForm.value = { availableFromChapter: "", expectedHeadRevisionId: "", ackConflict: false };
}

function openReject(_p: CanonProposal) {
  deciding.value = _p.id;
  decisionMode.value = "reject";
  actionError.value = null;
  rejectNote.value = "";
}

function cancelDecision() {
  deciding.value = null;
  decisionMode.value = null;
  actionError.value = null;
  working.value = false;
}

async function approve(p: CanonProposal) {
  actionError.value = null;
  const head = approveForm.value.expectedHeadRevisionId.trim();
  if (head && !UUID_RE.test(head)) {
    actionError.value = t("workspace.canon.errors.INVALID_INPUT");
    return;
  }
  working.value = true;
  try {
    // C12.1 tri-state: blank asserts NOTHING (key omitted); explicit null
    // would assert "no head yet" and wrongly 409 when a head exists.
    const body: { availableFromChapter: number | null; expectedHeadRevisionId?: string | null } = {
      availableFromChapter:
        approveForm.value.availableFromChapter.trim() === ""
          ? null
          : Number(approveForm.value.availableFromChapter),
    };
    if (head !== "") body.expectedHeadRevisionId = head;
    await api<{ canonFactId: string; supersededFactId: string | null }>(
      `/workspaces/${props.workspaceId}/canon/proposals/${p.id}/approve`,
      { method: "POST", body: JSON.stringify(body) },
    );
    deciding.value = null;
    decisionMode.value = null;
    await load();
  } catch (e) {
    if (e instanceof ApiError && e.code === "CONFLICT") {
      // Already decided, or the head moved under the plan (C12.1).
      actionError.value = t("workspace.canon.proposals.headMismatch");
    } else {
      actionError.value = errText(e);
    }
  } finally {
    working.value = false;
  }
}

async function reject(p: CanonProposal) {
  actionError.value = null;
  working.value = true;
  try {
    const note = rejectNote.value.trim();
    await api<void>(`/workspaces/${props.workspaceId}/canon/proposals/${p.id}/reject`, {
      method: "POST",
      body: JSON.stringify(note ? { note } : {}),
    });
    deciding.value = null;
    decisionMode.value = null;
    await load();
  } catch (e) {
    if (e instanceof ApiError && e.code === "CONFLICT") {
      actionError.value = t("workspace.canon.proposals.alreadyDecided");
    } else {
      actionError.value = errText(e);
    }
  } finally {
    working.value = false;
  }
}

onMounted(() => load());
</script>
