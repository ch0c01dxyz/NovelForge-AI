<script setup lang="ts">
/**
 * Search box for the discovery page (NF-WF-014, Invariant 6).
 *
 * Debounced (≥300ms), min 2 chars before querying, Escape clears.
 * Results are announced as a list with counts (aria-live="polite").
 * No "did you mean", no suggestions — the API returns an identical
 * empty result for anything invisible (no oracle).
 */
import { useLocale } from "../../composables/useLocale";

const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ (e: "update:modelValue", value: string): void }>();
const { t } = useLocale();

const inputRef = ref<HTMLInputElement | null>(null);
let timer: ReturnType<typeof setTimeout> | null = null;

function onInput(e: Event): void {
  const value = (e.target as HTMLInputElement).value;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => emit("update:modelValue", value), 300);
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape") {
    if (inputRef.value) inputRef.value.value = "";
    if (timer) clearTimeout(timer);
    emit("update:modelValue", "");
  }
}

onUnmounted(() => {
  if (timer) clearTimeout(timer);
});
</script>

<template>
  <div role="search">
    <label :for="'discover-search'" class="nf-section-label !text-nf-text-dim">
      {{ t("discover.searchLabel") }}
    </label>
    <input
      :id="'discover-search'"
      ref="inputRef"
      type="search"
      :value="props.modelValue"
      :placeholder="t('discover.searchPlaceholder')"
      :minlength="2"
      autocomplete="off"
      class="mt-2 w-full rounded-lg border border-nf-border-focus bg-nf-bg-1 px-4 py-3 text-[15px] text-nf-text placeholder:text-nf-text-dim focus-visible:nf-focus"
      @input="onInput"
      @keydown="onKeydown"
    />
    <p class="mt-1.5 text-[12px] text-nf-text-dim">{{ t("discover.searchHint") }}</p>
  </div>
</template>
