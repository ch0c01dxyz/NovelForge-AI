<script setup lang="ts">
/**
 * Definition list (NF-WF-018A): the workspace's agents/skills/workflows
 * with current version number and status (DRAFT/PUBLISHED/ARCHIVED).
 * Pure view over the frozen list routes; all actions ride the frozen
 * routes. Edit/publish/run affordances are shown only when the caller's
 * role grants them (progressive enhancement — the server enforces).
 */
import { ref, computed, watch, onMounted } from "vue";
import {
  useAiStudio,
  type DefinitionKind,
  type DefinitionSummary,
} from "../../composables/useAiStudio";
import { useLocale } from "../../composables/useLocale";

const props = defineProps<{
  workspaceId: string;
  kind: DefinitionKind;
  canManage: boolean;
  canRun: boolean;
}>();

const emit = defineEmits<{
  (e: "select", id: string): void;
  (e: "run-launched", runId: string): void;
}>();

const { t } = useLocale();
const studio = useAiStudio();

const definitions = ref<DefinitionSummary[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

const kindLabel = computed(() => t(`aiStudio.kinds.${props.kind}`));

function statusLabel(status: string): string {
  return t(`aiStudio.definitions.status.${status}`);
}

function statusClass(status: string): string {
  if (status === "PUBLISHED") return "bg-nf-ok/15 text-nf-ok";
  if (status === "ARCHIVED") return "bg-nf-text-faint/15 text-nf-text-faint";
  return "bg-nf-accent/15 text-nf-accent-hi";
}

async function refresh() {
  loading.value = true;
  error.value = null;
  try {
    definitions.value = await studio.listDefinitions(props.workspaceId, props.kind);
  } catch (err) {
    error.value = err instanceof Error ? err.message : "unknown";
  } finally {
    loading.value = false;
  }
}

async function launch(id: string) {
  try {
    const run = await studio.launchRun(props.workspaceId, id);
    emit("run-launched", run.id);
  } catch (err) {
    error.value = err instanceof Error ? err.message : "unknown";
  }
}

defineExpose({ refresh });

onMounted(refresh);
watch(() => [props.workspaceId, props.kind], refresh);
</script>

<template>
  <section :aria-label="kindLabel">
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
    <ul v-else class="divide-y divide-nf-border/60">
      <li
        v-for="d in definitions"
        :key="d.id"
        class="flex items-center gap-3 px-2 py-2.5"
        :data-testid="`definition-${d.key}`"
      >
        <div class="min-w-0 flex-1">
          <button
            class="max-w-full truncate text-left text-[14px] font-medium text-nf-text hover:text-nf-accent-hi focus-visible:nf-focus"
            @click="emit('select', d.id)"
          >
            {{ d.name }}
            <span class="ml-1 font-normal text-nf-text-faint">({{ d.key }})</span>
          </button>
          <p class="truncate text-[12px] text-nf-text-faint">
            <span
              v-if="d.scope === 'PLATFORM'"
              class="mr-1 rounded border border-nf-border-strong px-1 text-[10px] font-semibold uppercase"
            >
              PLATFORM
            </span>
            {{ t("aiStudio.definitions.version", { version: d.version ?? "—" }) }}
          </p>
        </div>
        <span
          class="rounded px-1.5 py-0.5 text-[11px] font-semibold"
          :class="statusClass(d.status)"
        >
          {{ statusLabel(d.status) }}
        </span>
        <button
          v-if="props.kind === 'workflow' && props.canRun && d.status === 'PUBLISHED'"
          class="rounded-lg bg-nf-accent px-3 py-1.5 text-[12px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus"
          :aria-label="`${t('aiStudio.definitions.runWorkflow')}: ${d.name}`"
          @click="launch(d.id)"
        >
          {{ t("aiStudio.definitions.runWorkflow") }}
        </button>
      </li>
    </ul>
  </section>
</template>
