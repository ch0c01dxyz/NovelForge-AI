<template>
  <section
    aria-labelledby="endgame-debt-title"
    class="rounded-xl border border-nf-border bg-nf-bg-1 p-5"
    data-testid="endgame-debt-report"
  >
    <div class="flex items-center justify-between gap-3">
      <h2 id="endgame-debt-title" class="text-[16px] font-semibold text-nf-text">
        {{ t("endgame.debtReportTitle") }}
      </h2>
      <span v-if="report" class="text-[11px] text-nf-text-faint" data-testid="endgame-debt-generated">
        {{ t("endgame.generatedAt", { at: report.generatedAt }) }}
      </span>
    </div>

    <p v-if="loadError" role="alert" class="mt-3 text-[13px] text-nf-error" data-testid="endgame-debt-error">
      {{ t("endgame.debtError") }}
    </p>

    <div v-else-if="report" class="mt-4 grid gap-4 md:grid-cols-2">
      <!-- Unclosed MUSTs -->
      <div class="rounded-lg border border-nf-border bg-nf-bg-2 p-4">
        <h3 class="text-[13px] font-semibold text-nf-text">
          {{ t("endgame.unclosedMusts") }}
          <span class="ml-1 rounded-full bg-nf-bg-3 px-2 py-0.5 text-[11px] text-nf-text-dim" :data-testid="`endgame-debt-musts-count`">
            {{ report.unclosedMusts.length }}
          </span>
        </h3>
        <ul v-if="report.unclosedMusts.length > 0" class="mt-2 space-y-1">
          <li
            v-for="m in report.unclosedMusts"
            :key="m.ledgerId"
            :data-testid="`endgame-debt-must-${m.ledgerId}`"
            class="text-[12px] text-nf-text-dim"
          >
            <span class="font-mono text-[11px]">{{ m.threadId.slice(0, 8) }}</span>
            <span v-if="m.criteria" class="ml-1">— {{ m.criteria }}</span>
          </li>
        </ul>
        <p v-else class="mt-2 text-[12px] text-nf-text-faint">{{ t("endgame.none") }}</p>
      </div>

      <!-- Unpaid callbacks -->
      <div class="rounded-lg border border-nf-border bg-nf-bg-2 p-4">
        <h3 class="text-[13px] font-semibold text-nf-text">
          {{ t("endgame.unpaidCallbacks") }}
          <span class="ml-1 rounded-full bg-nf-bg-3 px-2 py-0.5 text-[11px] text-nf-text-dim" data-testid="endgame-debt-callbacks-count">
            {{ report.unpaidCallbacks.length }}
          </span>
        </h3>
        <ul v-if="report.unpaidCallbacks.length > 0" class="mt-2 space-y-1">
          <li
            v-for="c in report.unpaidCallbacks"
            :key="c.callbackId"
            class="text-[12px] text-nf-text-dim"
          >
            {{ c.description ?? c.setupEventId.slice(0, 8) }}
          </li>
        </ul>
        <p v-else class="mt-2 text-[12px] text-nf-text-faint">{{ t("endgame.none") }}</p>
      </div>

      <!-- Open threads -->
      <div class="rounded-lg border border-nf-border bg-nf-bg-2 p-4">
        <h3 class="text-[13px] font-semibold text-nf-text">
          {{ t("endgame.openThreads") }}
          <span class="ml-1 rounded-full bg-nf-bg-3 px-2 py-0.5 text-[11px] text-nf-text-dim" data-testid="endgame-debt-open-count">
            {{ report.openThreads.length }}
          </span>
        </h3>
        <ul v-if="report.openThreads.length > 0" class="mt-2 max-h-40 space-y-1 overflow-y-auto">
          <li v-for="th in report.openThreads" :key="th.threadId" class="text-[12px] text-nf-text-dim">
            {{ th.title }}
          </li>
        </ul>
        <p v-else class="mt-2 text-[12px] text-nf-text-faint">{{ t("endgame.none") }}</p>
      </div>

      <!-- Sequel hooks -->
      <div class="rounded-lg border border-nf-border bg-nf-bg-2 p-4">
        <h3 class="text-[13px] font-semibold text-nf-text">
          {{ t("endgame.sequelHooks") }}
          <span class="ml-1 rounded-full bg-nf-bg-3 px-2 py-0.5 text-[11px] text-nf-text-dim" data-testid="endgame-debt-sequel-count">
            {{ report.sequelHooks.length }}
          </span>
        </h3>
        <ul v-if="report.sequelHooks.length > 0" class="mt-2 space-y-1">
          <li
            v-for="s in report.sequelHooks"
            :key="s.ledgerId"
            class="text-[12px] text-nf-text-dim"
          >
            {{ s.description ?? s.threadId.slice(0, 8) }}
          </li>
        </ul>
        <p v-else class="mt-2 text-[12px] text-nf-text-faint">{{ t("endgame.none") }}</p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { useLocale } from "../../composables/useLocale";
import type { DebtReportShape } from "./endgameLedgerApi";

defineProps<{
  report: DebtReportShape | null;
  loadError: boolean;
}>();

const { t } = useLocale();
</script>
