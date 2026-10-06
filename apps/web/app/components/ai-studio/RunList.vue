<script setup lang="ts">
/**
 * Run list (NF-WF-018A): workspace workflow runs with a status filter.
 * The filter rides the additive `?status=` query param (Invariant 1(d)).
 * Selecting a run opens its detail (the parent mounts RunGraph).
 */
import { ref, watch, onMounted } from "vue";
import { useAiStudio, type RunSummary } from "../../composables/useAiStudio";
import { useLocale } from "../../composables/useLocale";

const props = defineProps<{
  workspaceId: string;
}>();

const emit = defineEmits<{
  (e: "select", runId: string): void;
}>();

const { t } = useLocale();
const studio = useAiStudio();

const STATUS_OPTIONS = [
  "PENDING",
  "RUNNING",
  "AWAITING_APPROVAL",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
] as const;

const statusFilter = ref<string>("");
const runs = ref<RunSummary[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

function statusLabel(status: string): string {
  return t(`aiStudio.runs.status.${status}`);
}

function statusClass(status: string): string {
  if (status === "SUCCEEDED") return "bg-nf-ok/15 text-nf-ok";
  if (status === "FAILED") return "bg-nf-warn/15 text-nf-warn";
  if (status === "AWAITING_APPROVAL") return "bg-nf-accent/15 text-nf-accent-hi";
  if (status === "RUNNING" || status === "PENDING")
    return "bg-nf-accent/10 text-nf-accent-hi";
  return "bg-nf-text-faint/15 text-nf-text-faint";
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

async function refresh() {
  loading.value = true;
  error.value = null;
  try {
    runs.value = await studio.listRuns(props.workspaceId, {
      ...(statusFilter.value ? { status: statusFilter.value } : {}),
      limit: 100,
    });
  } catch (err) {
    error.value = err instanceof Error ? err.message : "unknown";
  } finally {
    loading.value = false;
  }
}

onMounted(refresh);
watch(statusFilter, refresh);

defineExpose({ refresh });
</script>

<template>
  <section aria-labelledby="run-list-heading">
    <div class="mb-3 flex items-center gap-3">
      <h2 id="run-list-heading" class="text-[15px] font-semibold text-nf-text">
        {{ t("aiStudio.runs.title") }}
      </h2>
      <label class="flex items-center gap-2 text-[13px] text-nf-text-dim">
        {{ t("aiStudio.runs.filter.label") }}
        <select
          v-model="statusFilter"
          class="rounded-lg border border-nf-border-strong bg-nf-bg-0 px-2 py-1 text-[13px] text-nf-text focus-visible:nf-focus"
          data-testid="run-status-filter"
        >
          <option value="">{{ t("aiStudio.runs.filter.all") }}</option>
          <option v-for="s in STATUS_OPTIONS" :key="s" :value="s">
            {{ statusLabel(s) }}
          </option>
        </select>
      </label>
    </div>

    <div v-if="loading" class="py-6 text-center text-nf-text-faint" role="status">
      {{ t("common.loading") }}
    </div>
    <div v-else-if="error" class="py-6 text-center" role="alert">
      <p class="text-nf-warn">{{ error }}</p>
      <button
        class="mt-2 rounded-lg border border-nf-border-strong px-3 py-1.5 text-[13px] focus-visible:nf-focus"
        @click="refresh"
      >
        {{ t("common.retry") }}
      </button>
    </div>
    <p v-else-if="runs.length === 0" class="py-6 text-center text-nf-text-faint">
      {{ t("aiStudio.runs.empty") }}
    </p>
    <ul v-else class="divide-y divide-nf-border/60">
      <li
        v-for="r in runs"
        :key="r.id"
        class="flex items-center gap-3 px-2 py-2.5"
        :data-testid="`run-${r.id}`"
      >
        <div class="min-w-0 flex-1">
          <button
            class="truncate text-left text-[14px] font-medium text-nf-text hover:text-nf-accent-hi focus-visible:nf-focus"
            @click="emit('select', r.id)"
          >
            {{ r.workflowKey }}
          </button>
          <p class="truncate text-[12px] text-nf-text-faint">
            {{ t("aiStudio.runs.workflowVersion", { version: r.workflowVersionNumber ?? "—" }) }}
            · {{ formatDate(r.startedAt) }}
          </p>
        </div>
        <span
          class="rounded px-1.5 py-0.5 text-[11px] font-semibold"
          :class="statusClass(r.status)"
        >
          {{ statusLabel(r.status) }}
        </span>
      </li>
    </ul>
  </section>
</template>
