<script setup lang="ts">
/**
 * Narrative workspace panel (NF-WF-016, Invariant 1.8).
 *
 * Tab shell: DNA | Policies | Antagonists | Readouts. The Readouts tab
 * hosts the read-only assessment tools — drama-window, cooldown, and
 * patterns — as small forms whose results are displayed but never
 * persisted. There is NO assessment form for SCALE (GAP-039): the SCALE
 * policy payload is shown display-only inside the Policies tab.
 */
import { ref } from "vue";
import { useLocale } from "../../composables/useLocale";
import { useApi, ApiError } from "../../composables/useApi";
import DnaEditor from "./DnaEditor.vue";
import PolicyList from "./PolicyList.vue";
import Antagonists from "./Antagonists.vue";
import ScaleReviewPanel from "./ScaleReviewPanel.vue";

const props = defineProps<{
  workspaceId: string;
  novelId: string;
  /** Selected chapter ID from the workspace, or null. */
  chapterId?: string | null;
  /** Saved version UUID, or null when unsaved/none. */
  chapterVersionId?: string | null;
}>();

const { t } = useLocale();
const { api } = useApi();

type Tab = "dna" | "policies" | "antagonists" | "scale" | "readouts";
const tabs: Tab[] = ["dna", "policies", "antagonists", "scale", "readouts"];
const active = ref<Tab>("dna");
const tabRefs = ref<Array<HTMLButtonElement | null>>([]);

function select(i: number) {
  active.value = tabs[i]!;
  tabRefs.value[i]?.focus();
}

function onTabKeydown(e: KeyboardEvent) {
  const i = tabs.indexOf(active.value);
  if (e.key === "ArrowRight") {
    e.preventDefault();
    select((i + 1) % tabs.length);
  } else if (e.key === "ArrowLeft") {
    e.preventDefault();
    select((i - 1 + tabs.length) % tabs.length);
  } else if (e.key === "Home") {
    e.preventDefault();
    select(0);
  } else if (e.key === "End") {
    e.preventDefault();
    select(tabs.length - 1);
  }
}

function tabLabel(tabId: Tab): string {
  if (tabId === "scale") return t("workspace.scaleReview.title");
  return t(
    `workspace.narrative.panel.tab${tabId === "dna" ? "Dna" : tabId === "policies" ? "Policies" : tabId === "antagonists" ? "Antagonists" : "Readouts"}`,
  );
}

const base = () =>
  `/workspaces/${props.workspaceId}/novels/${props.novelId}/narrative`;

function errorKey(e: unknown): string {
  if (e instanceof ApiError && e.status === 403) return t("workspace.narrative.errors.forbidden");
  if (e instanceof ApiError && e.status === 404) return t("workspace.narrative.errors.notFound");
  return t("workspace.narrative.errors.unknown");
}

// --- Drama window ---
const dramaChapters = ref("");
const dramaResult = ref<string | null>(null);
const dramaError = ref<string | null>(null);
const dramaRunning = ref(false);

async function runDramaWindow() {
  dramaError.value = null;
  dramaResult.value = null;
  if (!/^\d+$/.test(dramaChapters.value.trim()) || Number(dramaChapters.value.trim()) > 100000) {
    dramaError.value = t("workspace.narrative.readouts.drama.chaptersInvalid");
    return;
  }
  dramaRunning.value = true;
  try {
    const result = await api<unknown>(`${base()}/drama-window`, {
      method: "POST",
      body: JSON.stringify({ chaptersSinceDrama: Number(dramaChapters.value.trim()) }),
    });
    dramaResult.value = JSON.stringify(result, null, 2);
  } catch (e) {
    dramaError.value = errorKey(e);
  } finally {
    dramaRunning.value = false;
  }
}

// --- Cooldown ---
const BEAT_TYPES = [
  "SOCIAL",
  "PERSONAL",
  "ROMANCE",
  "POLITICAL",
  "ECONOMIC",
  "SCHOLARLY",
  "MILITARY",
  "FAMILY",
  "IDEOLOGICAL",
  "CUSTOM",
] as const;
const cooldownCandidate = ref({ id: "", type: "SOCIAL", chapter: "" });
const cooldownHistory = ref("[]");
const cooldownResult = ref<string | null>(null);
const cooldownError = ref<string | null>(null);
const cooldownRunning = ref(false);

function parseJsonList(raw: string): unknown[] | null {
  try {
    const parsed: unknown = JSON.parse(raw.trim() || "[]");
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function runCooldown() {
  cooldownError.value = null;
  cooldownResult.value = null;
  if (!/^\d+$/.test(cooldownCandidate.value.chapter.trim())) {
    cooldownError.value = t("workspace.narrative.readouts.cooldown.chapterInvalid");
    return;
  }
  const history = parseJsonList(cooldownHistory.value);
  if (history === null) {
    cooldownError.value = t("workspace.narrative.readouts.cooldown.historyInvalid");
    return;
  }
  cooldownRunning.value = true;
  try {
    const result = await api<unknown>(`${base()}/cooldown`, {
      method: "POST",
      body: JSON.stringify({
        candidate: {
          id: cooldownCandidate.value.id.trim() || "candidate",
          type: cooldownCandidate.value.type,
          chapter: Number(cooldownCandidate.value.chapter.trim()),
        },
        history,
      }),
    });
    cooldownResult.value = JSON.stringify(result, null, 2);
  } catch (e) {
    cooldownError.value = errorKey(e);
  } finally {
    cooldownRunning.value = false;
  }
}

// --- Patterns ---
const patternsBeats = ref("[]");
const patternsSequence = ref("");
const patternsResult = ref<string | null>(null);
const patternsError = ref<string | null>(null);
const patternsRunning = ref(false);

async function runPatterns() {
  patternsError.value = null;
  patternsResult.value = null;
  const beats = parseJsonList(patternsBeats.value);
  if (beats === null) {
    patternsError.value = t("workspace.narrative.readouts.patterns.beatsInvalid");
    return;
  }
  const sequence = patternsSequence.value.trim();
  if (sequence.length < 1 || sequence.length > 200) {
    patternsError.value = t("workspace.narrative.readouts.patterns.sequenceInvalid");
    return;
  }
  patternsRunning.value = true;
  try {
    const result = await api<unknown>(`${base()}/patterns`, {
      method: "POST",
      body: JSON.stringify({ beats, sequence }),
    });
    patternsResult.value = JSON.stringify(result, null, 2);
  } catch (e) {
    patternsError.value = errorKey(e);
  } finally {
    patternsRunning.value = false;
  }
}
</script>

<template>
  <section :aria-label="t('workspace.narrative.panel.title')" class="flex flex-col gap-3">
    <div
      role="tablist"
      :aria-label="t('workspace.narrative.panel.title')"
      class="flex gap-1 border-b border-nf-border"
      @keydown="onTabKeydown"
    >
      <button
        v-for="(tabId, i) in tabs"
        :key="tabId"
        :ref="(el) => (tabRefs[i] = el as HTMLButtonElement | null)"
        role="tab"
        :aria-selected="active === tabId"
        :tabindex="active === tabId ? 0 : -1"
        class="border-b-2 px-3 py-2 text-[13px] font-medium focus-visible:nf-focus"
        :class="
          active === tabId
            ? 'border-nf-accent text-nf-accent-hi'
            : 'border-transparent text-nf-text-dim hover:text-nf-text'
        "
        @click="active = tabId"
      >
        {{ tabLabel(tabId) }}
      </button>
    </div>

    <div v-if="active === 'dna'" role="tabpanel">
      <DnaEditor :workspace-id="workspaceId" :novel-id="novelId" />
    </div>

    <div v-else-if="active === 'policies'" role="tabpanel">
      <PolicyList :workspace-id="workspaceId" :novel-id="novelId" />
    </div>

    <div v-else-if="active === 'antagonists'" role="tabpanel">
      <Antagonists :workspace-id="workspaceId" :novel-id="novelId" />
    </div>

    <div v-else-if="active === 'scale'" role="tabpanel">
      <ScaleReviewPanel
        :workspace-id="workspaceId"
        :novel-id="novelId"
        :chapter-id="props.chapterId ?? null"
        :chapter-version-id="props.chapterVersionId ?? null"
      />
    </div>

    <div v-else role="tabpanel" class="flex flex-col gap-4">
      <p class="text-[12px] leading-relaxed text-nf-text-faint">
        {{ t("workspace.narrative.readouts.about") }}
      </p>

      <!-- Drama window -->
      <div class="flex flex-col gap-2 rounded-lg border border-nf-border bg-nf-bg-2 p-3">
        <h3 class="text-[13px] font-semibold text-nf-text">
          {{ t("workspace.narrative.readouts.drama.title") }}
        </h3>
        <form class="flex items-end gap-2" @submit.prevent="runDramaWindow">
          <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
            {{ t("workspace.narrative.readouts.drama.chaptersLabel") }}
            <input
              v-model="dramaChapters"
              type="text"
              inputmode="numeric"
              required
              class="w-32 rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
            />
          </label>
          <button
            type="submit"
            :disabled="dramaRunning"
            class="rounded-lg bg-nf-accent px-4 py-2 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus disabled:opacity-50"
          >
            {{ t("workspace.narrative.readouts.run") }}
          </button>
        </form>
        <p
          v-if="dramaError"
          role="alert"
          class="rounded-md border border-nf-warn/40 bg-nf-warn/10 px-2.5 py-1.5 text-[12.5px] text-nf-warn"
        >
          {{ dramaError }}
        </p>
        <pre v-if="dramaResult" class="max-h-48 overflow-auto rounded-md border border-nf-border bg-nf-bg-0 p-2.5 font-mono text-[11.5px] text-nf-text-dim">{{ dramaResult }}</pre>
      </div>

      <!-- Cooldown -->
      <div class="flex flex-col gap-2 rounded-lg border border-nf-border bg-nf-bg-2 p-3">
        <h3 class="text-[13px] font-semibold text-nf-text">
          {{ t("workspace.narrative.readouts.cooldown.title") }}
        </h3>
        <form class="flex flex-col gap-2" @submit.prevent="runCooldown">
          <div class="grid grid-cols-3 gap-2">
            <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
              {{ t("workspace.narrative.readouts.cooldown.candidateIdLabel") }}
              <input
                v-model="cooldownCandidate.id"
                type="text"
                class="rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
              />
            </label>
            <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
              {{ t("workspace.narrative.readouts.cooldown.candidateTypeLabel") }}
              <select
                v-model="cooldownCandidate.type"
                class="rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
              >
                <option v-for="bt in BEAT_TYPES" :key="bt" :value="bt">{{ bt }}</option>
              </select>
            </label>
            <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
              {{ t("workspace.narrative.readouts.cooldown.candidateChapterLabel") }}
              <input
                v-model="cooldownCandidate.chapter"
                type="text"
                inputmode="numeric"
                required
                class="rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
              />
            </label>
          </div>
          <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
            {{ t("workspace.narrative.readouts.cooldown.historyLabel") }}
            <textarea
              v-model="cooldownHistory"
              rows="4"
              spellcheck="false"
              class="rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 font-mono text-[12.5px] text-nf-text focus-visible:nf-focus"
            />
          </label>
          <div>
            <button
              type="submit"
              :disabled="cooldownRunning"
              class="rounded-lg bg-nf-accent px-4 py-2 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus disabled:opacity-50"
            >
              {{ t("workspace.narrative.readouts.run") }}
            </button>
          </div>
        </form>
        <p
          v-if="cooldownError"
          role="alert"
          class="rounded-md border border-nf-warn/40 bg-nf-warn/10 px-2.5 py-1.5 text-[12.5px] text-nf-warn"
        >
          {{ cooldownError }}
        </p>
        <pre v-if="cooldownResult" class="max-h-48 overflow-auto rounded-md border border-nf-border bg-nf-bg-0 p-2.5 font-mono text-[11.5px] text-nf-text-dim">{{ cooldownResult }}</pre>
      </div>

      <!-- Patterns -->
      <div class="flex flex-col gap-2 rounded-lg border border-nf-border bg-nf-bg-2 p-3">
        <h3 class="text-[13px] font-semibold text-nf-text">
          {{ t("workspace.narrative.readouts.patterns.title") }}
        </h3>
        <form class="flex flex-col gap-2" @submit.prevent="runPatterns">
          <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
            {{ t("workspace.narrative.readouts.patterns.beatsLabel") }}
            <textarea
              v-model="patternsBeats"
              rows="4"
              spellcheck="false"
              class="rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 font-mono text-[12.5px] text-nf-text focus-visible:nf-focus"
            />
          </label>
          <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
            {{ t("workspace.narrative.readouts.patterns.sequenceLabel") }}
            <input
              v-model="patternsSequence"
              type="text"
              maxlength="200"
              required
              class="rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
            />
          </label>
          <div>
            <button
              type="submit"
              :disabled="patternsRunning"
              class="rounded-lg bg-nf-accent px-4 py-2 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus disabled:opacity-50"
            >
              {{ t("workspace.narrative.readouts.run") }}
            </button>
          </div>
        </form>
        <p
          v-if="patternsError"
          role="alert"
          class="rounded-md border border-nf-warn/40 bg-nf-warn/10 px-2.5 py-1.5 text-[12.5px] text-nf-warn"
        >
          {{ patternsError }}
        </p>
        <pre v-if="patternsResult" class="max-h-48 overflow-auto rounded-md border border-nf-border bg-nf-bg-0 p-2.5 font-mono text-[11.5px] text-nf-text-dim">{{ patternsResult }}</pre>
      </div>
    </div>
  </section>
</template>
