<template>
  <div>
    <PanelTabs v-model="activeTab" :tabs="tabs" :ariaLabel="t('workspace.timeline.tabsLabel')" />
    <div class="pt-4">
      <section
        v-show="activeTab === 'events'"
        role="tabpanel"
        id="panel-events"
        aria-labelledby="tab-events"
      >
        <StoryEvents :workspace-id="workspaceId" :novel-id="novelId" />
      </section>
      <section
        v-show="activeTab === 'timeline'"
        role="tabpanel"
        id="panel-timeline"
        aria-labelledby="tab-timeline"
      >
        <TimelineView :workspace-id="workspaceId" :novel-id="novelId" />
      </section>
      <section
        v-show="activeTab === 'threads'"
        role="tabpanel"
        id="panel-threads"
        aria-labelledby="tab-threads"
      >
        <ThreadsView :workspace-id="workspaceId" :novel-id="novelId" />
      </section>
      <section
        v-show="activeTab === 'promises'"
        role="tabpanel"
        id="panel-promises"
        aria-labelledby="tab-promises"
      >
        <PromisesView :workspace-id="workspaceId" :novel-id="novelId" />
      </section>
      <section
        v-show="activeTab === 'edges'"
        role="tabpanel"
        id="panel-edges"
        aria-labelledby="tab-edges"
      >
        <CausalEdges :workspace-id="workspaceId" :novel-id="novelId" />
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * TimelinePanel (NF-WF-016): tab container for the timeline workspace —
 * story events, timeline entries, threads, promises, causal edges.
 *
 * Self-contained top-level panel: props { workspaceId, novelId }, every
 * tab fetches its own data via useApi(). No thread↔event linking UI by
 * design (GAP-056); the threads tab says so explicitly.
 */
import { ref } from "vue";
import { useLocale } from "../../composables/useLocale";
import PanelTabs from "./PanelTabs.vue";
import StoryEvents from "./StoryEvents.vue";
import TimelineView from "./TimelineView.vue";
import ThreadsView from "./ThreadsView.vue";
import PromisesView from "./PromisesView.vue";
import CausalEdges from "./CausalEdges.vue";

defineProps<{
  workspaceId: string;
  novelId: string;
}>();

const { t } = useLocale();
const activeTab = ref("events");

const tabs = [
  { id: "events", label: t("workspace.timeline.tabs.events") },
  { id: "timeline", label: t("workspace.timeline.tabs.timeline") },
  { id: "threads", label: t("workspace.timeline.tabs.threads") },
  { id: "promises", label: t("workspace.timeline.tabs.promises") },
  { id: "edges", label: t("workspace.timeline.tabs.edges") },
];

</script>
