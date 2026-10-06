<script setup lang="ts">
/**
 * Research workspace panel (NF-WF-016, Invariant 1.7).
 *
 * Self-contained tab shell: References | Search | Audit. Props are the
 * workspace + novel ids; the panel fetches through `useApi()` and owns
 * no store. The non-canon boundary is labelled explicitly in the header:
 * references are NEVER canon and never become canon by ingestion
 * (schema comment at schema.prisma:939-943).
 *
 * Tabs follow the roving-tabindex tab pattern and are keyboard
 * navigable; the audit list is read-only.
 */
import { ref, onMounted } from "vue";
import { useLocale } from "../../composables/useLocale";
import { useApi, ApiError } from "../../composables/useApi";
import ReferenceLibrary from "./ReferenceLibrary.vue";
import RetrievalSearch from "./RetrievalSearch.vue";

const props = defineProps<{
  workspaceId: string;
  novelId: string;
}>();

const { t } = useLocale();
const { api } = useApi();

type Tab = "references" | "search" | "audit";
const tabs: Tab[] = ["references", "search", "audit"];
const active = ref<Tab>("references");
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

interface RetrievalAuditEntry {
  id: string;
  query: string;
  mode: string;
  readerChapter: number | null;
  returnedCount: number;
  withheldCount: number;
  retrievers: string[];
  latencyMs: number | null;
  createdAt: string;
}

const audit = ref<RetrievalAuditEntry[]>([]);
const auditLoading = ref(false);
const auditError = ref<string | null>(null);

function errorKey(e: unknown): string {
  if (e instanceof ApiError && e.status === 403) return t("workspace.research.errors.forbidden");
  if (e instanceof ApiError && e.status === 404) return t("workspace.research.errors.notFound");
  return t("workspace.research.errors.unknown");
}

async function loadAudit() {
  auditLoading.value = true;
  auditError.value = null;
  try {
    audit.value = await api<RetrievalAuditEntry[]>(`/workspaces/${props.workspaceId}/retrievals?limit=50`);
  } catch (e) {
    auditError.value = errorKey(e);
  } finally {
    auditLoading.value = false;
  }
}

onMounted(() => loadAudit());
</script>

<template>
  <section :aria-label="t('workspace.research.panel.title')" class="flex flex-col gap-3">
    <div
      role="note"
      class="rounded-lg border border-nf-border bg-nf-bg-2 px-3 py-2 text-[12px] leading-relaxed text-nf-text-dim"
    >
      <p class="font-semibold text-nf-text">{{ t("workspace.research.panel.nonCanonBoundary") }}</p>
      <p class="mt-0.5">{{ t("workspace.research.panel.nonCanonDetail") }}</p>
    </div>

    <div
      role="tablist"
      :aria-label="t('workspace.research.panel.title')"
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
        {{ t(`workspace.research.panel.tab${tabId === "references" ? "References" : tabId === "search" ? "Search" : "Audit"}`) }}
      </button>
    </div>

    <div v-if="active === 'references'" role="tabpanel">
      <ReferenceLibrary :workspace-id="workspaceId" :novel-id="novelId" />
    </div>

    <div v-else-if="active === 'search'" role="tabpanel">
      <RetrievalSearch :workspace-id="workspaceId" :novel-id="novelId" />
    </div>

    <div v-else role="tabpanel" class="flex flex-col gap-2">
      <div class="flex items-center justify-between">
        <h3
          class="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-nf-text-faint"
        >
          {{ t("workspace.research.audit.title") }}
        </h3>
        <button
          class="rounded-md border border-nf-border-strong px-2.5 py-1 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
          :disabled="auditLoading"
          @click="loadAudit()"
        >
          {{ t("workspace.research.audit.refresh") }}
        </button>
      </div>

      <p v-if="auditLoading" class="text-[12.5px] text-nf-text-faint">
        {{ t("workspace.research.common.loading") }}
      </p>
      <p
        v-else-if="auditError"
        role="alert"
        class="rounded-lg border border-nf-warn/40 bg-nf-warn/10 px-3 py-2 text-[12.5px] text-nf-warn"
      >
        {{ auditError }}
      </p>
      <p v-else-if="!audit.length" class="text-[12.5px] text-nf-text-faint">
        {{ t("workspace.research.audit.empty") }}
      </p>
      <ul v-else class="flex flex-col gap-2">
        <li
          v-for="entry in audit"
          :key="entry.id"
          class="rounded-lg border border-nf-border bg-nf-bg-2 px-3 py-2"
        >
          <p class="text-[12.5px] text-nf-text">{{ entry.query }}</p>
          <p class="mt-1 font-mono text-[11px] text-nf-text-faint">
            {{
              t("workspace.research.audit.meta", {
                mode: entry.mode,
                returned: entry.returnedCount,
                withheld: entry.withheldCount,
                latency: entry.latencyMs ?? "—",
                at: entry.createdAt,
              })
            }}
          </p>
        </li>
      </ul>
    </div>
  </section>
</template>
