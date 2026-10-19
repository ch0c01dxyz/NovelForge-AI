import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { computed, ref, watch, onUnmounted, type Ref } from "vue";
import Workspace from "./index.vue";
import { useApi } from "../../../../../composables/useApi";

// useLocale (via the page setup) uses Nuxt auto-imports (useCookie/useState/
// onNuxtReady) that don't exist under plain vitest; stub like useLocale.test.ts.
const stateMap = new Map<string, Ref<unknown>>();
const cookieRef = ref<string | null>(null);
vi.stubGlobal("useCookie", vi.fn(() => cookieRef));
vi.stubGlobal("useState", vi.fn((key: string, init?: () => unknown) => {
  if (!stateMap.has(key)) stateMap.set(key, ref(init ? init() : undefined));
  return stateMap.get(key)!;
}));
vi.stubGlobal("onNuxtReady", vi.fn(() => {}));
vi.stubGlobal("ref", ref);
vi.stubGlobal("computed", computed);
vi.stubGlobal("watch", watch);
vi.stubGlobal("onMounted", () => {});
vi.stubGlobal("onUnmounted", onUnmounted);
vi.stubGlobal("useApi", useApi);
vi.stubGlobal("useRoute", () => ({ params: { workspaceId: "ws", novelId: "novel" } }));
let guard: () => boolean;
vi.stubGlobal("onBeforeRouteLeave", (callback: () => boolean) => { guard = callback; });

describe("workspace navigation preserves unsaved text", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    stateMap.clear();
    cookieRef.value = null;
    localStorage.clear();
  });
  function publishingFixture(handler?: (url: string, init?: RequestInit) => Promise<Response> | Response | undefined) {
    const fetch = vi.fn(async (url: string, init?: RequestInit) => handler?.(url, init) ?? new Response(JSON.stringify(url.endsWith("scale-review-context") ? { context: { chapterVersion: { id: "saved-version", content: "Saved text" }, currentVersionId: "saved-version" } } : url.endsWith("final-text-review") ? { verdict: "PASS", chapterVersionId: "saved-version" } : { id: "publication" }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const wrapper = mount({ ...Workspace, render: () => null });
    const state = (wrapper.vm.$ as unknown as { setupState: Record<string, unknown> }).setupState;
    state.chapters = [{ id: "chapter", currentVersion: 1, status: "DRAFT", wordCount: 2 }];
    state.activeId = "chapter";state.version = 1;state.content = "Saved text";state.saveState = "saved";
    return { wrapper, state, fetch, publish: state.publish as () => Promise<void> };
  }
  it("reviews the exact saved version before publishing and ignores duplicate clicks", async () => {
    const { wrapper, fetch, publish } = publishingFixture();
    const first = publish();await publish();await first;
    expect(fetch.mock.calls.map(c => c[0].split("/").at(-1))).toEqual(["scale-review-context", "final-text-review", "publish"]);
    expect(JSON.parse(fetch.mock.calls[1]![1]!.body as string)).toEqual({ chapterVersionId: "saved-version" });wrapper.unmount();
  });
  it.each(["PASS", "FAIL"])("explicit Save saves text then reviews with %s without publishing", async (verdict) => {
    const { wrapper, state, fetch } = publishingFixture((url, init) => init?.method === "PUT" ? new Response(JSON.stringify({ version: 2, wordCount: 2 }), { status: 200 }) : url.endsWith("final-text-review") ? new Response(JSON.stringify({ verdict, chapterVersionId: "saved-version" }), { status: 200 }) : undefined);
    state.saveState = "dirty";
    await (state.saveAndReview as () => Promise<void>)();
    expect(fetch.mock.calls.map(c => c[0].split("/").at(-1))).toEqual(["chapter", "scale-review-context", "final-text-review"]);
    expect(state.saveState).toBe("saved");expect(state.version).toBe(2);
    if(verdict === "FAIL") expect(state.error).toBeTruthy();else expect(state.reviewNotice).toBeTruthy();
    wrapper.unmount();
  });
  it("waits for blur autosave before the explicit Save review", async () => {
    let finish!: (response: Response) => void;
    const { wrapper, state, fetch } = publishingFixture((url, init) => init?.method === "PUT" ? new Promise<Response>(resolve => { finish = resolve; }) : undefined);
    state.saveState = "dirty";
    const saving = (state.saveNow as () => Promise<void>)();
    const reviewing = (state.saveAndReview as () => Promise<void>)();
    expect(fetch).toHaveBeenCalledTimes(1);
    finish(new Response(JSON.stringify({ version: 2, wordCount: 2 }), { status: 200 }));
    await saving;await reviewing;
    expect(fetch.mock.calls.map(c => c[0].split("/").at(-1))).toEqual(["chapter", "scale-review-context", "final-text-review"]);wrapper.unmount();
  });
  it.each(["FAIL", "malformed", "error"])("does not publish after a %s review", async (result) => {
    const { wrapper, state, fetch, publish } = publishingFixture((url) => url.endsWith("final-text-review") ? new Response(JSON.stringify(result === "error" ? { error: "INTERNAL" } : result === "FAIL" ? { verdict: "FAIL", chapterVersionId: "saved-version" } : {}), { status: result === "error" ? 500 : 200 }) : undefined);
    await publish();expect(fetch.mock.calls.some(c => c[0].endsWith("publication/publish"))).toBe(false);expect(state.error).toBeTruthy();wrapper.unmount();
  });
  it.each(["edit", "selection", "unmount"])("stops publication after %s during review", async (change) => {
    let finish!: (response: Response) => void;
    const { wrapper, state, fetch, publish } = publishingFixture((url) => url.endsWith("final-text-review") ? new Promise<Response>(r => { finish = r; }) : undefined);
    const pending = publish();await flushPromises();
    if (change === "unmount") wrapper.unmount();
    else if (change === "selection") state.activeId = "another";
    else { state.content = "New text";state.saveState = "dirty"; }
    finish(new Response(JSON.stringify({ verdict: "PASS", chapterVersionId: "saved-version" }), { status: 200 }));await pending;
    expect(fetch.mock.calls.some(c => c[0].endsWith("publication/publish"))).toBe(false);if(change !== "unmount") wrapper.unmount();
  });
  it("refuses a server version with different text before review", async () => {
    const { wrapper, fetch, publish } = publishingFixture((url) => url.endsWith("scale-review-context") ? new Response(JSON.stringify({ context: { chapterVersion: { id: "new-version", content: "Other author's change" }, currentVersionId: "new-version" } }), { status: 200 }) : undefined);
    await publish();expect(fetch).toHaveBeenCalledTimes(1);wrapper.unmount();
  });
  it("sorts chapter numbers in both directions without changing the active chapter or dirty buffer", () => {
    const wrapper = mount({ ...Workspace, render: () => null });
    const state = (wrapper.vm.$ as unknown as { setupState: Record<string, unknown> }).setupState;
    state.chapters = [{ id: "ten", number: 10 }, { id: "one", number: 1 }, { id: "two", number: 2 }];
    state.activeId = "two";
    state.content = "Keep this unsaved chapter";
    state.saveState = "dirty";
    const numbers = () => (state.sortedChapters as { number: number }[]).map((c) => c.number);
    expect(numbers()).toEqual([1, 2, 10]);
    state.chapterSort = "newest";
    expect(numbers()).toEqual([10, 2, 1]);
    expect((state.chapters as { number: number }[]).map((c) => c.number)).toEqual([10, 1, 2]);
    expect(state.activeId).toBe("two");
    expect(state.content).toBe("Keep this unsaved chapter");
    expect(state.saveState).toBe("dirty");
    state.chapterSort = "oldest";
    expect(numbers()).toEqual([1, 2, 10]);
    state.chapters = [];
    expect(numbers()).toEqual([]);
    wrapper.unmount();
  });
  it("blocks dirty, in-flight and conflicted buffers and allows only saved state", () => {
    // Execute the real page setup/guard; child rendering and network loading
    // are outside this navigation check.
    const wrapper = mount({ ...Workspace, render: () => null });
    const state = (wrapper.vm.$ as unknown as { setupState: Record<string, unknown> }).setupState;
    expect(guard()).toBe(true);
    for (const status of ["dirty", "saving", "conflict"]) {
      state.content = "Text must survive navigation";
      state.saveState = status;
      expect(guard()).toBe(false);
      expect(state.content).toBe("Text must survive navigation");
      expect(state.error).toContain("Save your text");
    }
    state.saveState = "saved";
    expect(guard()).toBe(true);
    wrapper.unmount();
  });
  it("does not mark newer edits saved when an older autosave completes", async () => {
    let complete!: (response: Response) => void;
    const fetch = vi.fn(() => new Promise<Response>((resolve) => { complete = resolve; }));
    vi.stubGlobal("fetch", fetch);
    const wrapper = mount({ ...Workspace, render: () => null });
    const state = (wrapper.vm.$ as unknown as { setupState: Record<string, unknown> }).setupState;
    state.chapters = [{ id: "chapter", currentVersion: null, wordCount: 0 }];
    state.activeId = "chapter";
    state.content = "Submitted text";
    state.saveState = "dirty";
    const save = state.saveNow as () => Promise<void>;
    const pending = save();
    expect(guard()).toBe(false);
    (state.onEditorInput as (text: string) => void)("Newer unsaved text");
    await save();
    await (state.selectChapter as (id: string) => Promise<void>)("another-chapter");
    expect(state.activeId).toBe("chapter");
    expect(fetch).toHaveBeenCalledTimes(1);
    complete(new Response(JSON.stringify({ version: 1, wordCount: 2 }), { status: 200 }));
    await pending;
    await flushPromises();
    expect(state.content).toBe("Newer unsaved text");
    expect(state.saveState).toBe("dirty");
    expect(guard()).toBe(false);
    wrapper.unmount();
  });
  it("keeps chapter and buffer when the flush before chapter switching fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const wrapper = mount({ ...Workspace, render: () => null });
    const state = (wrapper.vm.$ as unknown as { setupState: Record<string, unknown> }).setupState;
    state.chapters = [{ id: "chapter", currentVersion: null, wordCount: 0 }];
    state.activeId = "chapter";
    state.content = "Keep this buffer";
    state.saveState = "dirty";
    await (state.selectChapter as (id: string) => Promise<void>)("another-chapter");
    expect(state.activeId).toBe("chapter");
    expect(state.content).toBe("Keep this buffer");
    expect(guard()).toBe(false);
    wrapper.unmount();
  });
});
