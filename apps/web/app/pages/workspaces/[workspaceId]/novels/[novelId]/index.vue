<script setup lang="ts">
/**
 * Writer workspace (Phase 2). Layout per docs/design/writer-workspace
 * + DESIGN-TOKENS.md: header / nav | editor | context rail / status footer.
 *
 * Data comes from the manuscript API; autosave PUTs a new immutable
 * version with the optimistic-concurrency expectedVersion and handles 409
 * (someone else saved first) by refetching rather than clobbering.
 */
interface ChapterSummary {
  id: string;
  number: number;
  title: string;
  status: string;
  wordCount: number;
  currentVersion: number | null;
}
interface ChapterDetail extends ChapterSummary {
  content: string;
}

const route = useRoute();
const { api } = useApi();

const workspaceId = computed(() => String(route.params.workspaceId ?? ""));
const novelId = computed(() => String(route.params.novelId ?? ""));
const base = computed(() => `/workspaces/${workspaceId.value}/novels/${novelId.value}`);

const chapters = ref<ChapterSummary[]>([]);
const activeId = ref<string | null>(null);
const content = ref("");
const version = ref<number | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const saveState = ref<"saved" | "dirty" | "saving" | "conflict">("saved");

const activeChapter = computed(
  () => chapters.value.find((c) => c.id === activeId.value) ?? null,
);
const wordCount = computed(() =>
  content.value.trim() ? content.value.trim().split(/\s+/).length : 0,
);

const saveLabel = computed(
  () =>
    ({
      saved: "Saved",
      dirty: "Unsaved changes",
      saving: "Saving…",
      conflict: "Conflict — reloaded",
    })[saveState.value],
);

async function loadChapters() {
  chapters.value = await api<ChapterSummary[]>(`${base.value}/chapters`);
  if (!activeId.value && chapters.value.length) {
    await selectChapter(chapters.value[0]!.id);
  }
}

async function selectChapter(id: string) {
  // Flush unsaved text for the chapter we're leaving before switching.
  if (saveState.value === "dirty") await saveNow();
  const seq = ++selectSeq;
  activeId.value = id;
  const detail = await api<ChapterDetail>(`${base.value}/chapters/${id}`);
  // A newer selection won the race — drop this stale response.
  if (seq !== selectSeq) return;
  content.value = detail.content;
  version.value = detail.currentVersion;
  saveState.value = "saved";
  error.value = null;
}

async function createChapter() {
  const title = globalThis.prompt("Chapter title");
  if (!title?.trim()) return;
  try {
    const { id } = await api<{ id: string; number: number }>(
      `${base.value}/chapters`,
      { method: "POST", body: JSON.stringify({ title: title.trim() }) },
    );
    await loadChapters();
    await selectChapter(id);
  } catch {
    error.value = "Could not create the chapter.";
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;
// Monotonic token: only the newest selectChapter response may write state.
let selectSeq = 0;
onUnmounted(() => clearTimeout(timer));

function onInput() {
  saveState.value = "dirty";
  clearTimeout(timer);
  timer = setTimeout(() => void saveNow(), 1500); // 1.5s debounce
}

async function saveNow() {
  const chapter = activeChapter.value;
  if (!chapter || saveState.value === "saving") return;
  const savingId = chapter.id;
  clearTimeout(timer);
  saveState.value = "saving";
  try {
    const result = await api<{ version: number; wordCount: number }>(
      `${base.value}/chapters/${chapter.id}`,
      {
        method: "PUT",
        body: JSON.stringify({
          content: content.value,
          expectedVersion: version.value,
        }),
      },
    );
    chapter.currentVersion = result.version;
    chapter.wordCount = result.wordCount;
    // The user may have switched chapters while this save was in flight;
    // only the still-active chapter may touch the live editor state.
    if (activeId.value === savingId) {
      version.value = result.version;
      saveState.value = "saved";
      error.value = null;
    }
  } catch (e) {
    if (activeId.value !== savingId) return; // stale save, chapter moved on
    if (e instanceof ApiError && e.status === 409) {
      // Stale version or published chapter: refetch instead of clobbering.
      saveState.value = "conflict";
      await selectChapter(savingId);
    } else {
      saveState.value = "dirty"; // keep the text; retry on next edit
      error.value = "Could not save — your text is still here.";
    }
  }
}

onMounted(async () => {
  try {
    await loadChapters();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      await navigateTo(
        `/sign-in?redirect=${encodeURIComponent(route.fullPath)}`,
      );
      return;
    }
    error.value = "Could not load the manuscript.";
  } finally {
    loading.value = false;
  }
});

async function publish() {
  const chapter = activeChapter.value;
  if (!chapter) return;
  if (saveState.value !== "saved") await saveNow();
  // Never publish unsaved or conflicted text — the version on the server
  // is what gets frozen, so a failed save must abort the publish.
  if (saveState.value !== "saved") return;
  try {
    await api(`${base.value}/chapters/${chapter.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "PUBLISHED" }),
    });
    chapter.status = "PUBLISHED";
  } catch (e) {
    error.value =
      e instanceof ApiError && e.status === 403
        ? "You do not have permission to publish."
        : "Publish failed.";
  }
}
</script>

<template>
  <div class="grid h-dvh grid-rows-[52px_1fr_30px] bg-nf-bg-0 text-nf-text">
    <header
      class="flex items-center gap-5 border-b border-nf-border bg-nf-bg-1 px-5 shadow-nf-sm"
    >
      <NuxtLink
        to="/"
        class="flex items-center gap-2.5 text-[14.5px] font-semibold tracking-tight hover:opacity-80 focus-visible:nf-focus"
      >
        <span
          class="grid size-6.5 place-items-center rounded-md bg-nf-accent font-nf-literary text-[15px] font-bold text-nf-accent-ink"
          >N</span
        >
        NovelForge
      </NuxtLink>
      <div class="flex-1" />
      <button
        class="rounded-lg border border-nf-border-strong px-3.5 py-1.5 text-[13px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus disabled:opacity-50"
        :disabled="saveState === 'saved'"
        @click="saveNow"
      >
        Save
      </button>
      <button
        class="rounded-lg bg-nf-accent px-3.5 py-1.5 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus disabled:opacity-50"
        :disabled="!activeChapter || saveState === 'saving'"
        @click="publish"
      >
        Publish
      </button>
    </header>

    <div
      class="grid min-h-0 grid-cols-1 lg:grid-cols-[264px_1fr] xl:grid-cols-[264px_1fr_312px]"
    >
      <nav class="hidden overflow-y-auto border-r border-nf-border bg-nf-bg-1 p-4 lg:block">
        <div class="mb-2 flex items-center justify-between px-2.5 pb-2">
          <span
            class="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-nf-text-faint"
            >Chapters</span
          >
          <button
            class="rounded border border-nf-border-strong px-1.5 text-[13px] leading-5 text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
            aria-label="New chapter"
            @click="createChapter"
          >
            +
          </button>
        </div>
        <p v-if="loading" class="px-2.5 text-[13px] text-nf-text-faint">Loading…</p>
        <p v-else-if="!chapters.length" class="px-2.5 text-[13px] text-nf-text-faint">
          No chapters yet.
        </p>
        <button
          v-for="c in chapters"
          :key="c.id"
          class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] focus-visible:nf-focus"
          :class="
            c.id === activeId
              ? 'border-l-2 border-nf-accent bg-nf-accent/10 font-semibold text-nf-accent-hi'
              : 'text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text'
          "
          @click="selectChapter(c.id)"
        >
          <span class="truncate">{{ c.number }} — {{ c.title }}</span>
          <span
            class="ml-auto shrink-0 rounded bg-nf-bg-0 px-1.5 py-px text-[11px] tabular-nums text-nf-text-faint"
          >
            {{ c.wordCount.toLocaleString() }}
          </span>
        </button>
      </nav>

      <main class="flex min-w-0 flex-col bg-nf-bg-0">
        <div class="flex items-center gap-2 border-b border-nf-border bg-nf-bg-1 px-6 py-2">
          <span class="text-[12.5px] font-semibold text-nf-text-dim">B</span>
          <span class="font-nf-literary text-[12.5px] font-bold italic text-nf-text-dim">I</span>
          <span class="text-[12.5px] font-semibold text-nf-text-dim">H2</span>
          <div class="flex-1" />
          <span class="flex items-center gap-1.5 text-[12px] tabular-nums text-nf-text-faint">
            <span
              class="text-[9px]"
              :class="saveState === 'saved' ? 'text-nf-ok' : 'text-nf-accent-hi'"
              >●</span
            >
            {{ saveLabel }}<template v-if="version !== null"> · v{{ version }}</template>
          </span>
        </div>

        <div class="flex-1 overflow-y-auto">
          <p
            v-if="error"
            role="alert"
            class="mx-auto mt-6 max-w-[700px] rounded-lg border border-nf-warn/40 bg-nf-warn/10 px-4 py-3 text-[13px] text-nf-warn"
          >
            {{ error }}
          </p>
          <div v-if="activeChapter" class="mx-auto max-w-[700px] px-6 py-10 lg:px-10">
            <div
              class="mb-2.5 flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-nf-accent-hi"
            >
              Chapter {{ activeChapter.number }}
              <span class="h-px flex-1 bg-gradient-to-r from-nf-border-strong to-transparent" />
            </div>
            <h1 class="mb-2 font-nf-literary text-3xl font-semibold leading-tight">
              {{ activeChapter.title }}
            </h1>
            <div class="mb-8 text-[13px] tabular-nums text-nf-text-faint">
              {{ activeChapter.status }} · {{ wordCount.toLocaleString() }} words
            </div>
            <textarea
              v-model="content"
              rows="18"
              aria-label="Chapter content"
              class="w-full resize-none border-none bg-transparent font-nf-literary text-[17.5px] leading-[1.85] text-nf-text outline-none placeholder:text-nf-text-faint focus-visible:nf-focus"
              placeholder="Begin the chapter…"
              @input="onInput"
              @blur="saveState === 'dirty' && saveNow()"
            />
          </div>
          <p v-else-if="!loading" class="px-6 py-10 text-center text-sm text-nf-text-faint">
            Select or create a chapter to start writing.
          </p>
        </div>
      </main>

      <aside
        class="hidden overflow-y-auto border-l border-nf-border bg-nf-bg-1 px-4 py-5 xl:block"
      >
        <div
          class="mb-2.5 border-b border-nf-border pb-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-nf-text-faint"
        >
          Chapter
        </div>
        <div class="rounded-xl border border-nf-border bg-nf-bg-2 p-3">
          <div class="text-[13px] font-semibold">
            {{ activeChapter?.title ?? "—" }}
          </div>
          <p class="mt-1 text-xs leading-relaxed text-nf-text-dim">
            Status {{ activeChapter?.status ?? "—" }} · version
            {{ version ?? "—" }}
          </p>
        </div>
      </aside>
    </div>

    <footer
      class="flex items-center gap-5 border-t border-nf-border bg-nf-bg-1 px-5 text-[11.5px] tabular-nums text-nf-text-faint"
    >
      <span>Version <b class="font-semibold text-nf-text-dim">v{{ version ?? "—" }}</b></span>
      <span>Words <b class="font-semibold text-nf-text-dim">{{ wordCount.toLocaleString() }}</b></span>
      <div class="ml-auto hidden gap-5 sm:flex">
        <span>
          Chapter
          <b class="font-semibold text-nf-text-dim">{{ activeChapter?.number ?? "—" }}</b>
        </span>
      </div>
    </footer>
  </div>
</template>
