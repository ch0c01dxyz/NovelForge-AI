<template>
  <section :aria-label="t('workspace.canon.title')">
    <div role="tablist" :aria-label="t('workspace.canon.title')" class="mb-4 flex gap-1 border-b border-nf-border">
      <button
        v-for="(tab, i) in tabs"
        :key="tab"
        ref="tabBtns"
        type="button"
        role="tab"
        :id="`canon-tab-${tab}`"
        :aria-selected="activeTab === tab"
        :aria-controls="`canon-panel-${tab}`"
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
        {{ t(`workspace.canon.tabs.${tab}`) }}
      </button>
    </div>

    <div v-show="activeTab === 'facts'" id="canon-panel-facts" role="tabpanel" aria-labelledby="canon-tab-facts">
      <div class="mb-3 flex justify-end">
        <button
          type="button"
          class="rounded-md bg-nf-accent px-3 py-1.5 text-[13px] font-medium text-nf-accent-ink hover:brightness-110 focus-visible:nf-focus"
          @click="createOpen = true"
        >
          {{ t("workspace.world.facts.new") }}
        </button>
      </div>
      <FactList
        ref="factList"
        :workspace-id="props.workspaceId"
        :novel-id="props.novelId"
      />
      <FactEditor
        :workspace-id="props.workspaceId"
        :novel-id="props.novelId"
        :open="createOpen"
        mode="create"
        @close="createOpen = false"
        @saved="onFactCreated"
      />
    </div>

    <div v-show="activeTab === 'proposals'" id="canon-panel-proposals" role="tabpanel" aria-labelledby="canon-tab-proposals">
      <ProposalReview :workspace-id="props.workspaceId" :novel-id="props.novelId" />
    </div>

    <div v-show="activeTab === 'applications'" id="canon-panel-applications" role="tabpanel" aria-labelledby="canon-tab-applications">
      <h3 class="mb-2 text-[15px] font-semibold text-nf-text">
        {{ t("workspace.canon.applications.title") }}
      </h3>
      <p class="mb-3 text-[13px] text-nf-text-dim">
        {{ t("workspace.canon.applications.noList") }}
      </p>
      <form class="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end" @submit.prevent="loadApplication">
        <label class="block flex-1">
          <span class="mb-1 block text-[12px] text-nf-text-dim">{{ t("workspace.canon.applications.applicationId") }}</span>
          <input
            v-model="applicationId"
            type="text"
            :placeholder="t('workspace.canon.applications.applicationIdPlaceholder')"
            class="w-full rounded-md border border-nf-border bg-nf-bg-2 px-2.5 py-1.5 font-mono text-[12px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
          />
        </label>
        <button
          type="submit"
          :disabled="appLoading"
          class="rounded-md bg-nf-accent px-3 py-1.5 text-[13px] font-medium text-nf-accent-ink hover:brightness-110 disabled:opacity-50 focus-visible:nf-focus"
        >
          {{ appLoading ? t("workspace.canon.applications.loading") : t("workspace.canon.applications.load") }}
        </button>
      </form>
      <p v-if="appError" role="alert" class="mb-3 text-[13px] text-nf-warn">{{ appError }}</p>

      <!-- Read-only view of one application. The 008 CanonApplicationReview
           dialog creates applications from a generation run's extraction
           proposals (props: runId, chapterNumber, proposals) — it cannot
           render an existing application by id, so it is not wired here. -->
      <div v-if="application" class="rounded-lg border border-nf-border bg-nf-bg-2 p-3">
        <div class="mb-2 flex items-center justify-between gap-2">
          <p class="font-mono text-[12px] text-nf-text-faint">{{ application.id }}</p>
          <span class="rounded-full border px-2 py-0.5 text-[11px]" :class="appStatusClass(application.status)">
            {{ appStatusLabel(application.status) }}
          </span>
        </div>
        <p class="mb-2 text-[13px] text-nf-text-dim">
          {{ t("workspace.canon.applications.items") }}: {{ application.items.length }}
        </p>
        <ul class="space-y-2">
          <li
            v-for="item in application.items"
            :key="item.id"
            class="rounded border border-nf-border bg-nf-bg-1 p-2"
          >
            <div class="flex items-start justify-between gap-2">
              <p class="text-[13px] text-nf-text">
                <span class="text-nf-text-faint">#{{ item.claimIndex }}</span>
                {{ item.entity?.name ?? item.kind }} —
                <span class="text-nf-accent-hi">{{ item.predicate }}</span>
              </p>
              <span class="shrink-0 rounded-full border px-2 py-0.5 text-[11px]" :class="verdictClass(item.verdict)">
                {{ verdictLabel(item.verdict) }}
              </span>
            </div>
            <p class="mt-0.5 text-[12px] text-nf-text-dim">{{ item.text }}</p>
            <p v-if="item.conflictsWithFact" class="mt-0.5 text-[12px] text-nf-warn">
              {{ t("workspace.canon.applications.conflictsWith", { statement: item.conflictsWithFact.statement }) }}
            </p>
            <p v-if="item.canonFactId" class="mt-0.5 font-mono text-[11px] text-nf-ok">
              {{ t("workspace.canon.applications.mintedFact", { id: item.canonFactId.slice(0, 8) }) }}
            </p>
          </li>
        </ul>
        <p class="mt-3 text-[12px] text-nf-text-faint">
          {{ t("workspace.canon.applications.auditNote") }}
        </p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * Canon review panel (NF-WF-016): Facts | Proposals | Applications.
 * Facts reuses the WorldPanel FactList. Applications has NO list route
 * (only GET /canon/applications/:applicationId), so the tab offers an
 * honest "review by ID" lookup rendering a read-only view — no invented
 * route, and the 008 dialog is not misused for existing applications.
 */
import { ref } from "vue";
import { useApi, ApiError } from "../../composables/useApi";
import { useLocale } from "../../composables/useLocale";
import FactList from "./FactList.vue";
import FactEditor from "./FactEditor.vue";
import ProposalReview from "./ProposalReview.vue";
import { UUID_RE, type CanonApplicationView } from "./canon-types";

const props = defineProps<{
  workspaceId: string;
  novelId: string;
}>();

const { t } = useLocale();
const { api } = useApi();

const tabs = ["facts", "proposals", "applications"] as const;
type Tab = (typeof tabs)[number];
const activeTab = ref<Tab>("facts");
const tabBtns = ref<HTMLElement[]>([]);
const createOpen = ref(false);
const factList = ref<{ refresh: () => Promise<void> } | null>(null);

const applicationId = ref("");
const application = ref<CanonApplicationView | null>(null);
const appLoading = ref(false);
const appError = ref<string | null>(null);

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

function appStatusLabel(status: string): string {
  const key = `workspace.canon.applications.status.${status}`;
  const msg = t(key);
  return msg === key ? status : msg;
}

function appStatusClass(status: string): string {
  if (status === "APPLIED") return "border-nf-ok/40 text-nf-ok";
  if (status === "REJECTED") return "border-nf-border text-nf-text-faint";
  if (status === "STALE") return "border-nf-warn/40 text-nf-warn";
  return "border-nf-accent/50 text-nf-accent-hi";
}

function verdictLabel(verdict: string): string {
  const key = `workspace.canon.applications.verdict.${verdict}`;
  const msg = t(key);
  return msg === key ? verdict : msg;
}

function verdictClass(verdict: string): string {
  if (verdict === "APPLICABLE") return "border-nf-ok/40 text-nf-ok";
  if (verdict === "CONFLICT") return "border-nf-warn/40 text-nf-warn";
  return "border-nf-border text-nf-text-faint";
}

async function onFactCreated() {
  createOpen.value = false;
  await factList.value?.refresh();
}

async function loadApplication() {
  appError.value = null;
  application.value = null;
  const id = applicationId.value.trim();
  if (!UUID_RE.test(id)) {
    appError.value = t("workspace.canon.errors.INVALID_INPUT");
    return;
  }
  appLoading.value = true;
  try {
    application.value = await api<CanonApplicationView>(
      `/workspaces/${props.workspaceId}/novels/${props.novelId}/canon/applications/${id}`,
    );
  } catch (e) {
    if (e instanceof ApiError && e.code === "NOT_FOUND") {
      appError.value = t("workspace.canon.applications.notFound");
    } else if (e instanceof ApiError) {
      const key = `workspace.canon.errors.${e.code}`;
      const msg = t(key);
      appError.value = msg === key ? e.code : msg;
    } else {
      appError.value = t("workspace.canon.errors.network");
    }
  } finally {
    appLoading.value = false;
  }
}
</script>
