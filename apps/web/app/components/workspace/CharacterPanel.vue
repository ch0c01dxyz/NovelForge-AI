<template>
  <section
    :aria-label="t('workspace.characters.panel.sectionLabel')"
    class="flex h-full flex-col gap-4"
    data-testid="character-panel"
  >
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div
        role="tablist"
        :aria-label="t('workspace.characters.panel.tabsLabel')"
        class="flex gap-1 border-b border-nf-border"
      >
        <button
          v-for="tab in tabs"
          :key="tab.id"
          :ref="(el) => setTabRef(tab.id, el)"
          role="tab"
          :aria-selected="activeTab === tab.id"
          :tabindex="activeTab === tab.id ? 0 : -1"
          :data-testid="`character-tab-${tab.id}`"
          class="border-b-2 px-3 py-2 text-[13px] font-medium focus-visible:nf-focus"
          :class="
            activeTab === tab.id
              ? 'border-nf-text text-nf-text'
              : 'border-transparent text-nf-text-dim hover:text-nf-text'
          "
          @click="activeTab = tab.id"
          @keydown="onTabKeydown"
        >
          {{ t(tab.labelKey) }}
        </button>
      </div>

      <div v-if="activeTab !== 'characters'" class="flex items-center gap-2">
        <label
          :for="`${uid}-working`"
          class="text-[12px] font-medium text-nf-text-dim"
        >
          {{ t("workspace.characters.panel.workingCharacterLabel") }}
        </label>
        <select
          :id="`${uid}-working`"
          v-model="selectedId"
          data-testid="working-character-select"
          class="rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
        >
          <option :value="null">
            {{ t("workspace.characters.panel.workingCharacterNone") }}
          </option>
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

    <div v-if="activeTab === 'characters'" role="tabpanel" class="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
      <div class="w-full lg:w-[380px] lg:shrink-0">
        <CharacterList
          :workspace-id="workspaceId"
          :novel-id="novelId"
          :characters="characters"
          :loading="loading"
          :load-error="loadError"
          :selected-id="selectedId"
          :focus-id="focusCharacterId"
          @select="selectedId = $event"
          @created="reload"
          @deleted="onDeleted"
          @retry="reload"
        />
      </div>
      <div class="min-h-0 flex-1">
        <CharacterSheet :character="selectedCharacter" />
      </div>
    </div>

    <div v-else role="tabpanel" class="min-h-0 flex-1">
      <p
        v-if="!selectedId"
        class="rounded-lg border border-nf-border bg-nf-bg-2 px-3 py-2.5 text-[12.5px] text-nf-text-dim"
        data-testid="select-character-first"
      >
        {{ t("workspace.characters.panel.selectCharacterFirst") }}
      </p>
      <CharacterStates
        v-else-if="activeTab === 'states'"
        :workspace-id="workspaceId"
        :novel-id="novelId"
        :character-id="selectedId"
        :character-name="selectedCharacter?.name ?? ''"
      />
      <CharacterKnowledge
        v-else-if="activeTab === 'knowledge'"
        :workspace-id="workspaceId"
        :novel-id="novelId"
        :character-id="selectedId"
        :character-name="selectedCharacter?.name ?? ''"
      />
      <CharacterArcs
        v-else-if="activeTab === 'arcs'"
        :workspace-id="workspaceId"
        :novel-id="novelId"
        :character-id="selectedId"
        :character-name="selectedCharacter?.name ?? ''"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * Character workspace panel (NF-WF-016, Invariant 1.1).
 *
 * Self-contained tab container (Characters | States | Knowledge | Arcs).
 * Fetches the character list once and shares the working-character
 * selection with the sub-panels. There is no character UPDATE route
 * (GAP-058): corrections go through delete + recreate, which the sheet
 * states honestly.
 *
 * Props/emits only, no stores, no AI calls. All strings via useLocale.
 */
import { computed, onMounted, ref } from "vue";
import { useApi, ApiError } from "../../composables/useApi";
import { useLocale } from "../../composables/useLocale";
import CharacterList from "./CharacterList.vue";
import CharacterSheet from "./CharacterSheet.vue";
import CharacterStates from "./CharacterStates.vue";
import CharacterKnowledge from "./CharacterKnowledge.vue";
import CharacterArcs from "./CharacterArcs.vue";

/**
 * Character row as the API returns it. The contract pins
 * `storyEntityId: string | null` on the response; the backend at HEAD
 * omits it, so the UI treats a missing value as "no link" (see handoff).
 */
export interface WorkspaceCharacter {
  id: string;
  key: string;
  name: string;
  summary: string | null;
  storyEntityId: string | null;
}

const props = defineProps<{
  workspaceId: string;
  novelId: string;
  /** NF-WF-016 follow-up: preselect + highlight this character (from the health "Go to"). */
  focusCharacterId?: string | null;
}>();

const { t } = useLocale();
const { api } = useApi();

const uid = `charpanel-${Math.random().toString(36).slice(2, 8)}`;

type TabId = "characters" | "states" | "knowledge" | "arcs";
const tabs: Array<{ id: TabId; labelKey: string }> = [
  { id: "characters", labelKey: "workspace.characters.panel.tabs.characters" },
  { id: "states", labelKey: "workspace.characters.panel.tabs.states" },
  { id: "knowledge", labelKey: "workspace.characters.panel.tabs.knowledge" },
  { id: "arcs", labelKey: "workspace.characters.panel.tabs.arcs" },
];

const activeTab = ref<TabId>("characters");
const characters = ref<WorkspaceCharacter[]>([]);
const loading = ref(false);
const loadError = ref<string | null>(null);
const selectedId = ref<string | null>(null);

const tabRefs = new Map<TabId, HTMLElement | null>();
function setTabRef(id: TabId, el: unknown) {
  tabRefs.set(id, el as HTMLElement | null);
}
function onTabKeydown(e: KeyboardEvent) {
  const order: TabId[] = ["characters", "states", "knowledge", "arcs"];
  const i = order.indexOf(activeTab.value);
  if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
    e.preventDefault();
    const next =
      order[(i + (e.key === "ArrowRight" ? 1 : order.length - 1)) % order.length]!;
    activeTab.value = next;
    tabRefs.get(next)?.focus();
  } else if (e.key === "Home") {
    e.preventDefault();
    activeTab.value = order[0]!;
    tabRefs.get(order[0]!)?.focus();
  } else if (e.key === "End") {
    e.preventDefault();
    activeTab.value = order[order.length - 1]!;
    tabRefs.get(order[order.length - 1]!)?.focus();
  }
}

const selectedCharacter = computed(
  () => characters.value.find((c) => c.id === selectedId.value) ?? null,
);

function apiErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return t("workspace.characters.error.unauthorized");
    if (err.status === 403) return t("workspace.characters.error.forbidden");
    if (err.status === 404) return t("workspace.characters.error.notFound");
    return t("workspace.characters.error.generic", { code: err.code });
  }
  return t("workspace.characters.error.generic", { code: "UNKNOWN" });
}

async function reload() {
  loading.value = true;
  loadError.value = null;
  try {
    characters.value = await api<WorkspaceCharacter[]>(
      `/workspaces/${props.workspaceId}/novels/${props.novelId}/characters?take=200&skip=0`,
    );
    if (
      props.focusCharacterId &&
      characters.value.some((c) => c.id === props.focusCharacterId)
    ) {
      selectedId.value = props.focusCharacterId;
      activeTab.value = "characters";
    }
    if (selectedId.value && !characters.value.some((c) => c.id === selectedId.value)) {
      selectedId.value = null;
    }
  } catch (err) {
    loadError.value = apiErrorMessage(err);
  } finally {
    loading.value = false;
  }
}

function onDeleted(id: string) {
  if (selectedId.value === id) selectedId.value = null;
  void reload();
}

onMounted(() => {
  void reload();
});
</script>
