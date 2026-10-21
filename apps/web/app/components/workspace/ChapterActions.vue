<script setup lang="ts">
import { nextTick, onUnmounted, ref } from "vue";
import { ApiError, useApi } from "../../composables/useApi";
import { useLocale } from "../../composables/useLocale";
import { trapDialogFocus } from "../../utils/trapDialogFocus";
import ActionMenu from "../ui/ActionMenu.vue";
import ConfirmDialog from "./ConfirmDialog.vue";
const props = defineProps<{
  base: string; chapter: { id: string; title: string; status: string };
  beforeChange: () => Promise<boolean>;
}>();
const emit = defineEmits<{ changed: [result: { id: string; title: string; currentVersion: number | null }]; deleted: [id: string] }>();
const { api } = useApi(), { t } = useLocale();
const busy = ref(false), renameOpen = ref(false), deleteOpen = ref(false), completed = ref(false);
const error = ref<string | null>(null), title = ref("");
const pin = ref<{ expectedTitle: string; expectedChapterVersionId: string | null } | null>(null);
const dialog = ref<HTMLDialogElement | null>(null), input = ref<HTMLInputElement | null>(null), host = ref<HTMLElement | null>(null);
let alive = true;
onUnmounted(() => { alive = false; });
function failure(e: unknown) {
  error.value = t(e instanceof ApiError && e.status === 409 ? "chapterActions.conflict" : "chapterActions.failed");
}
async function open(kind: "rename" | "delete") {
  if (busy.value || completed.value) return;
  busy.value = true; error.value = null;
  try {
    if (!await props.beforeChange() || !alive) return;
    const detail = await api<{ title: string; currentVersionId: string | null; status: string }>(`${props.base}/chapters/${props.chapter.id}`);
    if (!alive) return;
    if (detail.status === "PUBLISHED") { error.value = t("chapters.blockedPublished"); return; }
    pin.value = { expectedTitle: detail.title, expectedChapterVersionId: detail.currentVersionId };
    title.value = detail.title;
    if (kind === "delete") deleteOpen.value = true;
    else { renameOpen.value = true; await nextTick(); dialog.value?.showModal?.(); input.value?.focus(); }
  } catch (e) { if (alive) failure(e); }
  finally { busy.value = false; }
}
async function closeRename() {
  if (busy.value) return;
  renameOpen.value = false; await nextTick(); host.value?.querySelector("summary")?.focus();
}
async function rename() {
  if (busy.value || !pin.value || !title.value.trim() || title.value.trim().length > 200) return;
  busy.value = true; error.value = null;
  const target = props.base, chapterId = props.chapter.id;
  try {
    if (!await props.beforeChange()) { error.value = t("recovery.saveBeforeLeaving"); return; }
    if (!alive || target !== props.base || chapterId !== props.chapter.id) return;
    const result = await api<{ title: string; currentVersion: number | null }>(`${target}/chapters/${chapterId}/title`, { method: "PATCH", body: JSON.stringify({ title: title.value.trim(), ...pin.value }) });
    if (!alive) return;
    emit("changed", { id: props.chapter.id, ...result });
    renameOpen.value = false;
    await nextTick(); host.value?.querySelector("summary")?.focus();
  } catch (e) { if (alive) failure(e); }
  finally { busy.value = false; }
}
async function remove() {
  if (busy.value || completed.value || !pin.value) return;
  busy.value = true; error.value = null;
  const target = props.base, chapterId = props.chapter.id;
  try {
    if (!await props.beforeChange()) { error.value = t("recovery.saveBeforeLeaving"); return; }
    if (!alive || target !== props.base || chapterId !== props.chapter.id) return;
    await api(`${target}/chapters/${chapterId}`, { method: "DELETE", body: JSON.stringify(pin.value) });
    if (!alive) return;
    completed.value = true; deleteOpen.value = false; emit("deleted", props.chapter.id);
  } catch (e) { if (alive) failure(e); }
  finally { busy.value = false; }
}
</script>

<template>
  <div ref="host" class="shrink-0">
    <ActionMenu class="nf-chapter-actions" :label="t('chapterActions.menu', { title: chapter.title })" :title="t('chapterActions.menu', { title: chapter.title })">
      <template #trigger><span aria-hidden="true">⋯</span></template>
      <button :disabled="busy || completed" @click="open('rename')">{{ t('chapterActions.rename') }}</button>
      <button :disabled="busy || completed" @click="open('delete')">{{ t('common.delete') }}</button>
    </ActionMenu>
    <p v-if="error && !renameOpen && !deleteOpen" role="alert" class="max-w-40 text-[12px] text-nf-error">{{ error }}</p>
    <dialog v-if="renameOpen" ref="dialog" :aria-label="t('chapterActions.rename')" :aria-busy="busy" class="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-nf-border-strong bg-nf-bg-1 p-5 text-nf-text shadow-nf-lg backdrop:bg-black/60" @cancel.prevent="closeRename" @keydown="trapDialogFocus($event, dialog)">
      <h2 class="font-nf-literary text-xl font-semibold">{{ t('chapterActions.rename') }}</h2>
      <form class="mt-4 space-y-4" @submit.prevent="rename">
        <label class="block text-[13px]">{{ t('chapterCreation.chapterTitle') }}<input ref="input" v-model="title" :disabled="busy" maxlength="200" class="mt-2 w-full rounded-lg border border-nf-border-strong bg-nf-bg-0 px-3 py-2.5 focus-visible:nf-focus" /></label>
        <p v-if="error" role="alert" class="text-[13px] text-nf-error">{{ error }}</p>
        <div class="flex justify-end gap-2">
          <button type="button" :disabled="busy" class="rounded-lg border border-nf-border-strong px-4 py-2 text-[13px] focus-visible:nf-focus" @click="closeRename">{{ t('common.cancel') }}</button>
          <button :disabled="busy || !title.trim() || title.trim().length > 200" class="rounded-lg bg-nf-accent px-4 py-2 text-[13px] font-semibold text-nf-accent-ink focus-visible:nf-focus disabled:opacity-50">{{ t('common.save') }}</button>
        </div>
      </form>
    </dialog>
    <ConfirmDialog :open="deleteOpen" :title="t('chapterActions.deleteTitle')" :body="t('chapterActions.deleteBody', { title: pin?.expectedTitle ?? chapter.title })" :confirm-label="t('common.delete')" :cancel-label="t('common.cancel')" :busy="busy" :error="error ?? undefined" danger @confirm="remove" @cancel="deleteOpen = false; error = null" />
  </div>
</template>
