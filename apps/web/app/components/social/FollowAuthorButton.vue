<script setup lang="ts">
/**
 * Author-follow button for the public author page (NF-WF-019A).
 * Rendered only when a session exists; anonymous readers see the
 * follower count as static text. Optimistic UI with rollback;
 * `aria-pressed` reflects the follow state. Self-follow is refused by
 * the server (400 INVALID_INPUT) and rolls back here.
 */
import { useLocale } from "../../composables/useLocale";
import { useEngagement } from "../../composables/useEngagement";

const props = defineProps<{
  authorId: string;
  followingAuthor: boolean;
  followerCount: number;
}>();

const emit = defineEmits<{ failed: [] }>();

const { t } = useLocale();
const { setAuthorFollow } = useEngagement();

const followingState = ref(props.followingAuthor);
const countState = ref(props.followerCount);
const busy = ref(false);

watch(
  () => props.followingAuthor,
  (v) => (followingState.value = v),
);
watch(
  () => props.followerCount,
  (v) => (countState.value = v),
);

async function toggle(): Promise<void> {
  if (busy.value) return;
  const next = !followingState.value;
  const prevFollowing = followingState.value;
  const prevCount = countState.value;
  followingState.value = next;
  countState.value = prevCount + (next ? 1 : -1);
  busy.value = true;
  try {
    await setAuthorFollow(props.authorId, next);
  } catch {
    followingState.value = prevFollowing;
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
    :aria-pressed="followingState"
    :disabled="busy"
    class="inline-flex items-center gap-2 rounded-full border border-nf-border bg-nf-bg-1 px-4 py-1.5 text-sm text-nf-text-dim transition-colors hover:border-nf-border-strong hover:text-nf-text focus-visible:nf-focus disabled:opacity-60"
    :class="{ 'border-nf-accent text-nf-text': followingState }"
    @click="toggle"
  >
    <span aria-hidden="true">{{ followingState ? "✓" : "+" }}</span>
    <span>{{
      followingState ? t("social.followingAuthor") : t("social.followAuthor")
    }}</span>
    <span class="tabular-nums text-nf-text-faint" aria-label="Follower count">{{
      countState
    }}</span>
  </button>
</template>
