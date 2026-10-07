import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { computed, ref, watch, onUnmounted } from "vue";
import Workspace from "./index.vue";
import { useApi } from "../../../../../composables/useApi";

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
  beforeEach(() => vi.restoreAllMocks());
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
