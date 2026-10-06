<template>
  <section
    aria-labelledby="endgame-ledger-title"
    class="rounded-xl border border-nf-border bg-nf-bg-1 p-5"
    data-testid="endgame-ledger-list"
  >
    <div class="flex items-center justify-between gap-3">
      <h2 id="endgame-ledger-title" class="text-[16px] font-semibold text-nf-text">
        {{ t("endgame.ledgerTitle") }}
      </h2>
      <button
        type="button"
        data-testid="endgame-ledger-create-open"
        class="rounded-lg border border-nf-border-strong bg-nf-bg-3 px-4 py-2 text-[13px] font-semibold text-nf-text hover:bg-nf-bg-2 focus-visible:nf-focus"
        @click="$emit('create')"
      >
        {{ t("endgame.create") }}
      </button>
    </div>

    <p v-if="loadError" role="alert" class="mt-3 text-[13px] text-red-300" data-testid="endgame-ledger-error">
      {{ t("endgame.listError") }}
    </p>

    <!-- Status filter -->
    <div class="mt-4 flex flex-wrap items-center gap-2" role="group" :aria-label="t('endgame.status')">
      <label class="text-[12px] text-nf-text-faint" for="endgame-status-filter">
        {{ t("endgame.status") }}
      </label>
      <select
        id="endgame-status-filter"
        data-testid="endgame-status-filter"
        v-model="statusFilter"
        class="rounded-lg border border-nf-border-strong bg-nf-bg-2 px-3 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
      >
        <option value="">{{ t("endgame.filterAll") }}</option>
        <option v-for="s in statuses" :key="s" :value="s">
          {{ t(`endgame.statusLabels.${s}`) }}
        </option>
      </select>
    </div>

    <div class="mt-4" data-testid="endgame-ledger-items">
      <p v-if="filtered.length === 0 && !loading" class="text-[13px] text-nf-text-dim" data-testid="endgame-no-entries">
        {{ t("endgame.noEntries") }}
      </p>
      <ul v-else :aria-label="t('endgame.ledgerTitle')" class="m-0 list-none p-0">
        <li
          v-for="entry in filtered"
          :key="entry.id"
          :data-testid="`endgame-entry-${entry.id}`"
          class="mt-2 rounded-lg border border-nf-border bg-nf-bg-2 p-4"
        >
          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0">
              <h3 class="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-nf-text">
                <span class="truncate">{{ entry.threadTitle }}</span>
                <span
                  :data-testid="`endgame-entry-status-${entry.id}`"
                  class="rounded-full border px-2 py-0.5 text-[11px] font-medium"
                  :class="statusBadgeClass(entry.status)"
                >
                  {{ t(`endgame.statusLabels.${entry.status}`) }}
                </span>
                <span
                  v-if="entry.closed"
                  :data-testid="`endgame-entry-closed-${entry.id}`"
                  class="rounded-full border border-nf-border px-2 py-0.5 text-[11px] text-nf-text-dim"
                >
                  {{ t("endgame.closed") }}
                </span>
              </h3>
              <p v-if="entry.criteria" class="mt-1 text-[12px] text-nf-text-dim">
                <span class="font-medium">{{ t("endgame.criteria") }}:</span> {{ entry.criteria }}
              </p>
              <p v-if="entry.rationale" class="mt-1 text-[12px] text-nf-text-faint">
                {{ entry.rationale }}
              </p>
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <label :for="`endgame-entry-status-select-${entry.id}`" class="sr-only">
                {{ t("endgame.changeStatus") }}
              </label>
              <select
                :id="`endgame-entry-status-select-${entry.id}`"
                :data-testid="`endgame-entry-status-select-${entry.id}`"
                :value="entry.status"
                :disabled="updatingId === entry.id"
                class="rounded-lg border border-nf-border-strong bg-nf-bg-3 px-2 py-1 text-[12px] text-nf-text focus-visible:nf-focus"
                @change="$emit('change-status', entry, ($event.target as HTMLSelectElement).value)"
              >
                <option v-for="s in statuses" :key="s" :value="s">
                  {{ t(`endgame.statusLabels.${s}`) }}
                </option>
              </select>
            </div>
          </div>
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useLocale } from "../../composables/useLocale";
import {
  ENDGAME_CLOSURE_STATUSES,
  type EndgameClosureStatus,
  type EndgameLedgerShape,
} from "./endgameLedgerApi";

const props = defineProps<{
  entries: EndgameLedgerShape[];
  loading: boolean;
  loadError: boolean;
  updatingId: string | null;
}>();

defineEmits<{
  create: [];
  "change-status": [entry: EndgameLedgerShape, status: string];
}>();

const { t } = useLocale();
const statuses = ENDGAME_CLOSURE_STATUSES;
const statusFilter = ref("");

const filtered = computed(() =>
  statusFilter.value
    ? props.entries.filter((e) => e.status === statusFilter.value)
    : props.entries,
);

function statusBadgeClass(status: EndgameClosureStatus): string {
  switch (status) {
    case "MUST":
      return "border-red-400/40 bg-red-400/10 text-red-200";
    case "SHOULD":
      return "border-amber-400/40 bg-amber-400/10 text-amber-200";
    case "MAY":
      return "border-sky-400/40 bg-sky-400/10 text-sky-200";
    case "OPEN":
      return "border-nf-border-strong bg-nf-bg-3 text-nf-text-dim";
    case "SEQUEL":
      return "border-violet-400/40 bg-violet-400/10 text-violet-200";
  }
}
</script>
