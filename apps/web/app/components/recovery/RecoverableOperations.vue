<template>
  <section
    aria-labelledby="recoverable-title"
    class="rounded-xl border border-nf-border bg-nf-bg-1 p-5"
    data-testid="recoverable-operations"
  >
    <h3 id="recoverable-title" class="text-[15px] font-semibold text-nf-text">
      {{ t("recovery.recoverableOperations") }}
    </h3>

    <div v-if="loading" class="mt-3 text-[13px] text-nf-text-dim" data-testid="recoverable-loading">
      {{ t("common.loading") }}
    </div>
    <p v-if="loadError" role="alert" class="mt-3 text-[13px] text-nf-error" data-testid="recoverable-error">
      {{ loadError }}
    </p>

    <p v-if="!loading && checkpoints.length === 0" class="mt-3 text-[13px] text-nf-text-dim" data-testid="recoverable-empty">
      {{ t("recovery.noRecoverable") }}
    </p>

    <ul v-else :aria-label="t('recovery.recoverableOperations')" class="mt-3 space-y-2 list-none p-0 m-0">
      <li
        v-for="c in checkpoints"
        :key="c.id"
        :data-testid="`recoverable-${c.id}`"
        class="rounded-lg border border-nf-border bg-nf-bg-2 p-4"
      >
        <div class="flex items-center justify-between gap-3">
          <div class="min-w-0">
            <p class="text-[14px] font-semibold text-nf-text truncate">{{ c.label }}</p>
            <dl class="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-nf-text-dim">
              <div class="flex gap-1">
                <dt>{{ t("recovery.headRevision") }}:</dt>
                <dd class="font-mono">#{{ c.revisionNumber }}</dd>
              </div>
              <div class="flex gap-1">
                <dt>{{ t("recovery.branches") }}:</dt>
                <dd class="font-mono">{{ c.branchName }}</dd>
              </div>
              <div class="flex gap-1">
                <dt>{{ t("recovery.updated") }}:</dt>
                <dd>{{ formatDate(c.createdAt) }}</dd>
              </div>
            </dl>
            <p v-if="c.note" class="mt-1 text-[12px] text-nf-text-dim">{{ c.note }}</p>
          </div>
          <button
            type="button"
            :data-testid="`recoverable-rollback-${c.id}`"
            :disabled="rollingBackId !== null"
            class="shrink-0 rounded-lg border border-nf-border-strong px-3 py-1.5 text-[13px] text-nf-text hover:bg-nf-bg-3 focus-visible:nf-focus disabled:opacity-50"
            @click="onRollback(c)"
          >
            {{ rollingBackId === c.id ? t("recovery.rollingBack") : t("recovery.rollback") }}
          </button>
        </div>
        <p v-if="rollbackErrorId === c.id" role="alert" class="mt-2 text-[13px] text-nf-error" :data-testid="`recoverable-error-${c.id}`">
          {{ rollbackError }}
        </p>
        <p v-if="rolledBackId === c.id" class="mt-2 text-[13px] text-nf-ok" :data-testid="`recoverable-done-${c.id}`">
          {{ t("recovery.rollbackApplied") }}
        </p>
      </li>
    </ul>

    <!-- Confirm dialog -->
    <div
      v-if="confirming"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rollback-confirm-title"
      data-testid="rollback-confirm"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      @click.self="confirming = null"
    >
      <div class="w-full max-w-md rounded-xl border border-nf-border bg-nf-bg-1 p-5">
        <h4 id="rollback-confirm-title" class="text-[15px] font-semibold text-nf-text">
          {{ t("recovery.rollbackConfirm") }}
        </h4>
        <p class="mt-2 text-[13px] text-nf-text-dim">
          {{ t("recovery.rollbackConfirmBody") }}
        </p>
        <p class="mt-2 text-[13px] text-nf-text font-mono">{{ confirming.label }}</p>
        <div class="mt-4 flex justify-end gap-2">
          <button
            type="button"
            data-testid="rollback-confirm-cancel"
            class="rounded-lg border border-nf-border px-4 py-2 text-[13px] text-nf-text hover:bg-nf-bg-2 focus-visible:nf-focus"
            @click="confirming = null"
          >
            {{ t("recovery.cancel") }}
          </button>
          <button
            type="button"
            data-testid="rollback-confirm-ok"
            class="rounded-lg border border-nf-error bg-nf-error/10 px-4 py-2 text-[13px] font-semibold text-nf-error hover:bg-nf-error/20 focus-visible:nf-focus"
            @click="doRollback"
          >
            {{ t("recovery.rollback") }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * RecoverableOperations (NF-WF-020C): one-action bulk rollback.
 *
 * Lists the pre-operation checkpoints (PRE_MUTATION / PRE_IMPORT /
 * PRE_GENERATION — Invariant 15's recoverable set) and offers a single
 * rollback action per checkpoint, confirmed in a dialog. The rollback
 * rewinds covered state in one new RESTORE revision; later history stays
 * readable (Invariant 12).
 *
 * §15 foundational design; en+id via useLocale(); axe-tested.
 */
import { computed, onMounted, ref } from "vue";
import { useApi, ApiError } from "../../composables/useApi";
import { useLocale } from "../../composables/useLocale";

interface RecoverableCheckpoint {
  id: string;
  label: string;
  note: string | null;
  kind: string;
  revisionNumber: number;
  branchName: string;
  createdAt: string;
}

const props = defineProps<{
  workspaceId: string;
  novelId: string;
  checkedOutBranchName?: string;
}>();

const emit = defineEmits<{
  rolledBack: [revisionId: string];
}>();

const { t } = useLocale();
const { api } = useApi();

const loading = ref(true);
const loadError = ref<string | null>(null);
const allCheckpoints = ref<RecoverableCheckpoint[]>([]);
const checkpoints = computed(() => allCheckpoints.value.filter((checkpoint) =>
  !props.checkedOutBranchName || checkpoint.branchName === props.checkedOutBranchName));
const confirming = ref<RecoverableCheckpoint | null>(null);
const rollingBackId = ref<string | null>(null);
const rollbackErrorId = ref<string | null>(null);
const rollbackError = ref<string | null>(null);
const rolledBackId = ref<string | null>(null);

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = null;
  try {
    const res = await api<{ checkpoints: RecoverableCheckpoint[] }>(
      `/workspaces/${props.workspaceId}/novels/${props.novelId}/recoverable-checkpoints`,
    );
    allCheckpoints.value = res.checkpoints;
  } catch (e) {
    loadError.value = e instanceof ApiError ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

function onRollback(c: RecoverableCheckpoint): void {
  rollbackErrorId.value = null;
  rollbackError.value = null;
  confirming.value = c;
}

async function doRollback(): Promise<void> {
  const c = confirming.value;
  if (!c || rollingBackId.value) return;
  confirming.value = null;
  rollingBackId.value = c.id;
  try {
    const res = await api<{ revisionId: string }>(
      `/workspaces/${props.workspaceId}/novels/${props.novelId}/checkpoints/${c.id}/rollback`,
      { method: "POST", body: JSON.stringify({}) },
    );
    rolledBackId.value = c.id;
    emit("rolledBack", res.revisionId);
  } catch (e) {
    rollbackErrorId.value = c.id;
    rollbackError.value = e instanceof ApiError ? e.message : String(e);
  } finally {
    rollingBackId.value = null;
  }
}

onMounted(load);
</script>
