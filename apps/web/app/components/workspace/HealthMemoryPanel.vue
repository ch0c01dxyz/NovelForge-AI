<script setup lang="ts">
/**
 * Health & Memory workspace panel (NF-WF-016, Invariant 1.9).
 *
 * Tab shell: Health | Memory.
 *
 * Health: `evaluateHealth` findings with a severity filter and
 * expandable evidence (EvidenceFinding: rule, severity, evidence,
 * remediation). The optional `revisionId` is a free-form text input —
 * GAP-040 pins that there is NO cross-branch revision picker. The
 * UNRESOLVED_IDENTITY register (GET .../story-health/unresolved) is
 * includes explicit character identity linking. Evidence is never raw HTML.
 *
 * Memory: GET .../memory/status (reads statuses only). DerivedRebuildIntent
 * is audit-only for projections without a registered pipeline (ADR-0017);
 * GET .../derived-intents exposes its status read-only. POST
 * .../memory/rebuild (202; explicit confirmation; NO simulation flag
 * exposed), GET .../memory/as-of (read-only display).
 *
 * No final-text review receipt route exists (GET .../final-text-review
 * is absent — only POST to record); receipts are therefore omitted,
 * recorded as an honest gap rather than invented.
 */
import { ref, onMounted, computed } from "vue";
import { useLocale } from "../../composables/useLocale";
import { useApi, ApiError } from "../../composables/useApi";
import CharacterIdentityLink from "./CharacterIdentityLink.vue";

const props = defineProps<{
  workspaceId: string;
  novelId: string;
}>();

const { t } = useLocale();
const { api } = useApi();

type Tab = "health" | "memory";
const tabs: Tab[] = ["health", "memory"];
const active = ref<Tab>("health");
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

function errorKey(e: unknown): string {
  if (e instanceof ApiError && e.status === 403) return t("workspace.health.errors.forbidden");
  if (e instanceof ApiError && e.status === 404) return t("workspace.health.errors.notFound");
  return t("workspace.health.errors.unknown");
}

const base = () => `/workspaces/${props.workspaceId}/novels/${props.novelId}`;

// ---------- Health ----------
interface FindingEvidence {
  kind: string;
  id?: string;
  chapter?: number;
  order?: number;
  revisionId?: string;
  detail?: string;
}

interface EvidenceFinding {
  rule: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  status: string;
  evidence: FindingEvidence[];
  affectedEntities: Array<{ type: string; id: string }>;
  remediation: string | null;
  sourceRevisionId: string;
  evaluatedAt: string;
}

interface HealthResult {
  findings: EvidenceFinding[];
  unresolved: unknown[];
  sourceRevisionId: string;
}

const SEVERITIES = ["ALL", "INFO", "WARNING", "CRITICAL"] as const;

const healthChapter = ref("");
const healthRevisionId = ref("");
const severityFilter = ref<(typeof SEVERITIES)[number]>("ALL");
const health = ref<HealthResult | null>(null);
const healthLoading = ref(true);
const healthError = ref<string | null>(null);
const healthHistorical = ref(false);
const identityNotice = ref(false);
const expanded = ref<Record<string, boolean>>({});

const unresolvedRegister = ref<unknown[]>([]);
const unresolvedLoading = ref(true);
const unresolvedError = ref<string | null>(null);

const emit = defineEmits<{
  /** Author clicked "Go to" — the parent opens the target panel/section. */
  (e: "goto", target: { kind: string; id: string; rule: string }): void;
}>();

interface UnresolvedCard {
  title: string;
  detail: string;
  goto: { kind: string; id: string; rule: string } | null;
}

const KIND_LABELS: Record<string, string> = { character: "workspace.health.unresolved.kindCharacter", entity: "workspace.health.unresolved.kindEntity", timelineEvent: "workspace.health.unresolved.kindTimeline" };

const unresolvedItems = computed<UnresolvedCard[]>(() =>
  unresolvedRegister.value.map((raw) => {
    const ev = (raw as { evidence?: Array<{ kind?: string; id?: string; detail?: string }> }).evidence ?? [];
    const primary = ev[0] ?? {};
    const rule = String((raw as { rule?: string }).rule ?? "UNRESOLVED_IDENTITY");
    const kindKey = KIND_LABELS[String(primary.kind ?? "")];
    const title = kindKey
      ? `${t(kindKey)}${primary.id ? ` · ${primary.id.slice(0, 8)}` : ""}`
      : String(primary.id ?? rule);
    const detail = ev
      .map((e) => [e.kind, e.id, e.detail].filter(Boolean).join(" · "))
      .join("\n");
    const goto =
      primary.kind && primary.id
        ? { kind: String(primary.kind), id: String(primary.id), rule }
        : null;
    return { title, detail, goto };
  }),
);

function goToUnresolved(item: UnresolvedCard): void {
  if (item.goto) emit("goto", item.goto);
}

function identityCharacter(finding: EvidenceFinding): string | null {
  if (finding.rule !== "UNRESOLVED_IDENTITY") return null;
  return finding.evidence.find(evidence => evidence.kind === "character" && evidence.id)?.id ?? null;
}

async function identityLinked() {
  identityNotice.value = false;
  healthRevisionId.value = "";
  await Promise.all([loadHealth(), loadUnresolved()]);
  identityNotice.value = !healthError.value && !unresolvedError.value;
}

const filteredFindings = computed(() =>
  (health.value?.findings ?? []).filter(
    (f) => severityFilter.value === "ALL" || f.severity === severityFilter.value,
  ),
);

function severityClass(s: string): string {
  if (s === "CRITICAL") return "text-nf-warn";
  if (s === "WARNING") return "text-nf-warn";
  return "text-nf-ok";
}

function findingKey(f: EvidenceFinding): string {
  return `${f.rule}:${f.sourceRevisionId}:${f.evidence.map(e => `${e.kind}:${e.id ?? ""}:${e.chapter ?? ""}:${e.order ?? ""}`).join("|")}`;
}

async function loadHealth() {
  healthLoading.value = true;
  healthError.value = null;
  try {
    const params = new URLSearchParams();
    const chapterRaw = healthChapter.value.trim();
    if (chapterRaw) {
      if (!/^\d+$/.test(chapterRaw) || Number(chapterRaw) < 1) {
        healthError.value = t("workspace.health.findings.chapterInvalid");
        healthLoading.value = false;
        return;
      }
      params.set("chapter", chapterRaw);
    }
    const revisionRaw = healthRevisionId.value.trim();
    if (revisionRaw) params.set("revisionId", revisionRaw);
    const qs = params.toString();
    health.value = await api<HealthResult>(`${base()}/story-health${qs ? `?${qs}` : ""}`);
    healthHistorical.value = !!revisionRaw;
  } catch (e) {
    healthError.value = errorKey(e);
  } finally {
    healthLoading.value = false;
  }
}

async function loadUnresolved() {
  unresolvedLoading.value = true;
  unresolvedError.value = null;
  try {
    const result = await api<{ unresolved: unknown[] }>(`${base()}/story-health/unresolved`);
    unresolvedRegister.value = result.unresolved;
  } catch (e) {
    unresolvedError.value = errorKey(e);
  } finally {
    unresolvedLoading.value = false;
  }
}

// ---------- Memory ----------
interface MemoryScopeStatus {
  scope: string;
  freshness: string;
  sourceRevisionId: string | null;
  sourceRevisionNumber: number | null;
  headRevisionId: string | null;
  headRevisionNumber: number | null;
  chapterCoverage: string | null;
  lastError: string | null;
  attempts: number;
}

const statuses = ref<MemoryScopeStatus[]>([]);
const statusLoading = ref(true);
const statusError = ref<string | null>(null);

const rebuildScope = ref("");
const rebuildRevisionId = ref("");
const confirmingRebuild = ref(false);
const rebuildError = ref<string | null>(null);
const rebuildRunning = ref(false);
const rebuildAccepted = ref(false);

const asOfChapter = ref("");
const asOfRevisionId = ref("");
const asOfResult = ref<string | null>(null);
const asOfError = ref<string | null>(null);
const asOfLoading = ref(false);

async function loadStatus() {
  statusLoading.value = true;
  statusError.value = null;
  try {
    const result = await api<{ statuses: MemoryScopeStatus[] }>(`${base()}/memory/status`);
    statuses.value = result.statuses;
  } catch (e) {
    statusError.value = errorKey(e);
  } finally {
    statusLoading.value = false;
  }
}

async function rebuild() {
  rebuildError.value = null;
  rebuildAccepted.value = false;
  rebuildRunning.value = true;
  try {
    await api(`${base()}/memory/rebuild`, {
      method: "POST",
      body: JSON.stringify({
        ...(rebuildScope.value.trim() ? { scope: rebuildScope.value.trim() } : {}),
        ...(rebuildRevisionId.value.trim() ? { revisionId: rebuildRevisionId.value.trim() } : {}),
      }),
    });
    rebuildAccepted.value = true;
    confirmingRebuild.value = false;
    await loadStatus();
  } catch (e) {
    rebuildError.value = errorKey(e);
  } finally {
    rebuildRunning.value = false;
  }
}

async function loadAsOf() {
  asOfError.value = null;
  asOfResult.value = null;
  const params = new URLSearchParams();
  const chapterRaw = asOfChapter.value.trim();
  if (chapterRaw) {
    if (!/^\d+$/.test(chapterRaw) || Number(chapterRaw) < 1) {
      asOfError.value = t("workspace.health.memory.asOfChapterInvalid");
      return;
    }
    params.set("chapter", chapterRaw);
  }
  const revisionRaw = asOfRevisionId.value.trim();
  if (revisionRaw) params.set("revisionId", revisionRaw);
  if (!params.toString()) {
    asOfError.value = t("workspace.health.memory.asOfEmpty");
    return;
  }
  asOfLoading.value = true;
  try {
    const result = await api<unknown>(`${base()}/memory/as-of?${params.toString()}`);
    asOfResult.value = JSON.stringify(result, null, 2);
  } catch (e) {
    asOfError.value = errorKey(e);
  } finally {
    asOfLoading.value = false;
  }
}

onMounted(() => {
  loadHealth();
  loadUnresolved();
  loadStatus();
});
</script>

<template>
  <section :aria-label="t('workspace.health.panel.title')" class="flex flex-col gap-3">
    <div
      role="tablist"
      :aria-label="t('workspace.health.panel.title')"
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
        {{ t(`workspace.health.panel.tab${tabId === "health" ? "Health" : "Memory"}`) }}
      </button>
    </div>

    <!-- ================= HEALTH ================= -->
    <div v-if="active === 'health'" role="tabpanel" class="flex flex-col gap-3">
      <form class="flex flex-wrap items-end gap-2" @submit.prevent="loadHealth">
        <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
          {{ t("workspace.health.findings.chapterLabel") }}
          <input
            v-model="healthChapter"
            type="text"
            inputmode="numeric"
            class="w-28 rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
            :placeholder="t('workspace.health.findings.chapterOptional')"
          />
        </label>
        <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
          {{ t("workspace.health.findings.revisionIdLabel") }}
          <input
            v-model="healthRevisionId"
            type="text"
            class="w-56 rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 font-mono text-[12.5px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
            :placeholder="t('workspace.health.findings.revisionIdOptional')"
          />
        </label>
        <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
          {{ t("workspace.health.findings.severityFilterLabel") }}
          <select
            v-model="severityFilter"
            class="rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
          >
            <option v-for="s in SEVERITIES" :key="s" :value="s">
              {{ t(`workspace.health.findings.severity.${s}`) }}
            </option>
          </select>
        </label>
        <button
          type="submit"
          :disabled="healthLoading"
          class="rounded-lg bg-nf-accent px-4 py-2 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus disabled:opacity-50"
        >
          {{ t("workspace.health.findings.refresh") }}
        </button>
      </form>
      <p class="-mt-2 text-[11px] text-nf-text-faint">{{ t("workspace.health.findings.revisionIdHint") }}</p>
      <p v-if="healthLoading" class="text-[12.5px] text-nf-text-faint">
        {{ t("workspace.health.common.loading") }}
      </p>
      <p
        v-else-if="healthError"
        role="alert"
        class="rounded-lg border border-nf-warn/40 bg-nf-warn/10 px-3 py-2 text-[12.5px] text-nf-warn"
      >
        {{ healthError }}
      </p>

      <template v-else-if="health">
        <p class="font-mono text-[11px] text-nf-text-faint">
          {{ t("workspace.health.findings.sourceRevision", { revision: health.sourceRevisionId }) }}
        </p>
        <p v-if="!filteredFindings.length" class="text-[12.5px] text-nf-text-faint">
          {{ t("workspace.health.findings.noFindings") }}
        </p>
        <ul class="flex flex-col gap-2">
          <li
            v-for="f in filteredFindings"
            :key="findingKey(f)"
            class="rounded-lg border border-nf-border bg-nf-bg-2 px-3 py-2"
          >
            <div class="flex items-center gap-2">
              <p class="min-w-0 flex-1 text-[13px] font-medium text-nf-text">{{ identityCharacter(f) ? t('characterIdentity.finding') : f.rule }}</p>
              <span class="font-mono text-[11px] font-semibold" :class="severityClass(f.severity)">
                {{ t(`workspace.health.findings.severity.${f.severity}`) }}
              </span>
              <button
                class="rounded-md border border-nf-border-strong px-2.5 py-1 text-[12px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
                :aria-expanded="!!expanded[findingKey(f)]"
                @click="expanded[findingKey(f)] = !expanded[findingKey(f)]"
              >
                {{ t("workspace.health.findings.evidenceToggle") }}
              </button>
            </div>
            <template v-if="identityCharacter(f)">
              <p class="my-2 text-[12.5px] leading-relaxed text-nf-text-dim">{{ t('characterIdentity.explanation') }}</p>
              <CharacterIdentityLink v-if="!healthHistorical" :workspace-id="workspaceId" :novel-id="novelId" :character-id="identityCharacter(f)!" @linked="identityLinked" />
            </template>
            <div v-if="expanded[findingKey(f)]" class="mt-2 flex flex-col gap-2">
              <code v-if="identityCharacter(f)" class="text-[11px] text-nf-text-faint">{{ f.rule }}</code>
              <div>
                <p class="text-[11px] font-medium uppercase tracking-wide text-nf-text-faint">
                  {{ t("workspace.health.findings.evidenceTitle") }}
                </p>
                <ul class="mt-1 flex flex-col gap-1">
                  <li
                    v-for="(ev, j) in f.evidence"
                    :key="j"
                    class="rounded-md border border-nf-border bg-nf-bg-0 px-2.5 py-1.5 font-mono text-[11.5px] text-nf-text-dim"
                  >
                    <span class="text-nf-text">{{ ev.kind }}</span>
                    <span v-if="ev.id"> · {{ ev.id }}</span>
                    <span v-if="ev.chapter !== undefined"> · ch {{ ev.chapter }}</span>
                    <span v-if="ev.revisionId"> · {{ ev.revisionId }}</span>
                    <span v-if="ev.detail"> · {{ ev.detail }}</span>
                  </li>
                </ul>
              </div>
              <p v-if="f.remediation" class="text-[12.5px] text-nf-text-dim">
                <span class="text-[11px] font-medium uppercase tracking-wide text-nf-text-faint">
                  {{ t("workspace.health.findings.remediationTitle") }}:
                </span>
                {{ f.remediation }}
              </p>
            </div>
          </li>
        </ul>
      </template>

      <!-- Unresolved identities register -->
      <div class="flex flex-col gap-2">
        <p v-if="identityNotice" role="status" class="text-sm text-nf-ok">{{ t('characterIdentity.linked') }}</p>
        <div class="flex items-center justify-between">
          <h3 class="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-nf-text-faint">
            {{ t("workspace.health.unresolved.title") }}
          </h3>
          <button
            class="rounded-md border border-nf-border-strong px-2.5 py-1 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
            :disabled="unresolvedLoading"
            data-testid="unresolved-refresh"
            @click="loadUnresolved"
          >
            {{ t("workspace.health.unresolved.refresh") }}
          </button>
        </div>
        <p class="text-[12px] leading-relaxed text-nf-text-faint">
          {{ t("workspace.health.unresolved.about") }}
        </p>
        <p v-if="unresolvedLoading" class="text-[12.5px] text-nf-text-faint">
          {{ t("workspace.health.common.loading") }}
        </p>
        <p
          v-else-if="unresolvedError"
          role="alert"
          class="rounded-lg border border-nf-warn/40 bg-nf-warn/10 px-3 py-2 text-[12.5px] text-nf-warn"
        >
          {{ unresolvedError }}
        </p>
        <p v-else-if="!unresolvedRegister.length" class="text-[12.5px] text-nf-text-faint">
          {{ t("workspace.health.unresolved.empty") }}
        </p>
        <ul v-else class="flex max-h-64 flex-col gap-2 overflow-y-auto">
          <li
            v-for="(item, i) in unresolvedItems"
            :key="i"
            class="rounded-lg border border-nf-warn/40 bg-nf-warn-dim px-3 py-2"
            :data-testid="`unresolved-item-${i}`"
          >
            <div class="flex flex-wrap items-center gap-2">
              <p class="min-w-0 flex-1 truncate text-[13px] font-medium text-nf-text">
                {{ item.title }}
              </p>
              <button
                v-if="item.goto"
                type="button"
                class="rounded-md border border-nf-border-strong px-2.5 py-1 text-[12px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
                :data-testid="`unresolved-goto-${i}`"
                @click="goToUnresolved(item)"
              >
                {{ t("workspace.health.unresolved.goto") }}
              </button>
            </div>
            <template v-if="item.goto?.kind === 'character'">
              <p class="my-2 text-[12.5px] leading-relaxed text-nf-text-dim">{{ t('characterIdentity.explanation') }}</p>
              <CharacterIdentityLink :workspace-id="workspaceId" :novel-id="novelId" :character-id="item.goto.id" @linked="identityLinked" />
              <details class="mt-2 text-xs text-nf-text-dim"><summary class="cursor-pointer focus-visible:nf-focus">{{ t('run.technicalDetails') }}</summary><p class="mt-1 whitespace-pre-wrap break-words font-mono">{{ item.detail }}</p></details>
            </template>
            <p v-else class="mt-1 break-words font-mono text-[11.5px] text-nf-text-dim">{{ item.detail }}</p>
          </li>
        </ul>
      </div>
    </div>

    <!-- ================= MEMORY ================= -->
    <div v-else role="tabpanel" class="flex flex-col gap-4">
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <h3 class="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-nf-text-faint">
            {{ t("workspace.health.memory.statusTitle") }}
          </h3>
          <button
            class="rounded-md border border-nf-border-strong px-2.5 py-1 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
            :disabled="statusLoading"
            @click="loadStatus"
          >
            {{ t("workspace.health.memory.refresh") }}
          </button>
        </div>
        <p v-if="statusLoading" class="text-[12.5px] text-nf-text-faint">
          {{ t("workspace.health.common.loading") }}
        </p>
        <p
          v-else-if="statusError"
          role="alert"
          class="rounded-lg border border-nf-warn/40 bg-nf-warn/10 px-3 py-2 text-[12.5px] text-nf-warn"
        >
          {{ statusError }}
        </p>
        <p v-else-if="!statuses.length" class="text-[12.5px] text-nf-text-faint">
          {{ t("workspace.health.memory.noStatuses") }}
        </p>
        <ul v-else class="flex flex-col gap-2">
          <li
            v-for="s in statuses"
            :key="s.scope"
            class="rounded-lg border border-nf-border bg-nf-bg-2 px-3 py-2"
          >
            <p class="text-[13px] font-medium text-nf-text">
              {{ s.scope }}
              <span class="font-mono text-[11px]" :class="s.freshness === 'FRESH' ? 'text-nf-ok' : 'text-nf-warn'">
                {{ s.freshness }}
              </span>
            </p>
            <p class="mt-0.5 font-mono text-[11px] text-nf-text-faint">
              {{
                t("workspace.health.memory.scopeMeta", {
                  source: s.sourceRevisionNumber ?? "—",
                  head: s.headRevisionNumber ?? "—",
                  attempts: s.attempts,
                })
              }}
            </p>
            <p v-if="s.lastError" role="alert" class="mt-1 text-[12px] text-nf-warn">{{ s.lastError }}</p>
          </li>
        </ul>
      </div>

      <!-- Rebuild trigger -->
      <div class="flex flex-col gap-2">
        <h3 class="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-nf-text-faint">
          {{ t("workspace.health.memory.rebuildTitle") }}
        </h3>
        <div v-if="!confirmingRebuild" class="flex flex-wrap items-end gap-2">
          <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
            {{ t("workspace.health.memory.scopeLabel") }}
            <input
              v-model="rebuildScope"
              type="text"
              class="rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
              :placeholder="t('workspace.health.memory.scopeOptional')"
            />
          </label>
          <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
            {{ t("workspace.health.memory.rebuildRevisionIdLabel") }}
            <input
              v-model="rebuildRevisionId"
              type="text"
              class="w-56 rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 font-mono text-[12.5px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
              :placeholder="t('workspace.health.memory.rebuildRevisionIdOptional')"
            />
          </label>
          <button
            class="rounded-lg bg-nf-accent px-4 py-2 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus disabled:opacity-50"
            :disabled="rebuildRunning"
            @click="confirmingRebuild = true"
          >
            {{ t("workspace.health.memory.rebuildSubmit") }}
          </button>
        </div>
        <div
          v-else
          role="alertdialog"
          :aria-label="t('workspace.health.memory.rebuildConfirmTitle')"
          class="rounded-lg border border-nf-warn/40 bg-nf-warn/10 px-3 py-2"
        >
          <p class="text-[12.5px] text-nf-text">{{ t("workspace.health.memory.rebuildConfirm") }}</p>
          <div class="mt-2 flex gap-2">
            <button
              class="rounded-lg bg-nf-accent px-4 py-2 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus disabled:opacity-50"
              :disabled="rebuildRunning"
              @click="rebuild"
            >
              {{ t("workspace.common.confirm") }}
            </button>
            <button
              class="rounded-md border border-nf-border-strong px-2.5 py-1 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
              @click="confirmingRebuild = false"
            >
              {{ t("common.cancel") }}
            </button>
          </div>
        </div>
        <p v-if="rebuildAccepted" role="status" class="text-[12.5px] text-nf-ok">
          {{ t("workspace.health.memory.rebuildAccepted") }}
        </p>
        <p
          v-if="rebuildError"
          role="alert"
          class="rounded-md border border-nf-warn/40 bg-nf-warn/10 px-2.5 py-1.5 text-[12.5px] text-nf-warn"
        >
          {{ rebuildError }}
        </p>
      </div>

      <!-- As-of read -->
      <div class="flex flex-col gap-2">
        <h3 class="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-nf-text-faint">
          {{ t("workspace.health.memory.asOfTitle") }}
        </h3>
        <form class="flex flex-wrap items-end gap-2" @submit.prevent="loadAsOf">
          <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
            {{ t("workspace.health.memory.asOfChapterLabel") }}
            <input
              v-model="asOfChapter"
              type="text"
              inputmode="numeric"
              class="w-28 rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
            />
          </label>
          <label class="flex flex-col gap-1 text-[12px] text-nf-text-dim">
            {{ t("workspace.health.memory.asOfRevisionIdLabel") }}
            <input
              v-model="asOfRevisionId"
              type="text"
              class="w-56 rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 font-mono text-[12.5px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
            />
          </label>
          <button
            type="submit"
            :disabled="asOfLoading"
            class="rounded-md border border-nf-border-strong px-2.5 py-1.5 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus disabled:opacity-50"
          >
            {{ t("workspace.health.memory.asOfSubmit") }}
          </button>
        </form>
        <p
          v-if="asOfError"
          role="alert"
          class="rounded-md border border-nf-warn/40 bg-nf-warn/10 px-2.5 py-1.5 text-[12.5px] text-nf-warn"
        >
          {{ asOfError }}
        </p>
        <pre v-if="asOfResult" class="max-h-64 overflow-auto rounded-md border border-nf-border bg-nf-bg-0 p-2.5 font-mono text-[11.5px] text-nf-text-dim">{{ asOfResult }}</pre>
      </div>
    </div>
  </section>
</template>
