<template>
  <div>
    <p class="mb-3 rounded-lg border border-nf-border bg-nf-bg-1 px-3 py-2 text-[12px] leading-relaxed text-nf-text-faint">
      {{ t("workspace.timeline.threads.noLinkingNote") }}
    </p>

    <div class="mb-3">
      <button
        v-if="!showForm"
        type="button"
        data-testid="threads-new"
        class="rounded-lg border border-nf-border-strong bg-nf-bg-3 px-4 py-2 text-[13px] font-semibold text-nf-text hover:bg-nf-bg-2 focus-visible:nf-focus"
        @click="showForm = true"
      >
        {{ t("workspace.timeline.threads.create") }}
      </button>
      <form
        v-else
        data-testid="threads-form"
        class="flex flex-col gap-3 rounded-xl border border-nf-border bg-nf-bg-1 p-4"
        @submit.prevent="submit"
      >
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label :for="`${uid}-kind`" class="mb-1 block text-[13px] font-medium text-nf-text">
              {{ t("workspace.timeline.threads.form.kind") }}
            </label>
            <select
              :id="`${uid}-kind`"
              v-model="kind"
              class="w-full rounded-lg border border-nf-border bg-nf-bg-0 px-3 py-2 text-[13px] text-nf-text focus-visible:nf-focus"
            >
              <option v-for="k in kinds" :key="k" :value="k">
                {{ t(`workspace.timeline.threads.kind.${k}`) }}
              </option>
            </select>
          </div>
          <div>
            <label :for="`${uid}-importance`" class="mb-1 block text-[13px] font-medium text-nf-text">
              {{ t("workspace.timeline.threads.form.importance") }}
            </label>
            <select
              :id="`${uid}-importance`"
              v-model="importance"
              class="w-full rounded-lg border border-nf-border bg-nf-bg-0 px-3 py-2 text-[13px] text-nf-text focus-visible:nf-focus"
            >
              <option v-for="n in [1, 2, 3, 4, 5]" :key="n" :value="n">{{ n }}</option>
            </select>
          </div>
        </div>
        <div>
          <label :for="`${uid}-title`" class="mb-1 block text-[13px] font-medium text-nf-text">
            {{ t("workspace.timeline.threads.form.title") }}
          </label>
          <input
            :id="`${uid}-title`"
            v-model="title"
            type="text"
            required
            maxlength="300"
            class="w-full rounded-lg border border-nf-border bg-nf-bg-0 px-3 py-2 text-[13px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
          />
        </div>
        <div>
          <label :for="`${uid}-description`" class="mb-1 block text-[13px] font-medium text-nf-text">
            {{ t("workspace.timeline.threads.form.description") }}
          </label>
          <textarea
            :id="`${uid}-description`"
            v-model="description"
            rows="2"
            maxlength="20000"
            class="w-full rounded-lg border border-nf-border bg-nf-bg-0 px-3 py-2 text-[13px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
          />
        </div>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label
              :for="`${uid}-introduced`"
              class="mb-1 block text-[13px] font-medium text-nf-text"
            >
              {{ t("workspace.timeline.threads.form.introducedAtChapter") }}
            </label>
            <input
              :id="`${uid}-introduced`"
              v-model="introducedAtChapter"
              type="text"
              inputmode="numeric"
              class="w-full rounded-lg border border-nf-border bg-nf-bg-0 px-3 py-2 text-[13px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
            />
          </div>
          <div>
            <label :for="`${uid}-payoff`" class="mb-1 block text-[13px] font-medium text-nf-text">
              {{ t("workspace.timeline.threads.form.payoffIntent") }}
            </label>
            <input
              :id="`${uid}-payoff`"
              v-model="payoffIntent"
              type="text"
              maxlength="20000"
              class="w-full rounded-lg border border-nf-border bg-nf-bg-0 px-3 py-2 text-[13px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
            />
          </div>
        </div>
        <p class="text-[12px] text-nf-text-faint">
          {{ t("workspace.timeline.threads.form.chapterHint") }}
        </p>
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
      {{ t("workspace.timeline.threads.loading") }}
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
    <p v-else-if="threads.length === 0" class="py-6 text-center text-[13px] text-nf-text-faint">
      {{ t("workspace.timeline.threads.empty") }}
    </p>
    <ul v-else class="flex flex-col gap-2">
      <li
        v-for="thread in threads"
        :key="thread.id"
        data-testid="thread-item"
        class="rounded-xl border border-nf-border bg-nf-bg-1 p-3"
      >
        <div class="flex flex-wrap items-center gap-2">
          <p class="min-w-0 flex-1 text-[13px] font-semibold text-nf-text">{{ thread.title }}</p>
          <span class="rounded-full border border-nf-border-strong px-2 py-0.5 text-[11px] text-nf-text-dim">
            {{ t(`workspace.timeline.threads.kind.${thread.kind}`) }}
          </span>
          <span class="rounded-full border border-nf-border-strong px-2 py-0.5 text-[11px] text-nf-text-dim">
            {{ t(`workspace.timeline.threads.status.${thread.status}`) }}
          </span>
        </div>
        <p v-if="thread.description" class="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-nf-text-dim">
          {{ thread.description }}
        </p>

        <form
          data-testid="thread-status-form"
          class="mt-2 flex flex-wrap items-end gap-2"
          @submit.prevent="changeStatus(thread)"
        >
          <div>
            <label :for="`${uid}-status-${thread.id}`" class="mb-1 block text-[12px] text-nf-text-dim">
              {{ t("workspace.timeline.threads.statusChange") }}
            </label>
            <select
              :id="`${uid}-status-${thread.id}`"
              v-model="statusDraft[thread.id]"
              class="rounded-lg border border-nf-border bg-nf-bg-0 px-2.5 py-1.5 text-[12.5px] text-nf-text focus-visible:nf-focus"
            >
              <option v-for="s in statuses" :key="s" :value="s">
                {{ t(`workspace.timeline.threads.status.${s}`) }}
              </option>
            </select>
          </div>
          <div>
            <label :for="`${uid}-resolved-${thread.id}`" class="mb-1 block text-[12px] text-nf-text-dim">
              {{ t("workspace.timeline.threads.form.resolvedAtChapter") }}
            </label>
            <input
              :id="`${uid}-resolved-${thread.id}`"
              v-model="resolvedDraft[thread.id]"
              type="text"
              inputmode="numeric"
              class="w-28 rounded-lg border border-nf-border bg-nf-bg-0 px-2.5 py-1.5 text-[12.5px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
            />
          </div>
          <button
            type="submit"
            :disabled="transitioning === thread.id"
            class="rounded-lg border border-nf-border-strong px-3 py-1.5 text-[12.5px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus disabled:opacity-50"
          >
            {{ t("workspace.timeline.threads.updateStatus") }}
          </button>
        </form>
        <p v-if="statusError[thread.id]" role="alert" class="mt-1 text-[12.5px] text-nf-warn">
          {{ statusError[thread.id] }}
        </p>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
/**
 * ThreadsView (NF-WF-016): story-thread list, creation, and status
 * transitions (POST .../story/threads/:threadId/status).
 *
 * Deliberately NO thread↔event linking UI: the StoryThreadEvent relation
 * is schema-only with no API (GAP-056, Q3 deferred). The note at the top
 * of the tab says so honestly instead of pretending the affordance exists.
 */
import { onMounted, ref } from "vue";
import { useApi } from "../../composables/useApi";
import { useLocale } from "../../composables/useLocale";
import { timelineErrorMessage, parseOptionalChapter } from "./workspaceApi";

const props = defineProps<{
  workspaceId: string;
  novelId: string;
}>();

interface StoryThread {
  id: string;
  kind: string;
  title: string;
  status: string;
  description?: string | null;
  importance?: number;
  introducedAtChapter?: number | null;
  resolvedAtChapter?: number | null;
}

const kinds = ["MYSTERY", "CONFLICT", "QUESTION", "OBJECTIVE", "SUBPLOT"] as const;
const statuses = ["ACTIVE", "DORMANT", "RESOLVED"] as const;

const { api } = useApi();
const { t } = useLocale();
const uid = `threads-${Math.random().toString(36).slice(2)}`;

const threads = ref<StoryThread[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);
const showForm = ref(false);
const saving = ref(false);
const formError = ref<string | null>(null);

const kind = ref<string>("MYSTERY");
const title = ref("");
const description = ref("");
const importance = ref(3);
const introducedAtChapter = ref("");
const payoffIntent = ref("");

const statusDraft = ref<Record<string, string>>({});
const resolvedDraft = ref<Record<string, string>>({});
const statusError = ref<Record<string, string>>({});
const transitioning = ref<string | null>(null);

function base(): string {
  return `/workspaces/${props.workspaceId}/novels/${props.novelId}/story/threads`;
}

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = null;
  try {
    threads.value = await api<StoryThread[]>(base());
    for (const th of threads.value) {
      statusDraft.value[th.id] = th.status;
      resolvedDraft.value[th.id] = "";
    }
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
  kind.value = "MYSTERY";
  title.value = "";
  description.value = "";
  importance.value = 3;
  introducedAtChapter.value = "";
  payoffIntent.value = "";
}

async function submit(): Promise<void> {
  formError.value = null;
  if (title.value.trim().length === 0) {
    formError.value = t("workspace.timeline.common.fieldRequired");
    return;
  }
  const introduced = parseOptionalChapter(introducedAtChapter.value);
  if (introduced === "invalid") {
    formError.value = t("workspace.timeline.threads.form.chapterInvalid");
    return;
  }
  saving.value = true;
  try {
    await api(base(), {
      method: "POST",
      body: JSON.stringify({
        kind: kind.value,
        title: title.value.trim(),
        description: description.value.trim() === "" ? null : description.value.trim(),
        importance: importance.value,
        introducedAtChapter: introduced,
        payoffIntent: payoffIntent.value.trim() === "" ? null : payoffIntent.value.trim(),
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

async function changeStatus(thread: StoryThread): Promise<void> {
  const to = statusDraft.value[thread.id] ?? thread.status;
  const resolved = parseOptionalChapter(resolvedDraft.value[thread.id] ?? "");
  if (resolved === "invalid") {
    statusError.value[thread.id] = t("workspace.timeline.threads.form.chapterInvalid");
    return;
  }
  statusError.value[thread.id] = "";
  transitioning.value = thread.id;
  try {
    const updated = await api<StoryThread>(`${base()}/${thread.id}/status`, {
      method: "POST",
      body: JSON.stringify({ status: to, resolvedAtChapter: resolved }),
    });
    const idx = threads.value.findIndex((x) => x.id === thread.id);
    if (idx >= 0) threads.value[idx] = updated;
  } catch (e) {
    statusError.value[thread.id] = timelineErrorMessage(t, e);
  } finally {
    transitioning.value = null;
  }
}

onMounted(load);

</script>
