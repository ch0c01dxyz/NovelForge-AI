<script setup lang="ts">
/**
 * WorkspaceManagerDialog (workspace management, 2026-10-18): create, rename
 * and delete workspaces from the author home. Deletion is OWNER-only and
 * blocked while the workspace still has novels (server-enforced; the UI
 * disables it with novelCount). Slugs are immutable identity — renames
 * change the display name only.
 *
 * Labels come from useLocale() keys; Escape dismisses; errors map the
 * typed 409 reasons to actionable en/id copy.
 */
import { computed, nextTick, onMounted, ref } from "vue";
import { ApiError, useApi } from "../../composables/useApi";
import { useLocale } from "../../composables/useLocale";
import ConfirmDialog from "../workspace/ConfirmDialog.vue";
import { trapDialogFocus } from "../../utils/trapDialogFocus";

interface WorkspaceRow {
  id: string;
  name: string;
  slug: string;
  role: string;
  canCreateNovel: boolean;
  canRename: boolean;
  canDelete: boolean;
  novelCount: number;
}

const emit = defineEmits<{ close: [] }>();
const { api } = useApi();
const { t } = useLocale();

const workspaces = ref<WorkspaceRow[]>([]);
const loading = ref(true);
const loadError = ref(false);
const busy = ref(false);
const ambiguous = ref(false);
const errorKey = ref("");

const newName = ref("");
const newSlug = ref("");
const slugTouched = ref(false);

const editingId = ref("");
const editName = ref("");
const deleteTarget = ref<WorkspaceRow | null>(null);
const nameInput = ref<HTMLInputElement | null>(null);
const heading = ref<HTMLElement | null>(null);
const dialog = ref<HTMLDialogElement | null>(null);

const validSlug = (value: string) =>
  value.length <= 80 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);

const createValid = computed(
  () =>
    !!newName.value.trim() &&
    newName.value.trim().length <= 120 &&
    validSlug(newSlug.value),
);
const editValid = computed(
  () => !!editName.value.trim() && editName.value.trim().length <= 120,
);

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function onNameInput() {
  if (!slugTouched.value) newSlug.value = slugify(newName.value);
}

async function load() {
  loading.value = true;
  loadError.value = false;
  try {
    workspaces.value = await api<WorkspaceRow[]>("/workspaces");
  } catch {
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  dialog.value?.showModal?.();
  void load();
  await nextTick();
  heading.value?.focus();
});

async function create() {
  if (busy.value || loading.value || loadError.value || ambiguous.value || !createValid.value) return;
  const name = newName.value.trim();
  const slug = newSlug.value;
  busy.value = true;
  errorKey.value = "";
  try {
    const ws = await api<{ id: string }>("/workspaces", {
      method: "POST",
      body: JSON.stringify({ name, slug }),
    });
    workspaces.value = [
      ...workspaces.value,
      {
        id: ws.id,
        name,
        slug,
        role: "OWNER",
        canCreateNovel: true,
        canRename: true,
        canDelete: true,
        novelCount: 0,
      },
    ];
    newName.value = "";
    newSlug.value = "";
    slugTouched.value = false;
  } catch (e) {
    handleError(e, "create");
  } finally {
    busy.value = false;
  }
}

function startRename(ws: WorkspaceRow) {
  if (busy.value || ambiguous.value) return;
  errorKey.value = "";
  editingId.value = ws.id;
  editName.value = ws.name;
  void nextTick(() => dialog.value?.querySelector<HTMLInputElement>('input[data-testid^="ws-rename-input-"]')?.focus());
}

async function saveRename(ws: WorkspaceRow) {
  if (busy.value || ambiguous.value || !editValid.value) return;
  busy.value = true;
  errorKey.value = "";
  try {
    const updated = await api<{ id: string; name: string; slug: string }>(
      `/workspaces/${ws.id}`,
      { method: "PATCH", body: JSON.stringify({ name: editName.value.trim() }) },
    );
    workspaces.value = workspaces.value.map((w) =>
      w.id === ws.id ? { ...w, name: updated.name, slug: updated.slug } : w,
    );
    editingId.value = "";
  } catch (e) {
    handleError(e, "rename");
  } finally {
    busy.value = false;
  }
}

async function remove() {
  const target = deleteTarget.value;
  if (busy.value || ambiguous.value || !target) return;
  busy.value = true;
  errorKey.value = "";
  try {
    await api(`/workspaces/${target.id}`, { method: "DELETE" });
    workspaces.value = workspaces.value.filter((w) => w.id !== target.id);
    deleteTarget.value = null;
  } catch (e) {
    handleError(e, "delete");
  } finally {
    busy.value = false;
  }
}

function handleError(e: unknown, action: "create" | "rename" | "delete") {
  ambiguous.value = !(e instanceof ApiError) || e.status >= 500;
  errorKey.value = ambiguous.value ? "authorHome.wsAmbiguous" : mapError(e, action);
  if (ambiguous.value) deleteTarget.value = null;
}

function mapError(e: unknown, action: string): string {
  if (e instanceof ApiError) {
    if (e.code === "WORKSPACE_NOT_EMPTY") return "authorHome.wsDeleteBlocked";
    if (e.code === "WORKSPACE_HAS_REFERENCED_HISTORY") return "authorHome.wsHistoryBlocked";
    if (e.status === 409 && action === "create") return "authorHome.wsSlugConflict";
    if (e.status === 401 || e.status === 403) return "authorHome.forbidden";
  }
  return "authorHome.wsError";
}

function onEscape() {
  if (!busy.value && !deleteTarget.value) emit("close");
}
</script>

<template>
  <dialog
    ref="dialog"
    class="m-auto w-full max-w-xl bg-transparent p-4 text-nf-text backdrop:bg-black/50"
    role="dialog"
    aria-modal="true"
    :aria-label="t('authorHome.wsManagerTitle')"
    @cancel.prevent="onEscape"
    @keydown="!deleteTarget && trapDialogFocus($event, dialog)"
  >
    <div
      class="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-nf-border bg-nf-bg-1 p-5 shadow-nf-lg"
    >
      <div class="flex items-start justify-between gap-3">
        <h3
          ref="heading"
          tabindex="-1"
          class="text-[15px] font-semibold text-nf-text focus-visible:nf-focus"
        >
          {{ t("authorHome.wsManagerTitle") }}
        </h3>
        <button
          type="button"
          class="rounded px-1 text-nf-text-dim hover:text-nf-text focus-visible:nf-focus"
          :aria-label="t('common.close')"
          data-testid="ws-close"
          :disabled="busy"
          @click="onEscape"
        >
          ✕
        </button>
      </div>

      <form class="mt-4" @submit.prevent="create">
        <fieldset :disabled="busy || loading || loadError || ambiguous">
        <h4 class="text-[13px] font-semibold text-nf-text">{{ t("authorHome.wsCreateTitle") }}</h4>
        <label class="mt-2 block text-[12.5px] text-nf-text-dim" for="ws-new-name">
          {{ t("authorHome.workspaceName") }}
        </label>
        <input
          id="ws-new-name"
          ref="nameInput"
          v-model="newName"
          type="text"
          maxlength="120"
          class="block w-full rounded-lg border border-nf-border-strong bg-nf-bg-0 p-2.5 text-nf-text focus-visible:nf-focus"
          data-testid="ws-new-name"
          @input="onNameInput"
        />
        <label class="mt-2 block text-[12.5px] text-nf-text-dim" for="ws-new-slug">
          {{ t("authorHome.workspaceSlug") }}
        </label>
        <input
          id="ws-new-slug"
          v-model="newSlug"
          type="text"
          maxlength="80"
          class="block w-full rounded-lg border border-nf-border-strong bg-nf-bg-0 p-2.5 font-mono text-[13px] text-nf-text focus-visible:nf-focus"
          data-testid="ws-new-slug"
          @input="slugTouched = true"
        />
        <p class="mt-1 text-[11.5px] text-nf-text-faint">{{ t("authorHome.slugHint") }}</p>
        <button
          type="submit"
          :disabled="busy || loading || loadError || ambiguous || !createValid"
          class="mt-3 rounded-lg bg-nf-accent px-3.5 py-1.5 text-[13px] font-semibold text-nf-accent-ink hover:opacity-90 focus-visible:nf-focus disabled:opacity-50"
          data-testid="ws-create"
        >
          {{ t("authorHome.wsCreate") }}
        </button>
        </fieldset>
      </form>

      <p v-if="loading" role="status" class="mt-5 text-[13px] text-nf-text-faint">
        {{ t("common.loading") }}
      </p>
      <div v-else-if="loadError" role="alert" class="mt-5">
        <p class="text-[13px] text-nf-warn">{{ t("authorHome.workspaceError") }}</p>
        <button type="button" class="mt-2 underline focus-visible:nf-focus" @click="load">
          {{ t("common.retry") }}
        </button>
      </div>
      <p
        v-else-if="!workspaces.length"
        class="mt-5 text-[13px] text-nf-text-dim"
        data-testid="ws-empty"
      >
        {{ t("authorHome.wsEmpty") }}
      </p>
      <ul v-else class="mt-5 flex flex-col gap-2" data-testid="ws-list">
        <li
          v-for="ws in workspaces"
          :key="ws.id"
          class="rounded-lg border border-nf-border bg-nf-bg-2 px-3 py-2.5"
          :data-testid="`ws-row-${ws.slug}`"
        >
          <div class="flex flex-wrap items-center gap-2">
            <template v-if="editingId === ws.id">
              <input
                v-model="editName"
                type="text"
                maxlength="120"
                :disabled="busy || ambiguous"
                :aria-label="t('authorHome.workspaceName')"
                class="min-w-0 flex-1 rounded-lg border border-nf-border-strong bg-nf-bg-0 p-2 text-[13px] text-nf-text focus-visible:nf-focus"
                :data-testid="`ws-rename-input-${ws.slug}`"
                @keydown.enter.prevent="saveRename(ws)"
              />
              <button
                type="button"
                :disabled="busy || ambiguous || !editValid"
                class="rounded-lg bg-nf-accent px-3 py-1.5 text-[12.5px] font-semibold text-nf-accent-ink hover:opacity-90 focus-visible:nf-focus disabled:opacity-50"
                :data-testid="`ws-rename-save-${ws.slug}`"
                @click="saveRename(ws)"
              >
                {{ t("common.save") }}
              </button>
              <button
                type="button"
                class="rounded-lg border border-nf-border-strong px-3 py-1.5 text-[12.5px] text-nf-text-dim hover:bg-nf-bg-3 focus-visible:nf-focus"
                :data-testid="`ws-rename-cancel-${ws.slug}`"
                :disabled="busy || ambiguous"
                @click="editingId = ''"
              >
                {{ t("common.cancel") }}
              </button>
            </template>
            <template v-else>
              <span class="min-w-0 break-words text-[13.5px] font-semibold text-nf-text">{{
                ws.name
              }}</span>
              <span
                class="ml-auto shrink-0 rounded-full border border-nf-border px-2 py-0.5 text-[11px] text-nf-text-dim"
                >{{ t("authorHome.wsNovelCount", { count: ws.novelCount }) }}</span
              >
              <button
                v-if="ws.canRename"
                type="button"
                class="rounded-lg border border-nf-border-strong px-3 py-1.5 text-[12.5px] text-nf-text-dim hover:bg-nf-bg-3 focus-visible:nf-focus"
                :data-testid="`ws-rename-${ws.slug}`"
                :disabled="busy || ambiguous"
                @click="startRename(ws)"
              >
                {{ t("authorHome.wsRename") }}
              </button>
              <button
                v-if="ws.canDelete"
                type="button"
                :disabled="busy || ambiguous || ws.novelCount > 0"
                :title="ws.novelCount > 0 ? t('authorHome.wsDeleteBlocked') : undefined"
                class="rounded-lg border border-nf-error/60 px-3 py-1.5 text-[12.5px] font-semibold text-nf-error hover:bg-nf-error/10 focus-visible:nf-focus disabled:cursor-not-allowed disabled:opacity-50"
                :data-testid="`ws-delete-${ws.slug}`"
                @click="errorKey = ''; deleteTarget = ws"
              >
                {{ t("authorHome.wsDelete") }}
              </button>
            </template>
          </div>
          <p class="mt-0.5 font-mono text-[11.5px] text-nf-text-faint">{{ ws.slug }}</p>
        </li>
      </ul>

      <p
        v-if="errorKey && !deleteTarget"
        role="alert"
        class="mt-3 rounded-lg border border-nf-warn/40 bg-nf-warn/10 px-3 py-2 text-[13px] text-nf-warn"
        data-testid="ws-error"
      >
        {{ t(errorKey) }}
      </p>
    </div>

    <ConfirmDialog
      :open="!!deleteTarget"
      :title="t('authorHome.wsDeleteConfirmTitle')"
      :body="t('authorHome.wsDeleteConfirm', { name: deleteTarget?.name ?? '' })"
      :confirm-label="t('authorHome.wsDelete')"
      :cancel-label="t('common.cancel')"
      danger
      :busy="busy"
      :error="errorKey ? t(errorKey) : ''"
      @confirm="remove"
      @cancel="!busy && (deleteTarget = null)"
    />
  </dialog>
</template>
