<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import { ApiError, useApi } from "../../composables/useApi";
import { useLocale } from "../../composables/useLocale";

interface Workspace {
  id: string;
  name: string;
  slug: string;
  role: string;
  canCreateNovel: boolean;
}
const emit = defineEmits<{ close: []; created: [workspaceId: string, novelId: string] }>();
const { api } = useApi();
const { t } = useLocale();
const workspaces = ref<Workspace[]>([]);
const loading = ref(true);
const loadError = ref(false);
const mode = ref<"existing" | "new">("new");
const workspaceId = ref("");
const workspaceName = ref("");
const workspaceSlug = ref("");
const title = ref("");
const slug = ref("");
const step = ref(1);
const heading = ref<HTMLElement | null>(null);
const busy = ref(false);
const errorKey = ref("");
const createdWorkspaceId = ref("");
const ambiguous = ref(false);
const completed = ref(false);
const eligible = computed(() => workspaces.value.filter((w) => w.canCreateNovel));
const validSlug = (value: string) => value.length <= 80 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const workspaceValid = computed(() =>
  mode.value === "existing"
    ? eligible.value.some((w) => w.id === workspaceId.value)
    : !!workspaceName.value.trim() &&
      workspaceName.value.trim().length <= 120 &&
      validSlug(workspaceSlug.value),
);
const novelValid = computed(
  () => !!title.value.trim() && title.value.trim().length <= 200 && validSlug(slug.value),
);
const workspaceLabel = computed(() =>
  mode.value === "new"
    ? workspaceName.value.trim()
    : eligible.value.find((w) => w.id === workspaceId.value)?.name,
);

async function loadWorkspaces() {
  loading.value = true;
  loadError.value = false;
  try {
    workspaces.value = await api<Workspace[]>("/workspaces");
    if (eligible.value.length) {
      mode.value = "existing";
      workspaceId.value = eligible.value[0]!.id;
    }
  } catch {
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}
onMounted(() => {
  heading.value?.focus();
  void loadWorkspaces();
});
async function move(next: number) {
  if (
    busy.value ||
    ambiguous.value ||
    completed.value ||
    (next > step.value && (step.value === 1 ? !workspaceValid.value : !novelValid.value))
  )
    return;
  step.value = next;
  errorKey.value = "";
  await nextTick();
  heading.value?.focus();
}
async function create() {
  if (
    step.value !== 3 ||
    busy.value ||
    ambiguous.value ||
    completed.value ||
    !workspaceValid.value ||
    !novelValid.value
  )
    return;
  busy.value = true;
  errorKey.value = "";
  try {
    let target = workspaceId.value;
    if (mode.value === "new") {
      if (!createdWorkspaceId.value) {
        const workspace = await api<{ id: string }>("/workspaces", {
          method: "POST",
          body: JSON.stringify({ name: workspaceName.value.trim(), slug: workspaceSlug.value }),
        });
        createdWorkspaceId.value = workspace.id;
      }
      target = createdWorkspaceId.value;
    }
    const novel = await api<{ id: string }>(`/workspaces/${target}/novels`, {
      method: "POST",
      body: JSON.stringify({ title: title.value.trim(), slug: slug.value }),
    });
    completed.value = true;
    emit("created", target, novel.id);
  } catch (e) {
    // A missing/5xx response may follow a committed write; never silently repeat it.
    ambiguous.value = !(e instanceof ApiError) || e.status >= 500;
    errorKey.value =
      !(e instanceof ApiError) || e.status >= 500
        ? "authorHome.ambiguous"
        : e.status === 409
          ? "authorHome.conflict"
          : e.status === 401 || e.status === 403
            ? "authorHome.forbidden"
            : "authorHome.createError";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section
    aria-labelledby="new-novel-heading"
    class="mt-6 rounded-xl border border-nf-border bg-nf-bg-1 p-5 sm:p-6"
    :aria-busy="loading || busy"
  >
    <div class="flex items-start justify-between gap-4">
      <h2
        id="new-novel-heading"
        ref="heading"
        tabindex="-1"
        class="font-nf-literary text-xl font-semibold focus:outline-none"
      >
        {{ t("authorHome.create") }}
      </h2>
      <button
        type="button"
        :disabled="busy"
        class="text-sm text-nf-text-dim focus-visible:nf-focus disabled:opacity-50"
        @click="emit('close')"
      >
        {{ t("common.close") }}
      </button>
    </div>
    <ol class="my-5 flex flex-wrap gap-4 text-sm" :aria-label="t('authorHome.steps')">
      <li
        v-for="(key, index) in ['workspace', 'details', 'review']"
        :key="key"
        :aria-current="step === index + 1 ? 'step' : undefined"
        :class="step === index + 1 ? 'font-semibold text-nf-text' : 'text-nf-text-dim'"
      >
        {{ index + 1 }}. {{ t("authorHome." + key) }}
      </li>
    </ol>
    <p v-if="loading" role="status">{{ t("common.loading") }}</p>
    <div v-else-if="loadError" role="alert">
      <p>{{ t("authorHome.workspaceError") }}</p>
      <button type="button" class="mt-3 underline focus-visible:nf-focus" @click="loadWorkspaces">
        {{ t("common.retry") }}
      </button>
    </div>
    <form v-else class="space-y-4" @submit.prevent="step < 3 ? move(step + 1) : create()">
      <fieldset v-if="step === 1" class="space-y-4">
        <legend class="mb-3 text-sm text-nf-text-dim">{{ t("authorHome.workspaceHint") }}</legend>
        <div v-if="eligible.length" class="flex flex-wrap gap-5 text-sm">
          <label class="flex items-center gap-2"
            ><input
              v-model="mode"
              type="radio"
              value="existing"
              :disabled="!!createdWorkspaceId"
            />{{ t("authorHome.existing") }}</label
          >
          <label class="flex items-center gap-2"
            ><input v-model="mode" type="radio" value="new" :disabled="!!createdWorkspaceId" />{{
              t("authorHome.newWorkspace")
            }}</label
          >
        </div>
        <label v-if="mode === 'existing'" class="block text-sm"
          >{{ t("authorHome.workspace") }}
          <select
            v-model="workspaceId"
            class="mt-2 block w-full rounded-lg border border-nf-border-strong bg-nf-bg-0 p-2.5 focus-visible:nf-focus"
          >
            <option v-for="w in eligible" :key="w.id" :value="w.id">{{ w.name }}</option>
          </select>
        </label>
        <template v-else>
          <label class="block text-sm"
            >{{ t("authorHome.workspaceName")
            }}<input
              v-model="workspaceName"
              data-testid="workspace-name"
              required
              maxlength="120"
              :disabled="!!createdWorkspaceId"
              class="mt-2 block w-full rounded-lg border border-nf-border-strong bg-nf-bg-0 p-2.5 focus-visible:nf-focus disabled:opacity-60"
          /></label>
          <label class="block text-sm"
            >{{ t("authorHome.workspaceSlug")
            }}<input
              v-model="workspaceSlug"
              data-testid="workspace-slug"
              required
              maxlength="80"
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              :disabled="!!createdWorkspaceId"
              aria-describedby="workspace-slug-help"
              class="mt-2 block w-full rounded-lg border border-nf-border-strong bg-nf-bg-0 p-2.5 focus-visible:nf-focus disabled:opacity-60"
          /></label>
          <p id="workspace-slug-help" class="text-sm text-nf-text-dim">
            {{ t("authorHome.slugHint") }}
          </p>
        </template>
      </fieldset>
      <fieldset v-else-if="step === 2" class="space-y-4">
        <legend class="mb-3 text-sm text-nf-text-dim">{{ t("authorHome.details") }}</legend>
        <label class="block text-sm"
          >{{ t("authorHome.novelTitle")
          }}<input
            v-model="title"
            data-testid="novel-title"
            required
            maxlength="200"
            class="mt-2 block w-full rounded-lg border border-nf-border-strong bg-nf-bg-0 p-2.5 focus-visible:nf-focus"
        /></label>
        <label class="block text-sm"
          >{{ t("authorHome.novelSlug")
          }}<input
            v-model="slug"
            data-testid="novel-slug"
            required
            maxlength="80"
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            aria-describedby="novel-slug-help"
            class="mt-2 block w-full rounded-lg border border-nf-border-strong bg-nf-bg-0 p-2.5 focus-visible:nf-focus"
        /></label>
        <p id="novel-slug-help" class="text-sm text-nf-text-dim">{{ t("authorHome.slugHint") }}</p>
      </fieldset>
      <div v-else class="space-y-4">
        <p class="text-sm text-nf-text-dim">{{ t("authorHome.reviewHint") }}</p>
        <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
          <dt class="text-nf-text-dim">{{ t("authorHome.workspace") }}</dt>
          <dd class="break-words">{{ workspaceLabel }}</dd>
          <dt class="text-nf-text-dim">{{ t("authorHome.workspaceSlug") }}</dt>
          <dd class="break-words">
            {{ mode === "new" ? workspaceSlug : eligible.find((w) => w.id === workspaceId)?.slug }}
          </dd>
          <dt class="text-nf-text-dim">{{ t("authorHome.novelTitle") }}</dt>
          <dd class="break-words">{{ title.trim() }}</dd>
          <dt class="text-nf-text-dim">{{ t("authorHome.novelSlug") }}</dt>
          <dd class="break-words">{{ slug }}</dd>
        </dl>
      </div>
      <p v-if="createdWorkspaceId && !completed" role="status" class="text-sm text-nf-text-dim">
        {{ t("authorHome.partial") }}
      </p>
      <p v-if="errorKey" role="alert" class="text-sm text-nf-warn">{{ t(errorKey) }}</p>
      <p v-if="completed" role="status" class="text-sm">{{ t("authorHome.created") }}</p>
      <div class="flex flex-wrap justify-end gap-3 pt-2">
        <button
          v-if="step > 1"
          type="button"
          :disabled="busy || ambiguous || completed"
          class="rounded-lg border border-nf-border-strong px-4 py-2 text-sm focus-visible:nf-focus disabled:opacity-50"
          @click="move(step - 1)"
        >
          {{ t("authorHome.back") }}
        </button>
        <button
          type="submit"
          data-testid="wizard-next"
          :disabled="busy || ambiguous || completed || (step === 1 ? !workspaceValid : !novelValid)"
          class="rounded-lg bg-nf-accent px-4 py-2 text-sm font-semibold text-nf-accent-ink focus-visible:nf-focus disabled:opacity-50"
        >
          {{
            busy
              ? t("authorHome.creating")
              : step === 3
                ? t("authorHome.confirm")
                : t("authorHome.next")
          }}
        </button>
      </div>
    </form>
  </section>
</template>
