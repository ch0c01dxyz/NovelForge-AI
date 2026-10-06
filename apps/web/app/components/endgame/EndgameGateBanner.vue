<template>
  <section
    :aria-label="t('endgame.gateTitle')"
    class="rounded-xl border p-5"
    :class="gate.verdict === 'READY' ? 'border-emerald-400/40 bg-emerald-400/5' : 'border-amber-400/40 bg-amber-400/5'"
    data-testid="endgame-gate-banner"
  >
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <span
          :data-testid="`endgame-gate-verdict-${gate.verdict}`"
          class="rounded-full border px-3 py-1 text-[13px] font-semibold"
          :class="
            gate.verdict === 'READY'
              ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-200'
              : 'border-amber-400/50 bg-amber-400/10 text-amber-200'
          "
        >
          {{ t(`endgame.gateVerdict.${gate.verdict}`) }}
        </span>
        <h2 class="text-[15px] font-semibold text-nf-text">{{ t("endgame.gateTitle") }}</h2>
      </div>
      <button
        v-if="!gate.approved"
        type="button"
        data-testid="endgame-gate-approve"
        :disabled="approving"
        class="rounded-lg border border-nf-accent bg-nf-accent px-4 py-2 text-[13px] font-semibold text-nf-accent-ink hover:brightness-110 disabled:opacity-50 focus-visible:nf-focus"
        @click="$emit('approve')"
      >
        {{ approving ? t("endgame.approving") : t("endgame.approve") }}
      </button>
      <p v-else class="text-[12px] text-nf-text-dim" data-testid="endgame-gate-approved-note">
        {{ t("endgame.approvedNote") }}
      </p>
    </div>

    <p class="mt-2 text-[13px] text-nf-text-dim">
      {{ gate.verdict === "READY" ? t("endgame.gateReadyHint") : t("endgame.gateBlockedHint") }}
    </p>

    <ul v-if="gate.blockingItems.length > 0" class="mt-3 space-y-2" :aria-label="t('endgame.blockingItems')">
      <li
        v-for="item in gate.blockingItems"
        :key="item.ledgerId"
        :data-testid="`endgame-blocking-${item.ledgerId}`"
        class="rounded-lg border border-nf-border bg-nf-bg-2 p-3 text-[13px]"
      >
        <span class="font-semibold text-nf-text">{{ item.threadTitle }}</span>
        <span class="ml-2 rounded-full border border-red-400/40 bg-red-400/10 px-2 py-0.5 text-[11px] font-medium text-red-200">
          {{ t(`endgame.statusLabels.${item.status}`) }}
        </span>
        <p v-if="item.criteria" class="mt-1 text-[12px] text-nf-text-dim">
          <span class="font-medium">{{ t("endgame.criteria") }}:</span> {{ item.criteria }}
        </p>
      </li>
    </ul>

    <p v-if="approveError" role="alert" class="mt-2 text-[13px] text-red-300" data-testid="endgame-approve-error">
      {{ approveError }}
    </p>
  </section>
</template>

<script setup lang="ts">
import { useLocale } from "../../composables/useLocale";
import type { EndingGateShape } from "./endgameLedgerApi";

defineProps<{
  gate: EndingGateShape;
  approving: boolean;
  approveError: string | null;
}>();

defineEmits<{
  approve: [];
}>();

const { t } = useLocale();
</script>
