<template>
  <section
    aria-labelledby="merge-preview-title"
    class="rounded-xl border border-nf-border bg-nf-bg-1 p-5"
    data-testid="merge-preview"
  >
    <h3 id="merge-preview-title" class="text-[15px] font-semibold text-nf-text">
      {{ t("recovery.mergePreview") }}
    </h3>
    <p class="mt-1 text-[12px] text-nf-text-dim">
      {{ t("recovery.mergeSource") }}: <span class="font-mono">{{ sourceBranchName }}</span>
      →
      {{ t("recovery.mergeTarget") }}: <span class="font-mono">{{ targetBranchName }}</span>
    </p>

    <!-- NF-WF-024C: semantic/conservative mode toggle -->
    <div class="mt-3 flex items-center gap-2" data-testid="merge-mode-toggle">
      <span id="merge-mode-label" class="text-[12px] text-nf-text-dim">{{ t("recovery.mergeMode") }}:</span>
      <div role="radiogroup" aria-labelledby="merge-mode-label" class="flex gap-1">
        <button
          type="button"
          role="radio"
          :aria-checked="mode === 'conservative'"
          data-testid="merge-mode-conservative"
          class="rounded-lg border px-3 py-1 text-[12px] font-medium"
          :class="mode === 'conservative' ? 'border-nf-border-strong bg-nf-bg-3 text-nf-text' : 'border-nf-border bg-nf-bg-2 text-nf-text-dim hover:bg-nf-bg-3'"
          @click="setMode('conservative')"
        >
          {{ t("recovery.mergeModeConservative") }}
        </button>
        <button
          type="button"
          role="radio"
          :aria-checked="mode === 'semantic'"
          data-testid="merge-mode-semantic"
          class="rounded-lg border px-3 py-1 text-[12px] font-medium"
          :class="mode === 'semantic' ? 'border-nf-border-strong bg-nf-bg-3 text-nf-text' : 'border-nf-border bg-nf-bg-2 text-nf-text-dim hover:bg-nf-bg-3'"
          @click="setMode('semantic')"
        >
          {{ t("recovery.mergeModeSemantic") }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="mt-3 text-[13px] text-nf-text-dim" data-testid="merge-preview-loading">
      {{ t("common.loading") }}
    </div>
    <p v-if="loadError" role="alert" class="mt-3 text-[13px] text-red-300" data-testid="merge-preview-error">
      {{ loadError }}
    </p>

    <div v-if="preview" class="mt-3">
      <!-- Summary -->
      <dl class="flex flex-wrap gap-x-5 gap-y-1 text-[12px]" data-testid="merge-preview-summary">
        <div class="flex gap-1">
          <dt class="text-nf-text-dim">{{ t("recovery.mergeClean") }}:</dt>
          <dd class="font-semibold text-nf-text">{{ preview.summary.clean }}</dd>
        </div>
        <div class="flex gap-1">
          <dt class="text-nf-text-dim">{{ t("recovery.mergeConflicts") }}:</dt>
          <dd class="font-semibold" :class="preview.summary.conflict > 0 ? 'text-red-300' : 'text-nf-text'">
            {{ preview.summary.conflict }}
          </dd>
        </div>
        <div class="flex gap-1">
          <dt class="text-nf-text-dim">{{ t("recovery.mergeDeletedModified") }}:</dt>
          <dd class="font-semibold" :class="preview.summary.deletedModified > 0 ? 'text-red-300' : 'text-nf-text'">
            {{ preview.summary.deletedModified }}
          </dd>
        </div>
        <div class="flex gap-1">
          <dt class="text-nf-text-dim">{{ t("recovery.mergeOrphanRisk") }}:</dt>
          <dd class="font-semibold" :class="preview.summary.orphanRisk > 0 ? 'text-amber-300' : 'text-nf-text'">
            {{ preview.summary.orphanRisk }}
          </dd>
        </div>
      </dl>

      <p v-if="preview.changes.length === 0" class="mt-3 text-[13px] text-nf-text-dim" data-testid="merge-preview-empty">
        {{ t("recovery.mergeNoChanges") }}
      </p>

      <!-- Change lists -->
      <div v-else class="mt-3 space-y-4">
        <div v-for="group in grouped" :key="group.kind">
          <h4 class="text-[13px] font-semibold text-nf-text" :data-testid="`merge-group-${group.kind}`">
            {{ group.label }} ({{ group.changes.length }})
          </h4>
          <ul class="mt-1 space-y-2">
            <li
              v-for="c in group.changes"
              :key="`${c.entityType}-${c.entityId}`"
              :data-testid="`merge-change-${c.entityId}`"
              class="rounded-lg border border-nf-border bg-nf-bg-2 p-3"
            >
              <div class="flex items-baseline justify-between gap-2">
                <span class="text-[13px] font-medium text-nf-text">
                  {{ c.entityType }} <span class="font-mono text-[12px] text-nf-text-dim">{{ c.entityId.slice(0, 8) }}</span>
                </span>
                <span
                  class="rounded-full px-2 py-0.5 text-[11px] font-medium"
                  :class="kindClass(c.kind)"
                  :data-testid="`merge-kind-${c.kind}`"
                >
                  {{ c.kind }}
                </span>
              </div>
              <p v-if="c.warning" class="mt-1 text-[12px] text-amber-300" role="note">
                {{ c.warning }}
              </p>
              <!-- NF-WF-024C: semantic rule citation for narrowed conflicts -->
              <p
                v-if="c.semanticRule"
                class="mt-1 text-[12px] text-nf-text-dim"
                :data-testid="`merge-semantic-${c.semanticRule}`"
              >
                {{ t("recovery.mergeSemanticRule", { rule: c.semanticRule }) }}
              </p>
              <!-- Conflict evidence: base / source / target -->
              <div v-if="c.kind === 'CONFLICT' || c.kind === 'DELETED_MODIFIED'" class="mt-2 grid gap-2 md:grid-cols-3 text-[12px]">
                <div v-if="c.base" class="rounded border border-nf-border p-2">
                  <p class="font-semibold text-nf-text-dim">{{ t("recovery.conflictBase") }}</p>
                  <pre class="mt-1 overflow-auto font-mono text-[11px] text-nf-text">{{ formatRow(c.base) }}</pre>
                </div>
                <div v-if="c.sourceVersion" class="rounded border border-nf-border p-2">
                  <p class="font-semibold text-nf-text-dim">{{ t("recovery.conflictSource") }}</p>
                  <pre class="mt-1 overflow-auto font-mono text-[11px] text-nf-text">{{ formatRow(c.sourceVersion) }}</pre>
                </div>
                <div v-if="c.targetVersion" class="rounded border border-nf-border p-2">
                  <p class="font-semibold text-nf-text-dim">{{ t("recovery.conflictTarget") }}</p>
                  <pre class="mt-1 overflow-auto font-mono text-[11px] text-nf-text">{{ formatRow(c.targetVersion) }}</pre>
                </div>
              </div>
            </li>
          </ul>
        </div>
      </div>

      <!-- Gated apply -->
      <div class="mt-4 border-t border-nf-border pt-4">
        <p
          v-if="preview.canApply"
          class="text-[13px] text-nf-text"
          data-testid="merge-can-apply"
        >
          {{ t("recovery.mergeCanApply") }}
        </p>
        <p
          v-else
          role="alert"
          class="text-[13px] text-red-300"
          data-testid="merge-cannot-apply"
        >
          {{ t("recovery.mergeCannotApply") }}
        </p>
        <p v-if="applyError" role="alert" class="mt-2 text-[13px] text-red-300" data-testid="merge-apply-error">
          {{ applyError }}
        </p>
        <p v-if="applied" class="mt-2 text-[13px] text-green-300" data-testid="merge-applied">
          {{ t("recovery.mergeApplied") }}
        </p>
        <button
          type="button"
          data-testid="merge-apply-button"
          :disabled="!preview.canApply || applying || applied"
          class="mt-2 rounded-lg border border-nf-border-strong bg-nf-bg-3 px-4 py-2 text-[13px] font-semibold text-nf-text hover:bg-nf-bg-2 focus-visible:nf-focus disabled:opacity-50"
          @click="onApply"
        >
          {{ applying ? t("recovery.merging") : t("recovery.mergeApply") }}
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * MergePreview (NF-WF-020C): conservative three-way merge preview.
 *
 * Loads the merge preview for source → target, renders the pinned taxonomy
 * (CLEAN / CONFLICT / DELETED_MODIFIED / ORPHAN_RISK) with conflict
 * evidence (base / source / target), and gates the apply button on zero
 * conflicts — the apply is never offered when conflicts exist (Invariant 5:
 * conflicts surfaced, never silently reconciled).
 *
 * §15 foundational design; en+id via useLocale(); axe-tested.
 */
import { computed, onMounted, ref } from "vue";
import { useApi, ApiError } from "../../composables/useApi";
import { useLocale } from "../../composables/useLocale";

interface MergeChange {
  entityType: string;
  entityId: string;
  kind: "CLEAN" | "CONFLICT" | "DELETED_MODIFIED" | "ORPHAN_RISK";
  changedOn: string[];
  base?: Record<string, unknown> | null;
  sourceVersion?: Record<string, unknown> | null;
  targetVersion?: Record<string, unknown> | null;
  warning?: string;
  /** NF-WF-024C: the proving rule for a CONFLICT narrowed to CLEAN by semantic analysis. */
  semanticRule?: "S1" | "S2" | "S3";
}

interface MergePreview {
  sourceBranch: { name: string };
  targetBranch: { name: string };
  changes: MergeChange[];
  summary: { clean: number; conflict: number; deletedModified: number; orphanRisk: number };
  canApply: boolean;
}

const props = defineProps<{
  workspaceId: string;
  novelId: string;
  sourceBranchId: string;
  targetBranchId?: string;
}>();

const emit = defineEmits<{
  applied: [revisionId: string];
}>();

const { t } = useLocale();
const { api } = useApi();

const loading = ref(true);
const loadError = ref<string | null>(null);
const preview = ref<MergePreview | null>(null);
const applying = ref(false);
const applied = ref(false);
const applyError = ref<string | null>(null);
// NF-WF-024C: merge analysis mode. Conservative (default) = 020C behavior;
// semantic = deterministic S1/S2/S3 narrowing of CONFLICT → CLEAN.
const mode = ref<"conservative" | "semantic">("conservative");

const sourceBranchName = computed(() => preview.value?.sourceBranch.name ?? "—");
const targetBranchName = computed(() => preview.value?.targetBranch.name ?? "—");

const grouped = computed(() => {
  if (!preview.value) return [];
  const groups: { kind: MergeChange["kind"]; label: string; changes: MergeChange[] }[] = [
    { kind: "CONFLICT", label: t("recovery.mergeConflicts"), changes: [] },
    { kind: "DELETED_MODIFIED", label: t("recovery.mergeDeletedModified"), changes: [] },
    { kind: "ORPHAN_RISK", label: t("recovery.mergeOrphanRisk"), changes: [] },
    { kind: "CLEAN", label: t("recovery.mergeClean"), changes: [] },
  ];
  for (const c of preview.value.changes) {
    groups.find((g) => g.kind === c.kind)?.changes.push(c);
  }
  return groups.filter((g) => g.changes.length > 0);
});

function kindClass(kind: MergeChange["kind"]): string {
  switch (kind) {
    case "CONFLICT":
    case "DELETED_MODIFIED":
      return "bg-red-950 text-red-300 border border-red-800";
    case "ORPHAN_RISK":
      return "bg-amber-950 text-amber-300 border border-amber-800";
    default:
      return "bg-nf-bg-3 text-nf-text-dim border border-nf-border-strong";
  }
}

function formatRow(row: Record<string, unknown>): string {
  // Show the human-meaningful fields first; fall back to full JSON.
  const picked: Record<string, unknown> = {};
  for (const k of ["predicate", "object_text", "statement", "name", "title", "content"]) {
    if (row[k] !== undefined) picked[k] = row[k];
  }
  const shown = Object.keys(picked).length > 0 ? picked : row;
  return JSON.stringify(shown, null, 1).slice(0, 500);
}

function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    switch (e.code) {
      case "MERGE_CONFLICTS":
        return t("recovery.mergeConflictsError");
      case "NOT_ON_TARGET_BRANCH":
        return t("recovery.notOnTargetBranch");
      case "MERGE_NO_SNAPSHOT":
        return t("recovery.mergeNoSnapshot");
      case "MERGE_DIRTY_TARGET":
        return t("recovery.mergeDirtyTarget");
      default:
        return e.message;
    }
  }
  return String(e);
}

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = null;
  try {
    const body: Record<string, string> = {};
    if (props.targetBranchId) body.targetBranchId = props.targetBranchId;
    // NF-WF-024C: pass the mode; conservative is the default.
    if (mode.value !== "conservative") body.mode = mode.value;
    const res = await api<{ preview: MergePreview }>(
      `/workspaces/${props.workspaceId}/novels/${props.novelId}/branches/${props.sourceBranchId}/merge/preview`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
    preview.value = res.preview;
  } catch (e) {
    loadError.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}

function setMode(next: "conservative" | "semantic"): void {
  if (mode.value === next) return;
  mode.value = next;
  applied.value = false;
  void load();
}

async function onApply(): Promise<void> {
  if (!preview.value?.canApply || applying.value) return;
  applying.value = true;
  applyError.value = null;
  try {
    const res = await api<{ revisionId: string }>(
      `/workspaces/${props.workspaceId}/novels/${props.novelId}/branches/${props.sourceBranchId}/merge/apply`,
      {
        method: "POST",
        body: JSON.stringify(props.targetBranchId ? { targetBranchId: props.targetBranchId } : {}),
      },
    );
    applied.value = true;
    emit("applied", res.revisionId);
  } catch (e) {
    applyError.value = errorMessage(e);
    // A conflict discovered at apply time (head moved between preview and
    // apply) reloads the preview so the author sees the new state.
    if (e instanceof ApiError && e.code === "MERGE_CONFLICTS") await load();
  } finally {
    applying.value = false;
  }
}

onMounted(load);
</script>
