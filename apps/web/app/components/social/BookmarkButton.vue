<script setup lang="ts">
/**
 * Bookmark button for the public novel page (NF-WF-019A).
 * Rendered only when a session exists; anonymous readers see no
 * affordance (Invariant 1 — server enforces, UI gating is progressive
 * enhancement). Optimistic UI with rollback on failure; `aria-pressed`
 * reflects the bookmark state.
 */
import { useLocale } from "../../composables/useLocale";
import { useEngagement } from "../../composables/useEngagement";

const props = defineProps<{
  novelId: string;
  bookmarked: boolean;
}>();

const emit = defineEmits<{ failed: [] }>();

const { t } = useLocale();
const { setBookmark } = useEngagement();

const bookmarkedState = ref(props.bookmarked);
const busy = ref(false);

watch(
  () => props.bookmarked,
  (v) => (bookmarkedState.value = v),
);

async function toggle(): Promise<void> {
  if (busy.value) return;
  const next = !bookmarkedState.value;
  const prev = bookmarkedState.value;
  bookmarkedState.value = next;
  busy.value = true;
  try {
    await setBookmark(props.novelId, next);
  } catch {
    bookmarkedState.value = prev;
    emit("failed");
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <button
    type="button"
    :aria-pressed="bookmarkedState"
    :disabled="busy"
    class="inline-flex items-center gap-2 rounded-full border border-nf-border bg-nf-bg-1 px-4 py-1.5 text-sm text-nf-text-dim transition-colors hover:border-nf-border-strong hover:text-nf-text focus-visible:nf-focus disabled:opacity-60"
    :class="{ 'border-nf-accent text-nf-text': bookmarkedState }"
    @click="toggle"
  >
    <span aria-hidden="true">{{ bookmarkedState ? "★" : "☆" }}</span>
    <span>{{ bookmarkedState ? t("social.bookmarked") : t("social.bookmark") }}</span>
  </button>
</template>
