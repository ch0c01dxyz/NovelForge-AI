<template>
  <section
    :aria-label="t('workspace.relationships.stances.title')"
    class="flex flex-col gap-4"
    data-testid="relationship-stances"
  >
    <h3
      class="border-b border-nf-border pb-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-nf-text-faint"
    >
      {{ t("workspace.relationships.stances.title") }}
    </h3>

    <form
      class="flex flex-wrap items-end gap-2.5 rounded-lg border border-nf-border bg-nf-bg-1 p-3"
      data-testid="stances-filter-form"
      @submit.prevent="reload"
    >
      <p class="w-full text-[12px] font-semibold text-nf-text">
        {{ t("workspace.relationships.stances.filterTitle") }}
      </p>
      <div>
        <label
          :for="`${uid}-ffrom`"
          class="mb-1 block text-[12px] font-medium text-nf-text-dim"
        >
          {{ t("workspace.relationships.stances.filterFromLabel") }}
        </label>
        <select
          :id="`${uid}-ffrom`"
          v-model="filterFrom"
          data-testid="stances-filter-from"
          class="rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
        >
          <option :value="''">{{ t("workspace.relationships.stances.filterAll") }}</option>
          <option v-for="c in characters" :key="c.id" :value="c.id">
            {{ c.name }}
          </option>
        </select>
      </div>
      <div>
        <label
          :for="`${uid}-fto`"
          class="mb-1 block text-[12px] font-medium text-nf-text-dim"
        >
          {{ t("workspace.relationships.stances.filterToLabel") }}
        </label>
        <select
          :id="`${uid}-fto`"
          v-model="filterTo"
          data-testid="stances-filter-to"
          class="rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
        >
          <option :value="''">{{ t("workspace.relationships.stances.filterAll") }}</option>
          <option v-for="c in characters" :key="c.id" :value="c.id">
            {{ c.name }}
          </option>
        </select>
      </div>
      <button
        type="submit"
        :disabled="loading"
        class="rounded-md border border-nf-border-strong px-2.5 py-1.5 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus disabled:opacity-50"
      >
        {{ t("workspace.relationships.stances.filterApply") }}
      </button>
      <button
        type="button"
        class="rounded-md border border-nf-border-strong px-2.5 py-1.5 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
        @click="clearFilters"
      >
        {{ t("workspace.relationships.stances.filterClear") }}
      </button>
    </form>

    <p v-if="loading" class="text-[12.5px] text-nf-text-faint">
      {{ t("workspace.relationships.stances.loading") }}
    </p>
    <div v-else-if="loadError" class="flex flex-col gap-2">
      <p role="alert" class="text-[12.5px] text-nf-warn">{{ loadError }}</p>
      <button
        type="button"
        class="self-start rounded-md border border-nf-border-strong px-2.5 py-1.5 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
        @click="reload"
      >
        {{ t("workspace.relationships.common.retry") }}
      </button>
    </div>

    <template v-else>
      <p
        v-if="!stances.length"
        class="text-[12.5px] text-nf-text-faint"
        data-testid="stances-empty"
      >
        {{ t("workspace.relationships.stances.empty") }}
      </p>
      <ul v-else class="flex flex-col gap-2" data-testid="stances-list">
        <li
          v-for="s in stances"
          :key="s.id"
          class="rounded-lg border border-nf-border bg-nf-bg-2 px-3 py-2"
        >
          <p class="text-[13px] font-medium text-nf-text">
            {{ t("workspace.relationships.stances.pairLabel", { from: nameOf(s.fromCharacterId), to: nameOf(s.toCharacterId) }) }}
            <span class="text-nf-text-faint">·</span>
            <span class="text-nf-warn">
              {{ t(`workspace.relationships.stances.stance.${s.stance}`) }}
            </span>
          </p>
          <p class="mt-0.5 font-mono text-[12px] text-nf-text-dim">
            {{ spanLabel(s.fromChapter, s.toChapter) }}
          </p>
        </li>
      </ul>

      <form
        class="flex flex-col gap-2.5 rounded-lg border border-nf-border bg-nf-bg-1 p-3"
        data-testid="stance-create-form"
        @submit.prevent="create"
      >
        <div class="grid grid-cols-2 gap-2.5">
          <div>
            <label
              :for="`${uid}-from`"
              class="mb-1 block text-[12px] font-medium text-nf-text-dim"
            >
              {{ t("workspace.relationships.stances.fromLabel") }}
            </label>
            <select
              :id="`${uid}-from`"
              v-model="fromId"
              data-testid="stance-from-input"
              class="w-full rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
            >
              <option
                v-for="c in characters"
                :key="c.id"
                :value="c.id"
              >
                {{ c.name }}
              </option>
            </select>
          </div>
          <div>
            <label
              :for="`${uid}-to`"
              class="mb-1 block text-[12px] font-medium text-nf-text-dim"
            >
              {{ t("workspace.relationships.stances.toLabel") }}
            </label>
            <select
              :id="`${uid}-to`"
              v-model="toId"
              data-testid="stance-to-input"
              class="w-full rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
            >
              <option
                v-for="c in characters"
                :key="c.id"
                :value="c.id"
              >
                {{ c.name }}
              </option>
            </select>
          </div>
        </div>
        <div class="grid grid-cols-3 gap-2.5">
          <div>
            <label
              :for="`${uid}-stance`"
              class="mb-1 block text-[12px] font-medium text-nf-text-dim"
            >
              {{ t("workspace.relationships.stances.stanceLabel") }}
            </label>
            <select
              :id="`${uid}-stance`"
              v-model="stance"
              data-testid="stance-stance-input"
              class="w-full rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
            >
              <option v-for="s in stanceOptions" :key="s" :value="s">
                {{ t(`workspace.relationships.stances.stance.${s}`) }}
              </option>
            </select>
          </div>
          <div>
            <label
              :for="`${uid}-fromch`"
              class="mb-1 block text-[12px] font-medium text-nf-text-dim"
            >
              {{ t("workspace.relationships.stances.fromChapterLabel") }}
            </label>
            <input
              :id="`${uid}-fromch`"
              v-model="fromChapter"
              type="number"
              min="1"
              max="100000"
              step="1"
              data-testid="stance-fromchapter-input"
              class="w-full rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] tabular-nums text-nf-text focus-visible:nf-focus"
            />
          </div>
          <div>
            <label
              :for="`${uid}-toch`"
              class="mb-1 block text-[12px] font-medium text-nf-text-dim"
            >
              {{ t("workspace.relationships.stances.toChapterLabel") }}
            </label>
            <input
              :id="`${uid}-toch`"
              v-model="toChapter"
              type="number"
              min="1"
              max="100000"
              step="1"
              data-testid="stance-tochapter-input"
              class="w-full rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] tabular-nums text-nf-text focus-visible:nf-focus"
            />
          </div>
        </div>
        <p v-if="fieldError" role="alert" class="text-[12px] text-nf-warn">
          {{ fieldError }}
        </p>
        <p v-if="submitError" role="alert" class="text-[12.5px] text-nf-warn" data-testid="stance-submit-error">
          {{ submitError }}
        </p>
        <button
          type="submit"
          :disabled="creating"
          data-testid="stance-create-submit"
          class="self-start rounded-lg bg-nf-accent px-3.5 py-2 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus disabled:opacity-50"
        >
          {{
            creating
              ? t("workspace.relationships.stances.adding")
              : t("workspace.relationships.stances.add")
          }}
        </button>
      </form>

      <form
        class="flex flex-col gap-2.5 rounded-lg border border-nf-border bg-nf-bg-1 p-3"
        data-testid="stance-at-form"
        @submit.prevent="lookupAt"
      >
        <p class="text-[12px] font-semibold text-nf-text">
          {{ t("workspace.relationships.stances.atTitle") }}
        </p>
        <div class="grid grid-cols-3 gap-2.5">
          <div>
            <label
              :for="`${uid}-afrom`"
              class="mb-1 block text-[12px] font-medium text-nf-text-dim"
            >
              {{ t("workspace.relationships.stances.atFromLabel") }}
            </label>
            <select
              :id="`${uid}-afrom`"
              v-model="atFrom"
              data-testid="stance-at-from-input"
              class="w-full rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
            >
              <option
                v-for="c in characters"
                :key="c.id"
                :value="c.id"
              >
                {{ c.name }}
              </option>
            </select>
          </div>
          <div>
            <label
              :for="`${uid}-ato`"
              class="mb-1 block text-[12px] font-medium text-nf-text-dim"
            >
              {{ t("workspace.relationships.stances.atToLabel") }}
            </label>
            <select
              :id="`${uid}-ato`"
              v-model="atTo"
              data-testid="stance-at-to-input"
              class="w-full rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
            >
              <option
                v-for="c in characters"
                :key="c.id"
                :value="c.id"
              >
                {{ c.name }}
              </option>
            </select>
          </div>
          <div>
            <label
              :for="`${uid}-achapter`"
              class="mb-1 block text-[12px] font-medium text-nf-text-dim"
            >
              {{ t("workspace.relationships.stances.atChapterLabel") }}
            </label>
            <input
              :id="`${uid}-achapter`"
              v-model="atChapter"
              type="number"
              min="1"
              max="100000"
              step="1"
              data-testid="stance-at-chapter-input"
              class="w-full rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] tabular-nums text-nf-text focus-visible:nf-focus"
            />
          </div>
        </div>
        <p v-if="atFieldError" role="alert" class="text-[12px] text-nf-warn">
          {{ atFieldError }}
        </p>
        <button
          type="submit"
          :disabled="lookingUp"
          data-testid="stance-at-submit"
          class="self-start rounded-md border border-nf-border-strong px-2.5 py-1.5 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus disabled:opacity-50"
        >
          {{ t("workspace.relationships.stances.atCheck") }}
        </button>
        <div
          v-if="atResult !== undefined"
          aria-live="polite"
          data-testid="stance-at-result"
          class="rounded-md border border-nf-border bg-nf-bg-2 px-3 py-2"
        >
          <p v-if="atResult" class="text-[12.5px] text-nf-text">
            {{
              t("workspace.relationships.stances.atResult", {
                from: nameOf(atResult.fromCharacterId),
                to: nameOf(atResult.toCharacterId),
                stance: t(`workspace.relationships.stances.stance.${atResult.stance}`),
                chapter: lastAtChapter,
              })
            }}
          </p>
          <p v-else class="text-[12.5px] text-nf-text-faint">
            {{ t("workspace.relationships.stances.atNone", { chapter: lastAtChapter }) }}
          </p>
        </div>
      </form>
    </template>
  </section>
</template>

<script setup lang="ts">
/**
 * Directional stance spans (NF-WF-016, Invariant 1.2): list with
 * optional from/to filters, create, and the read-only as-of lookup.
 *
 * Stances are directional (A→B is not B→A); the UI never conflates the
 * two directions. Character names resolve from the roster prop.
 */
import { onMounted, ref } from "vue";
import { useApi, ApiError } from "../../composables/useApi";
import { useLocale } from "../../composables/useLocale";
import type { RelationshipCharacter } from "./RelationshipPanel.vue";

const props = defineProps<{
  workspaceId: string;
  novelId: string;
  characters: RelationshipCharacter[];
}>();

const { t } = useLocale();
const { api } = useApi();

const uid = `stances-${Math.random().toString(36).slice(2, 8)}`;

const stanceOptions = [
  "ALLY",
  "FRIENDLY",
  "NEUTRAL",
  "WARY",
  "HOSTILE",
  "ENEMY",
] as const;
type StanceKind = (typeof stanceOptions)[number];

interface StanceRow {
  id: string;
  fromCharacterId: string;
  toCharacterId: string;
  stance: StanceKind;
  fromChapter: number;
  toChapter: number | null;
}

const stances = ref<StanceRow[]>([]);
const loading = ref(false);
const loadError = ref<string | null>(null);

const filterFrom = ref("");
const filterTo = ref("");

const fromId = ref("");
const toId = ref("");
const stance = ref<StanceKind>("NEUTRAL");
const fromChapter = ref("");
const toChapter = ref("");
const creating = ref(false);
const fieldError = ref<string | null>(null);
const submitError = ref<string | null>(null);

const atFrom = ref("");
const atTo = ref("");
const atChapter = ref("");
const lookingUp = ref(false);
const atFieldError = ref<string | null>(null);
const atResult = ref<StanceRow | null | undefined>(undefined);
const lastAtChapter = ref("");

function basePath() {
  return `/workspaces/${props.workspaceId}/novels/${props.novelId}/relationships/stances`;
}

function nameOf(id: string): string {
  return props.characters.find((c) => c.id === id)?.name ?? id;
}

function apiErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return t("workspace.relationships.error.unauthorized");
    if (err.status === 403) return t("workspace.relationships.error.forbidden");
    if (err.status === 404) return t("workspace.relationships.error.notFound");
    if (err.status === 400) return t("workspace.relationships.error.invalid");
    return t("workspace.relationships.error.generic", { code: err.code });
  }
  return t("workspace.relationships.error.generic", { code: "UNKNOWN" });
}

function spanLabel(from: number, to: number | null): string {
  return to === null
    ? t("workspace.relationships.common.chapterOpen", { from })
    : t("workspace.relationships.common.chapterRange", { from, to });
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
    const params = new URLSearchParams();
    if (filterFrom.value) params.set("fromCharacterId", filterFrom.value);
    if (filterTo.value) params.set("toCharacterId", filterTo.value);
    const query = params.toString() ? `?${params.toString()}` : "";
    stances.value = await api<StanceRow[]>(`${basePath()}${query}`);
  } catch (err) {
    loadError.value = apiErrorMessage(err);
  } finally {
    loading.value = false;
  }
}

function clearFilters() {
  filterFrom.value = "";
  filterTo.value = "";
  void reload();
}

async function create() {
  fieldError.value = null;
  submitError.value = null;
  if (!fromId.value || !toId.value) {
    fieldError.value = t("workspace.relationships.stances.pairRequired");
    return;
  }
  if (fromId.value === toId.value) {
    fieldError.value = t("workspace.relationships.stances.sameCharacterError");
    return;
  }
  const from = parseChapter(fromChapter.value);
  const to = isBlankChapter(toChapter.value) ? null : parseChapter(toChapter.value);
  if (from === null || (!isBlankChapter(toChapter.value) && to === null)) {
    fieldError.value = t("workspace.relationships.stances.chapterError");
    return;
  }
  if (to !== null && to < (from as number)) {
    fieldError.value = t("workspace.relationships.stances.rangeError");
    return;
  }
  creating.value = true;
  try {
    await api(basePath(), {
      method: "POST",
      body: JSON.stringify({
        fromCharacterId: fromId.value,
        toCharacterId: toId.value,
        stance: stance.value,
        fromChapter: from,
        toChapter: to,
      }),
    });
    fromChapter.value = "";
    toChapter.value = "";
    await reload();
  } catch (err) {
    submitError.value = apiErrorMessage(err);
  } finally {
    creating.value = false;
  }
}

async function lookupAt() {
  atFieldError.value = null;
  atResult.value = undefined;
  if (!atFrom.value || !atTo.value) {
    atFieldError.value = t("workspace.relationships.stances.pairRequired");
    return;
  }
  const chapter = parseChapter(atChapter.value);
  if (chapter === null) {
    atFieldError.value = t("workspace.relationships.stances.chapterError");
    return;
  }
  lookingUp.value = true;
  try {
    const params = new URLSearchParams({
      fromCharacterId: atFrom.value,
      toCharacterId: atTo.value,
      chapter: String(chapter),
    });
    atResult.value = await api<StanceRow | null>(`${basePath()}/at?${params.toString()}`);
    lastAtChapter.value = String(chapter);
  } catch (err) {
    atFieldError.value = apiErrorMessage(err);
  } finally {
    lookingUp.value = false;
  }
}

onMounted(() => {
  fromId.value = props.characters[0]?.id ?? "";
  toId.value = props.characters[1]?.id ?? props.characters[0]?.id ?? "";
  atFrom.value = fromId.value;
  atTo.value = toId.value;
  void reload();
});
</script>
