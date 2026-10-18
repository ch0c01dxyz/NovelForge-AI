<template>
  <main class="mx-auto max-w-5xl space-y-6 px-4 py-6" data-testid="recovery-page">
    <header class="flex items-center justify-between gap-3">
      <h1 class="text-[22px] font-semibold text-nf-text">{{ t("recovery.title") }}</h1>
      <NuxtLink :to="base" class="text-[13px] text-nf-text-dim underline focus-visible:nf-focus">{{ t("recovery.backToWorkspace") }}</NuxtLink>
    </header>
    <p v-if="loading" role="status">{{ t("common.loading") }}</p>
    <div v-else-if="loadError" role="alert">
      <p>{{ t("recovery.pageLoadError") }}</p>
      <button type="button" class="mt-2 underline focus-visible:nf-focus" @click="refresh">{{ t("common.retry") }}</button>
    </div>
    <template v-else>
      <RecoveryCenter :key="`branches-${epoch}`" :workspace-id="workspaceId" :novel-id="novelId" @changed="refresh" />
      <section class="rounded-xl border border-nf-border bg-nf-bg-1 p-5" aria-labelledby="checkpoint-heading">
        <h2 id="checkpoint-heading" class="text-[16px] font-semibold text-nf-text">{{ t("recovery.checkpoints") }}</h2>
        <p class="mt-2 text-[13px] text-nf-text-dim">{{ t("recovery.checkoutOnly") }}</p>
        <form class="mt-3 flex flex-wrap items-end gap-3" @submit.prevent="createCheckpoint">
          <label class="block text-[13px] text-nf-text">
            {{ t("recovery.checkpointLabel") }}
            <input v-model="checkpointLabel" required maxlength="200" class="mt-1 block rounded-lg border border-nf-border-strong bg-nf-bg-2 px-3 py-2 focus-visible:nf-focus" />
          </label>
          <button type="submit" :disabled="creating || !checkedOut || !checkpointLabel.trim()" class="rounded-lg border border-nf-border-strong bg-nf-bg-3 px-4 py-2 text-[13px] focus-visible:nf-focus disabled:opacity-50">{{ t("recovery.createCheckpoint") }}</button>
        </form>
        <p v-if="createError" role="alert" class="mt-2 text-[13px] text-nf-error">{{ createError }}</p>
        <label class="mt-4 block text-[13px] text-nf-text">
          {{ t("recovery.selectCheckpoint") }}
          <select v-model="checkpointId" data-testid="recovery-checkpoint-select" class="mt-1 block w-full rounded-lg border border-nf-border-strong bg-nf-bg-2 px-3 py-2 focus-visible:nf-focus">
            <option value="">{{ t("recovery.selectCheckpoint") }}</option>
            <option v-for="checkpoint in checkpoints" :key="checkpoint.id" :value="checkpoint.id">{{ checkpoint.label }} — #{{ checkpoint.revisionNumber }}</option>
          </select>
        </label>
        <p v-if="!checkpoints.length" class="mt-2 text-[13px] text-nf-text-dim">{{ t("recovery.noCheckpoints") }}</p>
        <SelectiveRestorePanel v-if="checkpointId" :key="`${epoch}-${checkpointId}`" :workspace-id="workspaceId" :novel-id="novelId" :checkpoint-id="checkpointId" @applied="refresh" />
      </section>
      <section class="rounded-xl border border-nf-border bg-nf-bg-1 p-5" aria-labelledby="merge-heading">
        <h2 id="merge-heading" class="text-[16px] font-semibold text-nf-text">{{ t("recovery.mergePreview") }}</h2>
        <label class="mt-3 block text-[13px] text-nf-text">
          {{ t("recovery.mergeSource") }}
          <select v-model="sourceBranchId" data-testid="recovery-source-select" class="mt-1 block w-full rounded-lg border border-nf-border-strong bg-nf-bg-2 px-3 py-2 focus-visible:nf-focus">
            <option value="">{{ t("recovery.selectBranch") }}</option>
            <option v-for="branch in sources" :key="branch.id" :value="branch.id">{{ branch.name }}</option>
          </select>
        </label>
        <p class="my-3 text-[13px] text-nf-text-dim">{{ t("recovery.mergeTarget") }}: {{ checkedOut?.name ?? "—" }}</p>
        <MergePreview v-if="sourceBranchId && checkedOut" :key="`${epoch}-${sourceBranchId}-${checkedOut.id}`" :workspace-id="workspaceId" :novel-id="novelId" :source-branch-id="sourceBranchId" :target-branch-id="checkedOut.id" @applied="refresh" />
      </section>
      <RecoverableOperations v-if="checkedOut" :key="`operations-${epoch}`" :workspace-id="workspaceId" :novel-id="novelId" :checked-out-branch-name="checkedOut.name" @rolled-back="refresh" />
    </template>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useApi, ApiError } from "../../../../../composables/useApi";
import { useLocale } from "../../../../../composables/useLocale";
import RecoveryCenter from "../../../../../components/recovery/RecoveryCenter.vue";
import SelectiveRestorePanel from "../../../../../components/recovery/SelectiveRestorePanel.vue";
import MergePreview from "../../../../../components/recovery/MergePreview.vue";
import RecoverableOperations from "../../../../../components/recovery/RecoverableOperations.vue";

interface Branch { id: string; name: string; isCheckedOut: boolean; headRevisionId: string | null }
interface Checkpoint { id: string; label: string; revisionNumber: number }
const route = useRoute();
const { api } = useApi();
const { t } = useLocale();
const workspaceId = String(route.params.workspaceId ?? "");
const novelId = String(route.params.novelId ?? "");
const base = `/workspaces/${workspaceId}/novels/${novelId}`;
const branches = ref<Branch[]>([]);
const checkpoints = ref<Checkpoint[]>([]);
const checkedOut = computed(() => branches.value.find((branch) => branch.isCheckedOut));
const sources = computed(() => branches.value.filter((branch) => branch.id !== checkedOut.value?.id));
const checkpointId = ref("");
const sourceBranchId = ref("");
const checkpointLabel = ref("");
const loading = ref(true);
const loadError = ref(false);
const creating = ref(false);
const createError = ref("");
const epoch = ref(0);
let loadSeq = 0;

async function refresh() {
  const seq = ++loadSeq;
  loading.value = true;
  loadError.value = false;
  checkpointId.value = "";
  sourceBranchId.value = "";
  try {
    const result = await api<{ branches: Branch[] }>(`${base}/branches`);
    const current = result.branches.find((branch) => branch.isCheckedOut);
    const checkpointResult = current
      ? await api<{ checkpoints: Checkpoint[] }>(`${base}/checkpoints?branchId=${current.id}`)
      : { checkpoints: [] };
    if (seq !== loadSeq) return;
    branches.value = result.branches;
    checkpoints.value = checkpointResult.checkpoints;
    epoch.value++;
  } catch {
    if (seq === loadSeq) loadError.value = true;
  } finally {
    if (seq === loadSeq) loading.value = false;
  }
}

async function createCheckpoint() {
  if (creating.value || !checkedOut.value || !checkpointLabel.value.trim()) return;
  creating.value = true;
  createError.value = "";
  try {
    await api(`${base}/checkpoints`, { method: "POST", body: JSON.stringify({ label: checkpointLabel.value.trim(),
      branchId: checkedOut.value.id, expectedHeadRevisionId: checkedOut.value.headRevisionId }) });
    checkpointLabel.value = "";
    await refresh();
  } catch (error) {
    createError.value = error instanceof ApiError ? error.message : t("recovery.applyError");
  } finally {
    creating.value = false;
  }
}
onMounted(refresh);
</script>
