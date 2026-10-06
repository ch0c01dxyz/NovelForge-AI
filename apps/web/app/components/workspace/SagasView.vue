<template>
  <div>
    <div class="mb-3">
      <button
        v-if="!showForm"
        type="button"
        data-testid="sagas-new"
        class="rounded-lg border border-nf-border-strong bg-nf-bg-3 px-4 py-2 text-[13px] font-semibold text-nf-text hover:bg-nf-bg-2 focus-visible:nf-focus"
        @click="showForm = true"
      >
        {{ t("workspace.planning.sagas.create") }}
      </button>
      <form
        v-else
        data-testid="sagas-form"
        class="flex flex-col gap-3 rounded-xl border border-nf-border bg-nf-bg-1 p-4"
        @submit.prevent="submit"
      >
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label :for="`${uid}-kind`" class="mb-1 block text-[13px] font-medium text-nf-text">
              {{ t("workspace.planning.sagas.form.kind") }}
            </label>
            <select
              :id="`${uid}-kind`"
              v-model="kind"
              class="w-full rounded-lg border border-nf-border bg-nf-bg-0 px-3 py-2 text-[13px] text-nf-text focus-visible:nf-focus"
            >
              <option v-for="k in kinds" :key="k" :value="k">
                {{ t(`workspace.planning.sagas.kind.${k}`) }}
              </option>
            </select>
          </div>
          <div>
            <label :for="`${uid}-title`" class="mb-1 block text-[13px] font-medium text-nf-text">
              {{ t("workspace.planning.sagas.form.title") }}
            </label>
            <input
              :id="`${uid}-title`"
              v-model="title"
              type="text"
              required
              maxlength="300"
              class="w-full rounded-lg border border-nf-border bg-nf-bg-0 px-3 py-2 text-[13px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
            />
          </div>
        </div>
        <div>
          <label :for="`${uid}-parent`" class="mb-1 block text-[13px] font-medium text-nf-text">
            {{ t("workspace.planning.sagas.form.parent") }}
          </label>
          <select
            :id="`${uid}-parent`"
            v-model="parentId"
            class="w-full rounded-lg border border-nf-border bg-nf-bg-0 px-3 py-2 text-[13px] text-nf-text focus-visible:nf-focus"
          >
            <option value="">{{ t("workspace.planning.sagas.form.noParent") }}</option>
            <option v-for="saga in sagas" :key="saga.id" :value="saga.id">
              {{ saga.title }}
            </option>
          </select>
        </div>
        <div>
          <label :for="`${uid}-intent`" class="mb-1 block text-[13px] font-medium text-nf-text">
            {{ t("workspace.planning.sagas.form.intent") }}
          </label>
          <textarea
            :id="`${uid}-intent`"
            v-model="intent"
            rows="2"
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
      {{ t("workspace.planning.sagas.loading") }}
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
    <p v-else-if="sagas.length === 0" class="py-6 text-center text-[13px] text-nf-text-faint">
      {{ t("workspace.planning.sagas.empty") }}
    </p>
    <ul v-else class="flex flex-col gap-2">
      <li
        v-for="saga in sagas"
        :key="saga.id"
        data-testid="saga-item"
        class="rounded-xl border border-nf-border bg-nf-bg-1 p-3"
      >
        <div class="flex flex-wrap items-center gap-2">
          <p class="min-w-0 flex-1 text-[13px] font-semibold text-nf-text">{{ saga.title }}</p>
          <span class="rounded-full border border-nf-border-strong px-2 py-0.5 text-[11px] text-nf-text-dim">
            {{ t(`workspace.planning.sagas.kind.${saga.kind}`) }}
          </span>
          <button
            type="button"
            data-testid="saga-delete"
            class="rounded-lg border border-nf-border-strong px-2.5 py-1 text-[12.5px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
            @click="askDelete(saga)"
          >
            {{ t("workspace.planning.sagas.delete") }}
          </button>
        </div>
        <p v-if="saga.intent" class="mt-1 text-[13px] leading-relaxed text-nf-text-dim">
          {{ saga.intent }}
        </p>
      </li>
    </ul>

    <ConfirmDialog
      :open="confirm !== null"
      :title="confirm?.title ?? ''"
      :body="confirm?.body ?? ''"
      :confirm-label="confirm?.confirmLabel ?? ''"
      :cancel-label="t('workspace.planning.common.cancel')"
      :danger="true"
      @confirm="doConfirm"
      @cancel="confirm = null"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * SagasView (NF-WF-016): saga list/create/delete.
 * GET/POST .../planning/sagas, DELETE .../planning/sagas/:sagaId → 204.
 * Deletion requires explicit confirmation (Invariant 8).
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

interface Saga {
  id: string;
  kind: string;
  title: string;
  intent?: string | null;
}

interface PendingConfirm {
  title: string;
  body: string;
  confirmLabel: string;
  run: () => Promise<void>;
}

const kinds = ["SAGA", "ARC", "CHAPTER_GROUP"] as const;

const { api } = useApi();
const { t } = useLocale();
const uid = `sagas-${Math.random().toString(36).slice(2)}`;

const sagas = ref<Saga[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);
const showForm = ref(false);
const saving = ref(false);
const formError = ref<string | null>(null);
const kind = ref<string>("SAGA");
const title = ref("");
const parentId = ref("");
const intent = ref("");
const confirm = ref<PendingConfirm | null>(null);

function base(): string {
  return `/workspaces/${props.workspaceId}/novels/${props.novelId}/planning/sagas`;
}

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = null;
  try {
    sagas.value = await api<Saga[]>(base());
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
  kind.value = "SAGA";
  title.value = "";
  parentId.value = "";
  intent.value = "";
}

async function submit(): Promise<void> {
  formError.value = null;
  if (title.value.trim().length === 0) {
    formError.value = t("workspace.planning.common.fieldRequired");
    return;
  }
  saving.value = true;
  try {
    await api(base(), {
      method: "POST",
      body: JSON.stringify({
        kind: kind.value,
        title: title.value.trim(),
        parentId: parentId.value === "" ? null : parentId.value,
        intent: intent.value.trim() === "" ? null : intent.value.trim(),
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

function askDelete(saga: Saga): void {
  confirm.value = {
    title: t("workspace.planning.sagas.deleteConfirmTitle"),
    body: t("workspace.planning.sagas.deleteConfirmBody"),
    confirmLabel: t("workspace.planning.sagas.delete"),
    run: async () => {
      await api(`${base()}/${saga.id}`, { method: "DELETE" });
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
