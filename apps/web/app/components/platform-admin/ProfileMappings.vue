<script setup lang="ts">
/**
 * Profile mappings (NF-WF-018B): which model serves each model profile.
 * The profiles are the frozen ModelProfile enum values.
 */
import { ref, computed, watch, nextTick } from "vue";
import { useLocale } from "../../composables/useLocale";
import { usePagedList } from "../../composables/usePagedList";
import type {
  ModelView,
  ProfileMapping,
  PlatformModelCatalogOption,
} from "../../composables/usePlatformAdmin";
import AdminPager from "./AdminPager.vue";
import ConfirmDialog from "../workspace/ConfirmDialog.vue";
import ActionMenu from "../ui/ActionMenu.vue";

const props = defineProps<{
  mappings: ProfileMapping[];
  models: ModelView[];
  catalog: PlatformModelCatalogOption[];
  catalogLoading?: boolean;
  catalogError?: string | null;
  profiles: readonly string[];
  loading: boolean;
  error: string | null;
  saving: boolean;
  actionError?: string | null;
}>();

const emit = defineEmits<{
  (e: "save", input: { profile: string; modelId: string; priority: number; enabled: boolean }): void;
  (e: "remove", mapping: ProfileMapping): void;
  (e: "reload-catalog"): void;
  (e: "profile-selected", profile: string): void;
  (e: "sync-image-models"): void;
}>();

const { t } = useLocale();

const profile = ref("");
watch(profile, (value, previous) => { if ((value === "IMAGE_GENERATOR") !== (previous === "IMAGE_GENERATOR")) modelId.value = ""; emit("profile-selected", value); });
const modelId = ref("");
const priority = ref(100);
const enabled = ref(true);

const modelQuery = ref("");const modelLimit = ref(100);const modelSearch = ref<HTMLInputElement | null>(null);
const filteredModels = computed(() => {
  const needle = modelQuery.value.trim().toLowerCase();
  return props.catalog.filter(model => `${model.displayName ?? ''} ${model.providerModelId} ${model.gatewayName} ${model.gatewayId}`.toLowerCase().includes(needle));
});
const visibleModels = computed(() => filteredModels.value.slice(0, modelLimit.value));
const selectedModel = computed(() => props.catalog.find(model => model.modelRef === modelId.value));
function catalogLabel(model: PlatformModelCatalogOption) { return `${model.displayName || model.providerModelId} · ${model.providerModelId} · ${model.gatewayName || model.gatewayId}`; }
watch(modelQuery, () => { modelLimit.value = 100; });
async function modelMenuToggle(event: Event) {
  const menu = event.target as HTMLDetailsElement;
  if (!menu.open) { modelQuery.value = "";return; }
  await nextTick();
  if (!menu.open) return;
  const bounds = menu.getBoundingClientRect();
  const above = bounds.top - 12, below = window.innerHeight - bounds.bottom - 12;
  const openAbove = below < 288 && above > below;
  menu.dataset.openAbove = String(openAbove);
  menu.style.setProperty("--nf-catalog-menu-height", `${Math.max(80, Math.min(288, openAbove ? above : below))}px`);
  modelSearch.value?.focus();
}
function chooseModel(id: string) { if (!props.saving && !props.catalogLoading && !props.catalogError) modelId.value = id; }
const pendingRemove = ref<ProfileMapping | null>(null);
watch(() => [props.mappings, props.saving], () => {
  if (pendingRemove.value && !props.saving && !props.mappings.some(m => m.profile === pendingRemove.value!.profile && m.modelRef === pendingRemove.value!.modelRef)) pendingRemove.value = null;
});
function modelLabel(mapping: ProfileMapping) {
  const model = props.models.find(m => m.id === mapping.modelRef);
  return model?.displayName ?? mapping.modelId;
}
function toggle(mapping: ProfileMapping) {
  if (props.saving || !mapping.modelRef) return;
  emit("save", { profile: mapping.profile, modelId: mapping.modelRef, priority: mapping.priority, enabled: !mapping.enabled });
}

function valid(): boolean {
  return props.profiles.includes(profile.value) && modelId.value.length > 0 && !!selectedModel.value && !props.catalogLoading && !props.catalogError;
}

function submit() {
  if (!valid() || props.saving) return;
  emit("save", {
    profile: profile.value,
    modelId: modelId.value,
    priority: priority.value,
    enabled: enabled.value,
  });
}

function profileLabel(p: string): string {
  const label = t(`platformAdmin.profiles.names.${p}`);
  return label === `platformAdmin.profiles.names.${p}` ? p : label;
}

const { query, page, pageCount, paged, total } = usePagedList<ProfileMapping>(
  () => props.mappings,
  (m, q) => `${profileLabel(m.profile)} ${m.profile} ${m.modelId}`.toLowerCase().includes(q),
);
</script>

<template>
  <section aria-labelledby="profiles-heading">
    <h2 id="profiles-heading" class="mb-1 text-[15px] font-semibold text-nf-text">
      {{ t("platformAdmin.profiles.heading") }}
    </h2>
    <p class="mb-3 text-[13px] text-nf-text-dim">{{ t("platformAdmin.profiles.description") }}</p>

    <div class="mb-3">
      <label class="text-[12px] font-semibold text-nf-text">
        {{ t("platformAdmin.search.label") }}
        <input
          v-model="query"
          type="search"
          class="ml-2 w-56 rounded-lg border border-nf-border bg-nf-bg-0 px-2 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
          :placeholder="t('platformAdmin.search.placeholder')"
          data-testid="profile-search"
        />
      </label>
    </div>

    <p v-if="loading" class="text-[13px] text-nf-text-dim">…</p>
    <p v-else-if="error" class="text-[13px] text-nf-warn" role="alert">{{ error }}</p>
    <p v-else-if="mappings.length > 0 && total === 0" class="text-[13px] text-nf-text-dim">
      {{ t("platformAdmin.search.noMatch") }}
    </p>
    <div v-else-if="mappings.length > 0" class="overflow-x-auto rounded-xl border border-nf-border">
      <table class="w-full text-left text-[13px]">
        <thead>
          <tr class="border-b border-nf-border bg-nf-bg-2 text-nf-text-dim">
            <th scope="col" class="px-3 py-2 font-semibold">{{ t("platformAdmin.profiles.profile") }}</th>
            <th scope="col" class="px-3 py-2 font-semibold">{{ t("platformAdmin.profiles.model") }}</th>
            <th scope="col" class="px-3 py-2 font-semibold">{{ t("platformAdmin.profiles.priority") }}</th>
            <th scope="col" class="px-3 py-2 font-semibold">{{ t("platformAdmin.profiles.enabled") }}</th>
            <th scope="col" class="px-3 py-2 font-semibold">{{ t("platformAdmin.profiles.actions") }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="m in paged"
            :key="`${m.profile}:${m.modelRef ?? `${m.gatewayId}:${m.modelId}`}`"
            class="border-b border-nf-border last:border-0"
          >
            <td class="px-3 py-2 font-semibold text-nf-text">{{ profileLabel(m.profile) }}</td>
            <td class="px-3 py-2 text-nf-text-dim">{{ modelLabel(m) }}<span class="mt-1 block text-[11px] text-nf-text-faint">{{ m.modelId }} · {{ m.gatewayId.slice(0, 8) }}</span></td>
            <td class="px-3 py-2 text-nf-text-dim">{{ m.priority }}</td>
            <td class="px-3 py-2 text-nf-text-dim">{{ m.enabled ? "✓" : "—" }}</td>
            <td class="px-3 py-2">
              <div class="flex flex-wrap gap-2">
                <button type="button" :disabled="saving || !m.modelRef" class="rounded-lg border border-nf-border-strong px-3 py-1.5 text-[12px] hover:bg-nf-bg-2 focus-visible:nf-focus disabled:opacity-50" @click="toggle(m)">{{ t(m.enabled ? 'platformAdmin.profiles.disable' : 'platformAdmin.profiles.enable') }}</button>
                <button type="button" :disabled="saving || !m.modelRef" class="rounded-lg border border-nf-error/40 px-3 py-1.5 text-[12px] text-nf-error hover:bg-nf-error/10 focus-visible:nf-focus disabled:opacity-50" @click="pendingRemove = m">{{ t('platformAdmin.profiles.remove') }}</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="text-[13px] text-nf-text-dim">{{ t('platformAdmin.profiles.empty') }}</p>
    <AdminPager
      :page="page"
      :page-count="pageCount"
      :total="total"
      @update:page="(p) => (page = p)"
    />

    <form
      class="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-nf-border bg-nf-bg-2 p-4 sm:grid-cols-2 md:grid-cols-5"
      @submit.prevent="submit"
    >
      <label class="block text-[12px] font-semibold text-nf-text">
        {{ t("platformAdmin.profiles.profile") }}
        <select
          v-model="profile"
          class="mt-1 w-full rounded-lg border border-nf-border bg-nf-bg-0 p-2 text-[13px] text-nf-text focus-visible:nf-focus"
          data-testid="profile-select"
        >
          <option value="">—</option>
          <option v-for="p in profiles" :key="p" :value="p">{{ profileLabel(p) }}</option>
        </select>
      </label>
      <div class="min-w-0 text-[12px] font-semibold text-nf-text">
        <p>{{ t("platformAdmin.profiles.model") }}</p>
        <ActionMenu :label="`${t('platformAdmin.profiles.model')}: ${selectedModel ? catalogLabel(selectedModel) : '—'}`" class="nf-profile-model-select mt-1 w-full" data-testid="profile-model-select" @toggle="modelMenuToggle">
          <template #trigger><span class="min-w-0 truncate">{{ selectedModel ? catalogLabel(selectedModel) : '—' }}</span></template>
          <div class="sticky top-0 z-10 bg-nf-bg-2 p-2">
            <input ref="modelSearch" v-model="modelQuery" type="search" :aria-label="t('modelPreference.search')" :placeholder="t('modelPreference.search')" class="w-full min-w-0 rounded-lg border border-nf-border-strong bg-nf-bg-0 px-3 py-2 text-[13px] font-normal focus-visible:nf-focus" @keydown.enter.prevent />
            <p role="status" class="mt-1 text-[11.5px] font-normal text-nf-text-faint">{{ t('platformAdmin.profiles.modelResultCount', { shown: visibleModels.length, count: filteredModels.length, total: catalog.length }) }}</p>
          </div>
          <button type="button" :disabled="saving || catalogLoading" @click="chooseModel('')">—</button>
          <button v-for="model in visibleModels" :key="JSON.stringify([model.gatewayId, model.providerModelId])" type="button" :data-model-id="model.modelRef" :aria-pressed="!!model.modelRef && modelId === model.modelRef" :disabled="saving || catalogLoading || !!catalogError || !model.modelRef" @click="model.modelRef && chooseModel(model.modelRef)">{{ catalogLabel(model) }}<span v-if="model.unavailableReason === 'NOT_SYNCED' || model.unavailableReason === 'MODEL_DISABLED'" class="block text-[11.5px]">{{ t(`modelPreference.reasons.${model.unavailableReason}`) }}</span></button>
          <p v-if="modelQuery.trim() && !filteredModels.length && !catalogLoading && !catalogError" class="px-3 py-2 text-[12px]">{{ t('modelPreference.noMatches') }}</p>
          <button v-if="visibleModels.length < filteredModels.length" type="button" @click.stop="modelLimit += 100">{{ t('modelPreference.showMore') }}</button>
        </ActionMenu>
        <p class="mt-2 text-[11.5px] font-normal text-nf-text-faint">{{ t('platformAdmin.profiles.catalogHint') }}</p>
        <button v-if="profile === 'IMAGE_GENERATOR'" type="button" :disabled="saving || catalogLoading" class="mt-2 rounded-lg border border-nf-border-strong px-3 py-2 text-xs focus-visible:nf-focus disabled:opacity-50" @click="emit('sync-image-models')">{{ t('platformAdmin.profiles.syncImages') }}</button>
        <p v-if="catalogLoading" role="status" class="mt-2 font-normal">{{ t('common.loading') }}</p>
        <div v-if="catalogError" role="alert" class="mt-2 font-normal text-nf-warn">{{ t('modelPreference.loadFailed') }}<button type="button" class="ml-1 rounded border border-nf-border px-2 py-1 focus-visible:nf-focus" :disabled="saving || catalogLoading" @click="emit('reload-catalog')">{{ t('common.retry') }}</button></div>
      </div>
      <label class="block text-[12px] font-semibold text-nf-text">
        {{ t("platformAdmin.profiles.priority") }}
        <input
          v-model.number="priority"
          type="number"
          min="0"
          max="10000"
          class="mt-1 w-full rounded-lg border border-nf-border bg-nf-bg-0 p-2 text-[13px] text-nf-text focus-visible:nf-focus"
        />
      </label>
      <label class="flex items-end gap-2 pb-2 text-[13px] text-nf-text">
        <input v-model="enabled" type="checkbox" class="focus-visible:nf-focus" />
        {{ t("platformAdmin.profiles.enabled") }}
      </label>
      <div class="flex items-end pb-0.5">
        <button
          type="submit"
          class="rounded-lg bg-nf-accent px-3.5 py-1.5 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus disabled:opacity-50"
          :disabled="!valid() || saving"
          data-testid="profile-save-button"
        >
          {{ saving ? t("platformAdmin.profiles.saving") : t("platformAdmin.profiles.save") }}
        </button>
      </div>
    </form>
    <ConfirmDialog :open="!!pendingRemove" :title="t('platformAdmin.profiles.remove')" :body="t('platformAdmin.profiles.removeConfirm', { model: pendingRemove ? modelLabel(pendingRemove) : '' })" :confirm-label="t('platformAdmin.profiles.remove')" :cancel-label="t('common.cancel')" :busy="saving" :error="actionError ?? undefined" danger @confirm="pendingRemove && !saving && emit('remove', pendingRemove)" @cancel="pendingRemove = null" />
  </section>
</template>

<style scoped>
.nf-profile-model-select :deep(summary) { width: 100%; justify-content: space-between; }
.nf-profile-model-select :deep(.nf-menu-panel) { left: 0; right: 0; width: 100%; min-width: 0; max-height: var(--nf-catalog-menu-height, 18rem); overflow-y: auto; }
.nf-profile-model-select[data-open-above="true"] :deep(.nf-menu-panel) { top: auto; bottom: calc(100% + 6px); }
.nf-profile-model-select :deep(.nf-menu-panel button) { white-space: normal; overflow-wrap: anywhere; }
</style>
