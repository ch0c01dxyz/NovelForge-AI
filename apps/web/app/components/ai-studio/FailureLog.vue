<script setup lang="ts">
/**
 * Failure log (NF-WF-018C): FAILED generations, plus the no-model 409
 * state as a documented first-class failure category (contract
 * Invariant 4). GAP-028's "not configured" worker state is surfaced
 * honestly here — surfaced, not fixed (Invariant 5).
 */
import GenerationLedger from "./GenerationLedger.vue";
import { useLocale } from "../../composables/useLocale";

defineProps<{
  workspaceId: string;
}>();

const { t } = useLocale();
</script>

<template>
  <div>
    <div class="mb-4 rounded-xl border border-nf-border bg-nf-bg-1 p-4" role="note">
      <h3 class="mb-1 text-[13px] font-semibold text-nf-text">
        {{ t("receipts.failures.noModelTitle") }}
      </h3>
      <p class="text-[12.5px] leading-relaxed text-nf-text-dim">
        {{ t("receipts.failures.noModelBody") }}
      </p>
    </div>
    <GenerationLedger :workspace-id="workspaceId" locked-status="FAILED" />
  </div>
</template>
