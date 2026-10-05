/**
 * Accessibility tests (NF-WF-015, WCAG 2.2 AA contract): zero axe
 * violations (wcag2aa + wcag22aa tags) on every new editor surface in
 * both locales. The checked-in suite is the automated half of the
 * audit; the manual checklist (keyboard, named screen reader,
 * contrast, viewports, reduced motion, 200% zoom, lang) follows the
 * apps/web/a11y/AUDIT-014.md pattern.
 *
 * jsdom notes (documented, not hidden):
 * - @vue/test-utils wraps mount() props in deep reactive(), which breaks
 *   ProseMirror transactions; editors are markRaw'ed (production props
 *   are shallowReactive, so this reproduces production).
 * - Range#getClientRects/getBoundingClientRect are stubbed (no layout).
 */
import { describe, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { nextTick, markRaw } from "vue";
import { axe, configureAxe } from "vitest-axe";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import RichEditor from "../components/editor/RichEditor.vue";
import EditorToolbar from "../components/editor/EditorToolbar.vue";
import SelectionAiMenu from "../components/editor/SelectionAiMenu.vue";
import AiSuggestionCard from "../components/editor/AiSuggestionCard.vue";
import ConflictBanner from "../components/editor/ConflictBanner.vue";
import SceneNav from "../components/editor/SceneNav.vue";
import { en } from "../i18n/en";
import { id } from "../i18n/id";

if (typeof Range !== "undefined" && !Range.prototype.getClientRects) {
  Range.prototype.getClientRects = (() => []) as unknown as () => DOMRectList;
}

function tFor(locale: typeof en | typeof id) {
  return (path: string, params?: Record<string, string | number>) => {
    const parts = path.split(".");
    let node: unknown = locale;
    for (const p of parts) node = (node as Record<string, unknown>)?.[p];
    let s = typeof node === "string" ? node : path;
    if (params) for (const [k, v] of Object.entries(params)) s = s.replace(`{${k}}`, String(v));
    return s;
  };
}

let currentT: (path: string, params?: Record<string, string | number>) => string = tFor(en);

vi.mock("../composables/useLocale", () => ({
  useLocale: () => ({
    t: (p: string, params?: Record<string, string | number>) => currentT(p, params),
    locale: { value: "en" },
    setLocale: vi.fn(),
  }),
}));

configureAxe({
  rules: {},
});

const WCAG22_AA = {
  runOnly: { type: "tag" as const, values: ["wcag2aa", "wcag22aa"] },
};

const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));

function manuscriptEditor(content = ""): Editor {
  return markRaw(
    new Editor({
      extensions: [
        StarterKit.configure({
          code: false,
          codeBlock: false,
          strike: false,
          underline: false,
          link: false,
          heading: { levels: [2] },
        }),
      ],
      content,
    }),
  );
}

const scenesProps = {
  chapters: [
    { id: "c1", number: 1, title: "One" },
    { id: "c2", number: 2, title: "Two" },
  ],
  activeChapterId: "c1",
  scenesByChapter: {
    c1: [{ id: "s1", number: 1, title: "Arrival", summary: "They arrive." }],
    c2: [],
  },
  activeSceneId: "s1" as string | null,
};

describe.each([
  ["en", en],
  ["id", id],
] as Array<["en" | "id", typeof en]>)("editor a11y (%s)", (_name, locale) => {
  it("has zero axe violations on all editor surfaces", async () => {
    currentT = tFor(locale);
    const ed = manuscriptEditor("<p>The quick brown fox.</p>");
    await tick(40);

    const rich = mount(RichEditor, { props: { modelValue: "The quick brown fox." } });
    await vi.waitFor(() => expect(rich.find(".tiptap").exists()).toBe(true), { timeout: 5000 });

    const toolbar = mount(EditorToolbar, { props: { editor: ed } });

    ed.commands.setTextSelection({ from: 5, to: 10 });
    const menu = mount(SelectionAiMenu, { props: { editor: ed } });
    await tick(80);
    await nextTick();
    await flushPromises();

    const card = mount(AiSuggestionCard, {
      props: {
        operation: "expand",
        operationLabelKey: "aiAssist.opExpand",
        streaming: false,
        result: "Expanded prose.",
        errorKey: null,
        anchor: { top: 100, left: 100 },
      },
      attachTo: document.body,
    });

    const banner = mount(ConflictBanner, { props: { serverVersion: 7 } });
    const nav = mount(SceneNav, { props: scenesProps });

    for (const [label, wrapper] of [
      ["RichEditor", rich],
      ["EditorToolbar", toolbar],
      ["SelectionAiMenu", menu],
      ["AiSuggestionCard", card],
      ["ConflictBanner", banner],
      ["SceneNav", nav],
    ] as const) {
      const results = await axe(wrapper.element, WCAG22_AA);
      expect(results.violations, `${label} violations`).toEqual([]);
    }

    ed.destroy();
  }, 30000);
});
