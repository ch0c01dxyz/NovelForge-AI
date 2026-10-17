<script setup lang="ts">
/**
 * Gateway list (NF-WF-018B): masked gateway rows.
 *
 * Invariant 1: the UI only ever sees `hasCredential` — the credential
 * value or ciphertext never reaches this component. The "Set"/"Not set"
 * badge is the entire credential surface.
 */
import { useLocale } from "../../composables/useLocale";
import { usePagedList } from "../../composables/usePagedList";
import type { GatewayView } from "../../composables/usePlatformAdmin";
import AdminPager from "./AdminPager.vue";

const { t } = useLocale();

const props = defineProps<{
  gateways: GatewayView[];
  loading: boolean;
  error: string | null;
}>();

const { query, page, pageCount, paged, total } = usePagedList<GatewayView>(
  () => props.gateways,
  (g, q) => `${g.name} ${g.baseUrl} ${g.health}`.toLowerCase().includes(q),
);

const emit = defineEmits<{
  (e: "add"): void;
  (e: "edit", id: string): void;
  (e: "rotate", id: string): void;
  (e: "delete", id: string): void;
  (e: "toggle-enabled", id: string, enabled: boolean): void;
  (e: "sync-models", id: string): void;
  (e: "health-check"): void;
}>();

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}
</script>

<template>
  <section aria-labelledby="gateways-heading">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 id="gateways-heading" class="text-[15px] font-semibold text-nf-text">
          {{ t("platformAdmin.gateways.heading") }}
        </h2>
        <p class="text-[13px] text-nf-text-dim">
          {{ t("platformAdmin.gateways.description") }}
        </p>
      </div>
      <div class="flex gap-2">
        <button
          class="rounded-lg border border-nf-border-strong px-3.5 py-1.5 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
          :disabled="loading"
          data-testid="health-check-button"
          @click="emit('health-check')"
        >
          {{ t("platformAdmin.gateways.healthCheck") }}
        </button>
        <button
          class="rounded-lg bg-nf-accent px-3.5 py-1.5 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus"
          data-testid="add-gateway-button"
          @click="emit('add')"
        >
          {{ t("platformAdmin.gateways.add") }}
        </button>
      </div>
    </div>

    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <label class="text-[12px] font-semibold text-nf-text">
        {{ t("platformAdmin.search.label") }}
        <input
          v-model="query"
          type="search"
          class="ml-2 w-56 rounded-lg border border-nf-border bg-nf-bg-0 px-2 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
          :placeholder="t('platformAdmin.search.placeholder')"
          data-testid="gateway-search"
        />
      </label>
    </div>

    <p v-if="loading" class="text-[13px] text-nf-text-dim">…</p>
    <p v-else-if="error" class="text-[13px] text-nf-warn" role="alert">{{ error }}</p>
    <p v-else-if="gateways.length > 0 && total === 0" class="text-[13px] text-nf-text-dim">
      {{ t("platformAdmin.search.noMatch") }}
    </p>
    <div v-else-if="gateways.length > 0" class="overflow-x-auto rounded-xl border border-nf-border">
      <table class="w-full text-left text-[13px]">
        <thead>
          <tr class="border-b border-nf-border bg-nf-bg-2 text-nf-text-dim">
            <th scope="col" class="px-3 py-2 font-semibold">{{ t("platformAdmin.gateways.columns.name") }}</th>
            <th scope="col" class="px-3 py-2 font-semibold">{{ t("platformAdmin.gateways.columns.baseUrl") }}</th>
            <th scope="col" class="px-3 py-2 font-semibold">{{ t("platformAdmin.gateways.columns.credential") }}</th>
            <th scope="col" class="px-3 py-2 font-semibold">{{ t("platformAdmin.gateways.columns.enabled") }}</th>
            <th scope="col" class="px-3 py-2 font-semibold">{{ t("platformAdmin.gateways.columns.priority") }}</th>
            <th scope="col" class="px-3 py-2 font-semibold">{{ t("platformAdmin.gateways.columns.weight") }}</th>
            <th scope="col" class="px-3 py-2 font-semibold">{{ t("platformAdmin.gateways.columns.health") }}</th>
            <th scope="col" class="px-3 py-2 font-semibold">{{ t("platformAdmin.gateways.columns.actions") }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="g in paged"
            :key="g.id"
            class="border-b border-nf-border last:border-0"
            :data-testid="`gateway-row-${g.id}`"
          >
            <td class="px-3 py-2 font-semibold text-nf-text">{{ g.name }}</td>
            <td class="px-3 py-2 text-nf-text-dim">{{ g.baseUrl }}</td>
            <td class="px-3 py-2">
              <!-- Masked: the credential value never reaches the UI. -->
              <span
                :class="g.hasCredential ? 'bg-nf-ok/15 text-nf-ok' : 'bg-nf-text-faint/15 text-nf-text-faint'"
                class="rounded-full px-2 py-0.5 text-[12px]"
                :data-testid="`gateway-credential-${g.id}`"
              >
                {{
                  g.hasCredential
                    ? t("platformAdmin.gateways.credentialSet")
                    : t("platformAdmin.gateways.credentialNotSet")
                }}
              </span>
            </td>
            <td class="px-3 py-2">
              <button
                class="rounded-md border border-nf-border px-2 py-0.5 text-[12px] text-nf-text-dim hover:bg-nf-bg-2 focus-visible:nf-focus"
                :aria-pressed="g.enabled"
                @click="emit('toggle-enabled', g.id, !g.enabled)"
              >
                {{ g.enabled ? t("platformAdmin.gateways.disable") : t("platformAdmin.gateways.enable") }}
              </button>
            </td>
            <td class="px-3 py-2 text-nf-text-dim">{{ g.priority }}</td>
            <td class="px-3 py-2 text-nf-text-dim">{{ g.weight }}</td>
            <td class="px-3 py-2 text-nf-text-dim" :title="formatDate(g.lastHealthCheckAt)">
              {{ g.health }}
            </td>
            <td class="px-3 py-2">
              <div class="flex flex-wrap gap-1">
                <button
                  class="rounded-md border border-nf-border px-2 py-0.5 text-[12px] text-nf-text-dim hover:bg-nf-bg-2 focus-visible:nf-focus"
                  @click="emit('edit', g.id)"
                >
                  {{ t("platformAdmin.gateways.edit") }}
                </button>
                <button
                  class="rounded-md border border-nf-border px-2 py-0.5 text-[12px] text-nf-text-dim hover:bg-nf-bg-2 focus-visible:nf-focus"
                  @click="emit('rotate', g.id)"
                >
                  {{ t("platformAdmin.gateways.rotate") }}
                </button>
                <button
                  class="rounded-md border border-nf-border px-2 py-0.5 text-[12px] text-nf-text-dim hover:bg-nf-bg-2 focus-visible:nf-focus"
                  @click="emit('sync-models', g.id)"
                >
                  {{ t("platformAdmin.gateways.syncModels") }}
                </button>
                <button
                  class="rounded-md border border-nf-warn/40 px-2 py-0.5 text-[12px] text-nf-warn hover:bg-nf-warn/10 focus-visible:nf-focus"
                  @click="emit('delete', g.id)"
                >
                  {{ t("platformAdmin.gateways.delete") }}
                </button>
              </div>
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
