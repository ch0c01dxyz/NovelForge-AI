<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useLocale } from "../../composables/useLocale";
import { trapDialogFocus } from "../../utils/trapDialogFocus";
import ChapterAiSetup from "./ChapterAiSetup.vue";
import type { AiChapterSetup } from "../../composables/useAiChapterCreation";
const props = defineProps<{ busy: boolean; error: string | null; uncertain?: boolean; workspaceId?: string; novelId?: string; pendingAi?: boolean; canResolveAi?: boolean }>();
const emit = defineEmits<{ close: []; manual: [input: { title: string }]; ai: [input: AiChapterSetup]; resumeAi: []; resolveAi: [] }>();
const { t } = useLocale();
const dialog = ref<HTMLDialogElement | null>(null);
const titleInput = ref<HTMLInputElement | null>(null);
const title = ref("");
const submitted = ref(false);
const mode = ref<"manual" | "ai">("manual");
const valid = computed(() => title.value.trim().length > 0 && title.value.trim().length <= 200);
onMounted(() => { dialog.value?.showModal?.(); titleInput.value?.focus(); });
watch(() => [props.busy, props.error], () => {
  if (!props.busy && props.error && !props.uncertain) submitted.value = false;
});
function submit() {
  if (!valid.value || props.busy || props.uncertain || submitted.value) return;
  submitted.value = true;
  emit("manual", { title: title.value.trim() });
}
function close() { if (!props.busy) emit("close"); }
</script>

<template>
  <dialog ref="dialog" :aria-label="t('chapterCreation.title')" :aria-busy="busy"
    class="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-xl border border-nf-border-strong bg-nf-bg-1 p-5 text-nf-text shadow-nf-lg backdrop:bg-black/60"
    @cancel.prevent="close" @keydown="trapDialogFocus($event, dialog)">
    <h2 class="font-nf-literary text-xl font-semibold">{{ t('chapterCreation.title') }}</h2>
    <div v-if="pendingAi" class="mt-4 space-y-3">
      <p role="status" class="text-sm text-nf-warn">{{ t('chapterCreation.resumeHint') }}</p>
      <button :disabled="busy" class="rounded-lg border border-nf-border-strong px-3 py-2 text-sm hover:bg-nf-bg-2 focus-visible:nf-focus disabled:opacity-50" @click="emit('resumeAi')">{{ t('chapterCreation.resume') }}</button>
      <button v-if="canResolveAi" :disabled="busy" class="rounded-lg border border-nf-border-strong px-3 py-2 text-sm hover:bg-nf-bg-2 focus-visible:nf-focus disabled:opacity-50" @click="emit('resolveAi')">{{ t('chapterCreation.resolve') }}</button>
    </div>
    <template v-else>
    <div v-if="workspaceId && novelId" role="group" :aria-label="t('chapterCreation.mode')" class="mt-4 grid grid-cols-2 gap-2">
      <button v-for="choice in (['manual', 'ai'] as const)" :key="choice" type="button" :disabled="busy || uncertain" :aria-pressed="mode === choice" class="rounded-lg border px-3 py-3 text-sm focus-visible:nf-focus" :class="mode === choice ? 'border-nf-accent bg-nf-accent/10 text-nf-accent-hi' : 'border-nf-border-strong hover:bg-nf-bg-2'" @click="mode = choice">{{ t(`chapterCreation.${choice}`) }}</button>
    </div>
    <ChapterAiSetup v-if="mode === 'ai' && workspaceId && novelId" :workspace-id="workspaceId" :novel-id="novelId" :busy="busy" @start="emit('ai', $event)" />
    <template v-else>
    <p class="mt-2 text-[13px] text-nf-text-dim">{{ t('chapterCreation.manualHint') }}</p>
    <form class="mt-5 space-y-4" @submit.prevent="submit">
      <label class="block text-[13px] font-medium">{{ t('chapterCreation.chapterTitle') }}
        <input ref="titleInput" v-model="title" maxlength="200" :disabled="busy" autofocus
          class="mt-2 w-full rounded-lg border border-nf-border-strong bg-nf-bg-0 px-3 py-2.5 text-nf-text focus-visible:nf-focus" />
      </label>
      <div class="flex justify-end gap-2">
        <button type="button" :disabled="busy" class="rounded-lg border border-nf-border-strong px-4 py-2 text-[13px] hover:bg-nf-bg-2 focus-visible:nf-focus disabled:opacity-50" @click="close">{{ t('common.cancel') }}</button>
        <button type="submit" :disabled="!valid || busy || uncertain || submitted" class="rounded-lg bg-nf-accent px-4 py-2 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus disabled:opacity-50">{{ t(busy ? 'common.saving' : 'chapterCreation.create') }}</button>
      </div>
    </form>
    </template>
    </template>
    <p v-if="error" role="alert" class="mt-3 text-[13px] text-nf-error">{{ error }}</p>
    <button v-if="pendingAi || mode === 'ai'" type="button" :disabled="busy" class="mt-4 rounded-lg border border-nf-border-strong px-4 py-2 text-sm focus-visible:nf-focus disabled:opacity-50" @click="close">{{ t('common.cancel') }}</button>
  </dialog>
</template>
