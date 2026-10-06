<script setup lang="ts">
/**
 * Like button for the public chapter page (NF-WF-019A).
 *
 * Rendered only when a session exists (the page owns that check —
 * anonymous readers see the static count instead). Optimistic UI with
 * rollback on failure; `aria-pressed` reflects the like state. The
 * server enforces auth (401) and idempotency (repeat → 200 same
 * state); the UI never invents counts — it adjusts the last observed
 * aggregate by ±1 and re-syncs from `GET /api/reader/engagement` on
 * the next page load.
 */
import { useLocale } from "../../composables/useLocale";
import { useEngagement } from "../../composables/useEngagement";

const props = defineProps<{
  novelId: string;
  chapterNumber: number;
  liked: boolean;
  likeCount: number;
}>();

const emit = defineEmits<{ failed: [] }>();

const { t } = useLocale();
const { setLike } = useEngagement();

const likedState = ref(props.liked);
const countState = ref(props.likeCount);
const busy = ref(false);

watch(
  () => props.liked,
  (v) => (likedState.value = v),
);
watch(
  () => props.likeCount,
  (v) => (countState.value = v),
);

async function toggle(): Promise<void> {
  if (busy.value) return;
  const next = !likedState.value;
  const prevLiked = likedState.value;
  const prevCount = countState.value;
  likedState.value = next;
  countState.value = prevCount + (next ? 1 : -1);
  busy.value = true;
  try {
    await setLike(props.novelId, props.chapterNumber, next);
  } catch {
    likedState.value = prevLiked;
    countState.value = prevCount;
    emit("failed");
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <button
    type="button"
    :aria-pressed="likedState"
    :disabled="busy"
    class="inline-flex items-center gap-2 rounded-full border border-nf-border bg-nf-bg-1 px-4 py-1.5 text-sm text-nf-text-dim transition-colors hover:border-nf-border-strong hover:text-nf-text focus-visible:nf-focus disabled:opacity-60"
    :class="{ 'border-nf-accent text-nf-text': likedState }"
    @click="toggle"
  >
    <span aria-hidden="true">{{ likedState ? "♥" : "♡" }}</span>
    <span>{{ likedState ? t("social.liked") : t("social.like") }}</span>
    <span class="tabular-nums text-nf-text-faint" aria-label="Like count">{{
      countState
    }}</span>
  </button>
</template>
