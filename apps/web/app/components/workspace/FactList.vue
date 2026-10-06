<template>
  <section aria-labelledby="fact-list-title">
    <div class="mb-3 flex items-center justify-between gap-3">
      <h3 id="fact-list-title" class="text-[15px] font-semibold text-nf-text">
        {{ t("workspace.world.facts.title") }}
      </h3>
      <label class="flex items-center gap-1.5 text-[12px] text-nf-text-dim">
        <input
          v-model="includeSuperseded"
          type="checkbox"
          class="h-3.5 w-3.5 accent-[#f97316] focus-visible:nf-focus"
          @change="load"
        />
        {{ t("workspace.world.facts.includeSuperseded") }}
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
    <p v-else-if="facts.length === 0" class="py-6 text-center text-[13px] text-nf-text-faint">
      {{ t("workspace.world.facts.empty") }}
    </p>
    <ul v-else class="space-y-3">
      <li
        v-for="f in facts"
        :key="f.id"
        class="rounded-lg border border-nf-border bg-nf-bg-2 p-3"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <p class="text-[13px] font-medium text-nf-text">
              <span class="text-nf-accent-hi">{{ f.predicate }}</span>
              <span v-if="f.objectText" class="text-nf-text-dim"> — {{ f.objectText }}</span>
            </p>
            <p v-if="f.statement" class="mt-0.5 text-[13px] text-nf-text-dim">{{ f.statement }}</p>
            <p class="mt-1 text-[12px] text-nf-text-faint">
              <template v-if="f.validFromChapter !== null">{{ t("workspace.world.facts.validFrom", { n: f.validFromChapter }) }} </template>
              <template v-if="f.validUntilChapter !== null">{{ t("workspace.world.facts.validUntil", { n: f.validUntilChapter }) }} </template>
              <template v-if="f.availableFromChapter !== null">{{ t("workspace.world.facts.availableFrom", { n: f.availableFromChapter }) }}</template>
            </p>
          </div>
          <span
            class="shrink-0 rounded-full border px-2 py-0.5 text-[11px]"
            :class="statusClass(f.status)"
          >
            {{ statusLabel(f.status) }}
          </span>
        </div>

        <!-- Evidence: quotes rendered as TEXT, never raw HTML -->
        <div class="mt-2 border-t border-nf-border pt-2">
          <p class="text-[12px] font-medium text-nf-text-dim">{{ t("workspace.world.facts.sources") }}</p>
          <p v-if="!f.sources || f.sources.length === 0" class="text-[12px] text-nf-text-faint">
            {{ t("workspace.world.facts.noSources") }}
          </p>
          <ul v-else class="mt-1 space-y-1.5">
            <li
              v-for="(s, i) in f.sources"
              :key="i"
              class="rounded border border-nf-border bg-nf-bg-1 p-2"
            >
              <p class="text-[11px] text-nf-text-faint">
                {{ t(`workspace.world.facts.source.${s.sourceKind}`) }}
                · [{{ s.start }}, {{ s.end }})
              </p>
              <blockquote class="mt-0.5 max-h-24 overflow-y-auto whitespace-pre-wrap text-[12px] text-nf-text-dim">
                {{ s.quote }}
              </blockquote>
            </li>
          </ul>
        </div>

        <div v-if="f.status === 'ACTIVE'" class="mt-2 flex gap-2">
          <button
            type="button"
            class="rounded-md border border-nf-border-strong px-2.5 py-1 text-[12px] text-nf-text hover:bg-nf-bg-3 focus-visible:nf-focus"
            @click="openSources(f)"
          >
            {{ t("workspace.world.facts.addCitation") }}
          </button>
          <button
            v-if="confirmingRetract !== f.id"
            type="button"
            class="rounded-md border border-nf-border px-2.5 py-1 text-[12px] text-nf-text-dim hover:border-nf-warn hover:text-nf-warn focus-visible:nf-focus"
            @click="confirmingRetract = f.id"
          >
            {{ t("workspace.world.facts.retract") }}
          </button>
        </div>

        <!-- Retract confirmation (destructive: explicit confirm required) -->
        <div
          v-if="confirmingRetract === f.id"
          class="mt-2 rounded-md border border-nf-warn/40 bg-nf-bg-1 p-2.5"
          role="alertdialog"
          :aria-label="t('workspace.world.facts.retractTitle')"
        >
          <p class="text-[13px] font-medium text-nf-warn">{{ t("workspace.world.facts.retractTitle") }}</p>
          <p class="mt-0.5 text-[12px] text-nf-text-dim">{{ t("workspace.world.facts.retractNote") }}</p>
          <label class="mt-2 block">
            <span class="mb-1 block text-[12px] text-nf-text-dim">{{ t("workspace.world.facts.retractReason") }}</span>
            <input
              v-model="retractReason"
              type="text"
              maxlength="2000"
              :placeholder="t('workspace.world.facts.retractReasonPlaceholder')"
              class="w-full rounded-md border border-nf-border bg-nf-bg-2 px-2.5 py-1.5 text-[13px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
            />
          </label>
          <p v-if="actionError" role="alert" class="mt-1.5 text-[13px] text-nf-warn">{{ actionError }}</p>
          <div class="mt-2 flex gap-2">
            <button
              type="button"
              :disabled="retracting"
              class="rounded-md border border-nf-warn px-3 py-1.5 text-[13px] text-nf-warn hover:bg-nf-bg-2 disabled:opacity-50 focus-visible:nf-focus"
              @click="retractFact(f)"
            >
              {{ retracting ? t("workspace.world.facts.retracting") : t("workspace.world.facts.retractConfirm") }}
            </button>
            <button
              type="button"
              class="rounded-md border border-nf-border px-3 py-1.5 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 focus-visible:nf-focus"
              @click="confirmingRetract = null; retractReason = ''; actionError = null"
            >
              {{ t("common.cancel") }}
            </button>
          </div>
        </div>
      </li>
    </ul>
    <p v-if="withheldCount > 0" class="mt-2 text-[12px] text-nf-text-faint">
      {{ t("workspace.world.facts.withheld", { n: withheldCount }) }}
    </p>

    <FactEditor
      :workspace-id="props.workspaceId"
      :novel-id="props.novelId"
      :open="sourcesEditorOpen"
      mode="sources"
      :fact="editorFact"
      :known-ids="knownIdsFor(editorFact?.id)"
      @close="closeSources"
      @source-attached="onSourceAttached"
      @source-detached="onSourceDetached"
      @saved="onSourcesSaved"
    />
  </section>
</template>

<script setup lang="ts">
/**
 * Fact list (NF-WF-016, World & Lore): authored canon facts WITH evidence.
 * The list route defaults to READER (withholds sources); the authoring UI
 * passes mode=AUTHOR explicitly (contract F5 pin). Retract is confirmed;
 * attach/detach of citations is delegated to FactEditor in "sources" mode.
 */
import { onMounted, ref, watch } from "vue";
import { useApi, ApiError } from "../../composables/useApi";
import { useLocale } from "../../composables/useLocale";
import FactEditor from "./FactEditor.vue";
import { type CanonFact } from "./canon-types";

const props = defineProps<{
  workspaceId: string;
  novelId: string;
  entityId?: string | null;
}>();

const emit = defineEmits<{
  (e: "changed"): void;
}>();

const { t } = useLocale();
const { api } = useApi();

const facts = ref<CanonFact[]>([]);
const withheldCount = ref(0);
const loading = ref(true);
const error = ref<string | null>(null);
const includeSuperseded = ref(false);
const confirmingRetract = ref<string | null>(null);
const retractReason = ref("");
const retracting = ref(false);
const actionError = ref<string | null>(null);
const sourcesEditorOpen = ref(false);
const editorFact = ref<CanonFact | null>(null);
// factId -> (source fingerprint -> source id), learned from attach (201)
// responses in this session. The list route does not return source ids.
const knownSourceIds = ref<Record<string, Record<string, string>>>({});

function knownIdsFor(factId: string | undefined): Record<string, string> {
  return (factId && knownSourceIds.value[factId]) || {};
}

function errText(e: unknown): string {
  if (e instanceof ApiError) {
    const key = `workspace.world.errors.${e.code}`;
    const msg = t(key);
    return msg === key ? e.code : msg;
  }
  return t("workspace.world.errors.network");
}

function statusLabel(status: string): string {
  const key = `workspace.world.facts.status.${status}`;
  const msg = t(key);
  return msg === key ? status : msg;
}

function statusClass(status: string): string {
  if (status === "ACTIVE") return "border-nf-ok/40 text-nf-ok";
  if (status === "RETRACTED") return "border-nf-border text-nf-text-faint";
  return "border-nf-warn/40 text-nf-warn";
}

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const qs = new URLSearchParams({ mode: "AUTHOR" });
    if (props.entityId) qs.set("entityId", props.entityId);
    if (includeSuperseded.value) qs.set("includeSuperseded", "true");
    const res = await api<{ facts: CanonFact[]; withheldCount: number }>(
      `/workspaces/${props.workspaceId}/novels/${props.novelId}/canon/facts?${qs}`,
    );
    facts.value = res.facts;
    withheldCount.value = res.withheldCount;
  } catch (e) {
    error.value = errText(e);
  } finally {
    loading.value = false;
  }
}

async function retractFact(f: CanonFact) {
  actionError.value = null;
  retracting.value = true;
  try {
    const reason = retractReason.value.trim();
    await api<void>(
      `/workspaces/${props.workspaceId}/novels/${props.novelId}/canon/facts/${f.id}/retract`,
      {
        method: "POST",
        body: JSON.stringify(reason ? { reason } : {}),
      },
    );
    confirmingRetract.value = null;
    retractReason.value = "";
    await load();
    emit("changed");
  } catch (e) {
    if (e instanceof ApiError && e.code === "CONFLICT") {
      actionError.value = t("workspace.world.facts.retractConflict");
    } else {
      actionError.value = errText(e);
    }
  } finally {
    retracting.value = false;
  }
}

function openSources(f: CanonFact) {
  editorFact.value = f;
  sourcesEditorOpen.value = true;
}

function closeSources() {
  sourcesEditorOpen.value = false;
  editorFact.value = null;
}

function onSourceAttached(factId: string, fingerprint: string, id: string) {
  if (!knownSourceIds.value[factId]) knownSourceIds.value[factId] = {};
  knownSourceIds.value[factId]![fingerprint] = id;
}

function onSourceDetached(factId: string, fingerprint: string) {
  delete knownSourceIds.value[factId]?.[fingerprint];
}

async function onSourcesSaved() {
  await load();
  // Re-point the editor at the refreshed fact row so the source list is current.
  if (editorFact.value) {
    editorFact.value = facts.value.find((f) => f.id === editorFact.value!.id) ?? null;
  }
  emit("changed");
}

watch(
  () => props.entityId,
  () => load(),
);

defineExpose({ refresh: load });
onMounted(() => load());
</script>
