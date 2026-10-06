<!--
  NF-WF-022B: Legacy records list with kind filter.
  §15 design tokens; en+id via endgame.legacy.* keys.
-->
<template>
  <section
    aria-labelledby="legacy-list-title"
    class="rounded-xl border border-nf-border bg-nf-bg-1 p-5"
    data-testid="legacy-list"
  >
    <div class="flex items-center justify-between gap-3">
      <div>
        <h2 id="legacy-list-title" class="text-[16px] font-semibold text-nf-text">
          {{ t("endgame.legacy.title") }}
        </h2>
        <p class="mt-1 text-[12px] text-nf-text-dim">
          {{ t("endgame.legacy.subtitle") }}
        </p>
      </div>
      <button
        type="button"
        data-testid="legacy-create-open"
        class="rounded-lg border border-nf-border-strong bg-nf-bg-3 px-4 py-2 text-[13px] font-semibold text-nf-text hover:bg-nf-bg-2 focus-visible:nf-focus"
        @click="$emit('create')"
      >
        {{ t("endgame.legacy.create") }}
      </button>
    </div>

    <p v-if="loadError" role="alert" class="mt-3 text-[13px] text-red-300" data-testid="legacy-list-error">
      {{ t("endgame.legacy.listError") }}
    </p>

    <!-- Kind filter -->
    <div class="mt-4 flex flex-wrap items-center gap-2" role="group" :aria-label="t('endgame.legacy.kind')">
      <label class="text-[12px] text-nf-text-faint" for="legacy-kind-filter">
        {{ t("endgame.legacy.kind") }}
      </label>
      <select
        id="legacy-kind-filter"
        v-model="kindFilter"
        data-testid="legacy-kind-filter"
        class="rounded-lg border border-nf-border-strong bg-nf-bg-2 px-3 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
      >
        <option value="">{{ t("endgame.legacy.filterAll") }}</option>
        <option v-for="k in kinds" :key="k" :value="k">
          {{ t(`endgame.legacy.kindLabels.${k}`) }}
        </option>
      </select>
    </div>

    <div class="mt-4" data-testid="legacy-items">
      <p v-if="visible.length === 0 && !loading" class="text-[13px] text-nf-text-dim" data-testid="legacy-empty">
        {{ t("endgame.legacy.noLegacies") }}
      </p>
      <ul v-else :aria-label="t('endgame.legacy.title')" class="m-0 list-none p-0">
        <li
          v-for="lg in visible"
          :key="lg.id"
          :data-testid="`legacy-item-${lg.id}`"
          class="mt-2 rounded-lg border border-nf-border bg-nf-bg-2 p-4"
        >
          <div class="flex items-center gap-2">
            <span
              :data-testid="`legacy-kind-${lg.id}`"
              class="rounded-full border border-nf-border-strong px-2 py-0.5 text-[11px] font-medium text-nf-text"
            >
              {{ t(`endgame.legacy.kindLabels.${lg.kind}`) }}
            </span>
          </div>
          <p class="mt-2 text-[13px] text-nf-text">{{ lg.description }}</p>
          <p v-if="lg.subjectId" class="mt-1 font-mono text-[11px] text-nf-text-dim">
            {{ t("endgame.legacy.subject") }}: {{ lg.subjectId }}
          </p>
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useLocale } from "../../composables/useLocale";
import type { EndgameLegacyKind, EndgameLegacyShape } from "./endgameCallbackApi.ts";

defineEmits<{ (e: "create"): void }>();

const { t } = useLocale();

const props = defineProps<{
  legacies: EndgameLegacyShape[];
  loading: boolean;
  loadError: boolean;
}>();

const kinds: EndgameLegacyKind[] = ["CHARACTER", "WORLD", "THEMATIC"];
const kindFilter = ref<"" | EndgameLegacyKind>("");

const visible = computed(() =>
  kindFilter.value ? props.legacies.filter((l) => l.kind === kindFilter.value) : props.legacies,
);
</script>
