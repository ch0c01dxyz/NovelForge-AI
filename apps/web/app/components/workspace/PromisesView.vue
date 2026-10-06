<template>
  <div>
    <div class="mb-3">
      <button
        v-if="!showForm"
        type="button"
        data-testid="promises-new"
        class="rounded-lg border border-nf-border-strong bg-nf-bg-3 px-4 py-2 text-[13px] font-semibold text-nf-text hover:bg-nf-bg-2 focus-visible:nf-focus"
        @click="showForm = true"
      >
        {{ t("workspace.timeline.promises.create") }}
      </button>
      <form
        v-else
        data-testid="promises-form"
        class="flex flex-col gap-3 rounded-xl border border-nf-border bg-nf-bg-1 p-4"
        @submit.prevent="submit"
      >
        <div>
          <label :for="`${uid}-title`" class="mb-1 block text-[13px] font-medium text-nf-text">
            {{ t("workspace.timeline.promises.form.title") }}
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
          <label :for="`${uid}-importance`" class="mb-1 block text-[13px] font-medium text-nf-text">
            {{ t("workspace.timeline.promises.form.importance") }}
          </label>
          <select
            :id="`${uid}-importance`"
            v-model="importance"
            class="w-full rounded-lg border border-nf-border bg-nf-bg-0 px-3 py-2 text-[13px] text-nf-text focus-visible:nf-focus"
          >
            <option v-for="n in [1, 2, 3, 4, 5]" :key="n" :value="n">{{ n }}</option>
          </select>
        </div>
        <div>
          <label :for="`${uid}-description`" class="mb-1 block text-[13px] font-medium text-nf-text">
            {{ t("workspace.timeline.promises.form.description") }}
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
              {{ t("workspace.timeline.promises.form.introducedAtChapter") }}
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
              {{ t("workspace.timeline.promises.form.payoffIntent") }}
            </label>
            <input
              :id="`${uid}-payoff`"
              v-model="payoffIntent"
              type="text"
              class="w-full rounded-lg border border-nf-border bg-nf-bg-0 px-3 py-2 text-[13px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
            />
          </div>
        </div>
        <p class="text-[12px] text-nf-text-faint">
          {{ t("workspace.timeline.promises.form.chapterHint") }}
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
      {{ t("workspace.timeline.promises.loading") }}
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
    <p v-else-if="promises.length === 0" class="py-6 text-center text-[13px] text-nf-text-faint">
      {{ t("workspace.timeline.promises.empty") }}
    </p>
    <ul v-else class="flex flex-col gap-2">
      <li
        v-for="promise in promises"
        :key="promise.id"
        data-testid="promise-item"
        class="rounded-xl border border-nf-border bg-nf-bg-1 p-3"
      >
        <div class="flex flex-wrap items-center gap-2">
          <p class="min-w-0 flex-1 text-[13px] font-semibold text-nf-text">{{ promise.title }}</p>
          <span
            v-if="promise.status"
            class="rounded-full border border-nf-border-strong px-2 py-0.5 text-[11px] text-nf-text-dim"
          >
            {{ t(`workspace.timeline.promises.transitionState.${promise.status}`) }}
          </span>
        </div>
        <p v-if="promise.description" class="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-nf-text-dim">
          {{ promise.description }}
        </p>

        <form
          data-testid="promise-transition-form"
          class="mt-2 flex flex-wrap items-end gap-2"
          @submit.prevent="transition(promise)"
        >
          <div>
            <label :for="`${uid}-to-${promise.id}`" class="mb-1 block text-[12px] text-nf-text-dim">
              {{ t("workspace.timeline.promises.recordTransition") }}
            </label>
            <select
              :id="`${uid}-to-${promise.id}`"
              v-model="toDraft[promise.id]"
              class="rounded-lg border border-nf-border bg-nf-bg-0 px-2.5 py-1.5 text-[12.5px] text-nf-text focus-visible:nf-focus"
            >
              <option v-for="s in transitionStates" :key="s" :value="s">
                {{ t(`workspace.timeline.promises.transitionState.${s}`) }}
              </option>
            </select>
          </div>
          <div>
            <label :for="`${uid}-payoffAt-${promise.id}`" class="mb-1 block text-[12px] text-nf-text-dim">
              {{ t("workspace.timeline.promises.form.payoffAtChapter") }}
            </label>
            <input
              :id="`${uid}-payoffAt-${promise.id}`"
              v-model="payoffAtDraft[promise.id]"
              type="text"
              inputmode="numeric"
              class="w-28 rounded-lg border border-nf-border bg-nf-bg-0 px-2.5 py-1.5 text-[12.5px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
            />
          </div>
          <button
            type="submit"
            :disabled="transitioning === promise.id"
            class="rounded-lg border border-nf-border-strong px-3 py-1.5 text-[12.5px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus disabled:opacity-50"
          >
            {{ t("workspace.timeline.promises.applyTransition") }}
          </button>
        </form>
        <p v-if="transitionError[promise.id]" role="alert" class="mt-1 text-[12.5px] text-nf-warn">
          {{ transitionError[promise.id] }}
        </p>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
/**
 * PromisesView (NF-WF-016): story-promise list, creation, and lifecycle
 * transitions (POST .../story/promises/:promiseId/transition).
 */
import { onMounted, ref } from "vue";
import { useApi } from "../../composables/useApi";
import { useLocale } from "../../composables/useLocale";
import { timelineErrorMessage, parseOptionalChapter } from "./workspaceApi";

const props = defineProps<{
  workspaceId: string;
  novelId: string;
}>();

interface StoryPromise {
  id: string;
  title: string;
  description?: string | null;
  importance?: number;
  status?: string;
  introducedAtChapter?: number | null;
}

const transitionStates = [
  "SETUP",
  "DEVELOPING",
  "READY_FOR_PAYOFF",
  "PAID_OFF",
  "ABANDONED",
  "INVALIDATED",
] as const;

const { api } = useApi();
const { t } = useLocale();
const uid = `promises-${Math.random().toString(36).slice(2)}`;

const promises = ref<StoryPromise[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);
const showForm = ref(false);
const saving = ref(false);
const formError = ref<string | null>(null);

const title = ref("");
const description = ref("");
const importance = ref(3);
const introducedAtChapter = ref("");
const payoffIntent = ref("");

const toDraft = ref<Record<string, string>>({});
const payoffAtDraft = ref<Record<string, string>>({});
const transitionError = ref<Record<string, string>>({});
const transitioning = ref<string | null>(null);

function base(): string {
  return `/workspaces/${props.workspaceId}/novels/${props.novelId}/story/promises`;
}

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = null;
  try {
    promises.value = await api<StoryPromise[]>(base());
    for (const p of promises.value) {
      toDraft.value[p.id] = p.status ?? "SETUP";
      payoffAtDraft.value[p.id] = "";
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
    formError.value = t("workspace.timeline.promises.form.chapterInvalid");
    return;
  }
  saving.value = true;
  try {
    await api(base(), {
      method: "POST",
      body: JSON.stringify({
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

async function transition(promise: StoryPromise): Promise<void> {
  const to = toDraft.value[promise.id] ?? "SETUP";
  const payoffAt = parseOptionalChapter(payoffAtDraft.value[promise.id] ?? "");
  if (payoffAt === "invalid") {
    transitionError.value[promise.id] = t("workspace.timeline.promises.form.chapterInvalid");
    return;
  }
  transitionError.value[promise.id] = "";
  transitioning.value = promise.id;
  try {
    const updated = await api<StoryPromise>(`${base()}/${promise.id}/transition`, {
      method: "POST",
      body: JSON.stringify({ to, payoffAtChapter: payoffAt }),
    });
    const idx = promises.value.findIndex((x) => x.id === promise.id);
    if (idx >= 0) promises.value[idx] = updated;
  } catch (e) {
    transitionError.value[promise.id] = timelineErrorMessage(t, e);
  } finally {
    transitioning.value = null;
  }
}

onMounted(load);

</script>
