<script setup lang="ts">
/**
 * Writer workspace shell (Phase 2, no AI chrome yet).
 * Layout per docs/design/writer-workspace + DESIGN-TOKENS.md:
 * header / nav | editor | context rail / status footer.
 * Manuscript data comes from the API once auth-gated flows land;
 * this shell wires the structure, autosave state machine, and token look.
 */
const route = useRoute();

// ponytail: static demo state until API auth cookie flow is wired in a
// follow-up task; structure + autosave UX are the deliverable here.
const chapters = ref([
  { id: "1", number: 84, title: "The Ash Gate", words: 2100, status: "PUBLISHED" },
  { id: "2", number: 85, title: "Ember Debt", words: 1412, status: "DRAFT" },
]);
const active = ref("2");
const content = ref(
  "The hall smelled of wet iron and old smoke. Veyra counted the braziers out of habit — seven, same as the night her father burned the ledgers — and found the number wanting.",
);

type SaveState = "saved" | "dirty" | "saving";
const saveState = ref<SaveState>("saved");
const version = ref(1);

let timer: ReturnType<typeof setTimeout> | undefined;
onUnmounted(() => clearTimeout(timer));
function onInput() {
  saveState.value = "dirty";
  clearTimeout(timer);
  // Autosave: 1.5s debounce after last keystroke.
  timer = setTimeout(() => {
    saveState.value = "saving";
    // TODO(phase2-api): PUT chapter version with expectedVersion: version
    setTimeout(() => {
      version.value += 1;
      saveState.value = "saved";
    }, 300);
  }, 1500);
}

const saveLabel = computed(
  () =>
    ({ saved: "Saved", dirty: "Unsaved changes", saving: "Saving…" })[
      saveState.value
    ],
);

const activeChapter = computed(
  () => chapters.value.find((c) => c.id === active.value) ?? chapters.value[0],
);
void route;
</script>

<template>
  <div class="grid h-dvh grid-rows-[52px_1fr_30px] bg-nf-bg-0 text-nf-text">
    <!-- Header -->
    <header
      class="flex items-center gap-5 border-b border-nf-border bg-nf-bg-1 px-5 shadow-nf-sm"
    >
      <div class="flex items-center gap-2.5 text-[14.5px] font-semibold tracking-tight">
        <span
          class="grid size-6.5 place-items-center rounded-md bg-nf-accent font-nf-literary text-[15px] font-bold text-nf-accent-ink"
          >N</span
        >
        NovelForge
      </div>
      <div
        class="hidden h-6 items-center gap-2 border-l border-nf-border pl-5 text-[13px] text-nf-text-faint sm:flex"
      >
        The Ashen Throne <span class="text-nf-border-strong">/</span>
        <b class="font-semibold text-nf-text">Arc II — The Ember War</b>
      </div>
      <div class="flex-1" />
      <button
        class="rounded-lg border border-nf-border-strong px-3.5 py-1.5 text-[13px] text-nf-text-dim hover:border-nf-border-strong hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
      >
        Outline
      </button>
      <button
        class="rounded-lg bg-nf-accent px-3.5 py-1.5 text-[13px] font-semibold text-nf-accent-ink hover:bg-nf-accent-hi focus-visible:nf-focus"
      >
        Publish
      </button>
    </header>

    <!-- 3-region -->
    <div class="grid min-h-0 grid-cols-1 lg:grid-cols-[264px_1fr] xl:grid-cols-[264px_1fr_312px]">
      <!-- Left nav -->
      <nav
        class="hidden overflow-y-auto border-r border-nf-border bg-nf-bg-1 p-4 lg:block"
      >
        <div class="mb-2 px-2.5 pb-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-nf-text-faint">
          Chapters
        </div>
        <button
          v-for="c in chapters"
          :key="c.id"
          class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] focus-visible:nf-focus"
          :class="
            c.id === active
              ? 'border-l-2 border-nf-accent bg-nf-accent/10 font-semibold text-nf-accent-hi'
              : 'text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text'
          "
          @click="active = c.id"
        >
          {{ c.number }} — {{ c.title }}
          <span class="ml-auto rounded bg-nf-bg-0 px-1.5 py-px text-[11px] tabular-nums text-nf-text-faint">
            {{ (c.words / 1000).toFixed(1) }}k
          </span>
        </button>
      </nav>

      <!-- Editor -->
      <main class="flex min-w-0 flex-col bg-nf-bg-0">
        <div
          class="flex items-center gap-2 border-b border-nf-border bg-nf-bg-1 px-6 py-2"
        >
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
            {{ saveLabel }} · v{{ version }}
          </span>
        </div>

        <div class="flex-1 overflow-y-auto">
          <div class="mx-auto max-w-[700px] px-6 py-10 lg:px-10">
            <div
              class="mb-2.5 flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-nf-accent-hi"
            >
              Chapter {{ activeChapter?.number }} · Scene 1
              <span class="h-px flex-1 bg-gradient-to-r from-nf-border-strong to-transparent" />
            </div>
            <h1 class="mb-2 font-nf-literary text-3xl font-semibold leading-tight">
              {{ activeChapter?.title }}
            </h1>
            <div class="mb-8 text-[13px] tabular-nums text-nf-text-faint">
              Draft · {{ activeChapter?.words.toLocaleString() }} words
            </div>
            <textarea
              v-model="content"
              rows="18"
              class="w-full resize-none border-none bg-transparent font-nf-literary text-[17.5px] leading-[1.85] text-nf-text outline-none placeholder:text-nf-text-faint focus-visible:nf-focus"
              @input="onInput"
            />
          </div>
        </div>
      </main>

      <!-- Right rail: desktop only for now (mock data, Phase 2 wiring next) -->
      <aside class="hidden overflow-y-auto border-l border-nf-border bg-nf-bg-1 px-4 py-5 xl:block">
        <div
          class="mb-2.5 border-b border-nf-border pb-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-nf-text-faint"
        >
          Scene Context
        </div>
        <div class="rounded-xl border border-nf-border bg-nf-bg-2 p-3">
          <div class="mb-1.5 flex items-center gap-2.5">
            <span class="grid size-7 place-items-center rounded-full border border-nf-border-strong bg-nf-bg-0 font-nf-literary text-xs font-bold text-nf-text-dim">V</span>
            <span class="text-[13px] font-semibold">Veyra Ashborn</span>
            <span class="ml-auto rounded-full border border-nf-accent/40 bg-nf-accent/10 px-2 py-px text-[10px] font-semibold text-nf-accent-hi">POV</span>
          </div>
          <p class="text-xs leading-relaxed text-nf-text-dim">
            Determined, hiding exhaustion. Carries the ember-debt ledger.
          </p>
        </div>
      </aside>
    </div>

    <!-- Footer -->
    <footer
      class="flex items-center gap-5 border-t border-nf-border bg-nf-bg-1 px-5 text-[11.5px] tabular-nums text-nf-text-faint"
    >
      <span>Version <b class="font-semibold text-nf-text-dim">v{{ version }}</b></span>
      <span>Words today <b class="font-semibold text-nf-text-dim">1,847</b></span>
      <div class="ml-auto hidden gap-5 sm:flex">
        <span>Chapter <b class="font-semibold text-nf-text-dim">85 / 2,400</b></span>
      </div>
    </footer>
  </div>
</template>
