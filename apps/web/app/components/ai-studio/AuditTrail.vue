<script setup lang="ts">
/**
 * Workspace AI audit trail (NF-WF-018C): the workspace's
 * AI-infrastructure audit actions via the additive
 * `GET /api/workspaces/:workspaceId/audit-log` route. Membership +
 * `workflow:manage` on the server; `?action=` is pinned to the
 * contract's allowlist. Rows carry identity only — actor email, never
 * credential material.
 */
import { ref, onMounted, watch } from "vue";
import { useReceipts, RECEIPT_AUDIT_ACTIONS, type AuditRow } from "../../composables/useReceipts";
import { useLocale } from "../../composables/useLocale";

const props = defineProps<{
  workspaceId: string;
}>();

const { t } = useLocale();
const receipts = useReceipts();

const actionFilter = ref<string>("");
const rows = ref<AuditRow[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const expandedId = ref<string | null>(null);

function actionLabel(action: string): string {
  return t(`receipts.audit.actions.${action}`, {});
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

async function refresh() {
  loading.value = true;
  error.value = null;
  try {
    rows.value = await receipts.listWorkspaceAuditLog(props.workspaceId, {
      ...(actionFilter.value ? { action: actionFilter.value } : {}),
      limit: 100,
    });
  } catch (err) {
    error.value = err instanceof Error ? err.message : "unknown";
  } finally {
    loading.value = false;
  }
}

function toggle(id: string) {
  expandedId.value = expandedId.value === id ? null : id;
}

onMounted(refresh);
watch(actionFilter, refresh);
watch(() => props.workspaceId, refresh);

defineExpose({ refresh });
</script>

<template>
  <section aria-labelledby="audit-heading">
    <div class="mb-3 flex flex-wrap items-center gap-3">
      <h2 id="audit-heading" class="text-[15px] font-semibold text-nf-text">
        {{ t("receipts.audit.title") }}
      </h2>
      <div class="ml-auto flex items-center gap-2">
        <label for="audit-action-filter" class="text-[12.5px] text-nf-text-dim">
          {{ t("receipts.audit.actionFilter") }}
        </label>
        <select
          id="audit-action-filter"
          v-model="actionFilter"
          class="rounded-lg border border-nf-border bg-nf-bg-0 px-2 py-1 text-[12.5px] text-nf-text focus-visible:nf-focus"
        >
          <option value="">{{ t("receipts.audit.allActions") }}</option>
          <option v-for="a in RECEIPT_AUDIT_ACTIONS" :key="a" :value="a">{{ actionLabel(a) }}</option>
        </select>
      </div>
    </div>

    <div v-if="loading" class="py-10 text-center text-nf-text-faint" role="status">{{ t("common.loading") }}</div>
    <div v-else-if="error" class="py-10 text-center" role="alert"><p class="text-nf-warn">{{ error }}</p></div>
    <p v-else-if="rows.length === 0" class="py-10 text-center text-[13px] text-nf-text-faint">
      {{ t("receipts.audit.empty") }}
    </p>
    <div v-else class="overflow-x-auto rounded-xl border border-nf-border bg-nf-bg-1">
      <table class="w-full min-w-[680px] border-collapse text-left text-[12.5px]">
        <caption class="sr-only">{{ t("receipts.audit.title") }}</caption>
        <thead>
          <tr class="border-b border-nf-border bg-nf-bg-2/60">
            <th scope="col" class="px-3 py-2 font-semibold text-nf-text-dim">{{ t("receipts.audit.time") }}</th>
            <th scope="col" class="px-3 py-2 font-semibold text-nf-text-dim">{{ t("receipts.audit.actor") }}</th>
            <th scope="col" class="px-3 py-2 font-semibold text-nf-text-dim">{{ t("receipts.audit.action") }}</th>
            <th scope="col" class="px-3 py-2 font-semibold text-nf-text-dim">{{ t("receipts.audit.entity") }}</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="row in rows" :key="row.id">
            <tr
              class="cursor-pointer border-b border-nf-border/60 hover:bg-nf-bg-2/40 focus-visible:nf-focus"
              tabindex="0"
              @click="toggle(row.id)"
              @keydown.enter="toggle(row.id)"
              @keydown.space.prevent="toggle(row.id)"
            >
              <td class="whitespace-nowrap px-3 py-2 text-nf-text-dim">{{ formatDate(row.createdAt) }}</td>
              <td class="px-3 py-2 text-nf-text">{{ row.actorEmail ?? "—" }}</td>
              <td class="px-3 py-2 font-mono text-[11.5px] text-nf-text">{{ row.action }}</td>
              <td class="px-3 py-2 text-nf-text-dim">
                <span class="font-mono text-[11.5px]">{{ row.entityType }}</span>
                <span v-if="row.entityId" class="font-mono text-[11px] text-nf-text-faint" :title="row.entityId">
                  ·{{ row.entityId.slice(0, 8) }}
                </span>
              </td>
            </tr>
            <tr v-if="expandedId === row.id" class="border-b border-nf-border/60 bg-nf-bg-2/40">
              <td colspan="4" class="px-4 py-3">
                <p class="mb-1 text-[11.5px] font-semibold uppercase tracking-wide text-nf-text-dim">
                  {{ t("receipts.audit.payload") }}
                </p>
                <pre class="max-h-48 overflow-auto rounded-lg bg-nf-bg-0 p-3 font-mono text-[11px] text-nf-text">{{ toJson(row.payload) }}</pre>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </section>
</template>
