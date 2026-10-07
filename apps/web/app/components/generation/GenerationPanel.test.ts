import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import GenerationPanel from "./GenerationPanel.vue";

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../../composables/useApi", async (original) => ({
  ...await original<typeof import("../../composables/useApi")>(),
  useApi: () => ({ api }),
}));
vi.mock("../../composables/useLocale", () => ({ useLocale: () => ({ t: (key: string) => key }) }));
const chapter = { id: "chapter-a", number: 1, title: "One", status: "DRAFT", currentVersion: 1 };
const props = { workspaceId: "workspace", novelId: "novel-a", chapter };
const row = (id: string, novelId: string | null = "novel-a", chapterNumber = 1) => ({
  id, novelId, workflowId: "workflow", status: "AWAITING_APPROVAL",
  input: { chapterNumber }, startedAt: "2026-10-07T00:00:00Z", completedAt: null,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => {
  api.mockReset().mockImplementation(async (path: string) => {
    if (path.endsWith("/workflows")) return [{ id: "workflow", key: "chapter-generation-review" }];
    if (path.endsWith("/outline-versions")) return [{ id: "outline", number: 1, status: "APPROVED" }];
    return [];
  });
});

describe("novel-scoped chapter workflow history", () => {
  it("sends both filters, rejects foreign/null novel and other chapter rows, and selects only its parked approval", async () => {
    const fallback = api.getMockImplementation()!;
    api.mockImplementation((path: string) => path.includes("/workflow-runs?")
      ? Promise.resolve([row("foreign1", "novel-b"), row("unbound1", null),
        row("chapter2", "novel-a", 2), row("matching")]) : fallback(path));
    const wrapper = mount(GenerationPanel, { props });
    await flushPromises();
    const call = api.mock.calls.find(([path]) => path.includes("/workflow-runs?"))!;
    const query = new URL(call[0], "http://test").searchParams;
    expect(query.get("novelId")).toBe("novel-a");
    expect(query.get("chapterNumber")).toBe("1");
    expect(wrapper.text()).not.toContain("foreign1");
    expect(wrapper.text()).not.toContain("chapter2");
    const parked = wrapper.findAll("button").find((b) => b.text() === "generation.viewParkedRun")!;
    await parked.trigger("click");
    expect(wrapper.emitted("run-selected")).toEqual([["matching"]]);
    wrapper.unmount();
  });

  it("ignores an old novel's delayed history after navigation and clears when chapter disappears", async () => {
    const old = deferred<ReturnType<typeof row>[]>();
    const fallback = api.getMockImplementation()!;
    let requests = 0;
    api.mockImplementation((path: string) => path.includes("/workflow-runs?")
      ? (++requests === 1 ? old.promise : Promise.resolve([row("new-novel", "novel-b")])) : fallback(path));
    const wrapper = mount(GenerationPanel, { props });
    await flushPromises();
    await wrapper.setProps({ novelId: "novel-b", chapter: { ...chapter, id: "chapter-b" } });
    await flushPromises();
    old.resolve([row("old-novel")]);
    await flushPromises();
    expect(wrapper.text()).toContain("new-nove");
    expect(wrapper.text()).not.toContain("old-nove");
    await wrapper.setProps({ chapter: null });
    await flushPromises();
    expect(wrapper.text()).not.toContain("generation.parkedWarning");
    wrapper.unmount();
  });

  it("does not emit a late start response into a different novel", async () => {
    const start = deferred<unknown>();
    const fallback = api.getMockImplementation()!;
    api.mockImplementation((path: string, init?: RequestInit) => init?.method === "POST" ? start.promise : fallback(path));
    const wrapper = mount(GenerationPanel, { props });
    await flushPromises();
    await wrapper.findAll("button").find((b) => b.text() === "generation.startRun")!.trigger("click");
    await wrapper.setProps({ novelId: "novel-b", chapter: { ...chapter, id: "chapter-b" } });
    await flushPromises();
    start.resolve({ ...row("old-start"), statusUrl: "/old-start" });
    await flushPromises();
    expect(wrapper.emitted("run-started")).toBeUndefined();
    wrapper.unmount();
  });

  it("starts and selects the current novel normally", async () => {
    const fallback = api.getMockImplementation()!;
    api.mockImplementation((path: string, init?: RequestInit) => init?.method === "POST"
      ? Promise.resolve({ ...row("new-start"), statusUrl: "/new-start" }) : fallback(path));
    const wrapper = mount(GenerationPanel, { props });
    await flushPromises();
    await wrapper.findAll("button").find((b) => b.text() === "generation.startRun")!.trigger("click");
    await flushPromises();
    expect(wrapper.emitted("run-started")).toEqual([[{ runId: "new-start", statusUrl: "/new-start" }]]);
    wrapper.unmount();
  });
});
