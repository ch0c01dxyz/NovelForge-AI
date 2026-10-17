<script setup lang="ts">
/**
 * Model catalog (NF-WF-018B): per-gateway models with enabled flags
 * and capabilities. Sync is triggered from the gateway list.
 *
 * Pagination + search revision: a synced catalog can hold thousands of
 * rows, so the table renders one page at a time and capability tokens
 * get localized chips. `nf:` markers are application-observed evidence
 * (JSON-mode compatibility), styled apart from gateway-reported ones.
 */
import { computed } from "vue";
import { useLocale } from "../../composables/useLocale";
import { usePagedList } from "../../composables/usePagedList";
import type {
  GatewayView,
  ModelView,
} from "../../composables/usePlatformAdmin";
import AdminPager from "./AdminPager.vue";

const props = defineProps<{
  models: ModelView[];
  gateways: GatewayView[];
  loading: boolean;
  error: string | null;
}>();

const emit = defineEmits<{
  (e: "toggle-enabled", id: string, enabled: boolean): void;
}>();

const { t, locale } = useLocale();

const gatewayNames = computed(() => {
  const map = new Map<string, string>();
  for (const g of props.gateways) map.set(g.id, g.name);
  return map;
});

function gatewayName(id: string): string {
  return gatewayNames.value.get(id) ?? id;
}

const { query, page, pageCount, paged, total } = usePagedList<ModelView>(
  () => props.models,
  (m, q) =>
    `${m.displayName ?? ""} ${m.modelId} ${gatewayName(m.gatewayId)} ${m.capabilities.join(" ")}`
      .toLowerCase()
      .includes(q),
);

function formatContextWindow(value: number | null): string {
  if (value === null) return "—";
  return new Intl.NumberFormat(locale.value).format(value);
}

function capLabel(token: string): string {
  const key = `platformAdmin.models.cap.${token.replace(/^nf:/, "nf_").replace(/=/g, "_")}`;
  const label = t(key);
  return label === key ? token : label;
}

function capClass(token: string): string {
  if (token === "nf:json_object=ok") return "bg-nf-ok/15 text-nf-ok";
  if (token === "nf:json_object=incompatible") return "bg-nf-warn/15 text-nf-warn";
  return "bg-nf-bg-2 text-nf-text-dim";
}
</script>

<template>
  <section aria-labelledby="models-heading">
    <h2 id="models-heading" class="mb-1 text-[15px] font-semibold text-nf-text">
      {{ t("platformAdmin.models.heading") }}
    </h2>
    <p class="mb-3 text-[13px] text-nf-text-dim">{{ t("platformAdmin.models.description") }}</p>

    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <label class="text-[12px] font-semibold text-nf-text">
        {{ t("platformAdmin.search.label") }}
        <input
          v-model="query"
          type="search"
          class="ml-2 w-56 rounded-lg border border-nf-border bg-nf-bg-0 px-2 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
          :placeholder="t('platformAdmin.search.placeholder')"
          data-testid="model-search"
        />
      </label>
    </div>

    <p v-if="loading" class="text-[13px] text-nf-text-dim">…</p>
    <p v-else-if="error" class="text-[13px] text-nf-warn" role="alert">{{ error }}</p>
    <p v-else-if="models.length === 0" class="text-[13px] text-nf-text-dim">
      {{ t("platformAdmin.models.empty") }}
    </p>
    <p v-else-if="total === 0" class="text-[13px] text-nf-text-dim">
      {{ t("platformAdmin.search.noMatch") }}
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
            v-for="m in paged"
            :key="m.id"
            class="border-b border-nf-border last:border-0"
            :data-testid="`model-row-${m.id}`"
          >
            <td class="px-3 py-2 font-semibold text-nf-text">
              {{ m.displayName ?? m.modelId }}
              <span v-if="m.displayName" class="block text-[12px] font-normal text-nf-text-faint">{{ m.modelId }}</span>
            </td>
            <td class="px-3 py-2 text-nf-text-dim">{{ gatewayName(m.gatewayId) }}</td>
            <td class="px-3 py-2" :data-testid="`model-capabilities-${m.id}`">
              <template v-if="m.capabilities.length">
                <span
                  v-for="c in m.capabilities"
                  :key="c"
                  class="mr-1 inline-block rounded-full px-2 py-0.5 text-[12px]"
                  :class="capClass(c)"
                >{{ capLabel(c) }}</span>
              </template>
              <span v-else class="text-nf-text-dim">—</span>
            </td>
            <td class="px-3 py-2 text-nf-text-dim">{{ formatContextWindow(m.contextWindow) }}</td>
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
    <AdminPager
      :page="page"
      :page-count="pageCount"
      :total="total"
      @update:page="(p) => (page = p)"
    />
  </section>
</template>
