<template>
  <div>
    <div class="mb-3">
      <button
        v-if="!showForm"
        type="button"
        data-testid="timeline-new"
        class="rounded-lg border border-nf-border-strong bg-nf-bg-3 px-4 py-2 text-[13px] font-semibold text-nf-text hover:bg-nf-bg-2 focus-visible:nf-focus"
        @click="showForm = true"
      >
        {{ t("workspace.timeline.timelineEntries.create") }}
      </button>
      <form
        v-else
        data-testid="timeline-form"
        class="flex flex-col gap-3 rounded-xl border border-nf-border bg-nf-bg-1 p-4"
        @submit.prevent="submit"
      >
        <div>
          <label :for="`${uid}-description`" class="mb-1 block text-[13px] font-medium text-nf-text">
            {{ t("workspace.timeline.timelineEntries.form.description") }}
          </label>
          <textarea
            :id="`${uid}-description`"
            v-model="description"
            rows="3"
            required
            maxlength="20000"
            class="w-full rounded-lg border border-nf-border bg-nf-bg-0 px-3 py-2 text-[13px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
            :placeholder="t('workspace.timeline.timelineEntries.form.descriptionPlaceholder')"
          />
        </div>
        <div>
          <label
            :for="`${uid}-availableFrom`"
            class="mb-1 block text-[13px] font-medium text-nf-text"
          >
            {{ t("workspace.timeline.timelineEntries.form.availableFromChapter") }}
          </label>
          <input
            :id="`${uid}-availableFrom`"
            v-model="availableFromChapter"
            type="text"
            inputmode="numeric"
            class="w-full rounded-lg border border-nf-border bg-nf-bg-0 px-3 py-2 text-[13px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
          />
          <p class="mt-1 text-[12px] text-nf-text-faint">
            {{ t("workspace.timeline.timelineEntries.form.chapterHint") }}
          </p>
        </div>
        <p v-if="formError" role="alert" class="text-[13px] text-nf-warn">{{ formError }}</p>
        <div class="flex justify-end gap-2">
          <button
            type="button"
            class="rounded-lg border border-nf-border-strong px-4 py-2 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
            @click="resetForm"
          >
            {{ t("workspace.timeline.common.cancel") }}
          </button>
          <button
            type="submit"
            :disabled="saving"
            class="rounded-lg border border-nf-border-strong bg-nf-bg-3 px-4 py-2 text-[13px] font-semibold text-nf-text hover:bg-nf-bg-2 focus-visible:nf-focus disabled:opacity-50"
          >
            {{ saving ? t("workspace.timeline.common.saving") : t("workspace.timeline.common.create") }}
          </button>
        </div>
      </form>
    </div>

    <div v-if="loading" class="py-6 text-center text-[13px] text-nf-text-dim">
      {{ t("workspace.timeline.timelineEntries.loading") }}
    </div>
    <div v-else-if="loadError" role="alert" class="py-4 text-center">
      <p class="text-[13px] text-nf-warn">{{ loadError }}</p>
      <button
        type="button"
        class="mt-2 rounded-lg border border-nf-border-strong px-3 py-1.5 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
        @click="load"
      >
        {{ t("workspace.timeline.common.retry") }}
      </button>
    </div>
    <p v-else-if="entries.length === 0" class="py-6 text-center text-[13px] text-nf-text-faint">
      {{ t("workspace.timeline.timelineEntries.empty") }}
    </p>
    <ul v-else class="flex flex-col gap-2">
      <li
        v-for="entry in entries"
        :key="entry.id"
        data-testid="timeline-entry-item"
        class="rounded-xl border border-nf-border bg-nf-bg-1 p-3"
      >
        <p class="whitespace-pre-wrap text-[13px] leading-relaxed text-nf-text">
          {{ entry.description }}
        </p>
        <p class="mt-1 text-[12px] text-nf-text-faint">
          <span v-if="entry.availableFromChapter === null || entry.availableFromChapter === undefined">
            {{ t("workspace.timeline.timelineEntries.hiddenFromReaders") }}
          </span>
          <span v-else>
            {{
              t("workspace.timeline.timelineEntries.availableFrom", {
                chapter: entry.availableFromChapter,
              })
            }}
          </span>
        </p>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
/**
 * TimelineView (NF-WF-016): timeline-entry list + creation form.
 * POST/GET .../story/timeline. No delete route exists by design.
 */
import { onMounted, ref } from "vue";
import { useApi } from "../../composables/useApi";
import { useLocale } from "../../composables/useLocale";
import { timelineErrorMessage, parseOptionalChapter } from "./workspaceApi";

const props = defineProps<{
  workspaceId: string;
  novelId: string;
}>();

interface TimelineEntry {
  id: string;
  description?: string;
  availableFromChapter?: number | null;
}

const { api } = useApi();
const { t } = useLocale();
const uid = `timeline-${Math.random().toString(36).slice(2)}`;

const entries = ref<TimelineEntry[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);
const showForm = ref(false);
const saving = ref(false);
const formError = ref<string | null>(null);
const description = ref("");
const availableFromChapter = ref("");

function base(): string {
  return `/workspaces/${props.workspaceId}/novels/${props.novelId}/story/timeline`;
}

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = null;
  try {
    entries.value = await api<TimelineEntry[]>(base());
  } catch (e) {
    loadError.value = timelineErrorMessage(t, e);
  } finally {
    loading.value = false;
  }
}

function resetForm(): void {
  showForm.value = false;
  saving.value = false;
  formError.value = null;
  description.value = "";
  availableFromChapter.value = "";
}

async function submit(): Promise<void> {
  formError.value = null;
  if (description.value.trim().length === 0) {
    formError.value = t("workspace.timeline.common.fieldRequired");
    return;
  }
  const chapter = parseOptionalChapter(availableFromChapter.value);
  if (chapter === "invalid") {
    formError.value = t("workspace.timeline.timelineEntries.form.chapterInvalid");
    return;
  }
  saving.value = true;
  try {
    await api(base(), {
      method: "POST",
      body: JSON.stringify({
        description: description.value.trim(),
        availableFromChapter: chapter,
      }),
    });
    resetForm();
    await load();
  } catch (e) {
    formError.value = timelineErrorMessage(t, e);
  } finally {
    saving.value = false;
  }
}

onMounted(load);

</script>
