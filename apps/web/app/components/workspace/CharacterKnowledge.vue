<template>
  <section
    :aria-label="t('workspace.characters.knowledge.title')"
    class="flex flex-col gap-4"
    data-testid="character-knowledge"
  >
    <h3
      class="border-b border-nf-border pb-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-nf-text-faint"
    >
      {{ t("workspace.characters.knowledge.title") }} — {{ characterName }}
    </h3>

    <p v-if="loading" class="text-[12.5px] text-nf-text-faint">
      {{ t("workspace.characters.knowledge.loading") }}
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
        v-if="!entries.length"
        class="text-[12.5px] text-nf-text-faint"
        data-testid="knowledge-empty"
      >
        {{ t("workspace.characters.knowledge.empty") }}
      </p>
      <ul v-else class="flex flex-col gap-2" data-testid="knowledge-list">
        <li
          v-for="k in entries"
          :key="k.id"
          class="rounded-lg border border-nf-border bg-nf-bg-2 px-3 py-2"
        >
          <p class="font-mono text-[11px] text-nf-text-faint">
            {{ t("workspace.characters.knowledge.factLabel") }}: {{ k.factId }}
          </p>
          <p class="mt-1 text-[12.5px] text-nf-text">
            {{ t(`workspace.characters.knowledge.stance.${k.stance}`) }}
            <span class="text-nf-text-faint">·</span>
            <span class="text-nf-text-dim">
              {{ t(`workspace.characters.knowledge.source.${k.source}`) }}
            </span>
          </p>
          <p class="mt-0.5 font-mono text-[12px] text-nf-text-dim">
            {{ spanLabel(k.fromChapter, k.toChapter) }}
          </p>
        </li>
      </ul>

      <form
        class="flex flex-col gap-2.5 rounded-lg border border-nf-border bg-nf-bg-1 p-3"
        data-testid="knowledge-create-form"
        @submit.prevent="create"
      >
        <div>
          <label
            :for="`${uid}-fact`"
            class="mb-1 block text-[12px] font-medium text-nf-text-dim"
          >
            {{ t("workspace.characters.knowledge.factIdLabel") }}
          </label>
          <input
            :id="`${uid}-fact`"
            v-model="factId"
            type="text"
            autocomplete="off"
            spellcheck="false"
            data-testid="knowledge-fact-input"
            class="w-full rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 font-mono text-[13px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
          />
          <p class="mt-0.5 text-[11.5px] text-nf-text-faint">
            {{ t("workspace.characters.knowledge.factIdHint") }}
          </p>
        </div>
        <div class="grid grid-cols-2 gap-2.5">
          <div>
            <label
              :for="`${uid}-stance`"
              class="mb-1 block text-[12px] font-medium text-nf-text-dim"
            >
              {{ t("workspace.characters.knowledge.stanceLabel") }}
            </label>
            <select
              :id="`${uid}-stance`"
              v-model="stance"
              data-testid="knowledge-stance-input"
              class="w-full rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
            >
              <option v-for="s in stances" :key="s" :value="s">
                {{ t(`workspace.characters.knowledge.stance.${s}`) }}
              </option>
            </select>
          </div>
          <div>
            <label
              :for="`${uid}-source`"
              class="mb-1 block text-[12px] font-medium text-nf-text-dim"
            >
              {{ t("workspace.characters.knowledge.sourceLabel") }}
            </label>
            <select
              :id="`${uid}-source`"
              v-model="source"
              data-testid="knowledge-source-input"
              class="w-full rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
            >
              <option v-for="s in sources" :key="s" :value="s">
                {{ t(`workspace.characters.knowledge.source.${s}`) }}
              </option>
            </select>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-2.5">
          <div>
            <label
              :for="`${uid}-from`"
              class="mb-1 block text-[12px] font-medium text-nf-text-dim"
            >
              {{ t("workspace.characters.knowledge.fromLabel") }}
            </label>
            <input
              :id="`${uid}-from`"
              v-model="fromChapter"
              type="number"
              min="1"
              max="100000"
              step="1"
              data-testid="knowledge-from-input"
              class="w-full rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] tabular-nums text-nf-text focus-visible:nf-focus"
            />
          </div>
          <div>
            <label
              :for="`${uid}-to`"
              class="mb-1 block text-[12px] font-medium text-nf-text-dim"
            >
              {{ t("workspace.characters.knowledge.toLabel") }}
            </label>
            <input
              :id="`${uid}-to`"
              v-model="toChapter"
              type="number"
              min="1"
              max="100000"
              step="1"
              data-testid="knowledge-to-input"
              class="w-full rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] tabular-nums text-nf-text focus-visible:nf-focus"
            />
          </div>
        </div>
        <p v-if="fieldError" role="alert" class="text-[12px] text-nf-warn">
          {{ fieldError }}
        </p>
        <p v-if="submitError" role="alert" class="text-[12.5px] text-nf-warn" data-testid="knowledge-submit-error">
          {{ submitError }}
        </p>
        <button
          type="submit"
          :disabled="creating"
          data-testid="knowledge-create-submit"
          class="self-start rounded-lg bg-nf-accent px-3.5 py-2 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus disabled:opacity-50"
        >
          {{
            creating
              ? t("workspace.characters.knowledge.adding")
              : t("workspace.characters.knowledge.add")
          }}
        </button>
      </form>

      <form
        class="flex flex-col gap-2.5 rounded-lg border border-nf-border bg-nf-bg-1 p-3"
        data-testid="knowledge-access-form"
        @submit.prevent="checkAccess"
      >
        <p class="text-[12px] font-semibold text-nf-text">
          {{ t("workspace.characters.knowledge.accessTitle") }}
        </p>
        <div>
          <label
            :for="`${uid}-afact`"
            class="mb-1 block text-[12px] font-medium text-nf-text-dim"
          >
            {{ t("workspace.characters.knowledge.accessFactIdLabel") }}
          </label>
          <input
            :id="`${uid}-afact`"
            v-model="accessFactId"
            type="text"
            autocomplete="off"
            spellcheck="false"
            data-testid="knowledge-access-fact-input"
            class="w-full rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 font-mono text-[13px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
          />
        </div>
        <div class="flex items-end gap-2.5">
          <div class="w-40">
            <label
              :for="`${uid}-achapter`"
              class="mb-1 block text-[12px] font-medium text-nf-text-dim"
            >
              {{ t("workspace.characters.knowledge.accessChapterLabel") }}
            </label>
            <input
              :id="`${uid}-achapter`"
              v-model="accessChapter"
              type="number"
              min="1"
              max="100000"
              step="1"
              data-testid="knowledge-access-chapter-input"
              class="w-full rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] tabular-nums text-nf-text focus-visible:nf-focus"
            />
          </div>
          <button
            type="submit"
            :disabled="checking"
            data-testid="knowledge-access-submit"
            class="rounded-md border border-nf-border-strong px-2.5 py-1.5 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus disabled:opacity-50"
          >
            {{ t("workspace.characters.knowledge.accessCheck") }}
          </button>
        </div>
        <p v-if="accessFieldError" role="alert" class="text-[12px] text-nf-warn">
          {{ accessFieldError }}
        </p>
        <div
          v-if="accessVerdict !== null"
          aria-live="polite"
          data-testid="knowledge-access-result"
          class="rounded-md border border-nf-border bg-nf-bg-2 px-3 py-2"
        >
          <p
            v-if="accessVerdict.accessible"
            class="text-[12.5px] text-nf-ok"
          >
            {{
              t("workspace.characters.knowledge.accessResult", {
                name: characterName,
                chapter: lastAccessChapter,
                stance: t(
                  `workspace.characters.knowledge.stance.${accessVerdict.stance}`,
                ),
              })
            }}
          </p>
          <p v-else class="text-[12.5px] text-nf-text-dim">
            {{
              t("workspace.characters.knowledge.accessDenied", {
                name: characterName,
                chapter: lastAccessChapter,
              })
            }}
          </p>
        </div>
      </form>
    </template>
  </section>
</template>

<script setup lang="ts">
/**
 * Character knowledge boundary (NF-WF-016, Invariant 1.1): the
 * fact-stance-source entries for one character, plus the read-only
 * voice-access check.
 *
 * The factId is a pasted canon-fact UUID — no fact picker exists in
 * this surface (per the task scope).
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

const uid = `knowledge-${Math.random().toString(36).slice(2, 8)}`;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const stances = ["KNOWN", "SUSPECTED", "BELIEVED_FALSE", "UNKNOWN"] as const;
const sources = [
  "REMEMBERED",
  "DERIVED",
  "LEARNED_IN_WORLD",
  "EXPERIMENTED",
  "TAUGHT",
  "RESEARCHED",
] as const;

type KnowledgeStance = (typeof stances)[number];
type KnowledgeSource = (typeof sources)[number];

interface KnowledgeEntry {
  id: string;
  characterId: string;
  factId: string;
  stance: KnowledgeStance;
  source: KnowledgeSource;
  fromChapter: number;
  toChapter: number | null;
}

interface AccessVerdict {
  accessible: boolean;
  stance: KnowledgeStance;
  source: KnowledgeSource | null;
}

const entries = ref<KnowledgeEntry[]>([]);
const loading = ref(false);
const loadError = ref<string | null>(null);

const factId = ref("");
const stance = ref<KnowledgeStance>("KNOWN");
const source = ref<KnowledgeSource>("REMEMBERED");
const fromChapter = ref("");
const toChapter = ref("");
const creating = ref(false);
const fieldError = ref<string | null>(null);
const submitError = ref<string | null>(null);

const accessFactId = ref("");
const accessChapter = ref("");
const checking = ref(false);
const accessFieldError = ref<string | null>(null);
const accessVerdict = ref<AccessVerdict | null>(null);
const lastAccessChapter = ref("");

function basePath() {
  return `/workspaces/${props.workspaceId}/novels/${props.novelId}/characters/${props.characterId}/knowledge`;
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
    entries.value = await api<KnowledgeEntry[]>(basePath());
  } catch (err) {
    loadError.value = apiErrorMessage(err);
  } finally {
    loading.value = false;
  }
}

async function create() {
  fieldError.value = null;
  submitError.value = null;
  const fid = factId.value.trim();
  if (!UUID_RE.test(fid)) {
    fieldError.value = t("workspace.characters.knowledge.factIdError");
    return;
  }
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
  creating.value = true;
  try {
    await api(basePath(), {
      method: "POST",
      body: JSON.stringify({
        factId: fid,
        stance: stance.value,
        source: source.value,
        fromChapter: from,
        toChapter: to,
      }),
    });
    factId.value = "";
    stance.value = "KNOWN";
    source.value = "REMEMBERED";
    fromChapter.value = "";
    toChapter.value = "";
    await reload();
  } catch (err) {
    submitError.value = apiErrorMessage(err);
  } finally {
    creating.value = false;
  }
}

async function checkAccess() {
  accessFieldError.value = null;
  accessVerdict.value = null;
  const fid = accessFactId.value.trim();
  if (!UUID_RE.test(fid)) {
    accessFieldError.value = t("workspace.characters.knowledge.factIdError");
    return;
  }
  const chapter = parseChapter(accessChapter.value);
  if (chapter === null) {
    accessFieldError.value = t("workspace.characters.states.chapterError");
    return;
  }
  checking.value = true;
  try {
    accessVerdict.value = await api<AccessVerdict>(
      `${basePath()}/access?factId=${encodeURIComponent(fid)}&chapter=${chapter}`,
    );
    lastAccessChapter.value = String(chapter);
  } catch (err) {
    accessFieldError.value = apiErrorMessage(err);
  } finally {
    checking.value = false;
  }
}

watch(
  () => props.characterId,
  () => {
    accessVerdict.value = null;
    void reload();
  },
  { immediate: true },
);
</script>
