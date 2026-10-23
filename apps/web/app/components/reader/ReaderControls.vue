<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useLocale } from "../../composables/useLocale";
import ReaderDialog from "./ReaderDialog.vue";
import { DEFAULT_READER_PREFERENCES, parseReaderPreferences, READER_FONT_STACKS, type ReaderPreferences } from "../../utils/readerPreferences";
interface Chapter { number: number; title: string }
const props = defineProps<{ slug: string; novelTitle: string; chapter: Chapter; chapters: Chapter[]; prevChapter: Chapter | null; nextChapter: Chapter | null; visible: boolean; listFailed?: boolean }>();
const emit = defineEmits<{ toggle: []; preferences: [value: ReaderPreferences]; retryList: [] }>();
const { t } = useLocale();
const modal = ref<"settings" | "chapters" | "comments" | null>(null);
const commentsVisited = ref(false), query = ref(""), newest = ref(false), storageFailed = ref(false);
const saved = ref({ ...DEFAULT_READER_PREFERENCES }), draft = ref({ ...DEFAULT_READER_PREFERENCES });
const KEY = "novelforge.readerPreferences.v1";
const detailUrl = computed(() => `/read/${encodeURIComponent(props.slug)}`);
const url = (number: number) => `${detailUrl.value}/${number}`;
const filtered = computed(() => props.chapters.filter(c => `${c.number} ${c.title}`.toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase())).toSorted((a, b) => newest.value ? b.number - a.number : a.number - b.number));
onMounted(() => {
  try { saved.value = parseReaderPreferences(JSON.parse(localStorage.getItem(KEY) ?? "null")); }
  catch { saved.value = { ...DEFAULT_READER_PREFERENCES }; }
  draft.value = { ...saved.value }; emit("preferences", saved.value);
});
function open(value: typeof modal.value) {
  if (value === "settings") draft.value = { ...saved.value };
  if (value === "comments") commentsVisited.value = true;
  modal.value = value;
}
function preview() { emit("preferences", parseReaderPreferences(draft.value)); }
function close() { if (modal.value === "settings") emit("preferences", saved.value); modal.value = null; }
function save() {
  saved.value = parseReaderPreferences(draft.value);
  storageFailed.value = false;
  try { localStorage.setItem(KEY, JSON.stringify(saved.value)); } catch { storageFailed.value = true; }
  emit("preferences", saved.value); modal.value = null;
}
</script>
<template>
  <div @click.stop>
    <button v-if="!visible" type="button" data-testid="reader-show-controls" class="fixed right-4 bottom-4 z-30 rounded-full border border-nf-border-strong bg-nf-bg-1 px-4 py-3 text-xs text-nf-text shadow-nf-md focus-visible:nf-focus" @click="emit('toggle')">{{ t('readerTools.showControls') }}</button>
    <template v-if="visible">
      <header data-testid="reader-top-controls" class="reader-top fixed inset-x-3 top-3 z-30 mx-auto flex max-w-5xl items-center gap-3 rounded-xl border border-nf-border-strong bg-nf-bg-1/95 p-2 text-nf-text shadow-nf-md backdrop-blur-sm sm:inset-x-6 sm:p-3">
        <NuxtLink :to="detailUrl" class="reader-control" :title="t('reader.backToNovel')" :aria-label="t('reader.backToNovel')"><span aria-hidden="true">←</span></NuxtLink>
        <div class="min-w-0 flex-1 text-center"><p class="truncate text-sm font-semibold">{{ novelTitle }}</p><p class="truncate text-xs text-nf-text-dim">{{ t('reader.chapterOverline', { n: chapter.number }) }} · {{ chapter.title }}</p></div>
        <NuxtLink to="/browse" class="reader-control" :title="t('readerTools.home')" :aria-label="t('readerTools.home')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-7h6v7" /></svg></NuxtLink>
        <button type="button" class="reader-control" :aria-label="t('readerTools.hideControls')" :title="t('readerTools.hideControls')" @click="emit('toggle')"><span aria-hidden="true">✕</span></button>
      </header>
      <nav :aria-label="t('readerTools.navigation')" data-testid="reader-bottom-controls" class="reader-bottom fixed inset-x-3 z-30 mx-auto flex w-fit max-w-[calc(100%_-_1.5rem)] items-center gap-0.5 rounded-2xl border border-nf-border-strong bg-nf-bg-1/95 p-2 text-nf-text shadow-nf-md backdrop-blur-sm sm:gap-3">
        <NuxtLink v-if="prevChapter" :to="url(prevChapter.number)" class="reader-control" :title="t('reader.prevChapter')" :aria-label="t('reader.prevChapter')"><span aria-hidden="true">‹</span></NuxtLink>
        <button v-else type="button" class="reader-control" disabled :aria-label="t('reader.prevChapter')" :title="t('readerTools.firstChapter')"><span aria-hidden="true">‹</span></button>
        <NuxtLink v-if="nextChapter" :to="url(nextChapter.number)" class="reader-control" :title="t('reader.nextChapter')" :aria-label="t('reader.nextChapter')"><span aria-hidden="true">›</span></NuxtLink>
        <button v-else type="button" class="reader-control" disabled :aria-label="t('reader.nextChapter')" :title="t('readerTools.lastChapter')"><span aria-hidden="true">›</span></button>
        <button type="button" class="reader-control" data-testid="reader-comments" :aria-label="t('comments.title')" :title="t('comments.title')" @click="open('comments')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v12H9l-5 4V4ZM8 8h8M8 12h6" /></svg></button>
        <button type="button" class="reader-control" data-testid="reader-settings" :aria-label="t('readerTools.settings')" :title="t('readerTools.settings')" @click="open('settings')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="9" cy="6" r="2" /><circle cx="16" cy="12" r="2" /><circle cx="10" cy="18" r="2" /></svg></button>
        <button type="button" class="reader-control" data-testid="reader-chapters" :aria-label="t('readerTools.chapters')" :title="t('readerTools.chapters')" @click="open('chapters')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12M3 6h1M3 12h1M3 18h1" /></svg></button>
        <NuxtLink to="/browse" class="reader-control" :aria-label="t('readerTools.home')" :title="t('readerTools.home')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-7h6v7" /></svg></NuxtLink>
      </nav>
    </template>
    <p v-if="storageFailed" role="status" class="fixed right-4 bottom-24 z-30 max-w-xs rounded-lg bg-nf-bg-1 p-3 text-sm text-nf-text">{{ t('readerTools.storageUnavailable') }}</p>
    <ReaderDialog :open="modal === 'settings'" :title="t('readerTools.settings')" @close="close">
      <form class="space-y-5" @submit.prevent="save" @input="preview" @change="preview">
        <label class="block text-sm">{{ t('readerTools.font') }}<select v-model="draft.font" class="nf-input mt-2 w-full"><option value="literary">{{ t('readerTools.literary') }}</option><option value="sans">{{ t('readerTools.sans') }}</option><option value="mono">{{ t('readerTools.mono') }}</option></select></label>
        <label v-for="field in ([{ key: 'size', min: 16, max: 30, step: 1 }, { key: 'line', min: 1.4, max: 2.4, step: 0.05 }, { key: 'spacing', min: 0, max: 0.16, step: 0.01 }] as const)" :key="field.key" class="block text-sm">{{ t(`readerTools.${field.key}`) }} <output class="float-right tabular-nums">{{ draft[field.key] }}</output><input v-model.number="draft[field.key]" :data-testid="`reader-${field.key}`" type="range" :min="field.min" :max="field.max" :step="field.step" class="mt-3 w-full accent-[var(--color-nf-accent)]" /></label>
        <fieldset><legend class="mb-2 text-sm">{{ t('readerTools.theme') }}</legend><div class="flex gap-3"><label v-for="theme in (['dark', 'light'] as const)" :key="theme" class="flex flex-1 items-center gap-2 rounded-lg border border-nf-border-strong p-3 text-sm"><input v-model="draft.theme" type="radio" name="reader-theme" :value="theme" class="accent-[var(--color-nf-accent)]" />{{ t(`readerTools.${theme}`) }}</label></div></fieldset>
        <p class="rounded-lg border border-nf-border-strong p-4" :style="{ fontFamily: READER_FONT_STACKS[draft.font], fontSize: `${draft.size}px`, lineHeight: draft.line, letterSpacing: `${draft.spacing}em`, background: draft.theme === 'light' ? '#faf8f4' : 'var(--color-nf-bg-0)', color: draft.theme === 'light' ? '#292524' : 'var(--color-nf-text)' }">{{ t('readerTools.preview') }}</p>
        <div class="flex flex-wrap justify-end gap-2"><button type="button" class="nf-btn mr-auto" @click="draft = { ...DEFAULT_READER_PREFERENCES }; preview()">{{ t('readerTools.reset') }}</button><button type="button" class="nf-btn" @click="close">{{ t('readerTools.cancel') }}</button><button type="submit" class="nf-btn nf-btn-primary">{{ t('readerTools.save') }}</button></div>
      </form>
    </ReaderDialog>
    <ReaderDialog :open="modal === 'chapters'" :title="t('readerTools.chapters')" @close="close">
      <div class="mb-4 flex flex-wrap gap-3"><label class="min-w-0 flex-1 text-xs text-nf-text-dim">{{ t('readerTools.search') }}<input v-model="query" type="search" class="nf-input mt-1 w-full" :placeholder="t('readerTools.searchHint')" /></label><label class="text-xs text-nf-text-dim">{{ t('readerTools.sort') }}<select v-model="newest" class="nf-input mt-1 block"><option :value="false">{{ t('readerTools.oldest') }}</option><option :value="true">{{ t('readerTools.newest') }}</option></select></label></div>
      <div v-if="listFailed" role="alert" class="text-sm"><p>{{ t('reader.loadFailed') }}</p><button type="button" class="nf-btn mt-3" @click="emit('retryList')">{{ t('readerTools.retry') }}</button></div>
      <p v-else-if="!filtered.length" role="status" class="py-8 text-center text-sm text-nf-text-dim">{{ t('readerTools.noChapters') }}</p>
      <nav v-else :aria-label="t('readerTools.chapters')" class="max-h-[50dvh] space-y-2 overflow-y-auto pr-1"><NuxtLink v-for="item in filtered" :key="item.number" :to="url(item.number)" :aria-current="item.number === chapter.number ? 'page' : undefined" class="flex min-h-12 items-center gap-3 rounded-lg border border-nf-border-strong bg-nf-bg-2 p-3 text-sm hover:bg-nf-bg-3 focus-visible:nf-focus" :class="{ 'border-nf-accent-border bg-nf-accent-dim': item.number === chapter.number }" @click="close"><span class="text-xs tabular-nums text-nf-text-dim">{{ item.number }}</span><span class="min-w-0 flex-1">{{ item.title }}</span><span v-if="item.number === chapter.number" class="text-xs text-nf-accent-hi">{{ t('readerTools.current') }}</span></NuxtLink></nav>
    </ReaderDialog>
    <ReaderDialog :open="modal === 'comments'" :title="t('comments.title')" @close="close"><slot v-if="commentsVisited" name="comments" :active="modal === 'comments'" /></ReaderDialog>
  </div>
</template>
<style scoped>
.reader-control { display:flex;align-items:center;justify-content:center;width:44px;height:44px;flex-shrink:0;border-radius:12px;border:1px solid var(--color-nf-border-strong);font-size:24px; }
.reader-control:hover { background:var(--color-nf-bg-3); }
.reader-control:focus-visible { outline:2px solid var(--color-nf-accent-hi);outline-offset:3px; }
.reader-control:disabled { opacity:.35;cursor:not-allowed; }
.reader-control svg { width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round; }
.reader-bottom { bottom:max(12px,env(safe-area-inset-bottom)); }
.reader-top { top:max(12px,env(safe-area-inset-top)); }
</style>
