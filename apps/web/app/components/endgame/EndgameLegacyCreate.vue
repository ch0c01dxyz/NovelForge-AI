<!--
  NF-WF-022B: Record legacy dialog (CHARACTER/WORLD/THEMATIC).
-->
<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    data-testid="legacy-create-dialog"
    role="dialog"
    aria-modal="true"
    :aria-label="t('endgame.legacy.createTitle')"
    @click.self="$emit('close')"
  >
    <form
      class="w-full max-w-lg rounded-xl border border-nf-border bg-nf-bg-1 p-6"
      @submit.prevent="submit"
    >
      <h2 class="text-[16px] font-semibold text-nf-text">
        {{ t("endgame.legacy.createTitle") }}
      </h2>

      <div class="mt-4 grid gap-4">
        <div>
          <label for="legacy-kind" class="mb-1 block text-[13px] font-medium text-nf-text">
            {{ t("endgame.legacy.kind") }}
          </label>
          <select
            id="legacy-kind"
            v-model="kind"
            required
            data-testid="legacy-kind-input"
            class="w-full rounded-lg border border-nf-border-strong bg-nf-bg-2 px-3 py-2 text-[13px] text-nf-text focus-visible:nf-focus"
          >
            <option value="" disabled>{{ t("endgame.legacy.kindPlaceholder") }}</option>
            <option value="CHARACTER">{{ t("endgame.legacy.kindLabels.CHARACTER") }}</option>
            <option value="WORLD">{{ t("endgame.legacy.kindLabels.WORLD") }}</option>
            <option value="THEMATIC">{{ t("endgame.legacy.kindLabels.THEMATIC") }}</option>
          </select>
        </div>
        <div>
          <label for="legacy-subject" class="mb-1 block text-[13px] font-medium text-nf-text">
            {{ t("endgame.legacy.subjectId") }}
          </label>
          <input
            id="legacy-subject"
            v-model="subjectId"
            type="text"
            data-testid="legacy-subject-input"
            :placeholder="t('endgame.legacy.subjectIdPlaceholder')"
            class="w-full rounded-lg border border-nf-border-strong bg-nf-bg-2 px-3 py-2 font-mono text-[13px] text-nf-text focus-visible:nf-focus"
          />
        </div>
        <div>
          <label for="legacy-desc" class="mb-1 block text-[13px] font-medium text-nf-text">
            {{ t("endgame.legacy.description") }}
          </label>
          <textarea
            id="legacy-desc"
            v-model="description"
            rows="3"
            required
            data-testid="legacy-desc-input"
            :placeholder="t('endgame.legacy.descriptionPlaceholder')"
            class="w-full rounded-lg border border-nf-border-strong bg-nf-bg-2 px-3 py-2 text-[13px] text-nf-text focus-visible:nf-focus"
          />
        </div>
      </div>

      <p v-if="error" role="alert" class="mt-3 text-[13px] text-red-300" data-testid="legacy-create-error">
        {{ error }}
      </p>

      <div class="mt-5 flex justify-end gap-2">
        <button
          type="button"
          data-testid="legacy-create-cancel"
          class="rounded-lg border border-nf-border px-4 py-2 text-[13px] text-nf-text hover:bg-nf-bg-2 focus-visible:nf-focus"
          @click="$emit('close')"
        >
          {{ t("endgame.legacy.cancel") }}
        </button>
        <button
          type="submit"
          :disabled="submitting"
          data-testid="legacy-create-submit"
          class="rounded-lg bg-nf-accent px-4 py-2 text-[13px] font-semibold text-nf-accent-ink disabled:opacity-50 focus-visible:nf-focus"
        >
          {{ submitting ? t("endgame.legacy.recording") : t("endgame.legacy.create") }}
        </button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useLocale } from "../../composables/useLocale";
import { useEndgameCallbackApi, type EndgameLegacyKind } from "./endgameCallbackApi.ts";

const { t } = useLocale();

const props = defineProps<{ workspaceId: string; novelId: string }>();
const emit = defineEmits<{
  (e: "close"): void;
  (e: "created"): void;
}>();

const kind = ref<"" | EndgameLegacyKind>("");
const subjectId = ref("");
const description = ref("");
const submitting = ref(false);
const error = ref("");

async function submit() {
  if (!kind.value) return;
  error.value = "";
  submitting.value = true;
  try {
    const api = useEndgameCallbackApi(props.workspaceId, props.novelId);
    await api.recordLegacy({
      kind: kind.value,
      ...(subjectId.value.trim() ? { subjectId: subjectId.value.trim() } : {}),
      description: description.value.trim(),
    });
    emit("created");
  } catch (e) {
    error.value = String(e instanceof Error ? e.message : e);
  } finally {
    submitting.value = false;
  }
}
</script>
