<script setup lang="ts">
/**
 * Model catalog (NF-WF-018B): per-gateway models with enabled flags
 * and capabilities. Sync is triggered from the gateway list.
 */
import { computed } from "vue";
import { useLocale } from "../../composables/useLocale";
import type {
  GatewayView,
  ModelView,
} from "../../composables/usePlatformAdmin";

const props = defineProps<{
  models: ModelView[];
  gateways: GatewayView[];
  loading: boolean;
  error: string | null;
}>();

const emit = defineEmits<{
  (e: "toggle-enabled", id: string, enabled: boolean): void;
}>();

const { t } = useLocale();

const gatewayNames = computed(() => {
  const map = new Map<string, string>();
  for (const g of props.gateways) map.set(g.id, g.name);
  return map;
});

function gatewayName(id: string): string {
  return gatewayNames.value.get(id) ?? id;
}
</script>

<template>
  <section aria-labelledby="models-heading">
    <h2 id="models-heading" class="mb-1 text-[15px] font-semibold text-nf-text">
      {{ t("platformAdmin.models.heading") }}
    </h2>
    <p class="mb-3 text-[13px] text-nf-text-dim">{{ t("platformAdmin.models.description") }}</p>

    <p v-if="loading" class="text-[13px] text-nf-text-dim">…</p>
    <p v-else-if="error" class="text-[13px] text-nf-warn" role="alert">{{ error }}</p>
    <p v-else-if="models.length === 0" class="text-[13px] text-nf-text-dim">
      {{ t("platformAdmin.models.empty") }}
    </p>
    <div v-else class="overflow-x-auto rounded-xl border border-nf-border">
      <table class="w-full text-left text-[13px]">
        <thead>
          <tr class="border-b border-nf-border bg-nf-bg-2 text-nf-text-dim">
            <th scope="col" class="px-3 py-2 font-semibold">{{ t("platformAdmin.models.columns.model") }}</th>
            <th scope="col" class="px-3 py-2 font-semibold">{{ t("platformAdmin.models.columns.gateway") }}</th>
            <th scope="col" class="px-3 py-2 font-semibold">{{ t("platformAdmin.models.columns.capabilities") }}</th>
            <th scope="col" class="px-3 py-2 font-semibold">{{ t("platformAdmin.models.columns.contextWindow") }}</th>
            <th scope="col" class="px-3 py-2 font-semibold">{{ t("platformAdmin.models.columns.enabled") }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="m in models"
            :key="m.id"
            class="border-b border-nf-border last:border-0"
            :data-testid="`model-row-${m.id}`"
          >
            <td class="px-3 py-2 font-semibold text-nf-text">
              {{ m.displayName ?? m.modelId }}
              <span v-if="m.displayName" class="block text-[12px] font-normal text-nf-text-faint">{{ m.modelId }}</span>
            </td>
            <td class="px-3 py-2 text-nf-text-dim">{{ gatewayName(m.gatewayId) }}</td>
            <td class="px-3 py-2 text-nf-text-dim">{{ m.capabilities.join(", ") || "—" }}</td>
            <td class="px-3 py-2 text-nf-text-dim">{{ m.contextWindow ?? "—" }}</td>
            <td class="px-3 py-2">
              <button
                class="rounded-md border border-nf-border px-2 py-0.5 text-[12px] text-nf-text-dim hover:bg-nf-bg-2 focus-visible:nf-focus"
                :aria-pressed="m.enabled"
                @click="emit('toggle-enabled', m.id, !m.enabled)"
              >
                {{ m.enabled ? t("platformAdmin.gateways.disable") : t("platformAdmin.gateways.enable") }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
