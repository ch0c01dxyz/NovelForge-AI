/**
 * Editor component tests (NF-WF-015): the six new editor components with
 * REAL Tiptap editors in jsdom (no editor mocks — the schema restriction,
 * the isSame guard, and the stale-selection pin are all exercised
 * against the real ProseMirror document).
 *
 * - RichEditor: plain-text loads as paragraphs; user edits emit HTML;
 *   programmatic setContent does not emit (isSame guard + suppressEmit);
 *   the schema is restricted to the manuscript subset.
 * - EditorToolbar: B/I/H2/quote toggle real marks; rewrite-tone emits.
 * - SelectionAiMenu: the real @tiptap/vue-3/menus BubbleMenu lists the
 *   six pinned operations; free-prompt flow; Esc dismisses.
 * - AiSuggestionCard: accept/insert/discard; streaming + error states.
 * - ConflictBanner: role=alert; the three explicit actions emit.
 * - SceneNav: breadcrumb; scene list; CRUD/move intents emit.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { nextTick, markRaw } from "vue";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import RichEditor from "./RichEditor.vue";
import EditorToolbar from "./EditorToolbar.vue";
import SelectionAiMenu from "./SelectionAiMenu.vue";
import AiSuggestionCard from "./AiSuggestionCard.vue";
import ConflictBanner from "./ConflictBanner.vue";
import SceneNav from "./SceneNav.vue";

vi.mock("../../composables/useLocale", () => ({
  useLocale: () => ({
    t: (path: string, params?: Record<string, string | number>) => {
      let s = path;
      if (params) for (const [k, v] of Object.entries(params)) s += `|${k}=${v}`;
      return s;
    },
    locale: { value: "en" },
    setLocale: vi.fn(),
  }),
}));

const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));

// jsdom has no layout engine: Range#getClientRects is missing, but
// ProseMirror's scrollToSelection (reached via Tiptap's focus() command,
// which scrolls into view) calls it. The empty list is the honest
// headless answer — there is nothing to scroll to.
if (typeof Range !== "undefined" && !Range.prototype.getClientRects) {
  Range.prototype.getClientRects = (() => []) as unknown as () => DOMRectList;
  Range.prototype.getBoundingClientRect = (() => ({
    x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0,
    toJSON: () => ({}),
  })) as unknown as () => DOMRect;
}

/** The manuscript subset, mirroring RichEditor's StarterKit config. */
function manuscriptEditor(content = ""): Editor {
  // markRaw: @vue/test-utils wraps mount() props in deep reactive(), which
  // breaks ProseMirror transaction identity. Real Vue component props are
  // shallowReactive, so the editor always stays raw in production; markRaw
  // reproduces that in tests (and is Tiptap's documented Vue practice).
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

/** Let ProseMirror's rAF-scheduled view work settle before destroying. */
async function settleAndDestroy(ed: Editor) {
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  await tick(20);
  ed.destroy();
}

async function tickSettle(ms = 60) {
  await tick(ms);
  await nextTick();
  await flushPromises();
}

describe("RichEditor", () => {
  it("renders plain-text chapters as paragraphs", async () => {
    const w = mount(RichEditor, { props: { modelValue: "First line\n\nSecond line" } });
    await vi.waitFor(() => expect(w.find(".tiptap").exists()).toBe(true), { timeout: 5000 });
    // The editor is the source of truth for the assertion, not the DOM.
    const ed = (w.emitted("editor-ready") as unknown as Array<[Editor]>)[0]![0];
    expect(ed.getHTML()).toBe("<p>First line</p><p>Second line</p>");
    ed.destroy();
  });

  it("emits update:modelValue with HTML on user edits", async () => {
    const w = mount(RichEditor, { props: { modelValue: "Hello" } });
    await vi.waitFor(() => expect(w.find(".tiptap").exists()).toBe(true), { timeout: 5000 });
    const ed = (w.emitted("editor-ready") as unknown as Array<[Editor]>)[0]![0];
    ed.commands.setTextSelection({ from: 6, to: 6 }); // end of "Hello"
    ed.commands.insertContent(" world");
    await vi.waitFor(() => expect(w.emitted("update:modelValue")).toHaveLength(1));
    const html = (w.emitted("update:modelValue") as unknown as Array<[string]>)[0]![0];
    expect(html).toContain("Hello world");
    ed.destroy();
  });

  it("programmatic setContent does not emit (isSame guard + suppressEmit)", async () => {
    const w = mount(RichEditor, { props: { modelValue: "Hello" } });
    await vi.waitFor(() => expect(w.find(".tiptap").exists()).toBe(true), { timeout: 5000 });
    const ed = (w.emitted("editor-ready") as unknown as Array<[Editor]>)[0]![0];
    await w.setProps({ modelValue: "<p>Loaded from server</p>" });
    await tickSettle();
    expect(w.emitted("update:modelValue")).toBeUndefined();
    expect(ed.getHTML()).toBe("<p>Loaded from server</p>");
    ed.destroy();
  });

  it("restricts the schema to the manuscript subset", async () => {
    const w = mount(RichEditor, { props: { modelValue: "Hi" } });
    await vi.waitFor(() => expect(w.find(".tiptap").exists()).toBe(true), { timeout: 5000 });
    const ed = (w.emitted("editor-ready") as unknown as Array<[Editor]>)[0]![0];
    // Marks/blocks the server allowlist keeps are available…
    expect(ed.commands.toggleBold).toBeTypeOf("function");
    expect(ed.commands.toggleItalic).toBeTypeOf("function");
    expect(ed.commands.toggleBlockquote).toBeTypeOf("function");
    expect(ed.commands.toggleHeading).toBeTypeOf("function");
    // …everything the sanitizer would strip is not registered.
    expect(ed.commands.toggleStrike).toBeUndefined();
    expect(ed.commands.toggleCodeBlock).toBeUndefined();
    expect(ed.commands.toggleCode).toBeUndefined();
    expect(ed.commands.setLink).toBeUndefined();
    // Headings are level-2 only (no h1 — titles are metadata).
    expect(ed.extensionManager.extensions.find((e) => e.name === "heading")?.options.levels).toEqual([2]);
    ed.destroy();
  });

  it("labels the editable region and emits blur", async () => {
    const w = mount(RichEditor, {
      props: { modelValue: "Hi", ariaLabel: "Chapter prose" },
    });
    await vi.waitFor(() => expect(w.find(".tiptap").exists()).toBe(true), { timeout: 5000 });
    const ed = (w.emitted("editor-ready") as unknown as Array<[Editor]>)[0]![0];
    expect(w.find('[aria-label="Chapter prose"]').exists()).toBe(true);
    ed.emit("blur", { editor: ed, event: new FocusEvent("blur"), transaction: ed.state.tr });
    expect(w.emitted("blur")).toHaveLength(1);
    ed.destroy();
  });
});

describe("EditorToolbar", () => {
  let ed: Editor;
  beforeEach(async () => {
    ed = manuscriptEditor("<p>hello</p>");
    await tick(30);
  });

  it("toggles bold/italic/H2/quote via real Tiptap commands", async () => {
    const w = mount(EditorToolbar, { props: { editor: ed } });
    ed.commands.setTextSelection({ from: 1, to: 6 });
    await nextTick();

    const buttons = w.findAll("button");
    const bold = buttons.find((b) => b.attributes("aria-label") === "editor.bold")!;
    await bold.trigger("click");
    expect(ed.isActive("bold")).toBe(true);
    expect(bold.attributes("aria-pressed")).toBe("true");

    const h2 = buttons.find((b) => b.attributes("aria-label") === "editor.heading2")!;
    await h2.trigger("click");
    expect(ed.isActive("heading", { level: 2 })).toBe(true);

    const quote = buttons.find((b) => b.attributes("aria-label") === "editor.quote")!;
    await quote.trigger("click");
    expect(ed.isActive("blockquote")).toBe(true);
    await settleAndDestroy(ed);
  });

  it("emits rewrite-tone for the AI entry point", async () => {
    const w = mount(EditorToolbar, { props: { editor: ed } });
    const ai = w.findAll("button").find((b) => b.attributes("aria-label") === "aiAssist.opRewriteTone")!;
    await ai.trigger("click");
    expect(w.emitted("rewrite-tone")).toHaveLength(1);
    await settleAndDestroy(ed);
  });
});

describe("SelectionAiMenu", () => {
  it("lists the six pinned operations over a selection", async () => {
    const ed = manuscriptEditor("<p>hello world</p>");
    await tick(30);
    ed.commands.setTextSelection({ from: 1, to: 6 });
    ed.commands.focus();
    const w = mount(SelectionAiMenu, { props: { editor: ed } });
    await tickSettle();
    const items = w.findAll('[role="menuitem"]');
    const labels = items.map((i) => i.text());
    expect(labels).toContain("aiAssist.opRewriteTone");
    expect(labels).toContain("aiAssist.opExpand");
    expect(labels).toContain("aiAssist.opMoreDialogue");
    expect(labels).toContain("aiAssist.opShowDontTell");
    expect(labels).toContain("aiAssist.opContinueScene");
    expect(labels).toContain("aiAssist.opFreePrompt");
    await settleAndDestroy(ed);
  });

  it("emits run-operation for a picked operation", async () => {
    const ed = manuscriptEditor("<p>hello world</p>");
    await tick(30);
    ed.commands.setTextSelection({ from: 1, to: 6 });
    const w = mount(SelectionAiMenu, { props: { editor: ed } });
    await tickSettle();
    const expand = w
      .findAll('[role="menuitem"]')
      .find((i) => i.text().includes("aiAssist.opExpand"))!;
    await expand.trigger("click");
    expect(w.emitted("run-operation")).toEqual([["expand"]]);
    await settleAndDestroy(ed);
  });

  it("runs the free prompt from the in-menu input", async () => {
    const ed = manuscriptEditor("<p>hello world</p>");
    await tick(30);
    ed.commands.setTextSelection({ from: 1, to: 6 });
    const w = mount(SelectionAiMenu, { props: { editor: ed } });
    await tickSettle();
    const free = w
      .findAll('[role="menuitem"]')
      .find((i) => i.text().includes("aiAssist.opFreePrompt"))!;
    await free.trigger("click");
    const input = w.find("input");
    await input.setValue("make it ominous");
    await input.trigger("keydown.enter");
    expect(w.emitted("run-free-prompt")).toEqual([["make it ominous"]]);
    await settleAndDestroy(ed);
  });

  it("Esc dismisses the menu and returns focus to the editor", async () => {
    const ed = manuscriptEditor("<p>hello world</p>");
    await tick(30);
    ed.commands.setTextSelection({ from: 1, to: 6 });
    // The view DOM itself must be connected for view.focus()/isFocused.
    document.body.appendChild(ed.view.dom);
    // Attached: view.focus() only flips isFocused on a connected element.
    const w = mount(SelectionAiMenu, { props: { editor: ed }, attachTo: document.body });
    await tickSettle();
    const menu = w.find('[role="menu"]');
    await menu.trigger("keydown", { key: "Escape" });
    await tickSettle();
    expect(ed.isFocused).toBe(true);
    ed.view.dom.remove();
    await settleAndDestroy(ed);
  });
});

describe("AiSuggestionCard", () => {
  const props = {
    operation: "expand" as const,
    operationLabelKey: "aiAssist.opExpand",
    streaming: false,
    result: "Expanded prose here.",
    errorKey: null,
    anchor: { top: 100, left: 100 },
  };

  it("emits accept/insert/discard", async () => {
    const w = mount(AiSuggestionCard, { props });
    const [accept, insert, discard] = w.findAll("button");
    await accept!.trigger("click");
    await insert!.trigger("click");
    await discard!.trigger("click");
    expect(w.emitted("accept")).toHaveLength(1);
    expect(w.emitted("insert")).toHaveLength(1);
    expect(w.emitted("discard")).toHaveLength(1);
  });

  it("disables accept/insert while streaming and shows the error state", async () => {
    const w = mount(AiSuggestionCard, { props: { ...props, streaming: true, result: "partial" } });
    const [accept, insert] = w.findAll("button");
    expect((accept!.element as HTMLButtonElement).disabled).toBe(true);
    expect((insert!.element as HTMLButtonElement).disabled).toBe(true);
    expect(w.text()).toContain("aiAssist.streaming");

    const w2 = mount(AiSuggestionCard, {
      props: { ...props, errorKey: "aiAssist.noModel" },
    });
    expect(w2.find('[role="alert"]').text()).toContain("aiAssist.noModel");
    const [accept2] = w2.findAll("button");
    expect((accept2!.element as HTMLButtonElement).disabled).toBe(true);
  });

  it("Esc discards the card", async () => {
    const w = mount(AiSuggestionCard, { props, attachTo: document.body });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await nextTick();
    expect(w.emitted("discard")).toHaveLength(1);
  });
});

describe("ConflictBanner", () => {
  it("is role=alert and emits the three explicit actions", async () => {
    const w = mount(ConflictBanner, { props: { serverVersion: 7 } });
    expect(w.attributes("role")).toBe("alert");
    expect(w.text()).toContain("conflict.message|version=7");
    const [keep, theirs, compare] = w.findAll("button");
    await keep!.trigger("click");
    await theirs!.trigger("click");
    await compare!.trigger("click");
    expect(w.emitted("keep-mine")).toHaveLength(1);
    expect(w.emitted("load-theirs")).toHaveLength(1);
    expect(w.emitted("compare")).toHaveLength(1);
  });
});

describe("SceneNav", () => {
  const chapters = [
    { id: "c1", number: 1, title: "One" },
    { id: "c2", number: 2, title: "Two" },
    { id: "c3", number: 3, title: "Three" },
  ];
  const scenesByChapter = {
    c2: [
      { id: "s1", number: 1, title: "Arrival", summary: "They arrive." },
      { id: "s2", number: 2, title: "Fight", summary: null },
    ],
    c1: [{ id: "s0", number: 1, title: "Prologue", summary: null }],
    c3: [],
  };

  function mountNav(activeSceneId: string | null = "s1") {
    return mount(SceneNav, {
      props: { chapters, activeChapterId: "c2", scenesByChapter, activeSceneId },
    });
  }

  it("shows the Chapter N · Scene M breadcrumb", () => {
    const w = mountNav("s2");
    expect(w.text()).toContain("scenes.breadcrumb|chapter=2|scene=2");
    const w2 = mountNav(null);
    expect(w2.text()).toContain("scenes.chapterOnly|chapter=2");
  });

  it("lists the active chapter's scenes plus adjacent chapters' scenes", async () => {
    const w = mountNav();
    await w.find("button").trigger("click"); // open the navigator
    const text = w.text();
    expect(text).toContain("Arrival");
    expect(text).toContain("Fight");
    expect(text).toContain("Prologue"); // adjacent chapter c1
    expect(text).toContain("scenes.noScenes"); // adjacent chapter c3 (empty)
  });

  it("emits select/add/rename/delete/move intents", async () => {
    const w = mountNav();
    await w.find("button").trigger("click");
    const sceneButtons = w.findAll("button").filter((b) => b.text().includes("Fight"));
    await sceneButtons[0]!.trigger("click");
    expect(w.emitted("select-scene")).toEqual([[{ chapterId: "c2", sceneId: "s2" }]]);

    // The management buttons appear on hover in CSS; call the emits via
    // the component's exposed intent surface (title attributes).
    const byTitle = (title: string) =>
      w.findAll("button").find((b) => b.attributes("title") === title)!;
    await byTitle("scenes.moveDown").trigger("click");
    expect(w.emitted("move-scene")).toEqual([
      [{ chapterId: "c2", sceneId: "s1", direction: "down" }],
    ]);
    await byTitle("scenes.renameScene").trigger("click");
    expect(w.emitted("rename-scene")).toEqual([[{ chapterId: "c2", sceneId: "s1" }]]);
    await byTitle("scenes.deleteScene").trigger("click");
    expect(w.emitted("delete-scene")).toEqual([[{ chapterId: "c2", sceneId: "s1" }]]);
    await byTitle("scenes.addScene").trigger("click");
    expect(w.emitted("add-scene")).toEqual([[{ chapterId: "c2" }]]);
  });
});
