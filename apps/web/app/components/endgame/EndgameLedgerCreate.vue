<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    data-testid="endgame-ledger-create-dialog"
    role="dialog"
    aria-modal="true"
    :aria-label="t('endgame.createTitle')"
    @click.self="$emit('close')"
  >
    <div class="w-full max-w-md rounded-xl border border-nf-border bg-nf-bg-1 p-5">
      <h2 class="text-[16px] font-semibold text-nf-text">{{ t("endgame.createTitle") }}</h2>
      <p class="mt-1 text-[13px] text-nf-text-dim">{{ t("endgame.createHint") }}</p>

      <p v-if="error" role="alert" class="mt-3 text-[13px] text-red-300" data-testid="endgame-create-error">
        {{ error }}
      </p>

      <form class="mt-4 space-y-3" @submit.prevent="submit">
        <div>
          <label for="endgame-create-thread" class="mb-1 block text-[12px] font-medium text-nf-text-dim">
            {{ t("endgame.thread") }}
          </label>
          <select
            id="endgame-create-thread"
            v-model="threadId"
            data-testid="endgame-create-thread"
            required
            class="w-full rounded-lg border border-nf-border-strong bg-nf-bg-2 px-3 py-2 text-[13px] text-nf-text focus-visible:nf-focus"
          >
            <option value="" disabled>{{ t("endgame.chooseThread") }}</option>
            <option v-for="th in threads" :key="th.id" :value="th.id">
              {{ th.title }} ({{ th.status }})
            </option>
          </select>
        </div>

        <div>
          <label for="endgame-create-status" class="mb-1 block text-[12px] font-medium text-nf-text-dim">
            {{ t("endgame.status") }}
          </label>
          <select
            id="endgame-create-status"
            v-model="status"
            data-testid="endgame-create-status"
            required
            class="w-full rounded-lg border border-nf-border-strong bg-nf-bg-2 px-3 py-2 text-[13px] text-nf-text focus-visible:nf-focus"
          >
            <option v-for="s in statuses" :key="s" :value="s">
              {{ t(`endgame.statusLabels.${s}`) }} — {{ t(`endgame.statusHelp.${s}`) }}
            </option>
          </select>
        </div>

        <div>
          <label for="endgame-create-criteria" class="mb-1 block text-[12px] font-medium text-nf-text-dim">
            {{ t("endgame.criteria") }} <span class="text-nf-text-faint">({{ t("endgame.optional") }})</span>
          </label>
          <textarea
            id="endgame-create-criteria"
            v-model="criteria"
            data-testid="endgame-create-criteria"
            rows="2"
            class="w-full rounded-lg border border-nf-border-strong bg-nf-bg-2 px-3 py-2 text-[13px] text-nf-text focus-visible:nf-focus"
          />
        </div>

        <div>
          <label for="endgame-create-rationale" class="mb-1 block text-[12px] font-medium text-nf-text-dim">
            {{ t("endgame.rationale") }} <span class="text-nf-text-faint">({{ t("endgame.optional") }})</span>
          </label>
          <textarea
            id="endgame-create-rationale"
            v-model="rationale"
            data-testid="endgame-create-rationale"
            rows="2"
            class="w-full rounded-lg border border-nf-border-strong bg-nf-bg-2 px-3 py-2 text-[13px] text-nf-text focus-visible:nf-focus"
          />
        </div>

        <div class="flex justify-end gap-2 pt-1">
          <button
            type="button"
            data-testid="endgame-create-cancel"
            class="rounded-lg border border-nf-border-strong px-4 py-2 text-[13px] text-nf-text-dim hover:text-nf-text focus-visible:nf-focus"
            @click="$emit('close')"
          >
            {{ t("endgame.cancel") }}
          </button>
          <button
            type="submit"
            data-testid="endgame-create-submit"
            :disabled="creating || !threadId"
            class="rounded-lg border border-nf-accent bg-nf-accent px-4 py-2 text-[13px] font-semibold text-nf-accent-ink hover:brightness-110 disabled:opacity-50 focus-visible:nf-focus"
          >
            {{ creating ? t("endgame.creating") : t("endgame.create") }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useLocale } from "../../composables/useLocale";
import {
  ENDGAME_CLOSURE_STATUSES,
  type EndgameClosureStatus,
  type StoryThreadOption,
} from "./endgameLedgerApi";

defineProps<{
  threads: StoryThreadOption[];
  creating: boolean;
  error: string | null;
}>();

const emit = defineEmits<{
  close: [];
  submit: [body: { threadId: string; status: EndgameClosureStatus; criteria?: string; rationale?: string }];
}>();

const { t } = useLocale();
const statuses = ENDGAME_CLOSURE_STATUSES;
const threadId = ref("");
const status = ref<EndgameClosureStatus>("MUST");
const criteria = ref("");
const rationale = ref("");

function submit(): void {
  if (!threadId.value) return;
  emit("submit", {
    threadId: threadId.value,
    status: status.value,
    ...(criteria.value.trim() ? { criteria: criteria.value.trim() } : {}),
    ...(rationale.value.trim() ? { rationale: rationale.value.trim() } : {}),
  });
}
</script>
