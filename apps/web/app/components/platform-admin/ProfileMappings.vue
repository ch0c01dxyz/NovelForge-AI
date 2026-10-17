<script setup lang="ts">
/**
 * Profile mappings (NF-WF-018B): which model serves each model profile.
 * The profiles are the frozen ModelProfile enum values.
 */
import { ref, computed } from "vue";
import { useLocale } from "../../composables/useLocale";
import { usePagedList } from "../../composables/usePagedList";
import type {
  ModelView,
  ProfileMapping,
} from "../../composables/usePlatformAdmin";
import AdminPager from "./AdminPager.vue";

const props = defineProps<{
  mappings: ProfileMapping[];
  models: ModelView[];
  profiles: string[];
  loading: boolean;
  error: string | null;
  saving: boolean;
}>();

const emit = defineEmits<{
  (e: "save", input: { profile: string; modelId: string; priority: number; enabled: boolean }): void;
}>();

const { t } = useLocale();

const profile = ref("");
const modelId = ref("");
const priority = ref(100);
const enabled = ref(true);

const enabledModels = computed(() => props.models.filter((m) => m.enabled));

function valid(): boolean {
  return profile.value.length > 0 && modelId.value.length > 0;
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
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="m in paged"
            :key="`${m.profile}:${m.modelId}`"
            class="border-b border-nf-border last:border-0"
          >
            <td class="px-3 py-2 font-semibold text-nf-text">{{ profileLabel(m.profile) }}</td>
            <td class="px-3 py-2 text-nf-text-dim">{{ m.modelId }}</td>
            <td class="px-3 py-2 text-nf-text-dim">{{ m.priority }}</td>
            <td class="px-3 py-2 text-nf-text-dim">{{ m.enabled ? "✓" : "—" }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <AdminPager
      :page="page"
      :page-count="pageCount"
      :total="total"
      @update:page="(p) => (page = p)"
    />

    <form
      class="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-nf-border bg-nf-bg-2 p-4 md:grid-cols-5"
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
      <label class="block text-[12px] font-semibold text-nf-text">
        {{ t("platformAdmin.profiles.model") }}
        <select
          v-model="modelId"
          class="mt-1 w-full rounded-lg border border-nf-border bg-nf-bg-0 p-2 text-[13px] text-nf-text focus-visible:nf-focus"
          data-testid="profile-model-select"
        >
          <option value="">—</option>
          <option v-for="m in enabledModels" :key="m.id" :value="m.id">
            {{ m.displayName ?? m.modelId }}
          </option>
        </select>
      </label>
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
  </section>
</template>
