<!--
  NF-WF-022B: Link setup → payoff dialog. Explicit author action only
  (Invariant 5) — the form posts to POST .../endgame/callbacks; there is
  no auto-detection in the UI.
-->
<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    data-testid="cb-create-dialog"
    role="dialog"
    aria-modal="true"
    :aria-label="t('endgame.callbacks.createTitle')"
    @click.self="$emit('close')"
  >
    <form
      class="w-full max-w-lg rounded-xl border border-nf-border bg-nf-bg-1 p-6"
      @submit.prevent="submit"
    >
      <h2 class="text-[16px] font-semibold text-nf-text">
        {{ t("endgame.callbacks.createTitle") }}
      </h2>
      <p class="mt-1 text-[12px] text-nf-text-dim">
        {{ t("endgame.callbacks.createHint") }}
      </p>

      <div class="mt-4 grid gap-4">
        <div>
          <label for="cb-setup" class="mb-1 block text-[13px] font-medium text-nf-text">
            {{ t("endgame.callbacks.setupEventId") }}
          </label>
          <input
            id="cb-setup"
            v-model="setupEventId"
            type="text"
            required
            data-testid="cb-setup-input"
            :placeholder="t('endgame.callbacks.setupEventIdPlaceholder')"
            class="w-full rounded-lg border border-nf-border-strong bg-nf-bg-2 px-3 py-2 font-mono text-[13px] text-nf-text focus-visible:nf-focus"
          />
        </div>
        <div>
          <label for="cb-payoff" class="mb-1 block text-[13px] font-medium text-nf-text">
            {{ t("endgame.callbacks.payoffEventId") }}
            <span class="font-normal text-nf-text-faint">({{ t("endgame.legacy.optional") }})</span>
          </label>
          <input
            id="cb-payoff"
            v-model="payoffEventId"
            type="text"
            data-testid="cb-payoff-input"
            :placeholder="t('endgame.callbacks.payoffEventIdPlaceholder')"
            class="w-full rounded-lg border border-nf-border-strong bg-nf-bg-2 px-3 py-2 font-mono text-[13px] text-nf-text focus-visible:nf-focus"
          />
        </div>
        <div>
          <label for="cb-desc" class="mb-1 block text-[13px] font-medium text-nf-text">
            {{ t("endgame.callbacks.description") }}
          </label>
          <textarea
            id="cb-desc"
            v-model="description"
            rows="2"
            data-testid="cb-desc-input"
            :placeholder="t('endgame.callbacks.descriptionPlaceholder')"
            class="w-full rounded-lg border border-nf-border-strong bg-nf-bg-2 px-3 py-2 text-[13px] text-nf-text focus-visible:nf-focus"
          />
        </div>
      </div>

      <p v-if="error" role="alert" class="mt-3 text-[13px] text-nf-error" data-testid="cb-create-error">
        {{ error }}
      </p>

      <div class="mt-5 flex justify-end gap-2">
        <button
          type="button"
          data-testid="cb-create-cancel"
          class="rounded-lg border border-nf-border px-4 py-2 text-[13px] text-nf-text hover:bg-nf-bg-2 focus-visible:nf-focus"
          @click="$emit('close')"
        >
          {{ t("endgame.callbacks.cancel") }}
        </button>
        <button
          type="submit"
          :disabled="submitting"
          data-testid="cb-create-submit"
          class="rounded-lg bg-nf-accent px-4 py-2 text-[13px] font-semibold text-nf-accent-ink disabled:opacity-50 focus-visible:nf-focus"
        >
          {{ submitting ? t("endgame.callbacks.linking") : t("endgame.callbacks.create") }}
        </button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useLocale } from "../../composables/useLocale";
import { useEndgameCallbackApi } from "./endgameCallbackApi.ts";

const { t } = useLocale();

const props = defineProps<{ workspaceId: string; novelId: string }>();
const emit = defineEmits<{
  (e: "close"): void;
  (e: "created"): void;
}>();

const setupEventId = ref("");
const payoffEventId = ref("");
const description = ref("");
const submitting = ref(false);
const error = ref("");

async function submit() {
  error.value = "";
  submitting.value = true;
  try {
    const api = useEndgameCallbackApi(props.workspaceId, props.novelId);
    await api.createCallback({
      setupEventId: setupEventId.value.trim(),
      ...(payoffEventId.value.trim() ? { payoffEventId: payoffEventId.value.trim() } : {}),
      ...(description.value.trim() ? { description: description.value.trim() } : {}),
    });
    emit("created");
  } catch (e) {
    error.value =
      e instanceof Error && e.message === "DUPLICATE_CALLBACK"
        ? t("endgame.callbacks.duplicateError")
        : String(e instanceof Error ? e.message : e);
  } finally {
    submitting.value = false;
  }
}
</script>
