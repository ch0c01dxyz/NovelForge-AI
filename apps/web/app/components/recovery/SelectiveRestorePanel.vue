<template>
  <section
    aria-labelledby="selective-restore-title"
    class="mt-6 rounded-xl border border-nf-border bg-nf-bg-1 p-5"
    data-testid="selective-restore"
  >
    <h2 id="selective-restore-title" class="text-[16px] font-semibold text-nf-text">
      {{ t("recovery.selective") }}
    </h2>

    <!-- Scope picker -->
    <div class="mt-4 grid gap-3 md:grid-cols-2">
      <label class="block">
        <span class="text-[13px] font-medium text-nf-text">{{ t("recovery.scope") }}</span>
        <select
          v-model="scope"
          data-testid="selective-scope"
          class="mt-1 w-full rounded-lg border border-nf-border-strong bg-nf-bg-2 px-3 py-2 text-[13px] text-nf-text focus-visible:nf-focus"
        >
          <option value="FULL">{{ t("recovery.scopeFull") }}</option>
          <option value="DOMAIN">{{ t("recovery.scopeDomain") }}</option>
          <option value="ENTITY">{{ t("recovery.scopeEntity") }}</option>
          <option value="SELECTIVE">{{ t("recovery.scopeSelective") }}</option>
        </select>
      </label>

      <label v-if="scope === 'DOMAIN'" class="block">
        <span class="text-[13px] font-medium text-nf-text">{{ t("recovery.domain") }}</span>
        <select
          v-model="domain"
          data-testid="selective-domain"
          class="mt-1 w-full rounded-lg border border-nf-border-strong bg-nf-bg-2 px-3 py-2 text-[13px] text-nf-text focus-visible:nf-focus"
        >
          <option v-for="d in domains" :key="d" :value="d">{{ d }}</option>
        </select>
      </label>

      <template v-if="scope === 'ENTITY'">
        <label class="block">
          <span class="text-[13px] font-medium text-nf-text">{{ t("recovery.entityType") }}</span>
          <input
            v-model="entityType"
            data-testid="selective-entity-type"
            class="mt-1 w-full rounded-lg border border-nf-border-strong bg-nf-bg-2 px-3 py-2 text-[13px] text-nf-text focus-visible:nf-focus"
            placeholder="canon_facts"
          />
        </label>
        <label class="block">
          <span class="text-[13px] font-medium text-nf-text">{{ t("recovery.entityId") }}</span>
          <input
            v-model="entityId"
            data-testid="selective-entity-id"
            class="mt-1 w-full rounded-lg border border-nf-border-strong bg-nf-bg-2 px-3 py-2 font-mono text-[13px] text-nf-text focus-visible:nf-focus"
          />
        </label>
      </template>

      <template v-if="scope === 'SELECTIVE'">
        <label class="block">
          <span class="text-[13px] font-medium text-nf-text">{{ t("recovery.tables") }}</span>
          <input
            v-model="tablesInput"
            data-testid="selective-tables"
            class="mt-1 w-full rounded-lg border border-nf-border-strong bg-nf-bg-2 px-3 py-2 text-[13px] text-nf-text focus-visible:nf-focus"
            placeholder="canon_facts, story_entities"
          />
        </label>
        <label class="block">
          <span class="text-[13px] font-medium text-nf-text">{{ t("recovery.entityIds") }}</span>
          <textarea
            v-model="entityIdsInput"
            data-testid="selective-entity-ids"
            rows="2"
            class="mt-1 w-full rounded-lg border border-nf-border-strong bg-nf-bg-2 px-3 py-2 font-mono text-[13px] text-nf-text focus-visible:nf-focus"
          />
        </label>
      </template>
    </div>

    <div class="mt-4 flex items-center gap-3">
      <button
        type="button"
        data-testid="selective-preview-btn"
        :disabled="previewing || !checkpointId"
        class="rounded-lg border border-nf-border-strong bg-nf-bg-3 px-4 py-2 text-[13px] font-semibold text-nf-text hover:bg-nf-bg-2 focus-visible:nf-focus disabled:opacity-50"
        @click="onPreview"
      >
        {{ previewing ? t("recovery.previewing") : t("recovery.previewRestore") }}
      </button>
      <p v-if="error" role="alert" data-testid="selective-error" class="text-[13px] text-red-300">
        {{ error }}
      </p>
    </div>

    <!-- Preview result -->
    <div v-if="preview" class="mt-4 border-t border-nf-border pt-4" data-testid="selective-preview">
      <h3 class="text-[14px] font-semibold text-nf-text">{{ t("recovery.conflicts") }}</h3>
      <p v-if="conflicts.length === 0" class="mt-1 text-[13px] text-nf-text-dim" data-testid="selective-no-conflicts">
        {{ t("recovery.noConflicts") }}
      </p>
      <ul v-else class="mt-2 space-y-2" :aria-label="t('recovery.conflicts')">
        <li
          v-for="(c, i) in conflicts"
          :key="i"
          data-testid="selective-conflict"
          class="rounded-lg border border-nf-border bg-nf-bg-2 p-3 text-[13px]"
        >
          <span
            class="rounded-full border border-nf-border-strong px-2 py-0.5 text-[11px] font-medium"
            :class="c.kind === 'ORPHAN_REFERENCE' ? 'text-red-300' : 'text-amber-300'"
          >
            {{ c.kind === "ORPHAN_REFERENCE" ? t("recovery.orphanReference") : t("recovery.staleDependent") }}
          </span>
          <p class="mt-1 text-nf-text">
            {{ t("recovery.conflictDetail", { dependentTable: c.dependentTable, dependentId: shortId(c.dependentId), referencedTable: c.referencedTable, referencedId: shortId(c.referencedId), via: c.via }) }}
          </p>
        </li>
      </ul>

      <!-- Acknowledgment gate -->
      <label v-if="needsAck" class="mt-3 flex items-start gap-2" data-testid="selective-ack-label">
        <input
          v-model="acknowledged"
          type="checkbox"
          data-testid="selective-ack"
          class="mt-0.5 h-4 w-4 accent-nf-accent"
        />
        <span class="text-[13px] text-nf-text">{{ t("recovery.acknowledge") }}</span>
      </label>
      <p v-if="needsAck && !acknowledged" class="mt-1 text-[12px] text-amber-300" data-testid="selective-ack-hint">
        {{ t("recovery.acknowledgeRequired") }}
      </p>

      <div class="mt-3">
        <button
          type="button"
          data-testid="selective-apply-btn"
          :disabled="applying || applied || (needsAck && !acknowledged)"
          class="rounded-lg bg-nf-accent px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 focus-visible:nf-focus disabled:opacity-50"
          @click="onApply"
        >
          {{ applying ? t("recovery.applying") : t("recovery.applyRestore") }}
        </button>
      </div>
    </div>

    <p v-if="applied" role="status" data-testid="selective-applied" class="mt-3 text-[13px] text-green-300">
      {{ t("recovery.applied") }}
    </p>
  </section>
</template>

<script setup lang="ts">
/**
 * SelectiveRestorePanel (NF-WF-020A): DOMAIN / ENTITY / SELECTIVE restore
 * preview + apply with the dependency-conflict report and the
 * acknowledgment gate.
 *
 * The acknowledgment checkbox is REQUIRED before apply when the preview
 * reports ORPHAN_REFERENCE conflicts (DOMAIN/SELECTIVE). ENTITY conflicts
 * are informational (the closure is rewound by definition — no gate).
 *
 * §15 foundational design; en+id via useLocale(); axe-tested.
 */
import { computed, ref, watch } from "vue";
import { useApi, ApiError } from "../../composables/useApi";
import { useLocale } from "../../composables/useLocale";

const props = defineProps<{
  workspaceId: string;
  novelId: string;
  checkpointId: string | null;
}>();
const emit = defineEmits<{ applied: [] }>();

const { t } = useLocale();
const { api } = useApi();

const domains = ["canon", "character", "relationship", "narrative", "planning", "intelligence", "manuscript"];

const scope = ref("DOMAIN");
const domain = ref("canon");
const entityType = ref("");
const entityId = ref("");
const tablesInput = ref("");
const entityIdsInput = ref("");

const previewing = ref(false);
const applying = ref(false);
const error = ref("");
const preview = ref<null | {
  restoreOperationId: string;
  preview: {
    dependencyConflicts: {
      kind: "ORPHAN_REFERENCE" | "STALE_DEPENDENT";
      dependentTable: string;
      dependentId: string;
      via: string;
      referencedTable: string;
      referencedId: string;
    }[];
  };
}>(null);
const acknowledged = ref(false);
const applied = ref(false);
type RestorePreview = NonNullable<(typeof preview)["value"]>;
let selectionSeq = 0;
watch([() => props.checkpointId, scope, domain, entityType, entityId, tablesInput, entityIdsInput], () => {
  selectionSeq++;
  preview.value = null;
  acknowledged.value = false;
  applied.value = false;
  previewing.value = false;
}, { flush: "sync" });

const conflicts = computed(() => preview.value?.preview.dependencyConflicts ?? []);
// The gate: ORPHAN_REFERENCE on DOMAIN/SELECTIVE requires acknowledgment.
const needsAck = computed(
  () => scope.value !== "ENTITY" && conflicts.value.some((c) => c.kind === "ORPHAN_REFERENCE"),
);

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

function selectionPayload(): Record<string, unknown> | undefined {
  if (scope.value === "DOMAIN") return { domain: domain.value };
  if (scope.value === "ENTITY") {
    return { entityType: entityType.value.trim(), entityId: entityId.value.trim() };
  }
  if (scope.value === "SELECTIVE") {
    const tables = tablesInput.value.split(",").map((s) => s.trim()).filter(Boolean);
    const entityIds = entityIdsInput.value.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    return entityIds.length > 0 ? { tables, entityIds } : { tables };
  }
  return undefined;
}

function toErrorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === "UNACKNOWLEDGED_CONFLICTS") return t("recovery.unacknowledgedError");
    if (e.code === "INVALID_INPUT") return t("recovery.invalidSelection");
    return e.message;
  }
  return t("recovery.previewError");
}

async function onPreview(): Promise<void> {
  if (!props.checkpointId) return;
  const seq = ++selectionSeq;
  preview.value = null;
  previewing.value = true;
  error.value = "";
  applied.value = false;
  acknowledged.value = false;
  try {
    const body: Record<string, unknown> = {
      checkpointId: props.checkpointId,
      scope: scope.value,
    };
    const selection = selectionPayload();
    if (selection) body.selection = selection;
    const result = await api<RestorePreview>(
      `/workspaces/${props.workspaceId}/novels/${props.novelId}/restores/preview`,
      { method: "POST", body: JSON.stringify(body) },
    );
    if (seq === selectionSeq) preview.value = result;
  } catch (e) {
    if (seq === selectionSeq) {
      error.value = toErrorMessage(e);
      preview.value = null;
    }
  } finally {
    if (seq === selectionSeq) previewing.value = false;
  }
}

async function onApply(): Promise<void> {
  if (!preview.value) return;
  applying.value = true;
  error.value = "";
  try {
    await api(
      `/workspaces/${props.workspaceId}/novels/${props.novelId}/restores/${preview.value.restoreOperationId}/apply`,
      {
        method: "POST",
        body: JSON.stringify(needsAck.value ? { acknowledged: acknowledged.value } : {}),
      },
    );
    applied.value = true;
    preview.value = null;
    emit("applied");
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : t("recovery.applyError");
  } finally {
    applying.value = false;
  }
}
</script>
