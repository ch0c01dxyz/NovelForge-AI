<template>
  <div>
    <div class="mb-3">
      <button
        v-if="!showForm"
        type="button"
        data-testid="edges-new"
        class="rounded-lg border border-nf-border-strong bg-nf-bg-3 px-4 py-2 text-[13px] font-semibold text-nf-text hover:bg-nf-bg-2 focus-visible:nf-focus"
        @click="showForm = true"
      >
        {{ t("workspace.timeline.edges.create") }}
      </button>
      <form
        v-else
        data-testid="edges-form"
        class="flex flex-col gap-3 rounded-xl border border-nf-border bg-nf-bg-1 p-4"
        @submit.prevent="submit"
      >
        <div>
          <label :for="`${uid}-cause`" class="mb-1 block text-[13px] font-medium text-nf-text">
            {{ t("workspace.timeline.edges.form.causeEventId") }}
          </label>
          <input
            :id="`${uid}-cause`"
            v-model="causeEventId"
            type="text"
            required
            class="w-full rounded-lg border border-nf-border bg-nf-bg-0 px-3 py-2 font-mono text-[13px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
          />
        </div>
        <div>
          <label :for="`${uid}-effect`" class="mb-1 block text-[13px] font-medium text-nf-text">
            {{ t("workspace.timeline.edges.form.effectEventId") }}
          </label>
          <input
            :id="`${uid}-effect`"
            v-model="effectEventId"
            type="text"
            required
            class="w-full rounded-lg border border-nf-border bg-nf-bg-0 px-3 py-2 font-mono text-[13px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
          />
        </div>
        <div>
          <label :for="`${uid}-confidence`" class="mb-1 block text-[13px] font-medium text-nf-text">
            {{ t("workspace.timeline.edges.form.confidence") }}
          </label>
          <select
            :id="`${uid}-confidence`"
            v-model="confidence"
            class="w-full rounded-lg border border-nf-border bg-nf-bg-0 px-3 py-2 text-[13px] text-nf-text focus-visible:nf-focus"
          >
            <option v-for="c in confidences" :key="c" :value="c">
              {{ t(`workspace.timeline.edges.confidence.${c}`) }}
            </option>
          </select>
        </div>
        <p class="text-[12px] text-nf-text-faint">
          {{ t("workspace.timeline.edges.form.escalationNote") }}
        </p>
        <p v-if="formError" role="alert" class="text-[13px] text-nf-warn">{{ formError }}</p>
        <div class="flex justify-end gap-2">
          <button
            type="button"
            class="rounded-lg border border-nf-border-strong px-4 py-2 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
            @click="resetForm"
          >
            {{ t("workspace.timeline.common.cancel") }}
          </button>
          <button
            type="submit"
            :disabled="saving"
            class="rounded-lg border border-nf-border-strong bg-nf-bg-3 px-4 py-2 text-[13px] font-semibold text-nf-text hover:bg-nf-bg-2 focus-visible:nf-focus disabled:opacity-50"
          >
            {{ saving ? t("workspace.timeline.common.saving") : t("workspace.timeline.common.create") }}
          </button>
        </div>
      </form>
    </div>

    <div v-if="loading" class="py-6 text-center text-[13px] text-nf-text-dim">
      {{ t("workspace.timeline.edges.loading") }}
    </div>
    <div v-else-if="loadError" role="alert" class="py-4 text-center">
      <p class="text-[13px] text-nf-warn">{{ loadError }}</p>
      <button
        type="button"
        class="mt-2 rounded-lg border border-nf-border-strong px-3 py-1.5 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
        @click="load"
      >
        {{ t("workspace.timeline.common.retry") }}
      </button>
    </div>
    <p v-else-if="edges.length === 0" class="py-6 text-center text-[13px] text-nf-text-faint">
      {{ t("workspace.timeline.edges.empty") }}
    </p>
    <ul v-else class="flex flex-col gap-2">
      <li
        v-for="edge in edges"
        :key="edge.id"
        data-testid="edge-item"
        class="rounded-xl border border-nf-border bg-nf-bg-1 p-3"
      >
        <p class="font-mono text-[12px] leading-relaxed text-nf-text">
          {{ edge.causeEventId }}
          <span class="text-nf-text-faint">→</span>
          {{ edge.effectEventId }}
        </p>
        <p class="mt-1 text-[12px] text-nf-text-dim">
          {{ t(`workspace.timeline.edges.confidence.${edge.confidence}`) }}
        </p>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
/**
 * CausalEdges (NF-WF-016): causal-edge list + creation form.
 * POST/GET .../story/causal-edges. Edge creation may escalate to
 * canon:approve server-side — a 403/409 surfaces through the shared
 * error mapping, honestly, without the UI guessing the cause.
 */
import { onMounted, ref } from "vue";
import { useApi } from "../../composables/useApi";
import { useLocale } from "../../composables/useLocale";
import { timelineErrorMessage } from "./workspaceApi";

const props = defineProps<{
  workspaceId: string;
  novelId: string;
}>();

interface CausalEdge {
  id: string;
  causeEventId: string;
  effectEventId: string;
  confidence: string;
}

const confidences = ["EXPLICIT", "INFERRED", "SPECULATIVE"] as const;

const { api } = useApi();
const { t } = useLocale();
const uid = `edges-${Math.random().toString(36).slice(2)}`;

const edges = ref<CausalEdge[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);
const showForm = ref(false);
const saving = ref(false);
const formError = ref<string | null>(null);
const causeEventId = ref("");
const effectEventId = ref("");
const confidence = ref<string>("EXPLICIT");

function base(): string {
  return `/workspaces/${props.workspaceId}/novels/${props.novelId}/story/causal-edges`;
}

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = null;
  try {
    edges.value = await api<CausalEdge[]>(base());
  } catch (e) {
    loadError.value = timelineErrorMessage(t, e);
  } finally {
    loading.value = false;
  }
}

function resetForm(): void {
  showForm.value = false;
  saving.value = false;
  formError.value = null;
  causeEventId.value = "";
  effectEventId.value = "";
  confidence.value = "EXPLICIT";
}

async function submit(): Promise<void> {
  formError.value = null;
  if (causeEventId.value.trim().length === 0 || effectEventId.value.trim().length === 0) {
    formError.value = t("workspace.timeline.common.fieldRequired");
    return;
  }
  saving.value = true;
  try {
    await api(base(), {
      method: "POST",
      body: JSON.stringify({
        causeEventId: causeEventId.value.trim(),
        effectEventId: effectEventId.value.trim(),
        confidence: confidence.value,
      }),
    });
    resetForm();
    await load();
  } catch (e) {
    formError.value = timelineErrorMessage(t, e);
  } finally {
    saving.value = false;
  }
}

onMounted(load);

</script>
