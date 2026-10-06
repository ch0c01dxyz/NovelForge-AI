<template>
  <section aria-labelledby="entity-browser-title">
    <div class="mb-3 flex items-center justify-between gap-3">
      <h3 id="entity-browser-title" class="text-[15px] font-semibold text-nf-text">
        {{ t("workspace.world.entities.title") }}
      </h3>
      <button
        type="button"
        class="rounded-md border border-nf-border-strong px-2.5 py-1 text-[13px] text-nf-text hover:bg-nf-bg-2 focus-visible:nf-focus"
        :aria-expanded="showCreate"
        @click="showCreate = !showCreate"
      >
        {{ t("workspace.world.entities.new") }}
      </button>
    </div>

    <!-- Kind filter: radiogroup, arrow-key navigable -->
    <div
      role="radiogroup"
      :aria-label="t('workspace.world.entities.kindFilter')"
      class="mb-3 flex flex-wrap gap-1.5"
    >
      <button
        v-for="k in kindOptions"
        :key="k"
        ref="kindBtns"
        type="button"
        role="radio"
        :aria-checked="kind === k"
        :tabindex="kind === k ? 0 : -1"
        class="rounded-full border px-2.5 py-1 text-[12px] focus-visible:nf-focus"
        :class="
          kind === k
            ? 'border-nf-accent bg-nf-accent text-nf-accent-ink'
            : 'border-nf-border text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text'
        "
        @click="kind = k"
        @keydown="onKindKeydown($event, k)"
      >
        {{ k === "ALL" ? t("workspace.world.entities.kindAll") : t(`workspace.world.entities.kind.${k}`) }}
      </button>
    </div>

    <!-- Create form -->
    <form
      v-if="showCreate"
      class="mb-4 rounded-lg border border-nf-border bg-nf-bg-2 p-3"
      @submit.prevent="createEntity"
    >
      <div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label class="block">
          <span class="mb-1 block text-[12px] text-nf-text-dim">{{ t("workspace.world.entities.form.kind") }}</span>
          <select
            v-model="form.kind"
            class="w-full rounded-md border border-nf-border bg-nf-bg-1 px-2.5 py-1.5 text-[13px] text-nf-text focus-visible:nf-focus"
          >
            <option v-for="k in ENTITY_KINDS" :key="k" :value="k">
              {{ t(`workspace.world.entities.kind.${k}`) }}
            </option>
          </select>
        </label>
        <label class="block">
          <span class="mb-1 block text-[12px] text-nf-text-dim">{{ t("workspace.world.entities.form.name") }}</span>
          <input
            v-model="form.name"
            type="text"
            maxlength="300"
            :placeholder="t('workspace.world.entities.form.namePlaceholder')"
            class="w-full rounded-md border border-nf-border bg-nf-bg-1 px-2.5 py-1.5 text-[13px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
          />
        </label>
        <label class="block">
          <span class="mb-1 block text-[12px] text-nf-text-dim">{{ t("workspace.world.entities.form.key") }}</span>
          <input
            v-model="form.key"
            type="text"
            maxlength="64"
            class="w-full rounded-md border border-nf-border bg-nf-bg-1 px-2.5 py-1.5 text-[13px] text-nf-text placeholder:text-nf-text-faint focus-visible:nf-focus"
          />
        </label>
      </div>
      <p class="mt-1 text-[12px] text-nf-text-faint">{{ t("workspace.world.entities.form.keyHint") }}</p>
      <p v-if="formError" role="alert" class="mt-2 text-[13px] text-nf-warn">{{ formError }}</p>
      <div class="mt-2 flex gap-2">
        <button
          type="submit"
          :disabled="creating"
          class="rounded-md bg-nf-accent px-3 py-1.5 text-[13px] font-medium text-nf-accent-ink hover:brightness-110 disabled:opacity-50 focus-visible:nf-focus"
        >
          {{ creating ? t("workspace.world.entities.creating") : t("workspace.world.entities.create") }}
        </button>
        <button
          type="button"
          class="rounded-md border border-nf-border px-3 py-1.5 text-[13px] text-nf-text-dim hover:bg-nf-bg-3 focus-visible:nf-focus"
          @click="showCreate = false"
        >
          {{ t("common.cancel") }}
        </button>
      </div>
    </form>

    <!-- List states -->
    <div v-if="loading" class="py-6 text-center text-[13px] text-nf-text-dim" role="status">
      {{ t("common.loading") }}
    </div>
    <div v-else-if="error" class="rounded-lg border border-nf-border bg-nf-bg-2 p-4 text-center">
      <p role="alert" class="text-[13px] text-nf-warn">{{ error }}</p>
      <button
        type="button"
        class="mt-2 rounded-md border border-nf-border-strong px-3 py-1.5 text-[13px] text-nf-text hover:bg-nf-bg-3 focus-visible:nf-focus"
        @click="load"
      >
        {{ t("common.retry") }}
      </button>
    </div>
    <p v-else-if="entities.length === 0" class="py-6 text-center text-[13px] text-nf-text-faint">
      {{ t("workspace.world.entities.empty") }}
    </p>
    <ul v-else :aria-label="t('workspace.world.entities.listLabel')" class="divide-y divide-nf-border rounded-lg border border-nf-border">
      <li v-for="e in entities" :key="e.id" class="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          class="min-w-0 flex-1 text-left focus-visible:nf-focus rounded"
          :title="t('workspace.world.entities.viewFacts')"
          @click="emit('select', e)"
        >
          <span class="block truncate text-[13px] font-medium text-nf-text">{{ e.name }}</span>
          <span class="block truncate text-[12px] text-nf-text-faint">
            {{ t(`workspace.world.entities.kind.${e.kind}`) }} · {{ e.key }}
          </span>
        </button>
        <button
          v-if="confirmingDelete !== e.id"
          type="button"
          class="shrink-0 rounded-md border border-nf-border px-2 py-1 text-[12px] text-nf-text-dim hover:border-nf-warn hover:text-nf-warn focus-visible:nf-focus"
          :aria-label="`${t('workspace.world.entities.delete')}: ${e.name}`"
          @click="confirmingDelete = e.id"
        >
          {{ t("workspace.world.entities.delete") }}
        </button>
        <span v-else class="flex shrink-0 items-center gap-1.5" role="alertdialog" :aria-label="t('workspace.world.entities.confirmDeleteTitle')">
          <span class="max-w-[220px] truncate text-[12px] text-nf-warn" :title="t('workspace.world.entities.confirmDelete', { name: e.name })">
            {{ t("workspace.world.entities.confirmDelete", { name: e.name }) }}
          </span>
          <button
            type="button"
            :disabled="deleting"
            class="rounded-md border border-nf-warn px-2 py-1 text-[12px] text-nf-warn hover:bg-nf-bg-2 disabled:opacity-50 focus-visible:nf-focus"
            @click="deleteEntity(e)"
          >
            {{ t("workspace.world.entities.confirmYes") }}
          </button>
          <button
            type="button"
            class="rounded-md border border-nf-border px-2 py-1 text-[12px] text-nf-text-dim hover:bg-nf-bg-2 focus-visible:nf-focus"
            @click="confirmingDelete = null"
          >
            {{ t("workspace.world.entities.confirmNo") }}
          </button>
        </span>
      </li>
    </ul>
    <p v-if="deleteError" role="alert" class="mt-2 text-[13px] text-nf-warn">{{ deleteError }}</p>
  </section>
</template>

<script setup lang="ts">
/**
 * Entity browser (NF-WF-016, World & Lore): kind-filtered StoryEntity list
 * with create and (confirmed) delete. Delete is refused by the server with
 * 409 CONFLICT when any canon fact cites the entity — surfaced honestly.
 */
import { onMounted, ref, watch } from "vue";
import { useApi, ApiError } from "../../composables/useApi";
import { useLocale } from "../../composables/useLocale";
import { ENTITY_KINDS, ENTITY_KEY_RE, type StoryEntity } from "./canon-types";

const props = defineProps<{
  workspaceId: string;
  novelId: string;
}>();

const emit = defineEmits<{
  (e: "select", entity: StoryEntity): void;
  (e: "changed"): void;
}>();

const { t } = useLocale();
const { api } = useApi();

type KindOption = (typeof ENTITY_KINDS)[number] | "ALL";
const kindOptions: KindOption[] = ["ALL", ...ENTITY_KINDS];

const kind = ref<KindOption>("ALL");
const entities = ref<StoryEntity[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const showCreate = ref(false);
const creating = ref(false);
const formError = ref<string | null>(null);
const form = ref({ kind: ENTITY_KINDS[0] as (typeof ENTITY_KINDS)[number], name: "", key: "" });
const confirmingDelete = ref<string | null>(null);
const deleting = ref(false);
const deleteError = ref<string | null>(null);
const kindBtns = ref<HTMLElement[]>([]);

function errText(e: unknown): string {
  if (e instanceof ApiError) {
    const key = `workspace.world.errors.${e.code}`;
    const msg = t(key);
    return msg === key ? e.code : msg;
  }
  return t("workspace.world.errors.network");
}

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const qs = kind.value === "ALL" ? "" : `?kind=${kind.value}`;
    entities.value = await api<StoryEntity[]>(
      `/workspaces/${props.workspaceId}/novels/${props.novelId}/canon/entities${qs}`,
    );
  } catch (e) {
    error.value = errText(e);
  } finally {
    loading.value = false;
  }
}

async function createEntity() {
  formError.value = null;
  const name = form.value.name.trim();
  const key = form.value.key.trim();
  if (!name) {
    formError.value = t("workspace.world.entities.nameRequired");
    return;
  }
  if (key && !ENTITY_KEY_RE.test(key)) {
    formError.value = t("workspace.world.entities.form.keyInvalid");
    return;
  }
  creating.value = true;
  try {
    await api<{ id: string }>(`/workspaces/${props.workspaceId}/novels/${props.novelId}/canon/entities`, {
      method: "POST",
      body: JSON.stringify({
        kind: form.value.kind,
        name,
        ...(key ? { key } : {}),
      }),
    });
    form.value.name = "";
    form.value.key = "";
    showCreate.value = false;
    await load();
    emit("changed");
  } catch (e) {
    formError.value = errText(e);
  } finally {
    creating.value = false;
  }
}

async function deleteEntity(e: StoryEntity) {
  deleteError.value = null;
  deleting.value = true;
  try {
    await api<void>(
      `/workspaces/${props.workspaceId}/novels/${props.novelId}/canon/entities/${e.id}`,
      { method: "DELETE" },
    );
    confirmingDelete.value = null;
    await load();
    emit("changed");
  } catch (err) {
    if (err instanceof ApiError && err.code === "CONFLICT") {
      // The server names the exact reason; keep it verbatim in English.
      deleteError.value = t("workspace.world.entities.deleteConflict");
    } else {
      deleteError.value = errText(err);
    }
    confirmingDelete.value = null;
  } finally {
    deleting.value = false;
  }
}

function onKindKeydown(ev: KeyboardEvent, current: KindOption) {
  const idx = kindOptions.indexOf(current);
  let next: number | null = null;
  if (ev.key === "ArrowRight" || ev.key === "ArrowDown") next = (idx + 1) % kindOptions.length;
  else if (ev.key === "ArrowLeft" || ev.key === "ArrowUp")
    next = (idx - 1 + kindOptions.length) % kindOptions.length;
  else if (ev.key === "Home") next = 0;
  else if (ev.key === "End") next = kindOptions.length - 1;
  if (next !== null) {
    ev.preventDefault();
    kind.value = kindOptions[next]!;
    kindBtns.value[next]?.focus();
  }
}

watch(kind, () => load());
onMounted(() => load());
</script>
