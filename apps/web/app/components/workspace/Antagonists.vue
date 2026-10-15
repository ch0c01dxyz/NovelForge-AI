<script setup lang="ts">
/**
 * Antagonist management (NF-WF-016, Invariant 1.8).
 *
 * Lists antagonists, creates them against a character chosen from the
 * novel's character roster (GET .../characters), and advances their
 * stage. Chapter numbers are 1-based (fromChapter required; toChapter
 * nullable).
 */
import { ref, onMounted } from "vue";
import { useLocale } from "../../composables/useLocale";
import { useApi, ApiError } from "../../composables/useApi";

const props = defineProps<{
  workspaceId: string;
  novelId: string;
}>();

const { t } = useLocale();
const { api } = useApi();

const ROLES = ["MAIN", "ARC", "TEMPORARY", "RIVAL", "IDEOLOGICAL", "POLITICAL", "PERSONAL", "COMPETITOR"] as const;
const STAGES = [
  "INTRODUCTION",
  "MOTIVATION",
  "FRICTION",
  "UNDERESTIMATION",
  "ESCALATION",
  "CONFRONTATION",
  "DEFEAT",
  "CONSEQUENCE",
  "RESOLUTION",
] as const;
const OUTCOMES = [
  "REGRET",
  "RESENTMENT",
  "RETREAT",
  "LOSS_OF_STATUS",
  "EXILE",
  "DEATH",
  "NEUTRALITY",
  "RESPECT",
  "REDEMPTION",
  "ALLIANCE",
  "SUBORDINATION",
  "FUTURE_REVENGE",
] as const;

interface Character {
  id: string;
  name: string;
  key: string;
}

interface Antagonist {
  id: string;
  characterId: string;
  characterName?: string | null;
  role: string;
  stage: string;
  outcome: string | null;
  purpose: string | null;
  fromChapter: number;
  toChapter: number | null;
}

const antagonists = ref<Antagonist[]>([]);
const characters = ref<Character[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);
const showForm = ref(false);

const form = ref({
  characterId: "",
  role: "MAIN",
  stage: "INTRODUCTION",
  outcome: "",
  purpose: "",
  fromChapter: "1",
  toChapter: "",
});
const formError = ref<string | null>(null);
const saving = ref(false);

const advancingId = ref<string | null>(null);
const advanceStage = ref("CONFRONTATION");
const advanceOutcome = ref("");
const advanceError = ref<string | null>(null);
const advancing = ref(false);

function errorKey(e: unknown): string {
  if (e instanceof ApiError && e.status === 403) return t("workspace.narrative.errors.forbidden");
  if (e instanceof ApiError && e.status === 404) return t("workspace.narrative.errors.notFound");
  return t("workspace.narrative.errors.unknown");
}

const base = () => `/workspaces/${props.workspaceId}/novels/${props.novelId}/narrative/antagonists`;

async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    const [list, chars] = await Promise.all([
      api<Antagonist[]>(base()),
      api<Character[]>(`/workspaces/${props.workspaceId}/novels/${props.novelId}/characters`),
    ]);
    antagonists.value = list;
    characters.value = chars;
  } catch (e) {
    loadError.value = errorKey(e);
  } finally {
    loading.value = false;
  }
}

function characterName(id: string): string {
  return characters.value.find((c) => c.id === id)?.name ?? id;
}

function positiveInt(raw: string): number | null {
  if (!/^\d+$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return n >= 1 && n <= 100000 ? n : null;
}

async function create() {
  formError.value = null;
  if (!form.value.characterId) {
    formError.value = t("workspace.narrative.antagonists.characterRequired");
    return;
  }
  const fromChapter = positiveInt(form.value.fromChapter);
  if (fromChapter === null) {
    formError.value = t("workspace.narrative.antagonists.fromChapterInvalid");
    return;
  }
  const toRaw = form.value.toChapter.trim();
  const toChapter = toRaw ? positiveInt(toRaw) : null;
  if (toRaw && toChapter === null) {
    formError.value = t("workspace.narrative.antagonists.toChapterInvalid");
    return;
  }
  if (toChapter !== null && toChapter < fromChapter) {
    formError.value = t("workspace.narrative.antagonists.rangeInvalid");
    return;
  }
  saving.value = true;
  try {
    const created = await api<Antagonist>(base(), {
      method: "POST",
      body: JSON.stringify({
        characterId: form.value.characterId,
        role: form.value.role,
        stage: form.value.stage,
        ...(form.value.outcome ? { outcome: form.value.outcome } : {}),
        ...(form.value.purpose.trim() ? { purpose: form.value.purpose.trim() } : {}),
        fromChapter,
        ...(toChapter !== null ? { toChapter } : {}),
      }),
    });
    antagonists.value = [...antagonists.value, created];
    form.value = {
      characterId: "",
      role: "MAIN",
      stage: "INTRODUCTION",
      outcome: "",
      purpose: "",
      fromChapter: "1",
      toChapter: "",
    };
    showForm.value = false;
  } catch (e) {
    formError.value = errorKey(e);
  } finally {
    saving.value = false;
  }
}

async function advance(id: string) {
  advanceError.value = null;
  advancing.value = true;
  try {
    const updated = await api<Antagonist>(`${base()}/${id}/stage`, {
      method: "POST",
      body: JSON.stringify({
        stage: advanceStage.value,
        ...(advanceOutcome.value ? { outcome: advanceOutcome.value } : {}),
      }),
    });
    antagonists.value = antagonists.value.map((a) => (a.id === id ? updated : a));
    advancingId.value = null;
    advanceOutcome.value = "";
  } catch (e) {
    advanceError.value = errorKey(e);
  } finally {
    advancing.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex items-center justify-between">
      <h3 class="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-nf-text-faint">
        {{ t("workspace.narrative.antagonists.title") }}
      </h3>
      <button
        class="rounded-md border border-nf-border-strong px-2.5 py-1 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
        :aria-expanded="showForm"
        @click="showForm = !showForm"
      >
        {{ t("workspace.narrative.antagonists.newAntagonist") }}
      </button>
    </div>

    <p v-if="loading" class="text-[12.5px] text-nf-text-faint">
      {{ t("workspace.narrative.common.loading") }}
    </p>
    <p
      v-else-if="loadError"
      role="alert"
      class="rounded-lg border border-nf-warn/40 bg-nf-warn/10 px-3 py-2 text-[12.5px] text-nf-warn"
    >
      {{ loadError }}
    </p>

    <template v-else>
      <form
        v-if="showForm"
        class="flex flex-col gap-2 rounded-lg border border-nf-border bg-nf-bg-2 p-3"
        @submit.prevent="create"
      >
        <div class="grid grid-cols-2 gap-2">
          <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
            {{ t("workspace.narrative.antagonists.characterLabel") }}
            <select
              v-model="form.characterId"
              required
              class="rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
            >
              <option value="" disabled>{{ t("workspace.narrative.antagonists.characterPlaceholder") }}</option>
              <option v-for="c in characters" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
          </label>
          <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
            {{ t("workspace.narrative.antagonists.roleLabel") }}
            <select
              v-model="form.role"
              class="rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
            >
              <option v-for="r in ROLES" :key="r" :value="r">
                {{ t(`workspace.narrative.antagonists.role.${r}`) }}
              </option>
            </select>
          </label>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
            {{ t("workspace.narrative.antagonists.stageLabel") }}
            <select
              v-model="form.stage"
              class="rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
            >
              <option v-for="s in STAGES" :key="s" :value="s">
                {{ t(`workspace.narrative.antagonists.stageName.${s}`) }}
              </option>
            </select>
          </label>
          <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
            {{ t("workspace.narrative.antagonists.outcomeLabel") }}
            <select
              v-model="form.outcome"
              class="rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
            >
              <option value="">{{ t("workspace.narrative.antagonists.outcomeNone") }}</option>
              <option v-for="o in OUTCOMES" :key="o" :value="o">
                {{ t(`workspace.narrative.antagonists.outcome.${o}`) }}
              </option>
            </select>
          </label>
        </div>
        <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
          {{ t("workspace.narrative.antagonists.purposeLabel") }}
          <textarea
            v-model="form.purpose"
            rows="3"
            maxlength="20000"
            class="rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
          />
        </label>
        <div class="grid grid-cols-2 gap-2">
          <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
            {{ t("workspace.narrative.antagonists.fromChapterLabel") }}
            <input
              v-model="form.fromChapter"
              type="text"
              inputmode="numeric"
              required
              class="rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
            />
          </label>
          <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
            {{ t("workspace.narrative.antagonists.toChapterLabel") }}
            <input
              v-model="form.toChapter"
              type="text"
              inputmode="numeric"
              class="rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
            />
          </label>
        </div>
        <p
          v-if="formError"
          role="alert"
          class="rounded-md border border-nf-warn/40 bg-nf-warn/10 px-2.5 py-1.5 text-[12.5px] text-nf-warn"
        >
          {{ formError }}
        </p>
        <div class="flex gap-2">
          <button
            type="submit"
            :disabled="saving"
            class="rounded-lg bg-nf-accent px-4 py-2 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus disabled:opacity-50"
          >
            {{ t("workspace.narrative.antagonists.create") }}
          </button>
          <button
            type="button"
            class="rounded-md border border-nf-border-strong px-2.5 py-1 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
            @click="showForm = false"
          >
            {{ t("common.cancel") }}
          </button>
        </div>
      </form>

      <p v-if="!antagonists.length" class="text-[12.5px] text-nf-text-faint">
        {{ t("workspace.narrative.antagonists.empty") }}
      </p>
      <ul class="flex flex-col gap-2">
        <li
          v-for="a in antagonists"
          :key="a.id"
          class="flex flex-col gap-2 rounded-lg border border-nf-border bg-nf-bg-2 px-3 py-2"
        >
          <div class="flex items-center gap-3">
            <div class="min-w-0 flex-1">
              <p class="text-[13px] font-medium text-nf-text">{{ a.characterName ?? characterName(a.characterId) }}</p>
              <p class="mt-0.5 font-mono text-[11px] text-nf-text-faint">
                {{ t(`workspace.narrative.antagonists.role.${a.role}`) }} ·
                {{ t(`workspace.narrative.antagonists.stageName.${a.stage}`) }}
                <span v-if="a.outcome"> · {{ t(`workspace.narrative.antagonists.outcome.${a.outcome}`) }}</span> ·
                {{ t("workspace.narrative.antagonists.chapterRange", { from: a.fromChapter, to: a.toChapter ?? "—" }) }}
              </p>
              <p v-if="a.purpose" class="mt-1 text-[12.5px] text-nf-text-dim">{{ a.purpose }}</p>
            </div>
            <button
              v-if="advancingId !== a.id"
              class="shrink-0 rounded-md border border-nf-border-strong px-2.5 py-1 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
              @click="advancingId = a.id; advanceStage = a.stage"
            >
              {{ t("workspace.narrative.antagonists.advance") }}
            </button>
          </div>
          <div v-if="advancingId === a.id" class="flex flex-wrap items-end gap-2 rounded-md border border-nf-border bg-nf-bg-0 p-2">
            <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
              {{ t("workspace.narrative.antagonists.stageLabel") }}
              <select
                v-model="advanceStage"
                class="rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
              >
                <option v-for="s in STAGES" :key="s" :value="s">
                  {{ t(`workspace.narrative.antagonists.stageName.${s}`) }}
                </option>
              </select>
            </label>
            <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
              {{ t("workspace.narrative.antagonists.outcomeLabel") }}
              <select
                v-model="advanceOutcome"
                class="rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
              >
                <option value="">{{ t("workspace.narrative.antagonists.outcomeNone") }}</option>
                <option v-for="o in OUTCOMES" :key="o" :value="o">
                  {{ t(`workspace.narrative.antagonists.outcome.${o}`) }}
                </option>
              </select>
            </label>
            <button
              class="rounded-lg bg-nf-accent px-3.5 py-1.5 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus disabled:opacity-50"
              :disabled="advancing"
              @click="advance(a.id)"
            >
              {{ t("workspace.narrative.antagonists.advanceSubmit") }}
            </button>
            <button
              class="rounded-md border border-nf-border-strong px-2.5 py-1 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
              @click="advancingId = null"
            >
              {{ t("common.cancel") }}
            </button>
          </div>
          <p
            v-if="advancingId === a.id && advanceError"
            role="alert"
            class="rounded-md border border-nf-warn/40 bg-nf-warn/10 px-2.5 py-1.5 text-[12.5px] text-nf-warn"
          >
            {{ advanceError }}
          </p>
        </li>
      </ul>
    </template>
  </div>
</template>
