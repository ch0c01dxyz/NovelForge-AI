<template>
  <section
    :aria-label="t('workspace.characters.list.title')"
    class="flex flex-col gap-3"
    data-testid="character-list"
  >
    <h3
      class="border-b border-nf-border pb-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-nf-text-faint"
    >
      {{ t("workspace.characters.list.title") }}
    </h3>

    <p v-if="loading" class="text-[12.5px] text-nf-text-faint">
      {{ t("workspace.characters.list.loading") }}
    </p>

    <div v-else-if="loadError" class="flex flex-col gap-2">
      <p role="alert" class="text-[12.5px] text-nf-warn">{{ loadError }}</p>
      <button
        type="button"
        class="self-start rounded-md border border-nf-border-strong px-2.5 py-1.5 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
        @click="emit('retry')"
      >
        {{ t("workspace.characters.common.retry") }}
      </button>
    </div>

    <template v-else>
      <p
        v-if="!characters.length"
        class="text-[12.5px] text-nf-text-faint"
        data-testid="character-list-empty"
      >
        {{ t("workspace.characters.list.empty") }}
      </p>
      <ul v-else class="flex max-h-[320px] flex-col gap-1.5 overflow-y-auto">
        <li v-for="c in characters" :key="c.id">
          <div
            class="rounded-lg border px-3 py-2"
            :class="
              selectedId === c.id
                ? 'border-nf-border-strong bg-nf-bg-3'
                : 'border-nf-border bg-nf-bg-2'
            "
          >
            <div class="flex items-center gap-2">
              <button
                type="button"
                :aria-label="t('workspace.characters.list.selectLabel', { name: c.name })"
                :aria-pressed="selectedId === c.id"
                :data-testid="`character-select-${c.id}`"
                class="min-w-0 flex-1 truncate text-left text-[13px] font-medium text-nf-text hover:underline focus-visible:nf-focus"
                @click="emit('select', c.id)"
              >
                {{ c.name }}
              </button>
              <span
                class="shrink-0 truncate font-mono text-[11px] text-nf-text-faint"
                :title="c.key"
              >
                {{ c.key }}
              </span>
              <button
                v-if="confirmingId !== c.id"
                type="button"
                :aria-label="t('workspace.characters.list.deleteAria', { name: c.name })"
                :data-testid="`character-delete-${c.id}`"
                class="shrink-0 rounded-md border border-nf-border-strong px-2 py-0.5 text-[12px] text-nf-text-dim hover:bg-nf-bg-3 hover:text-nf-warn focus-visible:nf-focus"
                @click="confirmingId = c.id"
              >
                {{ t("workspace.characters.list.deleteButton") }}
              </button>
            </div>

            <div
              v-if="confirmingId === c.id"
              class="mt-2 rounded-md border border-nf-warn/40 bg-nf-warn/10 px-2.5 py-2"
              role="group"
              :aria-label="t('workspace.characters.delete.confirmTitle')"
              :data-testid="`character-confirm-${c.id}`"
            >
              <p class="text-[12px] font-medium text-nf-warn">
                {{ t("workspace.characters.delete.confirmTitle") }}
              </p>
              <p class="mt-0.5 text-[12px] leading-relaxed text-nf-text-dim">
                {{ t("workspace.characters.delete.confirmBody", { name: c.name }) }}
              </p>
              <p
                v-if="deleteError"
                role="alert"
                class="mt-1 text-[12px] text-nf-warn"
              >
                {{ deleteError }}
              </p>
              <div class="mt-2 flex gap-2">
                <button
                  type="button"
                  :disabled="deleting"
                  :data-testid="`character-confirm-yes-${c.id}`"
                  class="rounded-md border border-nf-warn/50 px-2.5 py-1 text-[12.5px] font-semibold text-nf-warn hover:bg-nf-warn/10 focus-visible:nf-focus disabled:opacity-50"
                  @click="doDelete(c)"
                >
                  {{
                    deleting
                      ? t("workspace.characters.common.deleting")
                      : t("workspace.characters.delete.confirm")
                  }}
                </button>
                <button
                  type="button"
                  :disabled="deleting"
                  class="rounded-md border border-nf-border-strong px-2.5 py-1 text-[12.5px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus disabled:opacity-50"
                  @click="cancelConfirm"
                >
                  {{ t("workspace.characters.delete.cancel") }}
                </button>
              </div>
            </div>
          </div>
        </li>
      </ul>

      <form
        class="flex flex-col gap-2.5 rounded-lg border border-nf-border bg-nf-bg-1 p-3"
        data-testid="character-create-form"
        @submit.prevent="create"
      >
        <p class="text-[12px] font-semibold text-nf-text">
          {{ t("workspace.characters.form.title") }}
        </p>
        <div>
          <label
            :for="`${uid}-key`"
            class="mb-1 block text-[12px] font-medium text-nf-text-dim"
          >
            {{ t("workspace.characters.form.keyLabel") }}
          </label>
          <input
            :id="`${uid}-key`"
            v-model="key"
            type="text"
            autocomplete="off"
            spellcheck="false"
            maxlength="120"
            data-testid="character-key-input"
            class="w-full rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 font-mono text-[13px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
          />
          <p class="mt-0.5 text-[11.5px] text-nf-text-faint">
            {{ t("workspace.characters.form.keyHint") }}
          </p>
          <p
            v-if="fieldErrors.key"
            role="alert"
            class="mt-0.5 text-[12px] text-nf-warn"
          >
            {{ fieldErrors.key }}
          </p>
        </div>
        <div>
          <label
            :for="`${uid}-name`"
            class="mb-1 block text-[12px] font-medium text-nf-text-dim"
          >
            {{ t("workspace.characters.form.nameLabel") }}
          </label>
          <input
            :id="`${uid}-name`"
            v-model="name"
            type="text"
            maxlength="300"
            data-testid="character-name-input"
            class="w-full rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
          />
          <p
            v-if="fieldErrors.name"
            role="alert"
            class="mt-0.5 text-[12px] text-nf-warn"
          >
            {{ fieldErrors.name }}
          </p>
        </div>
        <div>
          <label
            :for="`${uid}-summary`"
            class="mb-1 block text-[12px] font-medium text-nf-text-dim"
          >
            {{ t("workspace.characters.form.summaryLabel") }}
          </label>
          <textarea
            :id="`${uid}-summary`"
            v-model="summary"
            rows="3"
            data-testid="character-summary-input"
            class="w-full rounded-md border border-nf-border-strong bg-nf-bg-0 px-2.5 py-1.5 text-[13px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
          />
          <p
            v-if="fieldErrors.summary"
            role="alert"
            class="mt-0.5 text-[12px] text-nf-warn"
          >
            {{ fieldErrors.summary }}
          </p>
        </div>
        <p v-if="submitError" role="alert" class="text-[12.5px] text-nf-warn">
          {{ submitError }}
        </p>
        <button
          type="submit"
          :disabled="creating"
          data-testid="character-create-submit"
          class="self-start rounded-lg bg-nf-accent px-3.5 py-2 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus disabled:opacity-50"
        >
          {{
            creating
              ? t("workspace.characters.form.creating")
              : t("workspace.characters.form.create")
          }}
        </button>
      </form>
    </template>
  </section>
</template>

<script setup lang="ts">
/**
 * Character list + create + delete (NF-WF-016, Invariant 1.1).
 *
 * Create validates the key format client-side before POSTing; delete is
 * a two-step explicit inline confirmation (destructive per Invariant 8).
 * There is deliberately no edit affordance: no character UPDATE route
 * exists (GAP-058), and the sheet says so.
 */
import { ref } from "vue";
import { useApi, ApiError } from "../../composables/useApi";
import { useLocale } from "../../composables/useLocale";
import type { WorkspaceCharacter } from "./CharacterPanel.vue";

const props = defineProps<{
  workspaceId: string;
  novelId: string;
  characters: WorkspaceCharacter[];
  loading: boolean;
  loadError: string | null;
  selectedId: string | null;
}>();

const emit = defineEmits<{
  (e: "select", id: string): void;
  (e: "created"): void;
  (e: "deleted", id: string): void;
  (e: "retry"): void;
}>();

const { t } = useLocale();
const { api } = useApi();

const uid = `charlist-${Math.random().toString(36).slice(2, 8)}`;
const KEY_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const key = ref("");
const name = ref("");
const summary = ref("");
const creating = ref(false);
const fieldErrors = ref<{ key?: string; name?: string; summary?: string }>({});
const submitError = ref<string | null>(null);

const confirmingId = ref<string | null>(null);
const deleting = ref(false);
const deleteError = ref<string | null>(null);

function apiErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return t("workspace.characters.error.unauthorized");
    if (err.status === 403) return t("workspace.characters.error.forbidden");
    if (err.status === 404) return t("workspace.characters.error.notFound");
    if (err.status === 409) return t("workspace.characters.error.conflict");
    if (err.status === 400) return t("workspace.characters.error.invalid");
    return t("workspace.characters.error.generic", { code: err.code });
  }
  return t("workspace.characters.error.generic", { code: "UNKNOWN" });
}

function validate(): boolean {
  const errors: { key?: string; name?: string; summary?: string } = {};
  const k = key.value.trim();
  if (!KEY_RE.test(k) || k.length > 120) {
    errors.key = t("workspace.characters.form.keyError");
  }
  const n = name.value.trim();
  if (!n || n.length > 300) {
    errors.name = t("workspace.characters.form.nameError");
  }
  if (summary.value.length > 20000) {
    errors.summary = t("workspace.characters.form.summaryError");
  }
  fieldErrors.value = errors;
  return Object.keys(errors).length === 0;
}

async function create() {
  submitError.value = null;
  if (!validate()) return;
  creating.value = true;
  try {
    await api(`/workspaces/${props.workspaceId}/novels/${props.novelId}/characters`, {
      method: "POST",
      body: JSON.stringify({
        key: key.value.trim(),
        name: name.value.trim(),
        summary: summary.value.trim() ? summary.value.trim() : null,
      }),
    });
    key.value = "";
    name.value = "";
    summary.value = "";
    fieldErrors.value = {};
    emit("created");
  } catch (err) {
    submitError.value = apiErrorMessage(err);
  } finally {
    creating.value = false;
  }
}

function cancelConfirm() {
  confirmingId.value = null;
  deleteError.value = null;
}

async function doDelete(c: WorkspaceCharacter) {
  deleteError.value = null;
  deleting.value = true;
  try {
    await api(
      `/workspaces/${props.workspaceId}/novels/${props.novelId}/characters/${c.id}`,
      { method: "DELETE" },
    );
    confirmingId.value = null;
    emit("deleted", c.id);
  } catch (err) {
    deleteError.value = apiErrorMessage(err);
  } finally {
    deleting.value = false;
  }
}
</script>
