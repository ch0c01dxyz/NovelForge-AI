<template>
  <div>
    <div v-if="loading" class="py-6 text-center text-[13px] text-nf-text-dim">
      {{ t("workspace.planning.horizon.loading") }}
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
    <div v-else>
      <div v-if="current === null" class="mb-3">
        <p class="py-4 text-center text-[13px] text-nf-text-faint">
          {{ t("workspace.planning.horizon.none") }}
        </p>
      </div>
      <div v-else class="mb-3 rounded-xl border border-nf-border bg-nf-bg-1 p-3">
        <p class="mb-1 text-[13px] font-medium text-nf-text">
          {{ t("workspace.planning.horizon.current") }}
        </p>
        <pre data-testid="horizon-current" class="max-h-64 overflow-auto whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-nf-text-dim">{{ pretty(current) }}</pre>
      </div>

      <form data-testid="horizon-form" class="flex flex-col gap-3" @submit.prevent="submit">
        <div>
          <label :for="`${uid}-policy`" class="mb-1 block text-[13px] font-medium text-nf-text">
            {{ t("workspace.planning.horizon.form.policy") }}
          </label>
          <textarea
            :id="`${uid}-policy`"
            v-model="policyText"
            rows="8"
            spellcheck="false"
            class="w-full rounded-lg border border-nf-border bg-nf-bg-0 px-3 py-2 font-mono text-[12.5px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
            :placeholder="t('workspace.planning.horizon.form.policyPlaceholder')"
          />
          <p class="mt-1 text-[12px] text-nf-text-faint">
            {{ t("workspace.planning.horizon.form.policyHint") }}
          </p>
        </div>
        <p v-if="formError" role="alert" class="text-[13px] text-nf-warn">{{ formError }}</p>
        <p v-if="saved" role="status" class="text-[13px] text-nf-ok">
          {{ t("workspace.planning.horizon.saved") }}
        </p>
        <div class="flex justify-end">
          <button
            type="submit"
            :disabled="saving"
            class="rounded-lg border border-nf-border-strong bg-nf-bg-3 px-4 py-2 text-[13px] font-semibold text-nf-text hover:bg-nf-bg-2 focus-visible:nf-focus disabled:opacity-50"
          >
            {{ saving ? t("workspace.planning.common.saving") : t("workspace.planning.horizon.save") }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * HorizonView (NF-WF-016): planning-horizon read/update.
 * GET .../planning/horizon → policy object or null; PUT with { policy }.
 * The policy is free-form JSON, so the editor is a JSON textarea with
 * parse-error handling — invalid JSON never reaches the server.
 */
import { onMounted, ref } from "vue";
import { useApi } from "../../composables/useApi";
import { useLocale } from "../../composables/useLocale";
import { planningErrorMessage } from "./workspaceApi";

const props = defineProps<{
  workspaceId: string;
  novelId: string;
}>();

const { api } = useApi();
const { t } = useLocale();
const uid = `horizon-${Math.random().toString(36).slice(2)}`;

const current = ref<unknown | null>(null);
const policyText = ref("");
const loading = ref(true);
const loadError = ref<string | null>(null);
const saving = ref(false);
const formError = ref<string | null>(null);
const saved = ref(false);

function base(): string {
  return `/workspaces/${props.workspaceId}/novels/${props.novelId}/planning/horizon`;
}

function pretty(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = null;
  try {
    current.value = await api<unknown>(base());
    policyText.value = current.value === null ? "" : pretty(current.value);
  } catch (e) {
    loadError.value = planningErrorMessage(t, e);
  } finally {
    loading.value = false;
  }
}

async function submit(): Promise<void> {
  formError.value = null;
  saved.value = false;
  const trimmed = policyText.value.trim();
  if (trimmed === "") {
    formError.value = t("workspace.planning.horizon.form.policyInvalid");
    return;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    formError.value = t("workspace.planning.horizon.form.policyInvalid");
    return;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    formError.value = t("workspace.planning.horizon.form.policyInvalid");
    return;
  }
  saving.value = true;
  try {
    current.value = await api<unknown>(base(), {
      method: "PUT",
      body: JSON.stringify({ policy: parsed }),
    });
    saved.value = true;
  } catch (e) {
    formError.value = planningErrorMessage(t, e);
  } finally {
    saving.value = false;
  }
}

onMounted(load);

</script>
