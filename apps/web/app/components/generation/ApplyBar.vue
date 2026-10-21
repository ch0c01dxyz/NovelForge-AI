<script setup lang="ts">
import { ref, computed, watch, onUnmounted, nextTick } from "vue";
/**
 * Apply bar (NF-WF-007 output #7): guarded manuscript apply.
 *
 * Invariant 6: Apply is DISABLED unless the run is SUCCEEDED, the
 * editor has no unsaved text, the chapter's current version still
 * equals the diff-pinned version, AND the chapter is not PUBLISHED
 * ("unpublish first" state — the two 409 CONFLICT paths are
 * indistinguishable by code). A 409 from the PUT enters the same
 * stale-source state; the UI MUST NOT refetch-and-resubmit
 * automatically. After a successful apply the run panel records
 * "Draft from run <id> applied to chapter v<n>".
 */
import { useLocale } from "../../composables/useLocale";
import { useApi, ApiError } from "../../composables/useApi";

const props = defineProps<{
  workspaceId: string;
  novelId: string;
  chapterId: string;
  chapterNumber: number;
  chapterStatus: string;
  currentVersion: number | null;
  diffPinnedVersion: number | null;
  saveState: "saved" | "dirty" | "saving" | "conflict";
  runStatus: string | null;
  runId: string | null;
  draftProse: string | null;
  draftTitle?: string | null;
  chapterTitle?: string;
}>();

const emit = defineEmits<{
  (e: "applied", version: number, title?: string): void;
  (e: "reload-rediff"): void;
  (e: "continue-next"): void;
}>();

const { t, locale } = useLocale();
const { api } = useApi();

const applying = ref(false);
const appliedVersion = ref<number | null>(null);
const appliedRunId = ref<string | null>(null);
const error = ref<string | null>(null);
const titleOnlyConflict = ref(false);
const allowTitleOnlyRebase = ref(false);
let scope = 0;
let mounted = true;
watch(() => [props.workspaceId, props.novelId, props.chapterId, props.runId], () => { scope++;appliedVersion.value = null;appliedRunId.value = null;error.value = null;titleOnlyConflict.value = false;allowTitleOnlyRebase.value = false; });
watch(() => [props.chapterTitle, props.diffPinnedVersion], () => { allowTitleOnlyRebase.value = false; });
onUnmounted(() => { mounted = false;scope++; });

const isPublished = computed(() => props.chapterStatus === "PUBLISHED");
const versionMoved = computed(
  () =>
    props.diffPinnedVersion !== null &&
    props.currentVersion !== null &&
    props.diffPinnedVersion !== props.currentVersion,
);

const blockReason = computed((): string | null => {
  if (props.runStatus !== "SUCCEEDED") return null; // bar hidden, not blocked
  if (isPublished.value) return t("apply.blockedPublished");
  if (props.saveState !== "saved") return t("apply.blockedDirty");
  if (versionMoved.value) return t("apply.blockedStale");
  if (props.draftTitle === null || (props.draftTitle !== undefined && (!props.draftTitle.trim() || props.draftTitle.length > 200 || !props.chapterTitle))) return t("chapterCreation.invalidTitle");
  return null;
});

const canApply = computed(
  () =>
    props.runStatus === "SUCCEEDED" &&
    props.draftProse !== null &&
    props.saveState === "saved" &&
    !versionMoved.value &&
    !isPublished.value &&
    (!titleOnlyConflict.value || allowTitleOnlyRebase.value) &&
    blockReason.value === null &&
    appliedRunId.value !== props.runId &&
    !applying.value,
);

async function apply() {
  if (!canApply.value || !props.draftProse) return;
  applying.value = true;
  const requestScope = scope;
  error.value = null;
  try {
    const result = await api<{ version: number; title?: string }>(
      `/workspaces/${props.workspaceId}/novels/${props.novelId}/chapters/${props.chapterId}`,
      {
        method: "PUT",
        body: JSON.stringify({
          content: props.draftProse,
          expectedVersion: props.diffPinnedVersion,
          ...(props.draftTitle !== undefined ? { title: props.draftTitle, expectedTitle: props.chapterTitle } : {}),
          ...(props.draftTitle !== undefined ? { creationRunId: props.runId } : {}),
          ...(titleOnlyConflict.value && allowTitleOnlyRebase.value ? { allowTitleOnlyRebase: true } : {}),
        }),
      },
    );
    if (!mounted || requestScope !== scope) return;
    appliedVersion.value = result.version;
    appliedRunId.value = props.runId;
    titleOnlyConflict.value = false;
    if (result.title !== undefined) emit("applied", result.version, result.title);
    else emit("applied", result.version);
  } catch (e) {
    if (!mounted || requestScope !== scope) return;
    if (e instanceof ApiError && e.status === 409) {
      // Stale version or published immutability — same stale-source
      // state; never auto-retry.
      titleOnlyConflict.value = e.code === "AI_CREATION_TITLE_ONLY_CHANGED";
      allowTitleOnlyRebase.value = false;
      error.value = t(titleOnlyConflict.value ? "apply.titleOnlyChanged" : e.code === "AI_CREATION_SOURCE_CHANGED" ? "apply.sourceChanged" : "apply.blockedStale");
    } else {
      error.value = t("apply.applyFailed");
    }
  } finally {
    applying.value = false;
  }
}
</script>

<template>
  <div
    v-if="runStatus === 'SUCCEEDED' && draftProse !== null"
    class="flex flex-col gap-2 rounded-xl border border-nf-border bg-nf-bg-1 p-3"
  >
    <div class="flex flex-wrap items-center gap-2">
      <p v-if="draftTitle" class="w-full text-sm font-semibold">{{ draftTitle }}</p>
      <button
        :disabled="!canApply"
        class="rounded-lg bg-nf-accent px-4 py-2 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus disabled:opacity-50"
        @click="apply"
      >
        {{ applying ? t("apply.applying") : t("apply.applyDraft") }}
      </button>
      <button
        v-if="appliedVersion !== null"
        class="rounded-lg border border-nf-border-strong px-3.5 py-2 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
        @click="emit('continue-next')"
      >
        {{ t("apply.continueNext") }}
      </button>
    </div>

    <p v-if="blockReason" role="status" class="text-[12.5px] text-nf-warn">
      {{ blockReason }}
      <button
        v-if="versionMoved && !isPublished"
        class="ml-1 underline underline-offset-2 hover:text-nf-text focus-visible:nf-focus"
        @click="emit('reload-rediff')"
      >
        {{ t("apply.reloadRediff") }}
      </button>
    </p>

    <p v-if="error" role="alert" class="text-[12.5px] text-nf-warn">{{ error }}</p>
    <label v-if="titleOnlyConflict" class="flex items-start gap-2 text-[12.5px] text-nf-text-dim">
      <input v-model="allowTitleOnlyRebase" data-testid="allow-title-only-recovery" type="checkbox" :disabled="applying" class="mt-0.5 accent-nf-accent" />
      {{ t('apply.keepRenamedTitle', { title: chapterTitle ?? '' }) }}
    </label>
    <button v-if="error && !isPublished" type="button" :disabled="applying" class="self-start underline focus-visible:nf-focus" @click="allowTitleOnlyRebase = false; emit('reload-rediff')">{{ t('apply.reloadRediff') }}</button>

    <p
      v-if="appliedVersion !== null && appliedRunId"
      role="status"
      class="text-[12.5px] text-nf-ok"
    >
      {{
        t("apply.applied", { runId: appliedRunId.slice(0, 8), version: appliedVersion })
      }}
    </p>
  </div>
</template>
