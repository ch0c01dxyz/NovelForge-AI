<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-50" role="presentation">
      <div class="absolute inset-0 bg-black/50" data-testid="fact-editor-backdrop" @click="emit('close')" />
      <section
        ref="panelRef"
        tabindex="-1"
        role="dialog"
        aria-modal="true"
        :aria-label="mode === 'create' ? t('workspace.world.editor.createTitle') : t('workspace.world.editor.sourcesTitle')"
        class="absolute left-1/2 top-[5%] max-h-[90vh] w-[min(680px,94vw)] -translate-x-1/2 overflow-y-auto rounded-xl border border-nf-border bg-nf-bg-1 shadow-xl focus-visible:nf-focus"
      >
        <header class="flex items-center justify-between gap-3 border-b border-nf-border px-5 py-3">
          <h2 class="text-[15px] font-semibold text-nf-text">
            {{ mode === "create" ? t("workspace.world.editor.createTitle") : t("workspace.world.editor.sourcesTitle") }}
          </h2>
          <button
            type="button"
            class="rounded-md border border-nf-border-strong px-2.5 py-1 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
            :aria-label="t('common.close')"
            @click="emit('close')"
          >
            ✕
          </button>
        </header>

        <div class="px-5 py-4">
          <!-- ============ SOURCES MODE: list + attach/detach ============ -->
          <template v-if="mode === 'sources' && fact">
            <p class="mb-2 text-[13px] text-nf-text-dim">
              <span class="text-nf-accent-hi">{{ fact.predicate }}</span>
              <span v-if="fact.objectText"> — {{ fact.objectText }}</span>
            </p>
            <ul class="space-y-2">
              <li
                v-for="(s, i) in localSources"
                :key="i"
                class="rounded-lg border border-nf-border bg-nf-bg-2 p-2.5"
              >
                <div class="flex items-start justify-between gap-2">
                  <p class="text-[11px] text-nf-text-faint">
                    {{ t(`workspace.world.facts.source.${s.sourceKind}`) }} · [{{ s.start }}, {{ s.end }})
                  </p>
                  <button
                    v-if="knownIds[sourceFingerprint(s)] && confirmingDetach !== sourceFingerprint(s)"
                    type="button"
                    class="shrink-0 rounded-md border border-nf-border px-2 py-0.5 text-[12px] text-nf-text-dim hover:border-nf-warn hover:text-nf-warn focus-visible:nf-focus"
                    @click="confirmingDetach = sourceFingerprint(s)"
                  >
                    {{ t("workspace.world.editor.detach") }}
                  </button>
                </div>
                <!-- Quote rendered as TEXT, never raw HTML -->
                <blockquote class="mt-1 max-h-28 overflow-y-auto whitespace-pre-wrap text-[12px] text-nf-text-dim">
                  {{ s.quote }}
                </blockquote>
                <p v-if="!knownIds[sourceFingerprint(s)]" class="mt-1 text-[11px] text-nf-text-faint">
                  {{ t("workspace.world.facts.citationDetachUnavailable") }}
                </p>
                <!-- Destructive: explicit confirmation required -->
                <div
                  v-if="confirmingDetach === sourceFingerprint(s)"
                  class="mt-1.5 flex items-center gap-2"
                  role="alertdialog"
                  :aria-label="t('workspace.world.editor.detachConfirm')"
                >
                  <span class="text-[12px] text-nf-warn">{{ t("workspace.world.editor.detachConfirm") }}</span>
                  <button
                    type="button"
                    :disabled="detaching !== null"
                    class="rounded-md border border-nf-warn px-2 py-0.5 text-[12px] text-nf-warn hover:bg-nf-bg-2 disabled:opacity-50 focus-visible:nf-focus"
                    @click="detach(s)"
                  >
                    {{ t("workspace.world.editor.detachYes") }}
                  </button>
                  <button
                    type="button"
                    class="rounded-md border border-nf-border px-2 py-0.5 text-[12px] text-nf-text-dim hover:bg-nf-bg-2 focus-visible:nf-focus"
                    @click="confirmingDetach = null"
                  >
                    {{ t("common.cancel") }}
                  </button>
                </div>
              </li>
            </ul>
            <p v-if="localSources.length === 0" class="py-2 text-[13px] text-nf-text-faint">
              {{ t("workspace.world.facts.noSources") }}
            </p>

            <h3 class="mb-2 mt-4 text-[13px] font-semibold text-nf-text">
              {{ t("workspace.world.facts.addCitation") }}
            </h3>
            <CitationFields v-model="attachForm" />
            <p v-if="attachError" role="alert" class="mt-2 text-[13px] text-nf-warn">{{ attachError }}</p>
            <button
              type="button"
              :disabled="attaching"
              class="mt-2 rounded-md bg-nf-accent px-3 py-1.5 text-[13px] font-medium text-nf-accent-ink hover:brightness-110 disabled:opacity-50 focus-visible:nf-focus"
              @click="attach"
            >
              {{ attaching ? t("workspace.world.editor.attaching") : t("workspace.world.editor.attach") }}
            </button>
          </template>

          <!-- ============ CREATE MODE ============ -->
          <form v-else-if="mode === 'create'" @submit.prevent="submit">
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label class="block">
                <span class="mb-1 block text-[12px] text-nf-text-dim">{{ t("workspace.world.editor.entity") }}</span>
                <select
                  v-model="createForm.entityId"
                  class="w-full rounded-md border border-nf-border bg-nf-bg-2 px-2.5 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
                >
                  <option value="">{{ t("workspace.world.editor.entitiesLoading") }}</option>
                  <option v-for="e in entities" :key="e.id" :value="e.id">{{ e.name }} ({{ e.key }})</option>
                </select>
              </label>
              <label class="block">
                <span class="mb-1 block text-[12px] text-nf-text-dim">{{ t("workspace.world.editor.predicate") }}</span>
                <input
                  v-model="createForm.predicate"
                  type="text"
                  maxlength="200"
                  :placeholder="t('workspace.world.editor.predicatePlaceholder')"
                  class="w-full rounded-md border border-nf-border bg-nf-bg-2 px-2.5 py-1.5 text-[13px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
                />
              </label>
            </div>

            <fieldset class="mt-3">
              <legend class="mb-1 text-[12px] text-nf-text-dim">{{ t("workspace.world.editor.objectKind") }}</legend>
              <div class="flex gap-3" role="radiogroup" :aria-label="t('workspace.world.editor.objectKind')">
                <label class="flex items-center gap-1.5 text-[13px] text-nf-text">
                  <input v-model="createForm.objectMode" type="radio" value="text" class="accent-[#f97316]" />
                  {{ t("workspace.world.editor.objectKindText") }}
                </label>
                <label class="flex items-center gap-1.5 text-[13px] text-nf-text">
                  <input v-model="createForm.objectMode" type="radio" value="entity" class="accent-[#f97316]" />
                  {{ t("workspace.world.editor.objectKindEntity") }}
                </label>
              </div>
              <input
                v-if="createForm.objectMode === 'text'"
                v-model="createForm.objectText"
                type="text"
                maxlength="2000"
                :placeholder="t('workspace.world.editor.objectTextPlaceholder')"
                class="mt-1.5 w-full rounded-md border border-nf-border bg-nf-bg-2 px-2.5 py-1.5 text-[13px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
              />
              <select
                v-else
                v-model="createForm.objectEntityId"
                class="mt-1.5 w-full rounded-md border border-nf-border bg-nf-bg-2 px-2.5 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
              >
                <option value="">{{ t("workspace.world.editor.objectEntity") }}</option>
                <option v-for="e in entities" :key="e.id" :value="e.id">{{ e.name }} ({{ e.key }})</option>
              </select>
            </fieldset>

            <label class="mt-3 block">
              <span class="mb-1 block text-[12px] text-nf-text-dim">{{ t("workspace.world.editor.statement") }}</span>
              <textarea
                v-model="createForm.statement"
                rows="2"
                maxlength="4000"
                :placeholder="t('workspace.world.editor.statementPlaceholder')"
                class="w-full rounded-md border border-nf-border bg-nf-bg-2 px-2.5 py-1.5 text-[13px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
              />
            </label>

            <div class="mt-3 grid grid-cols-3 gap-2">
              <label class="block">
                <span class="mb-1 block text-[12px] text-nf-text-dim">{{ t("workspace.world.editor.validFromChapter") }}</span>
                <input v-model="createForm.validFromChapter" type="number" min="0" max="100000" placeholder="—"
                  class="w-full rounded-md border border-nf-border bg-nf-bg-2 px-2.5 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus" />
              </label>
              <label class="block">
                <span class="mb-1 block text-[12px] text-nf-text-dim">{{ t("workspace.world.editor.validUntilChapter") }}</span>
                <input v-model="createForm.validUntilChapter" type="number" min="0" max="100000" placeholder="—"
                  class="w-full rounded-md border border-nf-border bg-nf-bg-2 px-2.5 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus" />
              </label>
              <label class="block">
                <span class="mb-1 block text-[12px] text-nf-text-dim">{{ t("workspace.world.editor.availableFromChapter") }}</span>
                <input v-model="createForm.availableFromChapter" type="number" min="0" max="100000" placeholder="—"
                  class="w-full rounded-md border border-nf-border bg-nf-bg-2 px-2.5 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus" />
              </label>
            </div>

            <fieldset class="mt-4 rounded-lg border border-nf-border-strong p-3">
              <legend class="px-1 text-[13px] font-semibold text-nf-text">
                {{ t("workspace.world.editor.citation") }}
              </legend>
              <CitationFields v-model="createForm.citation" />
            </fieldset>

            <p v-if="createError" role="alert" class="mt-2 text-[13px] text-nf-warn">{{ createError }}</p>
            <div class="mt-3 flex gap-2">
              <button
                type="submit"
                :disabled="submitting"
                class="rounded-md bg-nf-accent px-3 py-1.5 text-[13px] font-medium text-nf-accent-ink hover:brightness-110 disabled:opacity-50 focus-visible:nf-focus"
              >
                {{ submitting ? t("workspace.world.editor.submitting") : t("workspace.world.editor.submit") }}
              </button>
              <button
                type="button"
                class="rounded-md border border-nf-border px-3 py-1.5 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 focus-visible:nf-focus"
                @click="emit('close')"
              >
                {{ t("common.cancel") }}
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * Fact editor (NF-WF-016, World & Lore): create a canon fact with a REQUIRED
 * evidence citation (Invariant 2 / Q8 — the server keeps the source optional,
 * the UI refuses to submit without one), and attach/detach citations on an
 * existing fact (the Q2 route). Esc dismisses; focus returns to the opener.
 *
 * Strip-aware quote rule (Invariant 2): chapter prose may be sanitized HTML,
 * so the quote is matched against STORED content — strip tags before
 * matching, never invent offsets.
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useApi, ApiError } from "../../composables/useApi";
import { useLocale } from "../../composables/useLocale";
import {
  UUID_RE,
  sourceFingerprint,
  type CanonFact,
  type FactSource,
  type StoryEntity,
} from "./canon-types";
import CitationFields, { type CitationForm } from "./CitationFields.vue";

const props = defineProps<{
  workspaceId: string;
  novelId: string;
  open: boolean;
  mode: "create" | "sources";
  fact?: CanonFact | null;
  initialEntityId?: string | null;
  knownIds?: Record<string, string>;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "saved"): void;
  (e: "source-attached", factId: string, fingerprint: string, id: string): void;
  (e: "source-detached", factId: string, fingerprint: string): void;
}>();

const { t } = useLocale();
const { api } = useApi();

const panelRef = ref<HTMLElement | null>(null);
const opener = ref<HTMLElement | null>(null);
const entities = ref<StoryEntity[]>([]);
const submitting = ref(false);
const createError = ref<string | null>(null);
const attaching = ref(false);
const attachError = ref<string | null>(null);
const detaching = ref<string | null>(null);
const confirmingDetach = ref<string | null>(null);

const createForm = ref({
  entityId: "",
  predicate: "",
  objectMode: "text" as "text" | "entity",
  objectText: "",
  objectEntityId: "",
  statement: "",
  validFromChapter: "",
  validUntilChapter: "",
  availableFromChapter: "",
  citation: { kind: "CHAPTER", versionId: "", quote: "", start: "", end: "" } as CitationForm,
});
const attachForm = ref<CitationForm>({ kind: "CHAPTER", versionId: "", quote: "", start: "", end: "" });
const localSources = ref<FactSource[]>([]);

const knownIds = computed(() => props.knownIds ?? {});

function errText(e: unknown): string {
  if (e instanceof ApiError) {
    const key = `workspace.world.errors.${e.code}`;
    const msg = t(key);
    return msg === key ? e.code : msg;
  }
  return t("workspace.world.errors.network");
}

async function loadEntities() {
  try {
    entities.value = await api<StoryEntity[]>(
      `/workspaces/${props.workspaceId}/novels/${props.novelId}/canon/entities`,
    );
  } catch {
    entities.value = [];
  }
}

/** Validate a citation form; returns the error key or null. */
function validateCitation(c: CitationForm): string | null {
  if (!c.quote.trim() || !c.versionId.trim() || c.start === "" || c.end === "") {
    return "workspace.world.editor.citationRequired";
  }
  if (!UUID_RE.test(c.versionId.trim())) return "workspace.world.editor.versionIdInvalid";
  const start = Number(c.start);
  const end = Number(c.end);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) {
    return "workspace.world.editor.rangeInvalid";
  }
  return null;
}

function buildSource(c: CitationForm) {
  const versionId = c.versionId.trim();
  return {
    ...(c.kind === "CHAPTER" ? { chapterVersionId: versionId } : { referenceVersionId: versionId }),
    quote: c.quote,
    start: Number(c.start),
    end: Number(c.end),
  };
}

async function submit() {
  createError.value = null;
  const entityId = createForm.value.entityId || props.initialEntityId || "";
  const predicate = createForm.value.predicate.trim();
  if (!entityId) {
    createError.value = t("workspace.world.editor.entityRequired");
    return;
  }
  if (!predicate) {
    createError.value = t("workspace.world.editor.predicateRequired");
    return;
  }
  const objectText =
    createForm.value.objectMode === "text" ? createForm.value.objectText.trim() : "";
  const objectEntityId =
    createForm.value.objectMode === "entity" ? createForm.value.objectEntityId : "";
  if (!objectText && !objectEntityId) {
    createError.value = t("workspace.world.editor.objectRequired");
    return;
  }
  const citationError = validateCitation(createForm.value.citation);
  if (citationError) {
    // Q8: the UI REQUIRES the citation — the server keeps it optional.
    createError.value = t(citationError);
    return;
  }
  const num = (v: string): number | null => (v.trim() === "" ? null : Number(v));
  const validFrom = num(createForm.value.validFromChapter);
  const validUntil = num(createForm.value.validUntilChapter);
  if (validFrom !== null && validUntil !== null && validUntil < validFrom) {
    createError.value = t("workspace.world.editor.windowInvalid");
    return;
  }
  submitting.value = true;
  try {
    await api<{ id: string }>(`/workspaces/${props.workspaceId}/novels/${props.novelId}/canon/facts`, {
      method: "POST",
      body: JSON.stringify({
        entityId,
        predicate,
        ...(objectEntityId ? { objectEntityId } : { objectText }),
        ...(createForm.value.statement.trim()
          ? { statement: createForm.value.statement.trim() }
          : {}),
        validFromChapter: validFrom,
        validUntilChapter: validUntil,
        availableFromChapter: num(createForm.value.availableFromChapter),
        source: buildSource(createForm.value.citation),
      }),
    });
    emit("saved");
    emit("close");
  } catch (e) {
    if (e instanceof ApiError && e.code === "CONFLICT") {
      // P2002: a live fact exists for subject+predicate.
      createError.value = t("workspace.world.editor.factConflict");
    } else {
      createError.value = errText(e);
    }
  } finally {
    submitting.value = false;
  }
}

async function attach() {
  attachError.value = null;
  if (!props.fact) return;
  const citationError = validateCitation(attachForm.value);
  if (citationError) {
    attachError.value = t(citationError);
    return;
  }
  attaching.value = true;
  try {
    const source = buildSource(attachForm.value);
    const res = await api<{ id: string }>(
      `/workspaces/${props.workspaceId}/novels/${props.novelId}/canon/facts/${props.fact.id}/sources`,
      { method: "POST", body: JSON.stringify(source) },
    );
    const added: FactSource = {
      sourceKind: attachForm.value.kind,
      quote: source.quote,
      start: source.start,
      end: source.end,
      chapterVersionId: attachForm.value.kind === "CHAPTER" ? attachForm.value.versionId.trim() : null,
      referenceVersionId:
        attachForm.value.kind === "REFERENCE" ? attachForm.value.versionId.trim() : null,
    };
    localSources.value = [...localSources.value, added];
    emit("source-attached", props.fact.id, sourceFingerprint(added), res.id);
    attachForm.value = { kind: "CHAPTER", versionId: "", quote: "", start: "", end: "" };
    emit("saved");
  } catch (e) {
    attachError.value = errText(e);
  } finally {
    attaching.value = false;
  }
}

async function detach(s: FactSource) {
  if (!props.fact) return;
  const id = knownIds.value[sourceFingerprint(s)];
  if (!id) return;
  detaching.value = sourceFingerprint(s);
  try {
    await api<void>(
      `/workspaces/${props.workspaceId}/novels/${props.novelId}/canon/facts/${props.fact.id}/sources/${id}`,
      { method: "DELETE" },
    );
    localSources.value = localSources.value.filter((x) => sourceFingerprint(x) !== sourceFingerprint(s));
    emit("source-detached", props.fact.id, sourceFingerprint(s));
    emit("saved");
  } catch (e) {
    attachError.value = errText(e);
  } finally {
    detaching.value = null;
  }
  confirmingDetach.value = null;
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape" && props.open) {
    e.stopPropagation();
    emit("close");
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      opener.value = (document.activeElement as HTMLElement | null) ?? null;
      if (props.mode === "sources" && props.fact) {
        localSources.value = [...(props.fact.sources ?? [])];
      }
      if (props.mode === "create" && props.initialEntityId) {
        createForm.value.entityId = props.initialEntityId;
      }
      nextTick(() => panelRef.value?.focus());
    } else {
      opener.value?.focus();
      opener.value = null;
      createError.value = null;
      attachError.value = null;
    }
  },
  { flush: "post", immediate: true },
);

onMounted(() => {
  document.addEventListener("keydown", onKeydown, true);
  if (props.mode === "create") loadEntities();
});
onUnmounted(() => document.removeEventListener("keydown", onKeydown, true));
</script>
