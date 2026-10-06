<template>
  <section
    :aria-label="t('workspace.characters.states.title')"
    class="flex flex-col gap-4"
    data-testid="character-states"
  >
    <h3
      class="border-b border-nf-border pb-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-nf-text-faint"
    >
      {{ t("workspace.characters.states.title") }} — {{ characterName }}
    </h3>

    <p v-if="loading" class="text-[12.5px] text-nf-text-faint">
      {{ t("workspace.characters.states.loading") }}
    </p>
    <div v-else-if="loadError" class="flex flex-col gap-2">
      <p role="alert" class="text-[12.5px] text-nf-warn">{{ loadError }}</p>
      <button
        type="button"
        class="self-start rounded-md border border-nf-border-strong px-2.5 py-1.5 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
        @click="reload"
      >
        {{ t("workspace.characters.common.retry") }}
      </button>
    </div>

    <template v-else>
      <p
        v-if="!states.length"
        class="text-[12.5px] text-nf-text-faint"
        data-testid="states-empty"
      >
        {{ t("workspace.characters.states.empty") }}
      </p>
      <ul v-else class="flex flex-col gap-2" data-testid="states-list">
        <li
          v-for="s in states"
          :key="s.id"
          class="rounded-lg border border-nf-border bg-nf-bg-2 px-3 py-2"
        >
          <p class="font-mono text-[12px] text-nf-text-dim">
            {{ spanLabel(s.fromChapter, s.toChapter) }}
          </p>
          <p class="mt-0.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-nf-text-dim">
            {{ s.summary }}
          </p>
        </li>
      </ul>

      <form
        class="flex flex-col gap-2.5 rounded-lg border border-nf-border bg-nf-bg-1 p-3"
        data-testid="state-create-form"
        @submit.prevent="create"
      >
        <div class="grid grid-cols-2 gap-2.5">
          <div>
            <label
              :for="`${uid}-from`"
              class="mb-1 block text-[12px] font-medium text-nf-text-dim"
            >
              {{ t("workspace.characters.states.fromLabel") }}
            </label>
            <input
              :id="`${uid}-from`"
              v-model="fromChapter"
              type="number"
              min="1"
              max="100000"
              step="1"
              data-testid="state-from-input"
              class="w-full rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] tabular-nums text-nf-text focus-visible:nf-focus"
            />
          </div>
          <div>
            <label
              :for="`${uid}-to`"
              class="mb-1 block text-[12px] font-medium text-nf-text-dim"
            >
              {{ t("workspace.characters.states.toLabel") }}
            </label>
            <input
              :id="`${uid}-to`"
              v-model="toChapter"
              type="number"
              min="1"
              max="100000"
              step="1"
              data-testid="state-to-input"
              class="w-full rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] tabular-nums text-nf-text focus-visible:nf-focus"
            />
          </div>
        </div>
        <p
          v-if="fieldError"
          role="alert"
          class="text-[12px] text-nf-warn"
        >
          {{ fieldError }}
        </p>
        <div>
          <label
            :for="`${uid}-summary`"
            class="mb-1 block text-[12px] font-medium text-nf-text-dim"
          >
            {{ t("workspace.characters.states.summaryLabel") }}
          </label>
          <textarea
            :id="`${uid}-summary`"
            v-model="summary"
            rows="3"
            data-testid="state-summary-input"
            class="w-full rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
          />
        </div>
        <p v-if="submitError" role="alert" class="text-[12.5px] text-nf-warn" data-testid="state-submit-error">
          {{ submitError }}
        </p>
        <button
          type="submit"
          :disabled="creating"
          data-testid="state-create-submit"
          class="self-start rounded-lg bg-nf-accent px-3.5 py-2 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus disabled:opacity-50"
        >
          {{
            creating
              ? t("workspace.characters.states.adding")
              : t("workspace.characters.states.add")
          }}
        </button>
      </form>

      <form
        class="flex flex-col gap-2.5 rounded-lg border border-nf-border bg-nf-bg-1 p-3"
        data-testid="state-at-form"
        @submit.prevent="lookupAt"
      >
        <p class="text-[12px] font-semibold text-nf-text">
          {{ t("workspace.characters.states.atTitle") }}
        </p>
        <div class="flex items-end gap-2.5">
          <div class="w-40">
            <label
              :for="`${uid}-at`"
              class="mb-1 block text-[12px] font-medium text-nf-text-dim"
            >
              {{ t("workspace.characters.states.atChapterLabel") }}
            </label>
            <input
              :id="`${uid}-at`"
              v-model="atChapter"
              type="number"
              min="1"
              max="100000"
              step="1"
              data-testid="state-at-input"
              class="w-full rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] tabular-nums text-nf-text focus-visible:nf-focus"
            />
          </div>
          <button
            type="submit"
            :disabled="lookingUp"
            data-testid="state-at-submit"
            class="rounded-md border border-nf-border-strong px-2.5 py-1.5 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus disabled:opacity-50"
          >
            {{ t("workspace.characters.states.atCheck") }}
          </button>
        </div>
        <p
          v-if="atFieldError"
          role="alert"
          class="text-[12px] text-nf-warn"
        >
          {{ atFieldError }}
        </p>
        <div
          v-if="atResult !== undefined"
          aria-live="polite"
          data-testid="state-at-result"
          class="rounded-md border border-nf-border bg-nf-bg-2 px-3 py-2"
        >
          <template v-if="atResult">
            <p class="font-mono text-[12px] text-nf-text-dim">
              {{ spanLabel(atResult.fromChapter, atResult.toChapter) }}
            </p>
            <p class="mt-0.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-nf-text-dim">
              {{ atResult.summary }}
            </p>
          </template>
          <p v-else class="text-[12.5px] text-nf-text-faint">
            {{ t("workspace.characters.states.atNone", { chapter: lastAtChapter }) }}
          </p>
        </div>
      </form>
    </template>
  </section>
</template>

<script setup lang="ts">
/**
 * Character state spans (NF-WF-016, Invariant 1.1): list, create, and the
 * read-only as-of lookup.
 *
 * Overlapping spans are refused by the DB EXCLUDE constraint; the server
 * answers 409 and the UI surfaces it honestly instead of pretending the
 * write landed.
 */
import { ref, watch } from "vue";
import { useApi, ApiError } from "../../composables/useApi";
import { useLocale } from "../../composables/useLocale";

const props = defineProps<{
  workspaceId: string;
  novelId: string;
  characterId: string;
  characterName: string;
}>();

const { t } = useLocale();
const { api } = useApi();

const uid = `states-${Math.random().toString(36).slice(2, 8)}`;

interface StateSpan {
  id: string;
  characterId: string;
  fromChapter: number;
  toChapter: number | null;
  summary: string;
}

const states = ref<StateSpan[]>([]);
const loading = ref(false);
const loadError = ref<string | null>(null);

const fromChapter = ref("");
const toChapter = ref("");
const summary = ref("");
const creating = ref(false);
const fieldError = ref<string | null>(null);
const submitError = ref<string | null>(null);

const atChapter = ref("");
const lookingUp = ref(false);
const atFieldError = ref<string | null>(null);
const atResult = ref<StateSpan | null | undefined>(undefined);
const lastAtChapter = ref("");

function basePath() {
  return `/workspaces/${props.workspaceId}/novels/${props.novelId}/characters/${props.characterId}/states`;
}

function apiErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return t("workspace.characters.error.unauthorized");
    if (err.status === 403) return t("workspace.characters.error.forbidden");
    if (err.status === 404) return t("workspace.characters.error.notFound");
    if (err.status === 400) return t("workspace.characters.error.invalid");
    return t("workspace.characters.error.generic", { code: err.code });
  }
  return t("workspace.characters.error.generic", { code: "UNKNOWN" });
}

function spanLabel(from: number, to: number | null): string {
  return to === null
    ? t("workspace.characters.common.chapterOpen", { from })
    : t("workspace.characters.common.chapterRange", { from, to });
}

function parseChapter(raw: unknown): number | null {
  // Vue auto-casts <input type="number"> v-model values to numbers, so
  // both shapes arrive here; a cleared input stays "".
  if (typeof raw === "number") {
    return Number.isInteger(raw) && raw >= 1 && raw <= 100000 ? raw : null;
  }
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 100000) return null;
  return n;
}

/** True for "" and whitespace-only strings (a cleared number input stays ""). */
function isBlankChapter(raw: unknown): boolean {
  return raw === "" || (typeof raw === "string" && raw.trim() === "");
}

async function reload() {
  loading.value = true;
  loadError.value = null;
  try {
    states.value = await api<StateSpan[]>(basePath());
  } catch (err) {
    loadError.value = apiErrorMessage(err);
  } finally {
    loading.value = false;
  }
}

async function create() {
  fieldError.value = null;
  submitError.value = null;
  const from = parseChapter(fromChapter.value);
  const to = isBlankChapter(toChapter.value) ? null : parseChapter(toChapter.value);
  if (from === null || (!isBlankChapter(toChapter.value) && to === null)) {
    fieldError.value = t("workspace.characters.states.chapterError");
    return;
  }
  if (to !== null && to < (from as number)) {
    fieldError.value = t("workspace.characters.states.rangeError");
    return;
  }
  const s = summary.value.trim();
  if (!s || s.length > 20000) {
    fieldError.value = t("workspace.characters.states.summaryError");
    return;
  }
  creating.value = true;
  try {
    await api(basePath(), {
      method: "POST",
      body: JSON.stringify({ fromChapter: from, toChapter: to, summary: s }),
    });
    fromChapter.value = "";
    toChapter.value = "";
    summary.value = "";
    await reload();
  } catch (err) {
    submitError.value =
      err instanceof ApiError && err.status === 409
        ? t("workspace.characters.states.conflict")
        : apiErrorMessage(err);
  } finally {
    creating.value = false;
  }
}

async function lookupAt() {
  atFieldError.value = null;
  const chapter = parseChapter(atChapter.value);
  if (chapter === null) {
    atFieldError.value = t("workspace.characters.states.chapterError");
    atResult.value = undefined;
    return;
  }
  lookingUp.value = true;
  try {
    atResult.value = await api<StateSpan | null>(
      `${basePath()}/at?chapter=${chapter}`,
    );
    lastAtChapter.value = String(chapter);
  } catch (err) {
    atFieldError.value = apiErrorMessage(err);
  } finally {
    lookingUp.value = false;
  }
}

watch(
  () => props.characterId,
  () => {
    atResult.value = undefined;
    atFieldError.value = null;
    void reload();
  },
  { immediate: true },
);
</script>
