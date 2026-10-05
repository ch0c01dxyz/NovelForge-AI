<script setup lang="ts">
/**
 * ConflictBanner (NF-WF-015, Invariant 5): the honest version-conflict
 * UI. 007's page resolved 409 by refetching, silently dropping the
 * author's unsaved text; 015 shows this banner instead (role="alert",
 * not a modal — the editor stays visible).
 *
 * Three explicit actions: Keep mine (re-PUT local HTML with the fresh
 * server version as expectedVersion), Load theirs (discard local text
 * and refetch — the old behavior, now an explicit choice), Compare
 * (DraftDiffView: local HTML stripped as the draft, server version as
 * base). The banner persists until the author chooses; autosave pauses
 * while conflicted; nothing auto-resolves.
 *
 * The published-chapter 409 never reaches this banner: the page
 * disambiguates first (F3) and shows `chapters.blockedPublished`.
 */
import { useLocale } from "../../composables/useLocale";

defineProps<{
  /** The server version the author's save collided with. */
  serverVersion: number | null;
}>();

const emit = defineEmits<{
  (e: "keep-mine"): void;
  (e: "load-theirs"): void;
  (e: "compare"): void;
}>();

const { t } = useLocale();
</script>

<template>
  <div
    role="alert"
    class="mx-auto mt-6 max-w-[700px] rounded-xl border border-nf-warn/40 bg-nf-warn/10 px-4 py-3.5"
  >
    <h2 class="text-[13.5px] font-semibold text-nf-text">
      {{ t("conflict.title") }}
    </h2>
    <p class="mt-1 text-[13px] leading-relaxed text-nf-text-dim">
      {{ t("conflict.message", { version: serverVersion ?? "—" }) }}
    </p>
    <div class="mt-3 flex flex-wrap gap-2">
      <button
        type="button"
        class="rounded-lg bg-nf-accent px-3.5 py-1.5 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus"
        @click="emit('keep-mine')"
      >
        {{ t("conflict.keepMine") }}
      </button>
      <button
        type="button"
        class="rounded-lg border border-nf-border-strong px-3.5 py-1.5 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
        @click="emit('load-theirs')"
      >
        {{ t("conflict.loadTheirs") }}
      </button>
      <button
        type="button"
        class="rounded-lg border border-nf-border-strong px-3.5 py-1.5 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
        @click="emit('compare')"
      >
        {{ t("conflict.compare") }}
      </button>
    </div>
  </div>
</template>
