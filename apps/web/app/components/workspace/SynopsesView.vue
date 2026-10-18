<template>
  <div>
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <button
        v-if="!showForm"
        type="button"
        data-testid="synopses-new"
        class="rounded-lg border border-nf-border-strong bg-nf-bg-3 px-4 py-2 text-[13px] font-semibold text-nf-text hover:bg-nf-bg-2 focus-visible:nf-focus"
        @click="showForm = true"
      >
        {{ t("workspace.planning.synopses.create") }}
      </button>
      <label class="ml-auto flex items-center gap-2 text-[13px] text-nf-text-dim">
        <input
          v-model="includeArchived"
          type="checkbox"
          data-testid="synopses-include-archived"
          class="h-4 w-4 accent-nf-accent focus-visible:nf-focus"
          @change="load"
        />
        {{ t("workspace.planning.synopses.showArchived") }}
      </label>
    </div>

    <form
      v-if="showForm"
      data-testid="synopses-form"
      class="mb-3 flex flex-col gap-3 rounded-xl border border-nf-border bg-nf-bg-1 p-4"
      @submit.prevent="submit"
    >
      <div>
        <label :for="`${uid}-content`" class="mb-1 block text-[13px] font-medium text-nf-text">
          {{ t("workspace.planning.synopses.form.content") }}
        </label>
        <textarea
          :id="`${uid}-content`"
          v-model="content"
          rows="5"
          required
          maxlength="20000"
          class="w-full rounded-lg border border-nf-border bg-nf-bg-0 px-3 py-2 text-[13px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
          :placeholder="t('workspace.planning.synopses.form.contentPlaceholder')"
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

    <div v-if="loading" class="py-6 text-center text-[13px] text-nf-text-dim">
      {{ t("workspace.planning.synopses.loading") }}
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
    <p v-else-if="synopses.length === 0" class="py-6 text-center text-[13px] text-nf-text-faint">
      {{ t("workspace.planning.synopses.empty") }}
    </p>
    <ul v-else class="flex flex-col gap-2">
      <li
        v-for="synopsis in synopses"
        :key="synopsis.id"
        data-testid="synopsis-item"
        class="rounded-xl border border-nf-border bg-nf-bg-1 p-3"
      >
        <div class="flex items-center gap-2">
          <span
            v-if="synopsis.archived"
            class="rounded-full border border-nf-border-strong px-2 py-0.5 text-[11px] text-nf-text-dim"
          >
            {{ t("workspace.planning.synopses.archived") }}
          </span>
          <div class="ml-auto flex gap-1.5">
            <button
              v-if="!synopsis.archived"
              type="button"
              data-testid="synopsis-archive"
              class="rounded-lg border border-nf-border-strong px-2.5 py-1 text-[12.5px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
              @click="askArchive(synopsis)"
            >
              {{ t("workspace.planning.synopses.archive") }}
            </button>
            <button
              type="button"
              data-testid="synopsis-delete"
              class="rounded-lg border border-nf-border-strong px-2.5 py-1 text-[12.5px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
              @click="askDelete(synopsis)"
            >
              {{ t("workspace.planning.synopses.delete") }}
            </button>
          </div>
        </div>
        <p class="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-nf-text">
          {{ synopsis.content }}
        </p>
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
 * SynopsesView (NF-WF-016): synopsis list/create/archive/delete.
 * GET .../planning/synopses (includeArchived stringbool), POST
 * .../planning/synopses, POST .../:synopsisId/archive → 204,
 * DELETE .../:synopsisId → 204. Archive and delete both require
 * explicit confirmation (Invariant 8).
 */
import { onMounted, ref } from "vue";
import { useApi } from "../../composables/useApi";
import { useLocale } from "../../composables/useLocale";
import { planningErrorMessage } from "./workspaceApi";
import ConfirmDialog from "./ConfirmDialog.vue";

const props = defineProps<{
  workspaceId: string;
  novelId: string;
}>();

interface Synopsis {
  id: string;
  content?: string;
  archived?: boolean;
}

interface PendingConfirm {
  title: string;
  body: string;
  confirmLabel: string;
  danger: boolean;
  run: () => Promise<void>;
}

const { api } = useApi();
const { t } = useLocale();
const uid = `synopses-${Math.random().toString(36).slice(2)}`;

const synopses = ref<Synopsis[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);
const includeArchived = ref(false);
const showForm = ref(false);
const saving = ref(false);
const formError = ref<string | null>(null);
const content = ref("");
const confirm = ref<PendingConfirm | null>(null);

function base(): string {
  return `/workspaces/${props.workspaceId}/novels/${props.novelId}/planning/synopses`;
}

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = null;
  try {
    synopses.value = await api<Synopsis[]>(
      `${base()}?includeArchived=${includeArchived.value ? "true" : "false"}`,
    );
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
}

async function submit(): Promise<void> {
  formError.value = null;
  if (content.value.trim().length === 0) {
    formError.value = t("workspace.planning.common.fieldRequired");
    return;
  }
  saving.value = true;
  try {
    await api(base(), {
      method: "POST",
      body: JSON.stringify({ content: content.value.trim() }),
    });
    resetForm();
    await load();
  } catch (e) {
    formError.value = planningErrorMessage(t, e);
  } finally {
    saving.value = false;
  }
}

function askArchive(synopsis: Synopsis): void {
  confirm.value = {
    title: t("workspace.planning.synopses.archiveConfirmTitle"),
    body: t("workspace.planning.synopses.archiveConfirmBody"),
    confirmLabel: t("workspace.planning.synopses.archive"),
    danger: false,
    run: async () => {
      await api(`${base()}/${synopsis.id}/archive`, { method: "POST" });
      await load();
    },
  };
}

function askDelete(synopsis: Synopsis): void {
  confirm.value = {
    title: t("workspace.planning.synopses.deleteConfirmTitle"),
    body: t("workspace.planning.synopses.deleteConfirmBody"),
    confirmLabel: t("workspace.planning.synopses.delete"),
    danger: true,
    run: async () => {
      await api(`${base()}/${synopsis.id}`, { method: "DELETE" });
      await load();
    },
  };
}

async function doConfirm(): Promise<void> {
  const pending = confirm.value;
  confirm.value = null;
  if (!pending) return;
  try {
    await pending.run();
  } catch (e) {
    loadError.value = planningErrorMessage(t, e);
  }
}

onMounted(load);

</script>
