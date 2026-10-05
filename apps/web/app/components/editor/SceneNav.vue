<script setup lang="ts">
/**
 * SceneNav (NF-WF-015, Invariant 6): the scene breadcrumb + navigator in
 * the editor chrome. Shows the mockup's "Chapter N · Scene M" breadcrumb;
 * the navigator lists the active chapter's scenes (with summaries) plus
 * adjacent chapters' scenes. Selecting a scene in another chapter
 * switches chapters (the page keeps its dirty-flush); selecting a scene
 * in the active chapter sets the breadcrumb.
 *
 * Minimal scene CRUD surfaces here (create/rename/delete/reorder emit
 * intents; the page prompts and calls the routes). 015 does NOT do
 * intra-document scroll targeting (Q4).
 */
import { ref, computed } from "vue";
import { useLocale } from "../../composables/useLocale";

export interface SceneSummary {
  id: string;
  number: number;
  title: string;
  summary: string | null;
}
export interface ChapterRef {
  id: string;
  number: number;
  title: string;
}

const props = defineProps<{
  chapters: ChapterRef[];
  activeChapterId: string | null;
  scenesByChapter: Record<string, SceneSummary[]>;
  activeSceneId: string | null;
}>();

const emit = defineEmits<{
  (e: "select-scene", payload: { chapterId: string; sceneId: string }): void;
  (e: "add-scene", payload: { chapterId: string }): void;
  (e: "rename-scene", payload: { chapterId: string; sceneId: string }): void;
  (e: "delete-scene", payload: { chapterId: string; sceneId: string }): void;
  (e: "move-scene", payload: { chapterId: string; sceneId: string; direction: "up" | "down" }): void;
}>();

const { t } = useLocale();
const open = ref(false);

const activeChapter = computed(
  () => props.chapters.find((c) => c.id === props.activeChapterId) ?? null,
);
const activeScenes = computed(() =>
  props.activeChapterId ? (props.scenesByChapter[props.activeChapterId] ?? []) : [],
);
const activeScene = computed(
  () => activeScenes.value.find((s) => s.id === props.activeSceneId) ?? null,
);
const adjacentChapters = computed(() => {
  if (!activeChapter.value) return [];
  const sorted = [...props.chapters].sort((a, b) => a.number - b.number);
  const idx = sorted.findIndex((c) => c.id === activeChapter.value!.id);
  return [sorted[idx - 1], sorted[idx + 1]].filter(
    (c): c is ChapterRef => !!c,
  );
});

function toggle() {
  open.value = !open.value;
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") open.value = false;
}
</script>

<template>
  <div class="flex items-center gap-2" @keydown="onKeydown">
    <!-- Breadcrumb inherits the page's overline styling (accent-hi,
         uppercase, tracked) from the parent. -->
    <span aria-live="polite">
      {{
        activeScene
          ? t("scenes.breadcrumb", {
              chapter: activeChapter?.number ?? "—",
              scene: activeScene.number,
            })
          : t("scenes.chapterOnly", { chapter: activeChapter?.number ?? "—" })
      }}
    </span>
    <div class="relative">
      <button
        type="button"
        class="rounded-md border border-nf-border-strong px-2 py-0.5 text-[12px] text-nf-text-dim hover:bg-nf-bg-2 hover:text-nf-text focus-visible:nf-focus"
        :aria-expanded="open"
        @click="toggle"
      >
        {{ t("scenes.navigator") }}
      </button>
      <div
        v-if="open"
        role="dialog"
        :aria-label="t('scenes.navigator')"
        class="absolute left-0 top-full z-40 mt-1.5 max-h-[60vh] w-[320px] overflow-y-auto rounded-xl border border-nf-border-strong bg-nf-bg-2 p-2 shadow-nf-lg"
      >
        <div
          v-for="chapter in [activeChapter, ...adjacentChapters].filter(Boolean)"
          :key="chapter!.id"
          class="mb-2 last:mb-0"
        >
          <div class="flex items-center gap-2 px-2 pb-1 pt-1.5">
            <span class="text-[11px] font-semibold uppercase tracking-[0.1em] text-nf-text-faint">
              {{ t("chapters.chapter") }} {{ chapter!.number }} — {{ chapter!.title }}
            </span>
            <button
              v-if="chapter!.id === activeChapterId"
              type="button"
              class="ml-auto rounded border border-nf-border-strong px-1.5 text-[12px] leading-5 text-nf-text-dim hover:bg-nf-bg-3 hover:text-nf-text focus-visible:nf-focus"
              :aria-label="t('scenes.addScene')"
              :title="t('scenes.addScene')"
              @click="emit('add-scene', { chapterId: chapter!.id })"
            >
              +
            </button>
          </div>
          <p
            v-if="!(scenesByChapter[chapter!.id] ?? []).length"
            class="px-2 pb-1 text-[12px] text-nf-text-faint"
          >
            {{ t("scenes.noScenes") }}
          </p>
          <button
            v-for="scene in scenesByChapter[chapter!.id] ?? []"
            :key="scene.id"
            type="button"
            class="group flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-nf-bg-3 focus-visible:nf-focus"
            :class="scene.id === activeSceneId ? 'bg-nf-accent/10' : ''"
            @click="emit('select-scene', { chapterId: chapter!.id, sceneId: scene.id })"
          >
            <span
              class="mt-0.5 shrink-0 rounded bg-nf-bg-0 px-1.5 py-px text-[11px] tabular-nums text-nf-text-faint"
            >
              {{ scene.number }}
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[13px] text-nf-text">{{ scene.title }}</span>
              <span v-if="scene.summary" class="block truncate text-[12px] text-nf-text-faint">
                {{ scene.summary }}
              </span>
            </span>
            <span
              v-if="chapter!.id === activeChapterId"
              class="hidden shrink-0 items-center gap-0.5 group-hover:flex"
              @click.stop
            >
              <button
                type="button"
                class="rounded px-1 text-[12px] text-nf-text-dim hover:text-nf-text focus-visible:nf-focus"
                :aria-label="t('scenes.moveUp')"
                :title="t('scenes.moveUp')"
                @click="emit('move-scene', { chapterId: chapter!.id, sceneId: scene.id, direction: 'up' })"
              >
                ↑
              </button>
              <button
                type="button"
                class="rounded px-1 text-[12px] text-nf-text-dim hover:text-nf-text focus-visible:nf-focus"
                :aria-label="t('scenes.moveDown')"
                :title="t('scenes.moveDown')"
                @click="emit('move-scene', { chapterId: chapter!.id, sceneId: scene.id, direction: 'down' })"
              >
                ↓
              </button>
              <button
                type="button"
                class="rounded px-1 text-[12px] text-nf-text-dim hover:text-nf-text focus-visible:nf-focus"
                :aria-label="t('scenes.renameScene')"
                :title="t('scenes.renameScene')"
                @click="emit('rename-scene', { chapterId: chapter!.id, sceneId: scene.id })"
              >
                ✎
              </button>
              <button
                type="button"
                class="rounded px-1 text-[12px] text-nf-text-dim hover:text-nf-warn focus-visible:nf-focus"
                :aria-label="t('scenes.deleteScene')"
                :title="t('scenes.deleteScene')"
                @click="emit('delete-scene', { chapterId: chapter!.id, sceneId: scene.id })"
              >
                ✕
              </button>
            </span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
