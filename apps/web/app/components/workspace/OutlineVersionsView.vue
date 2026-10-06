<template>
  <div>
    <div class="mb-3">
      <button
        v-if="!showForm"
        type="button"
        data-testid="versions-new"
        class="rounded-lg border border-nf-border-strong bg-nf-bg-3 px-4 py-2 text-[13px] font-semibold text-nf-text hover:bg-nf-bg-2 focus-visible:nf-focus"
        @click="showForm = true"
      >
        {{ t("workspace.planning.versions.create") }}
      </button>
      <form
        v-else
        data-testid="versions-form"
        class="flex flex-col gap-3 rounded-xl border border-nf-border bg-nf-bg-1 p-4"
        @submit.prevent="submit"
      >
        <div>
          <label :for="`${uid}-content`" class="mb-1 block text-[13px] font-medium text-nf-text">
            {{ t("workspace.planning.versions.form.content") }}
          </label>
          <textarea
            :id="`${uid}-content`"
            v-model="content"
            rows="5"
            required
            spellcheck="false"
            class="w-full rounded-lg border border-nf-border bg-nf-bg-0 px-3 py-2 font-mono text-[12.5px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
            :placeholder="t('workspace.planning.versions.form.contentPlaceholder')"
          />
          <p class="mt-1 text-[12px] text-nf-text-faint">
            {{ t("workspace.planning.versions.form.contentHint") }}
          </p>
        </div>
        <div>
          <label :for="`${uid}-note`" class="mb-1 block text-[13px] font-medium text-nf-text">
            {{ t("workspace.planning.versions.form.note") }}
          </label>
          <input
            :id="`${uid}-note`"
            v-model="note"
            type="text"
            maxlength="2000"
            class="w-full rounded-lg border border-nf-border bg-nf-bg-0 px-3 py-2 text-[13px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
          />
        </div>
        <p v-if="formError" role="alert" class="text-[13px] text-nf-warn">{{ formError }}</p>
        <div class="flex justify-end gap-2">
          <button
            type="button"
            class="rounded-lg border border-nf-border-strong px-4 py-2 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
            @click="resetForm"
          >
            {{ t("workspace.planning.common.cancel") }}
          </button>
          <button
            type="submit"
            :disabled="saving"
            class="rounded-lg border border-nf-border-strong bg-nf-bg-3 px-4 py-2 text-[13px] font-semibold text-nf-text hover:bg-nf-bg-2 focus-visible:nf-focus disabled:opacity-50"
          >
            {{ saving ? t("workspace.planning.common.saving") : t("workspace.planning.common.create") }}
          </button>
        </div>
      </form>
    </div>

    <div v-if="loading" class="py-6 text-center text-[13px] text-nf-text-dim">
      {{ t("workspace.planning.versions.loading") }}
    </div>
    <div v-else-if="loadError" role="alert" class="py-4 text-center">
      <p class="text-[13px] text-nf-warn">{{ loadError }}</p>
      <button
        type="button"
        class="mt-2 rounded-lg border border-nf-border-strong px-3 py-1.5 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
        @click="load"
      >
        {{ t("workspace.planning.common.retry") }}
      </button>
    </div>
    <p v-else-if="versions.length === 0" class="py-6 text-center text-[13px] text-nf-text-faint">
      {{ t("workspace.planning.versions.empty") }}
    </p>
    <ul v-else class="flex flex-col gap-3">
      <li
        v-for="version in versions"
        :key="version.id"
        data-testid="version-item"
        class="rounded-xl border border-nf-border bg-nf-bg-1 p-3"
      >
        <div class="flex flex-wrap items-center gap-2">
          <span class="rounded-full border border-nf-border-strong px-2 py-0.5 text-[11px] text-nf-text-dim">
            {{ t(`workspace.planning.versions.status.${version.status}`) }}
          </span>
          <span v-if="version.note" class="min-w-0 flex-1 truncate text-[13px] text-nf-text-dim">
            {{ version.note }}
          </span>
        </div>

        <!-- Approval decision: deliberately separated from outline-node
             editing. Approving a version is a canon:approve decision
             recorded with actor and timestamp — it is not an edit. -->
        <div
          data-testid="approval-decision"
          class="mt-3 rounded-lg border border-nf-ok/40 bg-nf-ok/5 p-3"
        >
          <p class="text-[13px] font-semibold text-nf-ok">
            {{ t("workspace.planning.versions.approval.heading") }}
          </p>
          <p class="mt-1 text-[12px] leading-relaxed text-nf-text-dim">
            {{ t("workspace.planning.versions.approval.body") }}
          </p>
          <div class="mt-2 flex flex-wrap gap-2">
            <button
              v-if="version.status === 'DRAFT'"
              type="button"
              data-testid="version-approve"
              :disabled="acting === version.id"
              class="rounded-lg border border-nf-ok/40 bg-nf-ok/10 px-3 py-1.5 text-[12.5px] font-semibold text-nf-ok hover:bg-nf-ok/20 focus-visible:nf-focus disabled:opacity-50"
              @click="askApprove(version)"
            >
              {{ t("workspace.planning.versions.approval.approve") }}
            </button>
            <button
              type="button"
              data-testid="version-supersede"
              :disabled="acting === version.id"
              class="rounded-lg border border-nf-border-strong px-3 py-1.5 text-[12.5px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus disabled:opacity-50"
              @click="askSupersede(version)"
            >
              {{ t("workspace.planning.versions.approval.supersede") }}
            </button>
          </div>
          <p v-if="actionError[version.id]" role="alert" class="mt-2 text-[12.5px] text-nf-warn">
            {{ actionError[version.id] }}
          </p>
        </div>
      </li>
    </ul>

    <ConfirmDialog
      :open="confirm !== null"
      :title="confirm?.title ?? ''"
      :body="confirm?.body ?? ''"
      :confirm-label="confirm?.confirmLabel ?? ''"
      :cancel-label="t('workspace.planning.common.cancel')"
      :danger="confirm?.danger ?? false"
      @confirm="doConfirm"
      @cancel="confirm = null"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * OutlineVersionsView (NF-WF-016): outline-version list/create, plus the
 * approval and supersede decisions.
 *
 * Contract Q5: approving an outline version is a canon:approve decision —
 * it is rendered VISUALLY SEPARATED from outline-node editing inside a
 * labelled "approval decision" region. The approve call omits
 * expectedHeadRevisionId entirely (tri-state); a 409 means a concurrent
 * approval landed first and the UI surfaces it as such.
 */
import { onMounted, ref } from "vue";
import { ApiError, useApi } from "../../composables/useApi";
import { useLocale } from "../../composables/useLocale";
import { planningErrorMessage } from "./workspaceApi";
import ConfirmDialog from "./ConfirmDialog.vue";

const props = defineProps<{
  workspaceId: string;
  novelId: string;
}>();

interface OutlineVersion {
  id: string;
  status: string;
  note?: string | null;
}

interface PendingConfirm {
  title: string;
  body: string;
  confirmLabel: string;
  danger: boolean;
  /** The version row the decision applies to (for error targeting). */
  versionId: string;
  run: () => Promise<void>;
}

const { api } = useApi();
const { t } = useLocale();
const uid = `versions-${Math.random().toString(36).slice(2)}`;

const versions = ref<OutlineVersion[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);
const showForm = ref(false);
const saving = ref(false);
const formError = ref<string | null>(null);
const content = ref("");
const note = ref("");
const confirm = ref<PendingConfirm | null>(null);
const actionError = ref<Record<string, string>>({});
const acting = ref<string | null>(null);

function base(): string {
  return `/workspaces/${props.workspaceId}/novels/${props.novelId}/planning/outline-versions`;
}

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = null;
  try {
    versions.value = await api<OutlineVersion[]>(base());
  } catch (e) {
    loadError.value = planningErrorMessage(t, e);
  } finally {
    loading.value = false;
  }
}

function resetForm(): void {
  showForm.value = false;
  saving.value = false;
  formError.value = null;
  content.value = "";
  note.value = "";
}

function parseContent(raw: string): unknown | "invalid" {
  const trimmed = raw.trim();
  if (trimmed === "") return "invalid";
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return "invalid";
    return parsed;
  } catch {
    return "invalid";
  }
}

async function submit(): Promise<void> {
  formError.value = null;
  const parsed = parseContent(content.value);
  if (parsed === "invalid") {
    formError.value = t("workspace.planning.versions.form.contentInvalid");
    return;
  }
  saving.value = true;
  try {
    await api(base(), {
      method: "POST",
      body: JSON.stringify({
        content: parsed,
        note: note.value.trim() === "" ? null : note.value.trim(),
      }),
    });
    resetForm();
    await load();
  } catch (e) {
    formError.value = planningErrorMessage(t, e);
  } finally {
    saving.value = false;
  }
}

function askApprove(version: OutlineVersion): void {
  confirm.value = {
    title: t("workspace.planning.versions.approval.approveConfirmTitle"),
    body: t("workspace.planning.versions.approval.approveConfirmBody"),
    confirmLabel: t("workspace.planning.versions.approval.approve"),
    danger: false,
    versionId: version.id,
    run: async () => {
      // Tri-state body: expectedHeadRevisionId omitted entirely.
      const updated = await api<OutlineVersion>(`${base()}/${version.id}/approve`, {
        method: "POST",
      });
      const idx = versions.value.findIndex((v) => v.id === version.id);
      if (idx >= 0) versions.value[idx] = updated;
    },
  };
}

function askSupersede(version: OutlineVersion): void {
  confirm.value = {
    title: t("workspace.planning.versions.approval.supersedeConfirmTitle"),
    body: t("workspace.planning.versions.approval.supersedeConfirmBody"),
    confirmLabel: t("workspace.planning.versions.approval.supersede"),
    danger: true,
    versionId: version.id,
    run: async () => {
      await api(`${base()}/supersede`, { method: "POST" });
      await load();
    },
  };
}

async function doConfirm(): Promise<void> {
  const pending = confirm.value;
  confirm.value = null;
  if (!pending) return;
  acting.value = pending.versionId;
  actionError.value[pending.versionId] = "";
  try {
    await pending.run();
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) {
      actionError.value[pending.versionId] = t(
        "workspace.planning.versions.approval.conflict",
      );
    } else {
      actionError.value[pending.versionId] = planningErrorMessage(t, e);
    }
  } finally {
    acting.value = null;
  }
}

onMounted(load);

</script>
