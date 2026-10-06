<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    data-testid="sim-create-dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="sim-create-title"
    @keydown.escape="$emit('close')"
  >
    <div class="w-full max-w-md rounded-xl border border-nf-border bg-nf-bg-1 p-6 shadow-nf-md">
      <h2 id="sim-create-title" class="text-[16px] font-semibold text-nf-text">
        {{ t("simulation.createTitle") }}
      </h2>
      <p class="mt-1 text-[13px] text-nf-text-dim">
        {{ t("simulation.createHint") }}
      </p>

      <form class="mt-4 space-y-4" @submit.prevent="onSubmit">
        <div>
          <label for="sim-create-branch" class="block text-[12px] font-medium text-nf-text-dim">
            {{ t("simulation.branch") }}
            <span class="text-nf-text-faint">({{ t("simulation.optional") }})</span>
          </label>
          <select
            id="sim-create-branch"
            v-model="branchId"
            data-testid="sim-create-branch"
            class="mt-1 w-full rounded-lg border border-nf-border-strong bg-nf-bg-2 px-3 py-2 text-[13px] text-nf-text focus-visible:nf-focus"
          >
            <option value="">{{ t("simulation.noBranch") }}</option>
            <option v-for="b in branches" :key="b.id" :value="b.id">
              {{ b.name }}
            </option>
          </select>
        </div>

        <div>
          <label for="sim-create-seed" class="block text-[12px] font-medium text-nf-text-dim">
            {{ t("simulation.seed") }}
            <span class="text-nf-text-faint">({{ t("simulation.optional") }})</span>
          </label>
          <input
            id="sim-create-seed"
            v-model="seed"
            type="text"
            maxlength="100"
            data-testid="sim-create-seed"
            :placeholder="t('simulation.seedPlaceholder')"
            class="mt-1 w-full rounded-lg border border-nf-border-strong bg-nf-bg-2 px-3 py-2 text-[13px] text-nf-text focus-visible:nf-focus"
          />
        </div>

        <div>
          <label for="sim-create-max-ticks" class="block text-[12px] font-medium text-nf-text-dim">
            {{ t("simulation.maxTicks") }}
          </label>
          <input
            id="sim-create-max-ticks"
            v-model.number="maxTicks"
            type="number"
            min="1"
            max="1000"
            data-testid="sim-create-max-ticks"
            class="mt-1 w-full rounded-lg border border-nf-border-strong bg-nf-bg-2 px-3 py-2 text-[13px] text-nf-text focus-visible:nf-focus"
          />
        </div>

        <p v-if="error" role="alert" class="text-[13px] text-red-300" data-testid="sim-create-error">
          {{ error }}
        </p>

        <div class="flex justify-end gap-2 pt-2">
          <button
            type="button"
            data-testid="sim-create-cancel"
            class="rounded-lg border border-nf-border-strong px-4 py-2 text-[13px] text-nf-text hover:bg-nf-bg-2 focus-visible:nf-focus"
            @click="$emit('close')"
          >
            {{ t("simulation.cancel") }}
          </button>
          <button
            type="submit"
            data-testid="sim-create-submit"
            :disabled="submitting"
            class="rounded-lg bg-nf-accent px-4 py-2 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus disabled:opacity-50"
          >
            {{ submitting ? t("simulation.creating") : t("simulation.create") }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * NF-WF-021D: Simulation run creation dialog.
 *
 * Branch picker (optional — omitted branchId means configure will 400
 * NO_BRANCH per 021A F3), seed, and tick limit. Emits `created` with the
 * new run id on success.
 */
import { ref, watch } from "vue";
import { useLocale } from "../../composables/useLocale";
import { useSimulationApi } from "./simulationApi";
import { ApiError } from "../../composables/useApi";

interface BranchOption {
  id: string;
  name: string;
}

const props = defineProps<{
  open: boolean;
  workspaceId: string;
  novelId: string;
  branches: BranchOption[];
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "created", runId: string): void;
}>();

const { t } = useLocale();
const simApi = useSimulationApi();

const branchId = ref("");
const seed = ref("");
const maxTicks = ref(100);
const submitting = ref(false);
const error = ref<string | null>(null);

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      branchId.value = "";
      seed.value = "";
      maxTicks.value = 100;
      error.value = null;
    }
  },
);

async function onSubmit() {
  submitting.value = true;
  error.value = null;
  try {
    const run = await simApi.createRun(props.workspaceId, props.novelId, {
      ...(branchId.value ? { branchId: branchId.value } : {}),
      scenario: {
        ...(seed.value ? { seed: seed.value } : {}),
        maxTicks: maxTicks.value,
      },
    });
    emit("created", run.id);
  } catch (e) {
    error.value =
      e instanceof ApiError
        ? (t(`simulation.errors.${e.code}`) !== `simulation.errors.${e.code}`
            ? t(`simulation.errors.${e.code}`)
            : e.code)
        : String(e);
  } finally {
    submitting.value = false;
  }
}
</script>
