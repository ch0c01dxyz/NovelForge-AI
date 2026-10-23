<script setup lang="ts">
/**
 * NovelDiscoveryEditor (workspace management slice, 2026-10-18): author
 * controls for the reader-facing discovery metadata of ONE novel — genres
 * (max 5 canonical keys, labels mirrored in i18n `genre:`) and the target
 * audience rating. Saves through the capability-guarded member PATCH
 * routes; the server re-validates everything.
 */
import { computed, onMounted, onUnmounted, ref } from "vue";
import { ApiError, useApi } from "../../composables/useApi";
import { useLocale } from "../../composables/useLocale";

const props = defineProps<{
  workspaceId: string;
  novelId: string;
}>();

/** Mirrors apps/api/src/discovery/genres.ts GENRE_TAXONOMY (keys only). */
const GENRE_KEYS = [
  "fantasy",
  "high_fantasy",
  "urban_fantasy",
  "progression_fantasy",
  "xianxia",
  "wuxia",
  "litrpg",
  "science_fiction",
  "romance",
  "family",
  "action",
  "adventure",
  "mystery",
  "thriller",
  "horror",
  "historical",
  "apocalypse",
  "slice_of_life",
] as const;

const MAX_GENRES = 5;
const AUDIENCES = ["teen", "mature", "adult"] as const;

const { t } = useLocale();
const { api } = useApi();

const base = computed(
  () => `/workspaces/${props.workspaceId}/novels/${props.novelId}`,
);

const loading = ref(true);
const loadError = ref(false);
const genres = ref<string[]>([]);
const audience = ref<string | null>(null);
const coverUrl = ref<string | null>(null);
const publicSynopsis = ref("");
const savedPublicSynopsis = ref<string | null>(null);
const saveState = ref<"idle" | "saving" | "saved">("idle");
const errorKey = ref("");
let savedTimer: ReturnType<typeof setTimeout> | undefined;

onMounted(async () => {
  try {
    const novel = await api<{
      genres: string[];
      audience: string | null;
      coverUrl?: string;
    }>(base.value);
    genres.value = novel.genres ?? [];
    audience.value = novel.audience ?? null;
    coverUrl.value = novel.coverUrl ?? null;
    const details = await api<{ publicSynopsis: string | null }>(`${base.value}/reader-details`);
    publicSynopsis.value = details.publicSynopsis ?? "";
    savedPublicSynopsis.value = details.publicSynopsis ?? null;
  } catch {
    loadError.value = true;
  } finally {
    loading.value = false;
  }
});

function toggleGenre(key: string) {
  if (saveState.value === "saving") return;
  errorKey.value = "";
  if (genres.value.includes(key)) {
    genres.value = genres.value.filter((g) => g !== key);
    return;
  }
  if (genres.value.length >= MAX_GENRES) return;
  genres.value = [...genres.value, key];
}

const atCap = computed(() => genres.value.length >= MAX_GENRES);

function onAudienceInput(e: Event) {
  if (saveState.value === "saving") return;
  errorKey.value = "";
  const value = (e.target as HTMLSelectElement).value;
  audience.value = value === "" ? null : value;
}

async function save() {
  if (saveState.value === "saving") return;
  saveState.value = "saving";
  errorKey.value = "";
  clearTimeout(savedTimer);
  try {
    const [genreResult, audienceResult, synopsisResult] = await Promise.allSettled([
      api<{ genres: string[] }>(`${base.value}/genres`, {
        method: "PATCH",
        body: JSON.stringify({ genres: genres.value }),
      }),
      api<{ audience: string | null }>(`${base.value}/audience`, {
        method: "PATCH",
        body: JSON.stringify({ audience: audience.value }),
      }),
      api<{ publicSynopsis: string | null }>(`${base.value}/reader-details`, {
        method: "PATCH", body: JSON.stringify({ publicSynopsis: publicSynopsis.value, expectedPublicSynopsis: savedPublicSynopsis.value }),
      }),
    ]);
    if (synopsisResult.status === "fulfilled") {
      savedPublicSynopsis.value = synopsisResult.value.publicSynopsis ?? null;
      publicSynopsis.value = synopsisResult.value.publicSynopsis ?? "";
    }
    if (genreResult.status === "rejected") throw genreResult.reason;
    if (audienceResult.status === "rejected") throw audienceResult.reason;
    if (synopsisResult.status === "rejected") throw synopsisResult.reason;
    genres.value = genreResult.value.genres;
    audience.value = audienceResult.value.audience ?? null;
    saveState.value = "saved";
    savedTimer = setTimeout(() => (saveState.value = "idle"), 2500);
  } catch (e) {
    saveState.value = "idle";
    errorKey.value =
      e instanceof ApiError && e.status === 409 ? "publicNovel.synopsisChanged" : e instanceof ApiError && (e.status === 401 || e.status === 403)
        ? "workspace.discovery.forbidden"
        : "workspace.discovery.saveError";
  }
}

onUnmounted(() => {
  if (savedTimer) clearTimeout(savedTimer);
});
</script>

<template>
  <div :aria-busy="loading">
    <p v-if="loading" role="status" class="text-[13px] text-nf-text-faint">
      {{ t("common.loading") }}
    </p>
    <div v-else-if="loadError" role="alert">
      <p class="text-[13px] text-nf-warn">{{ t("workspace.discovery.loadError") }}</p>
      <button type="button" class="mt-2 underline focus-visible:nf-focus" @click="$router.go(0)">
        {{ t("common.retry") }}
      </button>
    </div>
    <template v-else>
      <img v-if="coverUrl" :src="coverUrl" alt="" class="mb-4 aspect-[2/3] w-32 rounded-lg border border-nf-border object-cover" />
      <label class="mb-5 block text-[13px] font-semibold text-nf-text">
        {{ t('publicNovel.publicSynopsis') }}
        <textarea v-model="publicSynopsis" data-testid="discovery-synopsis" :disabled="saveState === 'saving'" maxlength="6000" rows="6" class="nf-input mt-2 w-full font-normal" :placeholder="t('publicNovel.synopsisPlaceholder')" />
        <span class="mt-2 block text-xs font-normal leading-relaxed text-nf-text-dim">{{ t('publicNovel.synopsisHint') }}</span>
      </label>
      <fieldset :disabled="saveState === 'saving'">
        <legend class="text-[13px] font-semibold text-nf-text">
          {{ t("workspace.discovery.genresLabel") }}
        </legend>
        <p class="mt-1 text-[12px] text-nf-text-dim">
          {{ t("workspace.discovery.genresHint", { n: MAX_GENRES }) }}
        </p>
        <div class="mt-3 flex flex-wrap gap-2" data-testid="discovery-genre-chips">
          <button
            v-for="key in GENRE_KEYS"
            :key="key"
            type="button"
            :aria-pressed="genres.includes(key)"
            :disabled="!genres.includes(key) && atCap"
            :title="t(`genreDesc.${key}`)"
            class="rounded-full border px-3 py-1 text-[12.5px] focus-visible:nf-focus disabled:cursor-not-allowed disabled:opacity-40"
            :class="
              genres.includes(key)
                ? 'border-nf-accent bg-nf-accent-dim font-semibold text-nf-accent-hi'
                : 'border-nf-border-strong text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text'
            "
            :data-testid="`genre-chip-${key}`"
            :aria-label="t(`genre.${key}`)"
            @click="toggleGenre(key)"
          >
            {{ t(`genre.${key}`) }}
          </button>
        </div>
      </fieldset>

      <fieldset class="mt-5" :disabled="saveState === 'saving'">
        <legend class="text-[13px] font-semibold text-nf-text">
          {{ t("workspace.discovery.audienceLabel") }}
        </legend>
        <select
          :value="audience ?? ''"
          class="mt-2 block w-full rounded-lg border border-nf-border-strong bg-nf-bg-0 p-2.5 text-nf-text focus-visible:nf-focus"
          data-testid="discovery-audience"
          @change="onAudienceInput"
        >
          <option value="">{{ t("workspace.discovery.audienceNone") }}</option>
          <option v-for="a in AUDIENCES" :key="a" :value="a">{{ t(`audience.${a}`) }}</option>
        </select>
      </fieldset>

      <p
        v-if="errorKey"
        role="alert"
        class="mt-4 rounded-lg border border-nf-warn/40 bg-nf-warn/10 px-3 py-2 text-[13px] text-nf-warn"
        data-testid="discovery-error"
      >
        {{ t(errorKey) }}
      </p>

      <div class="mt-5 flex items-center gap-3">
        <button
          type="button"
          :disabled="saveState === 'saving'"
          class="rounded-lg bg-nf-accent px-4 py-1.5 text-[13px] font-semibold text-nf-accent-ink hover:opacity-90 focus-visible:nf-focus disabled:opacity-50"
          data-testid="discovery-save"
          @click="save"
        >
          {{ t("common.save") }}
        </button>
        <span
          v-if="saveState === 'saved'"
          role="status"
          class="text-[12.5px] text-nf-ok"
          data-testid="discovery-saved"
          >{{ t("common.saved") }}</span
        >
      </div>
    </template>
  </div>
</template>
