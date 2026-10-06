<template>
  <section
    aria-labelledby="recovery-title"
    class="rounded-xl border border-nf-border bg-nf-bg-1 p-5"
    data-testid="recovery-center"
  >
    <div class="flex items-center justify-between">
      <h2 id="recovery-title" class="text-[16px] font-semibold text-nf-text">
        {{ t("recovery.title") }}
      </h2>
      <button
        type="button"
        data-testid="recovery-create-open"
        class="rounded-lg border border-nf-border-strong bg-nf-bg-3 px-4 py-2 text-[13px] font-semibold text-nf-text hover:bg-nf-bg-2 focus-visible:nf-focus"
        @click="createOpen = true"
      >
        {{ t("recovery.createBranch") }}
      </button>
    </div>

    <p v-if="loadError" role="alert" class="mt-3 text-[13px] text-red-300" data-testid="recovery-load-error">
      {{ t("recovery.loadError") }}
    </p>

    <!-- Branch list -->
    <div class="mt-4" data-testid="recovery-branch-list">
      <p v-if="branches.length === 0 && !loading" class="text-[13px] text-nf-text-dim" data-testid="recovery-no-branches">
        {{ t("recovery.noBranches") }}
      </p>
      <ul :aria-label="t('recovery.branches')" class="list-none p-0 m-0">
        <li
          v-for="b in branches"
          :key="b.id"
          :data-testid="`recovery-branch-${b.id}`"
          class="mt-2 rounded-lg border border-nf-border bg-nf-bg-2 p-4"
        >
        <div class="flex items-center justify-between gap-3">
          <div class="min-w-0">
            <h3 class="flex items-center gap-2 text-[14px] font-semibold text-nf-text">
              <span class="truncate">{{ b.name }}</span>
              <span
                v-if="b.isCheckedOut"
                data-testid="recovery-checked-out-badge"
                class="rounded-full border border-nf-border-strong bg-nf-bg-3 px-2 py-0.5 text-[11px] font-medium text-nf-text-dim"
              >
                {{ t("recovery.checkedOut") }}
              </span>
            </h3>
            <dl class="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-nf-text-dim">
              <div class="flex gap-1">
                <dt>{{ t("recovery.headRevision") }}:</dt>
                <dd class="font-mono">#{{ b.headRevisionNumber ?? "—" }}</dd>
              </div>
              <div v-if="b.sourceRevisionId" class="flex gap-1">
                <dt>{{ t("recovery.forkPoint") }}:</dt>
                <dd class="font-mono">{{ b.sourceRevisionId.slice(0, 8) }}</dd>
              </div>
              <div class="flex gap-1">
                <dt>{{ t("recovery.updated") }}:</dt>
                <dd>{{ formatDate(b.updatedAt) }}</dd>
              </div>
            </dl>
          </div>
          <button
            v-if="!b.isCheckedOut"
            type="button"
            :data-testid="`recovery-switch-${b.id}`"
            :disabled="switchingId !== null"
            class="shrink-0 rounded-lg border border-nf-border-strong px-3 py-1.5 text-[13px] text-nf-text hover:bg-nf-bg-3 focus-visible:nf-focus disabled:opacity-50"
            @click="onSwitch(b)"
          >
            {{ switchingId === b.id ? t("recovery.switching") : t("recovery.switchTo") }}
          </button>
        </div>

        <!-- Per-branch timeline -->
        <div v-if="expandedId === b.id" class="mt-3 border-t border-nf-border pt-3" data-testid="recovery-timeline">
          <h4 class="text-[13px] font-semibold text-nf-text">{{ t("recovery.timeline") }}</h4>
          <div class="mt-2 grid gap-4 md:grid-cols-2">
            <div>
              <h5 class="text-[12px] font-medium text-nf-text-dim">{{ t("recovery.revisions") }}</h5>
              <ul class="mt-1 space-y-1">
                <li v-if="timelineRevisions.length === 0" class="text-[12px] text-nf-text-dim">
                  {{ t("recovery.noRevisions") }}
                </li>
                <li
                  v-for="r in timelineRevisions"
                  :key="r.id"
                  class="flex items-baseline justify-between gap-2 text-[12px]"
                >
                  <span class="font-mono text-nf-text">#{{ r.number }} {{ r.origin }}</span>
                  <span class="truncate text-nf-text-dim">{{ r.message ?? "" }}</span>
                </li>
              </ul>
            </div>
            <div>
              <h5 class="text-[12px] font-medium text-nf-text-dim">{{ t("recovery.checkpoints") }}</h5>
              <ul class="mt-1 space-y-1">
                <li v-if="timelineCheckpoints.length === 0" class="text-[12px] text-nf-text-dim">
                  {{ t("recovery.noCheckpoints") }}
                </li>
                <li
                  v-for="c in timelineCheckpoints"
                  :key="c.id"
                  class="flex items-baseline justify-between gap-2 text-[12px]"
                >
                  <span class="text-nf-text">{{ c.label }}</span>
                  <span class="font-mono text-nf-text-dim">#{{ c.revisionNumber }}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <button
          type="button"
          :data-testid="`recovery-timeline-toggle-${b.id}`"
          class="mt-2 text-[12px] text-nf-text-dim underline hover:text-nf-text focus-visible:nf-focus"
          @click="toggleTimeline(b)"
        >
          {{ expandedId === b.id ? "▾" : "▸" }} {{ t("recovery.timeline") }}
        </button>
        </li>
      </ul>
    </div>

    <!-- Create dialog -->
    <div v-if="createOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
      <div class="absolute inset-0 bg-black/60" data-testid="recovery-create-backdrop" @click="createOpen = false" />
      <section
        role="dialog"
        aria-modal="true"
        :aria-label="t('recovery.createBranch')"
        data-testid="recovery-create-dialog"
        class="relative w-full max-w-md rounded-xl border border-nf-border-strong bg-nf-bg-1 p-5 shadow-nf-md"
      >
        <h3 class="text-[15px] font-semibold text-nf-text">{{ t("recovery.createBranch") }}</h3>
        <form @submit.prevent="onCreate">
          <label class="mt-3 block">
            <span class="text-[13px] text-nf-text-dim">{{ t("recovery.branchName") }}</span>
            <input
              v-model="newName"
              type="text"
              required
              maxlength="100"
              :placeholder="t('recovery.branchNamePlaceholder')"
              data-testid="recovery-create-name"
              class="mt-1 w-full rounded-lg border border-nf-border-strong bg-nf-bg-2 px-3 py-2 text-[13px] text-nf-text focus-visible:nf-focus"
            />
          </label>
          <p v-if="createError" role="alert" class="mt-2 text-[13px] text-red-300" data-testid="recovery-create-error">
            {{ createError }}
          </p>
          <div class="mt-4 flex justify-end gap-2">
            <button
              type="button"
              data-testid="recovery-create-cancel"
              class="rounded-lg border border-nf-border-strong px-4 py-2 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 focus-visible:nf-focus"
              @click="createOpen = false"
            >
              {{ t("recovery.cancel") }}
            </button>
            <button
              type="submit"
              :disabled="creating"
              data-testid="recovery-create-submit"
              class="rounded-lg border border-nf-border-strong bg-nf-bg-3 px-4 py-2 text-[13px] font-semibold text-nf-text hover:bg-nf-bg-2 focus-visible:nf-focus disabled:opacity-50"
            >
              {{ creating ? t("recovery.creating") : t("recovery.createBranch") }}
            </button>
          </div>
        </form>
      </section>
    </div>

    <!-- Switch confirm (dirty warning) -->
    <div v-if="switchTarget" class="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
      <div class="absolute inset-0 bg-black/60" data-testid="recovery-switch-backdrop" @click="switchTarget = null" />
      <section
        role="alertdialog"
        aria-modal="true"
        :aria-label="t('recovery.confirmSwitch')"
        data-testid="recovery-switch-dialog"
        class="relative w-full max-w-md rounded-xl border border-nf-border-strong bg-nf-bg-1 p-5 shadow-nf-md"
      >
        <h3 class="text-[15px] font-semibold text-nf-text">{{ t("recovery.confirmSwitch") }}: {{ switchTarget.name }}</h3>
        <p class="mt-2 text-[13px] text-nf-text-dim">{{ t("recovery.dirtyWarning") }}</p>
        <label class="mt-3 flex items-start gap-2 text-[13px] text-nf-text">
          <input v-model="autoCheckpoint" type="checkbox" data-testid="recovery-auto-checkpoint" class="mt-0.5" />
          <span>
            {{ t("recovery.autoCheckpoint") }}
            <span class="block text-[12px] text-nf-text-dim">{{ t("recovery.autoCheckpointHint") }}</span>
          </span>
        </label>
        <p v-if="switchError" role="alert" class="mt-2 text-[13px] text-red-300" data-testid="recovery-switch-error">
          {{ switchError }}
        </p>
        <div class="mt-4 flex justify-end gap-2">
          <button
            type="button"
            data-testid="recovery-switch-cancel"
            class="rounded-lg border border-nf-border-strong px-4 py-2 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 focus-visible:nf-focus"
            @click="switchTarget = null"
          >
            {{ t("recovery.cancel") }}
          </button>
          <button
            type="button"
            :disabled="switchingId !== null"
            data-testid="recovery-switch-confirm"
            class="rounded-lg border border-nf-border-strong bg-nf-bg-3 px-4 py-2 text-[13px] font-semibold text-nf-text hover:bg-nf-bg-2 focus-visible:nf-focus disabled:opacity-50"
            @click="doSwitch"
          >
            {{ switchingId ? t("recovery.switching") : t("recovery.confirmSwitch") }}
          </button>
        </div>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * RecoveryCenter (NF-WF-020B): branch list/create/switch + per-branch
 * timeline (revisions + checkpoints filtered by branch).
 *
 * Temporal model (Invariant 5): live tables always reflect the checked-out
 * branch. Switching restores the target head; a dirty checked-out branch
 * (live differs from its head snapshot) refuses with DIRTY_SWITCH unless
 * the author enables auto-checkpoint.
 *
 * §15 foundational design; en+id via useLocale(); axe-tested.
 */
import { onMounted, ref } from "vue";
import { useApi, ApiError } from "../../composables/useApi";
import { useLocale } from "../../composables/useLocale";

interface Branch {
  id: string;
  name: string;
  headRevisionId: string | null;
  headRevisionNumber: number | null;
  parentBranchId: string | null;
  sourceRevisionId: string | null;
  isCheckedOut: boolean;
  updatedAt: string;
}

interface RevisionRow {
  id: string;
  number: number;
  origin: string;
  message: string | null;
}

interface CheckpointRow {
  id: string;
  label: string;
  revisionNumber: number;
}

const props = defineProps<{
  workspaceId: string;
  novelId: string;
}>();

const { api } = useApi();
const { t } = useLocale();

const branches = ref<Branch[]>([]);
const loading = ref(true);
const loadError = ref(false);

const createOpen = ref(false);
const newName = ref("");
const creating = ref(false);
const createError = ref("");

const switchTarget = ref<Branch | null>(null);
const autoCheckpoint = ref(false);
const switchingId = ref<string | null>(null);
const switchError = ref("");

const expandedId = ref<string | null>(null);
const timelineRevisions = ref<RevisionRow[]>([]);
const timelineCheckpoints = ref<CheckpointRow[]>([]);

function base(): string {
  return `/workspaces/${props.workspaceId}/novels/${props.novelId}`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = false;
  try {
    const res = await api<{ branches: Branch[] }>(`${base()}/branches`);
    branches.value = res.branches;
  } catch {
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}

function mapBranchError(code: string): string {
  switch (code) {
    case "BRANCH_EXISTS":
      return t("recovery.duplicateName");
    case "INVALID_BRANCH_NAME":
      return t("recovery.invalidName");
    case "DIRTY_SWITCH":
      return t("recovery.dirtySwitchError");
    case "NOT_ON_MAIN_BRANCH":
      return t("recovery.notOnMainBranch");
    default:
      return code;
  }
}

async function onCreate(): Promise<void> {
  creating.value = true;
  createError.value = "";
  try {
    await api(`${base()}/branches`, {
      method: "POST",
      body: JSON.stringify({ name: newName.value.trim() }),
    });
    createOpen.value = false;
    newName.value = "";
    await load();
  } catch (e) {
    createError.value = e instanceof ApiError ? mapBranchError(e.code) : String(e);
  } finally {
    creating.value = false;
  }
}

function onSwitch(b: Branch): void {
  switchTarget.value = b;
  autoCheckpoint.value = false;
  switchError.value = "";
}

async function doSwitch(): Promise<void> {
  const target = switchTarget.value;
  if (!target) return;
  switchingId.value = target.id;
  switchError.value = "";
  try {
    await api(`${base()}/branches/${target.id}/switch`, {
      method: "POST",
      body: JSON.stringify({ autoCheckpoint: autoCheckpoint.value }),
    });
    switchTarget.value = null;
    await load();
  } catch (e) {
    if (e instanceof ApiError && e.code === "DIRTY_SWITCH" && !autoCheckpoint.value) {
      // Surface the dirty warning inline; the author can enable
      // auto-checkpoint and retry without reopening the dialog.
      switchError.value = t("recovery.dirtySwitchError");
    } else {
      switchError.value = e instanceof ApiError ? mapBranchError(e.code) : String(e);
    }
  } finally {
    switchingId.value = null;
  }
}

async function toggleTimeline(b: Branch): Promise<void> {
  if (expandedId.value === b.id) {
    expandedId.value = null;
    return;
  }
  expandedId.value = b.id;
  try {
    const [revs, cps] = await Promise.all([
      api<{ revisions: RevisionRow[] }>(`${base()}/revisions?branchId=${b.id}`),
      api<{ checkpoints: CheckpointRow[] }>(`${base()}/checkpoints?branchId=${b.id}`),
    ]);
    timelineRevisions.value = revs.revisions;
    timelineCheckpoints.value = cps.checkpoints;
  } catch {
    timelineRevisions.value = [];
    timelineCheckpoints.value = [];
  }
}

onMounted(load);
</script>
