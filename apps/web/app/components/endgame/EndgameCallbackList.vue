<!--
  NF-WF-022B: Callback list — setup → payoff links with unpaid highlighted.
  §15 design tokens; en+id via endgame.callbacks.* keys.
-->
<template>
  <section
    aria-labelledby="cb-list-title"
    class="rounded-xl border border-nf-border bg-nf-bg-1 p-5"
    data-testid="cb-list"
  >
    <div class="flex items-center justify-between gap-3">
      <div>
        <h2 id="cb-list-title" class="text-[16px] font-semibold text-nf-text">
          {{ t("endgame.callbacks.title") }}
        </h2>
        <p class="mt-1 text-[12px] text-nf-text-dim">
          {{ t("endgame.callbacks.subtitle") }}
        </p>
      </div>
      <button
        type="button"
        data-testid="cb-create-open"
        class="rounded-lg border border-nf-border-strong bg-nf-bg-3 px-4 py-2 text-[13px] font-semibold text-nf-text hover:bg-nf-bg-2 focus-visible:nf-focus"
        @click="$emit('create')"
      >
        {{ t("endgame.callbacks.create") }}
      </button>
    </div>

    <p v-if="loadError" role="alert" class="mt-3 text-[13px] text-red-300" data-testid="cb-list-error">
      {{ t("endgame.callbacks.listError") }}
    </p>

    <!-- Unpaid filter -->
    <div class="mt-4 flex items-center gap-2">
      <input
        id="cb-unpaid-only"
        v-model="unpaidOnly"
        type="checkbox"
        data-testid="cb-unpaid-only"
        class="h-4 w-4 accent-nf-accent focus-visible:nf-focus"
      />
      <label for="cb-unpaid-only" class="text-[13px] text-nf-text">
        {{ t("endgame.callbacks.unpaidOnly") }}
      </label>
    </div>

    <div class="mt-4" data-testid="cb-items">
      <p v-if="visible.length === 0 && !loading" class="text-[13px] text-nf-text-dim" data-testid="cb-empty">
        {{ t("endgame.callbacks.noCallbacks") }}
      </p>
      <ul v-else :aria-label="t('endgame.callbacks.title')" class="m-0 list-none p-0">
        <li
          v-for="cb in visible"
          :key="cb.id"
          :data-testid="`cb-item-${cb.id}`"
          class="mt-2 rounded-lg border p-4"
          :class="cb.status === 'PENDING'
            ? 'border-amber-500/60 bg-amber-500/10'
            : 'border-nf-border bg-nf-bg-2'"
        >
          <div class="flex items-center justify-between gap-3">
            <span
              :data-testid="`cb-status-${cb.id}`"
              class="rounded-full border px-2 py-0.5 text-[11px] font-medium"
              :class="cb.status === 'PENDING'
                ? 'border-amber-500/60 text-amber-200'
                : 'border-emerald-500/60 text-emerald-200'"
            >
              {{ cb.status === 'PENDING' ? t("endgame.callbacks.unpaidBadge") : t("endgame.callbacks.paidBadge") }}
            </span>
          </div>
          <dl class="mt-2 grid gap-1 text-[13px]">
            <div class="flex gap-2">
              <dt class="text-nf-text-dim">{{ t("endgame.callbacks.setupEvent") }}:</dt>
              <dd class="font-mono text-[12px] text-nf-text">{{ cb.setupEventId }}</dd>
            </div>
            <div class="flex gap-2">
              <dt class="text-nf-text-dim">{{ t("endgame.callbacks.payoffEvent") }}:</dt>
              <dd class="font-mono text-[12px] text-nf-text">
                {{ cb.payoffEventId ?? t("endgame.callbacks.noPayoff") }}
              </dd>
            </div>
            <div v-if="cb.description" class="flex gap-2">
              <dt class="text-nf-text-dim">{{ t("endgame.callbacks.description") }}:</dt>
              <dd class="text-nf-text">{{ cb.description }}</dd>
            </div>
          </dl>
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useLocale } from "../../composables/useLocale";
import type { EndgameCallbackShape } from "./endgameCallbackApi.ts";

defineEmits<{ (e: "create"): void }>();

const { t } = useLocale();

const props = defineProps<{
  callbacks: EndgameCallbackShape[];
  loading: boolean;
  loadError: boolean;
}>();

const unpaidOnly = ref(false);

const visible = computed(() =>
  unpaidOnly.value ? props.callbacks.filter((c) => c.status === "PENDING") : props.callbacks,
);
</script>
