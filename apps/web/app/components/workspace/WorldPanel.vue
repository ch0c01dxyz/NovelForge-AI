<template>
  <section :aria-label="t('workspace.world.title')">
    <div role="tablist" :aria-label="t('workspace.world.title')" class="mb-4 flex gap-1 border-b border-nf-border">
      <button
        v-for="(tab, i) in tabs"
        :key="tab"
        ref="tabBtns"
        type="button"
        role="tab"
        :id="`world-tab-${tab}`"
        :aria-selected="activeTab === tab"
        :aria-controls="`world-panel-${tab}`"
        :tabindex="activeTab === tab ? 0 : -1"
        class="border-b-2 px-3 py-2 text-[13px] font-medium focus-visible:nf-focus"
        :class="
          activeTab === tab
            ? 'border-nf-accent text-nf-text'
            : 'border-transparent text-nf-text-dim hover:text-nf-text'
        "
        @click="activeTab = tab"
        @keydown="onTabKeydown($event, i)"
      >
        {{ t(`workspace.world.tabs.${tab}`) }}
      </button>
    </div>

    <div v-show="activeTab === 'entities'" id="world-panel-entities" role="tabpanel" aria-labelledby="world-tab-entities">
      <EntityBrowser
        :workspace-id="props.workspaceId"
        :novel-id="props.novelId"
        @select="onEntitySelect"
      />
    </div>

    <div v-show="activeTab === 'facts'" id="world-panel-facts" role="tabpanel" aria-labelledby="world-tab-facts">
      <div class="mb-3 flex items-center justify-between gap-3">
        <p v-if="selectedEntity" class="truncate text-[12px] text-nf-text-dim">
          {{ t("workspace.world.entities.selected", { name: selectedEntity.name }) }}
          <button
            type="button"
            class="ml-1 underline hover:text-nf-text focus-visible:nf-focus"
            @click="selectedEntity = null"
          >
            {{ t("workspace.world.entities.clearSelection") }}
          </button>
        </p>
        <span v-else />
        <button
          type="button"
          class="shrink-0 rounded-md bg-nf-accent px-3 py-1.5 text-[13px] font-medium text-nf-accent-ink hover:brightness-110 focus-visible:nf-focus"
          @click="createOpen = true"
        >
          {{ t("workspace.world.facts.new") }}
        </button>
      </div>
      <FactList
        ref="factList"
        :workspace-id="props.workspaceId"
        :novel-id="props.novelId"
        :entity-id="selectedEntity?.id ?? null"
      />
      <FactEditor
        :workspace-id="props.workspaceId"
        :novel-id="props.novelId"
        :open="createOpen"
        mode="create"
        :initial-entity-id="selectedEntity?.id ?? null"
        @close="createOpen = false"
        @saved="onFactCreated"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * World & Lore panel (NF-WF-016): tab container — Entities | Facts.
 * Selecting an entity jumps to the Facts tab filtered by it.
 */
import { ref } from "vue";
import { useLocale } from "../../composables/useLocale";
import EntityBrowser from "./EntityBrowser.vue";
import FactList from "./FactList.vue";
import FactEditor from "./FactEditor.vue";
import type { StoryEntity } from "./canon-types";

const props = defineProps<{
  workspaceId: string;
  novelId: string;
}>();

const { t } = useLocale();

const tabs = ["entities", "facts"] as const;
type Tab = (typeof tabs)[number];
const activeTab = ref<Tab>("entities");
const selectedEntity = ref<StoryEntity | null>(null);
const createOpen = ref(false);
const factList = ref<{ refresh: () => Promise<void> } | null>(null);
const tabBtns = ref<HTMLElement[]>([]);

function onEntitySelect(e: StoryEntity) {
  selectedEntity.value = e;
  activeTab.value = "facts";
}

async function onFactCreated() {
  await factList.value?.refresh();
}

function onTabKeydown(ev: KeyboardEvent, i: number) {
  let next: number | null = null;
  if (ev.key === "ArrowRight" || ev.key === "ArrowDown") next = (i + 1) % tabs.length;
  else if (ev.key === "ArrowLeft" || ev.key === "ArrowUp") next = (i - 1 + tabs.length) % tabs.length;
  else if (ev.key === "Home") next = 0;
  else if (ev.key === "End") next = tabs.length - 1;
  if (next !== null) {
    ev.preventDefault();
    activeTab.value = tabs[next]!;
    tabBtns.value[next]?.focus();
  }
}
</script>
