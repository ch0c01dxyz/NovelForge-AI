<template>
  <section
    :aria-label="t('workspace.characters.arcs.title')"
    class="flex flex-col gap-4"
    data-testid="character-arcs"
  >
    <h3
      class="border-b border-nf-border pb-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-nf-text-faint"
    >
      {{ t("workspace.characters.arcs.title") }} — {{ characterName }}
    </h3>

    <p v-if="loading" class="text-[12.5px] text-nf-text-faint">
      {{ t("workspace.characters.arcs.loading") }}
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
        v-if="!arcs.length"
        class="text-[12.5px] text-nf-text-faint"
        data-testid="arcs-empty"
      >
        {{ t("workspace.characters.arcs.empty") }}
      </p>
      <ul v-else class="flex flex-col gap-2" data-testid="arcs-list">
        <li
          v-for="arc in arcs"
          :key="arc.id"
          class="rounded-lg border border-nf-border bg-nf-bg-2 px-3 py-2"
        >
          <div class="flex items-center justify-between gap-2">
            <p class="min-w-0 flex-1 truncate text-[13px] font-medium text-nf-text">
              {{ arc.title }}
            </p>
            <span
              class="shrink-0 rounded-md border border-nf-border-strong px-1.5 py-0.5 text-[11px] text-nf-text-dim"
            >
              {{ t(`workspace.characters.arcs.status.${arc.status}`) }}
            </span>
          </div>

          <button
            type="button"
            :aria-expanded="expandedArcId === arc.id"
            :aria-label="t('workspace.characters.arcs.toggleMilestones', { title: arc.title })"
            :data-testid="`arc-toggle-${arc.id}`"
            class="mt-1.5 text-[12px] text-nf-text-dim underline underline-offset-2 hover:text-nf-text focus-visible:nf-focus"
            @click="expandedArcId = expandedArcId === arc.id ? null : arc.id"
          >
            {{ t("workspace.characters.arcs.milestonesTitle") }}
          </button>

          <div v-if="expandedArcId === arc.id" class="mt-2 flex flex-col gap-2.5">
            <form
              class="flex flex-col gap-2 rounded-md border border-nf-border bg-nf-bg-1 p-2.5"
              :data-testid="`milestone-form-${arc.id}`"
              @submit.prevent="addMilestone(arc)"
            >
              <div class="grid grid-cols-[110px_1fr] gap-2.5">
                <div>
                  <label
                    :for="`${uid}-${arc.id}-chapter`"
                    class="mb-1 block text-[12px] font-medium text-nf-text-dim"
                  >
                    {{ t("workspace.characters.arcs.milestoneChapterLabel") }}
                  </label>
                  <input
                    :id="`${uid}-${arc.id}-chapter`"
                    v-model="milestoneDrafts[arc.id]!.chapter"
                    type="number"
                    min="1"
                    max="100000"
                    step="1"
                    class="w-full rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] tabular-nums text-nf-text focus-visible:nf-focus"
                  />
                </div>
                <div>
                  <label
                    :for="`${uid}-${arc.id}-summary`"
                    class="mb-1 block text-[12px] font-medium text-nf-text-dim"
                  >
                    {{ t("workspace.characters.arcs.milestoneSummaryLabel") }}
                  </label>
                  <input
                    :id="`${uid}-${arc.id}-summary`"
                    v-model="milestoneDrafts[arc.id]!.summary"
                    type="text"
                    maxlength="20000"
                    class="w-full rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
                  />
                </div>
              </div>
              <p
                v-if="milestoneErrors[arc.id]"
                role="alert"
                class="text-[12px] text-nf-warn"
              >
                {{ milestoneErrors[arc.id] }}
              </p>
              <button
                type="submit"
                :disabled="addingMilestoneId === arc.id"
                :data-testid="`milestone-submit-${arc.id}`"
                class="self-start rounded-md border border-nf-border-strong px-2.5 py-1.5 text-[13px] text-nf-text-dim hover:bg-nf-bg-3 hover:text-nf-text focus-visible:nf-focus disabled:opacity-50"
              >
                {{
                  addingMilestoneId === arc.id
                    ? t("workspace.characters.arcs.addingMilestone")
                    : t("workspace.characters.arcs.addMilestone")
                }}
              </button>
            </form>

            <form
              class="flex flex-col gap-2 rounded-md border border-nf-border bg-nf-bg-1 p-2.5"
              :data-testid="`progress-form-${arc.id}`"
              @submit.prevent="checkProgress(arc)"
            >
              <p class="text-[12px] font-semibold text-nf-text">
                {{ t("workspace.characters.arcs.progressTitle") }}
              </p>
              <div class="flex items-end gap-2.5">
                <div class="w-36">
                  <label
                    :for="`${uid}-${arc.id}-progress`"
                    class="mb-1 block text-[12px] font-medium text-nf-text-dim"
                  >
                    {{ t("workspace.characters.arcs.progressChapterLabel") }}
                  </label>
                  <input
                    :id="`${uid}-${arc.id}-progress`"
                    v-model="progressDrafts[arc.id]!.chapter"
                    type="number"
                    min="1"
                    max="100000"
                    step="1"
                    class="w-full rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] tabular-nums text-nf-text focus-visible:nf-focus"
                  />
                </div>
                <button
                  type="submit"
                  :disabled="checkingProgressId === arc.id"
                  :data-testid="`progress-submit-${arc.id}`"
                  class="rounded-md border border-nf-border-strong px-2.5 py-1.5 text-[13px] text-nf-text-dim hover:bg-nf-bg-3 hover:text-nf-text focus-visible:nf-focus disabled:opacity-50"
                >
                  {{ t("workspace.characters.arcs.progressCheck") }}
                </button>
              </div>
              <div
                v-if="progressResults[arc.id] !== undefined"
                aria-live="polite"
                :data-testid="`progress-result-${arc.id}`"
                class="rounded-md border border-nf-border bg-nf-bg-2 px-2.5 py-2"
              >
                <template v-if="progressResults[arc.id]">
                  <p class="text-[12.5px] font-medium text-nf-text">
                    {{
                      t("workspace.characters.arcs.progressResult", {
                        reached: progressResults[arc.id]!.reached.length,
                        total: progressResults[arc.id]!.total,
                      })
                    }}
                  </p>
                  <ul class="mt-1.5 flex flex-col gap-1">
                    <li
                      v-for="m in progressResults[arc.id]!.reached"
                      :key="m.id"
                      class="text-[12px] leading-relaxed text-nf-text-dim"
                    >
                      <span class="font-mono tabular-nums">ch. {{ m.chapter }}</span>
                      <span class="text-nf-text-faint"> — </span>{{ m.summary }}
                    </li>
                  </ul>
                </template>
                <p v-else class="text-[12.5px] text-nf-text-faint">
                  {{
                    t("workspace.characters.arcs.progressNone", {
                      chapter: lastProgressChapter[arc.id] ?? "",
                    })
                  }}
                </p>
              </div>
            </form>
          </div>
        </li>
      </ul>

      <form
        class="flex flex-col gap-2.5 rounded-lg border border-nf-border bg-nf-bg-1 p-3"
        data-testid="arc-create-form"
        @submit.prevent="create"
      >
        <div>
          <label
            :for="`${uid}-title`"
            class="mb-1 block text-[12px] font-medium text-nf-text-dim"
          >
            {{ t("workspace.characters.arcs.titleLabel") }}
          </label>
          <input
            :id="`${uid}-title`"
            v-model="title"
            type="text"
            maxlength="300"
            data-testid="arc-title-input"
            class="w-full rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
          />
        </div>
        <div>
          <label
            :for="`${uid}-status`"
            class="mb-1 block text-[12px] font-medium text-nf-text-dim"
          >
            {{ t("workspace.characters.arcs.statusLabel") }}
          </label>
          <select
            :id="`${uid}-status`"
            v-model="status"
            data-testid="arc-status-input"
            class="w-full rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
          >
            <option
              v-for="s in arcStatuses"
              :key="s"
              :value="s"
            >
              {{ t(`workspace.characters.arcs.status.${s}`) }}
            </option>
          </select>
        </div>
        <p v-if="fieldError" role="alert" class="text-[12px] text-nf-warn">
          {{ fieldError }}
        </p>
        <p v-if="submitError" role="alert" class="text-[12.5px] text-nf-warn" data-testid="arc-submit-error">
          {{ submitError }}
        </p>
        <button
          type="submit"
          :disabled="creating"
          data-testid="arc-create-submit"
          class="self-start rounded-lg bg-nf-accent px-3.5 py-2 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus disabled:opacity-50"
        >
          {{
            creating
              ? t("workspace.characters.arcs.adding")
              : t("workspace.characters.arcs.add")
          }}
        </button>
      </form>
    </template>
  </section>
</template>

<script setup lang="ts">
/**
 * Character arcs (NF-WF-016, Invariant 1.1): list, create, add milestones,
 * and the read-only progress-at-chapter readout.
 *
 * There is no list-milestones route — milestones surface through the
 * spoiler-aware `progress?chapter=N` readout, which never leaks beats
 * past the queried chapter. The UI does not invent a list the API
 * cannot serve.
 */
import { reactive, ref, watch } from "vue";
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

const uid = `arcs-${Math.random().toString(36).slice(2, 8)}`;

const arcStatuses = ["ACTIVE", "RESOLVED", "ABANDONED"] as const;
type ArcStatus = (typeof arcStatuses)[number];

interface CharacterArc {
  id: string;
  characterId: string;
  status: ArcStatus;
  title: string;
}

interface Milestone {
  id: string;
  arcId: string;
  chapter: number;
  summary: string;
}

interface ArcProgress {
  reached: Milestone[];
  total: number;
  latest: Milestone | null;
}

const arcs = ref<CharacterArc[]>([]);
const loading = ref(false);
const loadError = ref<string | null>(null);

const title = ref("");
const status = ref<ArcStatus>("ACTIVE");
const creating = ref(false);
const fieldError = ref<string | null>(null);
const submitError = ref<string | null>(null);

const expandedArcId = ref<string | null>(null);
const milestoneDrafts = reactive<Record<string, { chapter: string; summary: string }>>({});
const milestoneErrors = reactive<Record<string, string | null>>({});
const addingMilestoneId = ref<string | null>(null);
const progressDrafts = reactive<Record<string, { chapter: string }>>({});
const progressResults = reactive<Record<string, ArcProgress | null | undefined>>({});
const lastProgressChapter = reactive<Record<string, string>>({});
const checkingProgressId = ref<string | null>(null);

function basePath() {
  return `/workspaces/${props.workspaceId}/novels/${props.novelId}`;
}
function charPath() {
  return `${basePath()}/characters/${props.characterId}/arcs`;
}
function arcPath(arcId: string) {
  return `${basePath()}/arcs/${arcId}`;
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

function ensureDrafts(arc: CharacterArc) {
  milestoneDrafts[arc.id] ??= { chapter: "", summary: "" };
  progressDrafts[arc.id] ??= { chapter: "" };
}

async function reload() {
  loading.value = true;
  loadError.value = null;
  try {
    arcs.value = await api<CharacterArc[]>(charPath());
    for (const arc of arcs.value) ensureDrafts(arc);
  } catch (err) {
    loadError.value = apiErrorMessage(err);
  } finally {
    loading.value = false;
  }
}

async function create() {
  fieldError.value = null;
  submitError.value = null;
  const tTitle = title.value.trim();
  if (!tTitle || tTitle.length > 300) {
    fieldError.value = t("workspace.characters.arcs.titleError");
    return;
  }
  creating.value = true;
  try {
    const created = await api<CharacterArc>(charPath(), {
      method: "POST",
      body: JSON.stringify({ title: tTitle, status: status.value }),
    });
    title.value = "";
    status.value = "ACTIVE";
    arcs.value = [...arcs.value, created];
    ensureDrafts(created);
  } catch (err) {
    submitError.value = apiErrorMessage(err);
  } finally {
    creating.value = false;
  }
}

async function addMilestone(arc: CharacterArc) {
  const draft = milestoneDrafts[arc.id]!;
  milestoneErrors[arc.id] = null;
  const chapter = parseChapter(draft.chapter);
  if (chapter === null) {
    milestoneErrors[arc.id] = t("workspace.characters.states.chapterError");
    return;
  }
  const s = draft.summary.trim();
  if (!s || s.length > 20000) {
    milestoneErrors[arc.id] = t("workspace.characters.arcs.milestoneSummaryError");
    return;
  }
  addingMilestoneId.value = arc.id;
  try {
    await api(`${arcPath(arc.id)}/milestones`, {
      method: "POST",
      body: JSON.stringify({ chapter, summary: s }),
    });
    draft.chapter = "";
    draft.summary = "";
    progressResults[arc.id] = undefined;
  } catch (err) {
    milestoneErrors[arc.id] = apiErrorMessage(err);
  } finally {
    addingMilestoneId.value = null;
  }
}

async function checkProgress(arc: CharacterArc) {
  const draft = progressDrafts[arc.id]!;
  milestoneErrors[arc.id] = null;
  const chapter = parseChapter(draft.chapter);
  if (chapter === null) {
    milestoneErrors[arc.id] = t("workspace.characters.states.chapterError");
    progressResults[arc.id] = undefined;
    return;
  }
  checkingProgressId.value = arc.id;
  try {
    const progress = await api<ArcProgress>(`${arcPath(arc.id)}/progress?chapter=${chapter}`);
    progressResults[arc.id] = progress.reached.length ? progress : null;
    lastProgressChapter[arc.id] = String(chapter);
  } catch (err) {
    progressResults[arc.id] = undefined;
    milestoneErrors[arc.id] = apiErrorMessage(err);
  } finally {
    checkingProgressId.value = null;
  }
}

watch(
  () => props.characterId,
  () => {
    expandedArcId.value = null;
    void reload();
  },
  { immediate: true },
);
</script>
