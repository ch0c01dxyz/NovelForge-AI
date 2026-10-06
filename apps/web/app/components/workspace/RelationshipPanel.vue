<template>
  <section
    :aria-label="t('workspace.relationships.panel.sectionLabel')"
    class="flex h-full flex-col gap-4"
    data-testid="relationship-panel"
  >
    <div
      role="tablist"
      :aria-label="t('workspace.relationships.panel.tabsLabel')"
      class="flex gap-1 border-b border-nf-border"
    >
      <button
        v-for="tab in tabs"
        :key="tab.id"
        :ref="(el) => setTabRef(tab.id, el)"
        role="tab"
        :aria-selected="activeTab === tab.id"
        :tabindex="activeTab === tab.id ? 0 : -1"
        :data-testid="`relationship-tab-${tab.id}`"
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

    <p v-if="loading" class="text-[12.5px] text-nf-text-faint">
      {{ t("workspace.relationships.panel.charactersLoading") }}
    </p>
    <div v-else-if="loadError" class="flex flex-col gap-2">
      <p role="alert" class="text-[12.5px] text-nf-warn">{{ loadError }}</p>
      <button
        type="button"
        data-testid="relationship-panel-retry"
        class="self-start rounded-md border border-nf-border-strong px-2.5 py-1.5 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
        @click="reload"
      >
        {{ t("workspace.relationships.common.retry") }}
      </button>
    </div>

    <div v-else role="tabpanel" class="min-h-0 flex-1">
      <RelationshipStances
        v-if="activeTab === 'stances'"
        :workspace-id="workspaceId"
        :novel-id="novelId"
        :characters="characters"
      />
      <Bonds
        v-else
        :workspace-id="workspaceId"
        :novel-id="novelId"
        :characters="characters"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * Relationship workspace panel (NF-WF-016, Invariant 1.2).
 *
 * Self-contained tab container (Stances | Bonds). Loads the character
 * roster once for the directional selects and name resolution; the
 * sub-panels own their stance/bond data.
 *
 * Props/emits only, no stores, no AI calls. All strings via useLocale.
 */
import { onMounted, ref } from "vue";
import { useApi, ApiError } from "../../composables/useApi";
import { useLocale } from "../../composables/useLocale";
import RelationshipStances from "./RelationshipStances.vue";
import Bonds from "./Bonds.vue";

/** Minimal character identity used for selects and name resolution. */
export interface RelationshipCharacter {
  id: string;
  key: string;
  name: string;
}

const props = defineProps<{
  workspaceId: string;
  novelId: string;
}>();

const { t } = useLocale();
const { api } = useApi();

type TabId = "stances" | "bonds";
const tabs: Array<{ id: TabId; labelKey: string }> = [
  { id: "stances", labelKey: "workspace.relationships.panel.tabs.stances" },
  { id: "bonds", labelKey: "workspace.relationships.panel.tabs.bonds" },
];

const activeTab = ref<TabId>("stances");
const characters = ref<RelationshipCharacter[]>([]);
const loading = ref(false);
const loadError = ref<string | null>(null);

const tabRefs = new Map<TabId, HTMLElement | null>();
function setTabRef(id: TabId, el: unknown) {
  tabRefs.set(id, el as HTMLElement | null);
}
function onTabKeydown(e: KeyboardEvent) {
  const order: TabId[] = ["stances", "bonds"];
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

function apiErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return t("workspace.relationships.error.unauthorized");
    if (err.status === 403) return t("workspace.relationships.error.forbidden");
    if (err.status === 404) return t("workspace.relationships.error.notFound");
    return t("workspace.relationships.error.generic", { code: err.code });
  }
  return t("workspace.relationships.error.generic", { code: "UNKNOWN" });
}

async function reload() {
  loading.value = true;
  loadError.value = null;
  try {
    characters.value = await api<RelationshipCharacter[]>(
      `/workspaces/${props.workspaceId}/novels/${props.novelId}/characters?take=200&skip=0`,
    );
  } catch (err) {
    loadError.value = apiErrorMessage(err);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void reload();
});
</script>
