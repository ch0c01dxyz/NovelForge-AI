<template>
  <div>
    <PanelTabs v-model="activeTab" :tabs="tabs" :ariaLabel="t('workspace.planning.tabsLabel')" />
    <div class="pt-4">
      <section
        v-show="activeTab === 'synopses'"
        role="tabpanel"
        id="panel-synopses"
        aria-labelledby="tab-synopses"
      >
        <SynopsesView :workspace-id="workspaceId" :novel-id="novelId" />
      </section>
      <section
        v-show="activeTab === 'sagas'"
        role="tabpanel"
        id="panel-sagas"
        aria-labelledby="tab-sagas"
      >
        <SagasView :workspace-id="workspaceId" :novel-id="novelId" />
      </section>
      <section
        v-show="activeTab === 'nodes'"
        role="tabpanel"
        id="panel-nodes"
        aria-labelledby="tab-nodes"
      >
        <OutlineNodesView :workspace-id="workspaceId" :novel-id="novelId" />
      </section>
      <section
        v-show="activeTab === 'versions'"
        role="tabpanel"
        id="panel-versions"
        aria-labelledby="tab-versions"
      >
        <OutlineVersionsView :workspace-id="workspaceId" :novel-id="novelId" />
      </section>
      <section
        v-show="activeTab === 'horizon'"
        role="tabpanel"
        id="panel-horizon"
        aria-labelledby="tab-horizon"
      >
        <HorizonView :workspace-id="workspaceId" :novel-id="novelId" />
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * PlanningPanel (NF-WF-016): tab container for the planning workspace —
 * synopses, sagas, outline nodes, outline versions, planning horizon.
 *
 * Self-contained top-level panel: props { workspaceId, novelId }, every
 * tab fetches its own data via useApi(). Outline-version approval lives
 * in the Versions tab, visually separated from node editing and labelled
 * as a canon:approve decision (contract Q5).
 */
import { ref } from "vue";
import { useLocale } from "../../composables/useLocale";
import PanelTabs from "./PanelTabs.vue";
import SynopsesView from "./SynopsesView.vue";
import SagasView from "./SagasView.vue";
import OutlineNodesView from "./OutlineNodesView.vue";
import OutlineVersionsView from "./OutlineVersionsView.vue";
import HorizonView from "./HorizonView.vue";

defineProps<{
  workspaceId: string;
  novelId: string;
}>();

const { t } = useLocale();
const activeTab = ref("synopses");

const tabs = [
  { id: "synopses", label: t("workspace.planning.tabs.synopses") },
  { id: "sagas", label: t("workspace.planning.tabs.sagas") },
  { id: "nodes", label: t("workspace.planning.tabs.nodes") },
  { id: "versions", label: t("workspace.planning.tabs.versions") },
  { id: "horizon", label: t("workspace.planning.tabs.horizon") },
];

</script>
