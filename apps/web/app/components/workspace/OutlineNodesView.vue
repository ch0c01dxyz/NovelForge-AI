<template>
  <div>
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <button
        v-if="!showForm"
        type="button"
        data-testid="nodes-new"
        class="rounded-lg border border-nf-border-strong bg-nf-bg-3 px-4 py-2 text-[13px] font-semibold text-nf-text hover:bg-nf-bg-2 focus-visible:nf-focus"
        @click="showForm = true"
      >
        {{ t("workspace.planning.nodes.create") }}
      </button>
      <label class="ml-auto flex items-center gap-2 text-[13px] text-nf-text-dim">
        {{ t("workspace.planning.nodes.filterSaga") }}
        <select
          v-model="sagaFilter"
          data-testid="nodes-saga-filter"
          class="rounded-lg border border-nf-border bg-nf-bg-0 px-2.5 py-1.5 text-[12.5px] text-nf-text focus-visible:nf-focus"
          @change="load"
        >
          <option value="">{{ t("workspace.planning.nodes.allSagas") }}</option>
          <option v-for="saga in sagas" :key="saga.id" :value="saga.id">
            {{ saga.title }}
          </option>
        </select>
      </label>
    </div>

    <form
      v-if="showForm"
      data-testid="nodes-form"
      class="mb-3 flex flex-col gap-3 rounded-xl border border-nf-border bg-nf-bg-1 p-4"
      @submit.prevent="submit"
    >
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label :for="`${uid}-saga`" class="mb-1 block text-[13px] font-medium text-nf-text">
            {{ t("workspace.planning.nodes.form.saga") }}
          </label>
          <select
            :id="`${uid}-saga`"
            v-model="sagaId"
            required
            class="w-full rounded-lg border border-nf-border bg-nf-bg-0 px-3 py-2 text-[13px] text-nf-text focus-visible:nf-focus"
          >
            <option value="" disabled>{{ t("workspace.planning.nodes.form.sagaPlaceholder") }}</option>
            <option v-for="saga in sagas" :key="saga.id" :value="saga.id">
              {{ saga.title }}
            </option>
          </select>
        </div>
        <div>
          <label :for="`${uid}-kind`" class="mb-1 block text-[13px] font-medium text-nf-text">
            {{ t("workspace.planning.nodes.form.kind") }}
          </label>
          <select
            :id="`${uid}-kind`"
            v-model="kind"
            class="w-full rounded-lg border border-nf-border bg-nf-bg-0 px-3 py-2 text-[13px] text-nf-text focus-visible:nf-focus"
          >
            <option v-for="k in kinds" :key="k" :value="k">
              {{ t(`workspace.planning.nodes.kind.${k}`) }}
            </option>
          </select>
        </div>
      </div>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label :for="`${uid}-title`" class="mb-1 block text-[13px] font-medium text-nf-text">
            {{ t("workspace.planning.nodes.form.title") }}
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
        <div>
          <label :for="`${uid}-order`" class="mb-1 block text-[13px] font-medium text-nf-text">
            {{ t("workspace.planning.nodes.form.order") }}
          </label>
          <input
            :id="`${uid}-order`"
            v-model="order"
            type="text"
            inputmode="numeric"
            required
            class="w-full rounded-lg border border-nf-border bg-nf-bg-0 px-3 py-2 text-[13px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
          />
        </div>
      </div>
      <div>
        <label :for="`${uid}-summary`" class="mb-1 block text-[13px] font-medium text-nf-text">
          {{ t("workspace.planning.nodes.form.summary") }}
        </label>
        <textarea
          :id="`${uid}-summary`"
          v-model="summary"
          rows="2"
          maxlength="4000"
          class="w-full rounded-lg border border-nf-border bg-nf-bg-0 px-3 py-2 text-[13px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
        />
      </div>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label :for="`${uid}-chapter`" class="mb-1 block text-[13px] font-medium text-nf-text">
            {{ t("workspace.planning.nodes.form.chapterId") }}
          </label>
          <input
            :id="`${uid}-chapter`"
            v-model="chapterId"
            type="text"
            class="w-full rounded-lg border border-nf-border bg-nf-bg-0 px-3 py-2 text-[13px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
          />
        </div>
        <div>
          <label :for="`${uid}-scene`" class="mb-1 block text-[13px] font-medium text-nf-text">
            {{ t("workspace.planning.nodes.form.sceneId") }}
          </label>
          <input
            :id="`${uid}-scene`"
            v-model="sceneId"
            type="text"
            class="w-full rounded-lg border border-nf-border bg-nf-bg-0 px-3 py-2 text-[13px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
          />
        </div>
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
      {{ t("workspace.planning.nodes.loading") }}
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
    <p v-else-if="nodes.length === 0" class="py-6 text-center text-[13px] text-nf-text-faint">
      {{ t("workspace.planning.nodes.empty") }}
    </p>
    <ul v-else class="flex flex-col gap-2">
      <li
        v-for="node in nodes"
        :key="node.id"
        data-testid="node-item"
        class="rounded-xl border border-nf-border bg-nf-bg-1 p-3"
      >
        <div class="flex flex-wrap items-center gap-2">
          <p class="min-w-0 flex-1 text-[13px] font-semibold text-nf-text">{{ node.title }}</p>
          <span class="rounded-full border border-nf-border-strong px-2 py-0.5 text-[11px] text-nf-text-dim">
            {{ t(`workspace.planning.nodes.kind.${node.kind}`) }}
          </span>
          <span
            v-if="node.order !== undefined"
            class="rounded-full border border-nf-border-strong px-2 py-0.5 text-[11px] text-nf-text-dim"
          >
            {{ t("workspace.planning.nodes.orderLabel", { order: node.order }) }}
          </span>
          <button
            type="button"
            data-testid="node-delete"
            class="rounded-lg border border-nf-border-strong px-2.5 py-1 text-[12.5px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
            @click="askDelete(node)"
          >
            {{ t("workspace.planning.nodes.delete") }}
          </button>
        </div>
        <p v-if="node.summary" class="mt-1 text-[13px] leading-relaxed text-nf-text-dim">
          {{ node.summary }}
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
 * OutlineNodesView (NF-WF-016): outline-node list/create/delete, with a
 * saga filter (sagas come from GET .../planning/sagas).
 * POST/GET .../planning/outline-nodes, DELETE .../:outlineNodeId → 204.
 *
 * GAP-055 interplay: deleting a node a scene references is the existing
 * 015 path — the server refuses with 409 and the UI says so honestly
 * instead of hiding the case.
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
  title: string;
}

interface OutlineNode {
  id: string;
  kind: string;
  title: string;
  summary?: string | null;
  order?: number;
}

interface PendingConfirm {
  title: string;
  body: string;
  confirmLabel: string;
  run: () => Promise<void>;
}

const kinds = ["CHAPTER_GROUP", "CHAPTER", "SCENE"] as const;

const { api } = useApi();
const { t } = useLocale();
const uid = `nodes-${Math.random().toString(36).slice(2)}`;

const nodes = ref<OutlineNode[]>([]);
const sagas = ref<Saga[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);
const sagaFilter = ref("");
const showForm = ref(false);
const saving = ref(false);
const formError = ref<string | null>(null);
const sagaId = ref("");
const kind = ref<string>("CHAPTER");
const title = ref("");
const summary = ref("");
const order = ref("");
const chapterId = ref("");
const sceneId = ref("");
const confirm = ref<PendingConfirm | null>(null);

function base(): string {
  return `/workspaces/${props.workspaceId}/novels/${props.novelId}/planning/outline-nodes`;
}

async function loadSagas(): Promise<void> {
  sagas.value = await api<Saga[]>(
    `/workspaces/${props.workspaceId}/novels/${props.novelId}/planning/sagas`,
  );
}

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = null;
  try {
    const query = sagaFilter.value === "" ? "" : `?sagaId=${encodeURIComponent(sagaFilter.value)}`;
    nodes.value = await api<OutlineNode[]>(`${base()}${query}`);
  } catch (e) {
    loadError.value = planningErrorMessage(t, e);
  } finally {
    loading.value = false;
  }
}

async function init(): Promise<void> {
  try {
    await loadSagas();
  } catch (e) {
    loadError.value = planningErrorMessage(t, e);
    loading.value = false;
    return;
  }
  await load();
}

function parseOrder(raw: string): number | "invalid" {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return "invalid";
  const n = Number(trimmed);
  return n >= 0 && n <= 100000 ? n : "invalid";
}

function resetForm(): void {
  showForm.value = false;
  saving.value = false;
  formError.value = null;
  sagaId.value = "";
  kind.value = "CHAPTER";
  title.value = "";
  summary.value = "";
  order.value = "";
  chapterId.value = "";
  sceneId.value = "";
}

async function submit(): Promise<void> {
  formError.value = null;
  if (title.value.trim().length === 0 || sagaId.value === "") {
    formError.value = t("workspace.planning.common.fieldRequired");
    return;
  }
  const parsedOrder = parseOrder(order.value);
  if (parsedOrder === "invalid") {
    formError.value = t("workspace.planning.nodes.form.orderInvalid");
    return;
  }
  saving.value = true;
  try {
    await api(base(), {
      method: "POST",
      body: JSON.stringify({
        sagaId: sagaId.value,
        kind: kind.value,
        title: title.value.trim(),
        summary: summary.value.trim() === "" ? null : summary.value.trim(),
        order: parsedOrder,
        chapterId: chapterId.value.trim() === "" ? null : chapterId.value.trim(),
        sceneId: sceneId.value.trim() === "" ? null : sceneId.value.trim(),
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

function askDelete(node: OutlineNode): void {
  confirm.value = {
    title: t("workspace.planning.nodes.deleteConfirmTitle"),
    body: t("workspace.planning.nodes.deleteConfirmBody"),
    confirmLabel: t("workspace.planning.nodes.delete"),
    run: async () => {
      await api(`${base()}/${node.id}`, { method: "DELETE" });
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

onMounted(init);

</script>
