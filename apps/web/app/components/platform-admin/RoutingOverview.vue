<script setup lang="ts">
/**
 * Routing overview (NF-WF-018B): per-gateway routing parameters and the
 * deployment routing strategy (read-only).
 *
 * The strategy is env-level ("deployment config") — this surface shows
 * it honestly and offers no control to change it. GAP-063: quota
 * observations are not recorded anywhere; the absence is shown, not
 * papered over.
 */
import { useLocale } from "../../composables/useLocale";
import type { GatewayView } from "../../composables/usePlatformAdmin";

defineProps<{
  gateways: GatewayView[];
  strategy: string | null;
  loading: boolean;
  error: string | null;
}>();

const { t } = useLocale();

function strategyLabel(s: string | null): string {
  if (!s) return "—";
  const label = t(`platformAdmin.routing.strategies.${s}`);
  return label === `platformAdmin.routing.strategies.${s}` ? s : label;
}
</script>

<template>
  <section aria-labelledby="routing-heading">
    <h2 id="routing-heading" class="mb-1 text-[15px] font-semibold text-nf-text">
      {{ t("platformAdmin.routing.heading") }}
    </h2>
    <p class="mb-3 text-[13px] text-nf-text-dim">{{ t("platformAdmin.routing.description") }}</p>

    <p v-if="loading" class="text-[13px] text-nf-text-dim">…</p>
    <p v-else-if="error" class="text-[13px] text-nf-warn" role="alert">{{ error }}</p>
    <div v-else>
      <div class="mb-4 rounded-xl border border-nf-border bg-nf-bg-2 p-4">
        <div class="text-[12px] font-semibold text-nf-text-dim">
          {{ t("platformAdmin.routing.strategy") }}
        </div>
        <div class="mt-1 text-[15px] font-semibold text-nf-text" data-testid="routing-strategy">
          {{ strategyLabel(strategy) }}
        </div>
        <div class="mt-1 text-[12px] text-nf-text-faint">
          {{ t("platformAdmin.routing.deploymentConfig") }}
        </div>
      </div>

      <div class="overflow-x-auto rounded-xl border border-nf-border">
        <table class="w-full text-left text-[13px]">
          <thead>
            <tr class="border-b border-nf-border bg-nf-bg-2 text-nf-text-dim">
              <th scope="col" class="px-3 py-2 font-semibold">{{ t("platformAdmin.gateways.columns.name") }}</th>
              <th scope="col" class="px-3 py-2 font-semibold">{{ t("platformAdmin.gateways.columns.priority") }}</th>
              <th scope="col" class="px-3 py-2 font-semibold">{{ t("platformAdmin.gateways.columns.weight") }}</th>
              <th scope="col" class="px-3 py-2 font-semibold">{{ t("platformAdmin.gateways.columns.timeout") }}</th>
              <th scope="col" class="px-3 py-2 font-semibold">{{ t("platformAdmin.gateways.columns.retries") }}</th>
              <th scope="col" class="px-3 py-2 font-semibold">{{ t("platformAdmin.gateways.columns.enabled") }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="g in gateways"
              :key="g.id"
              class="border-b border-nf-border last:border-0"
            >
              <td class="px-3 py-2 font-semibold text-nf-text">{{ g.name }}</td>
              <td class="px-3 py-2 text-nf-text-dim">{{ g.priority }}</td>
              <td class="px-3 py-2 text-nf-text-dim">{{ g.weight }}</td>
              <td class="px-3 py-2 text-nf-text-dim">{{ g.timeoutMs }}</td>
              <td class="px-3 py-2 text-nf-text-dim">{{ g.maxRetries }}</td>
              <td class="px-3 py-2 text-nf-text-dim">{{ g.enabled ? "✓" : "—" }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- GAP-063: quota absence shown honestly, no invented columns. -->
      <p class="mt-3 text-[12px] text-nf-text-faint" data-testid="quota-absence-note">
        {{ t("platformAdmin.routing.noQuota") }}
      </p>
    </div>
  </section>
</template>
