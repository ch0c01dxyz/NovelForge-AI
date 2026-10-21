import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import GenerationPanel from "./GenerationPanel.vue";
import { ApiError } from "../../composables/useApi";

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
  sessionStorage.clear();
  api.mockReset().mockImplementation(async (path: string) => {
    if (path === "/auth/session") return { userId: "author" };
    if (path.endsWith("/workflows")) return [{ id: "workflow", key: "chapter-generation-review" }];
    if (path.endsWith("/outline-versions")) return [{ id: "outline", number: 1, status: "APPROVED" }];
    if (path.includes("/model-preferences?")) return { fingerprint: "a".repeat(64), steps: [{ stepKey: "write", kind: "AGENT", definitionKey: "writer", profile: "CREATIVE_WRITER", inheritedModelRef: null, inheritedSource: "AUTOMATIC" }] };
    if (path.includes("/model-catalog?")) return [{ modelRef: "chosen-writer", providerModelId: "writer", gatewayId: "gateway", selectable: true }];
    return [];
  });
});

describe("novel-scoped chapter workflow history", () => {
  it("opens a completed chapter result on entry once, without posting or repeatedly replacing the selection", async () => {
    const fallback = api.getMockImplementation()!;
    api.mockImplementation((path: string) => path.includes("/workflow-runs?") ? Promise.resolve([{ ...row("completed"), status: "SUCCEEDED" }]) : fallback(path));
    const wrapper = mount(GenerationPanel, { props });await flushPromises();
    expect(wrapper.emitted("run-selected")).toEqual([["completed"]]);
    const historyReads = api.mock.calls.filter(([path]) => path.includes("/workflow-runs?")).length;
    await wrapper.setProps({ chapter: { ...chapter, currentVersion: 2 } });await flushPromises();
    expect(api.mock.calls.filter(([path]) => path.includes("/workflow-runs?"))).toHaveLength(historyReads);
    expect(wrapper.emitted("run-selected")).toEqual([["completed"]]);
    await (wrapper.vm as unknown as { refresh: () => Promise<void> }).refresh();await flushPromises();
    expect(wrapper.emitted("run-selected")).toEqual([["completed"]]);
    expect(api.mock.calls.some(([_path, init]) => init?.method === "POST")).toBe(false);wrapper.unmount();
  });
  it("reuses failed strict setup only on the existing chapter and requires an explicit new start", async () => {
    const fallback = api.getMockImplementation()!;
    const failed = { ...row("failed"), status: "FAILED", workflowId: "strict-workflow", workflowKey: "chapter-creation-review", input: { chapterId: chapter.id, chapterNumber: 1, outlineRef: "old-outline", targetWordCount: 900, styleNotes: "Retain the sealed letter" }, requestedModelPreferences: { preferredModelRef: "chosen-writer" } };
    api.mockImplementation((path: string, init?: RequestInit) => {
      if (path.includes("/workflow-runs?")) return Promise.resolve([failed]);
      if (path.endsWith("/workflow-runs/failed")) return Promise.resolve(failed);
      if (init?.method === "POST") return Promise.resolve({ ...row("retried"), statusUrl: "/retried" });
      return fallback(path);
    });
    const wrapper = mount(GenerationPanel, { props });await flushPromises();
    await wrapper.get('[data-retry-run="failed"]').trigger("click");await flushPromises();
    expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toBe("Retain the sealed letter");
    expect((wrapper.get('input[type="number"]').element as HTMLInputElement).value).toBe("900");
    expect(wrapper.text()).toContain("generation.reuseReady");
    expect(api.mock.calls.some(([_path, init]) => init?.method === "POST")).toBe(false);
    await wrapper.findAll("button").find(button => button.text() === "generation.startRun")!.trigger("click");await flushPromises();
    const post = api.mock.calls.find(([_path, init]) => init?.method === "POST")!;
    expect(post[0]).toContain("/workflows/strict-workflow/run");
    expect(JSON.parse(post[1].body)).toMatchObject({ input: { chapterId: chapter.id, chapterNumber: 1, outlineRef: "outline", targetWordCount: 900, styleNotes: "Retain the sealed letter" }, stepModelRefs: { write: "chosen-writer" } });
    expect(api.mock.calls.some(([path]) => path.endsWith("/chapters"))).toBe(false);wrapper.unmount();
  });
  it("refuses a failed strict run for a different chapter without dispatching", async () => {
    const fallback = api.getMockImplementation()!;
    const failed = { ...row("foreign"), status: "FAILED", workflowKey: "chapter-creation-review", input: { chapterId: "other-chapter", chapterNumber: 1 } };
    api.mockImplementation((path: string) => path.includes("/workflow-runs?") ? Promise.resolve([{ ...failed, input: { chapterId: chapter.id, chapterNumber: 1 } }]) : path.endsWith("/workflow-runs/foreign") ? Promise.resolve(failed) : fallback(path));
    const wrapper = mount(GenerationPanel, { props });await flushPromises();await wrapper.get('[data-retry-run="foreign"]').trigger("click");await flushPromises();
    expect(wrapper.text()).toContain("generation.reuseFailedError");expect(api.mock.calls.some(([_path, init]) => init?.method === "POST")).toBe(false);wrapper.unmount();
  });
  it("ignores a delayed failed-run setup response after chapter navigation", async () => {
    const fallback = api.getMockImplementation()!, delayed = deferred<unknown>();
    const failed = { ...row("delayed"), status: "FAILED", workflowKey: "chapter-creation-review", input: { chapterId: chapter.id, chapterNumber: 1, styleNotes: "Must not overwrite another chapter" } };
    api.mockImplementation((path: string) => path.includes("/workflow-runs?") ? Promise.resolve([failed]) : path.endsWith("/workflow-runs/delayed") ? delayed.promise : fallback(path));
    const wrapper = mount(GenerationPanel, { props });await flushPromises();await wrapper.get('[data-retry-run="delayed"]').trigger("click");
    await wrapper.setProps({ chapter: { ...chapter, id: "other-chapter", number: 2 } });await flushPromises();delayed.resolve(failed);await flushPromises();
    expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toBe("");expect(wrapper.text()).not.toContain("generation.reuseReady");wrapper.unmount();
  });
  it("restores a request after remount and reuses the exact payload without automatic dispatch", async () => {
    const fallback = api.getMockImplementation()!;
    let attempts = 0;
    api.mockImplementation((path: string, init?: RequestInit) => {
      if (init?.method !== "POST") return fallback(path);
      if (++attempts === 1) throw new TypeError("response lost");
      return Promise.resolve({ ...row("restored"), statusUrl: "/restored" });
    });
    const first = mount(GenerationPanel, { props });await flushPromises();
    await first.get("textarea").setValue("Author instruction retained privately in this tab");
    await first.findAll("button").find(button => button.text() === "generation.startRun")!.trigger("click");await flushPromises();first.unmount();
    const restored = mount(GenerationPanel, { props });await flushPromises();
    expect(attempts).toBe(1);expect(restored.text()).toContain("generation.startUncertain");
    await restored.get('[data-testid="retry-workflow-start"]').trigger("click");await flushPromises();
    const posts = api.mock.calls.filter(([_path, init]) => init?.method === "POST");expect(posts[1]).toEqual(posts[0]);
    expect(sessionStorage.length).toBe(0);restored.unmount();
  });
  it("does not POST if durable storage is unavailable", async () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("storage blocked"); });
    const wrapper = mount(GenerationPanel, { props });await flushPromises();
    await wrapper.findAll("button").find(button => button.text() === "generation.startRun")!.trigger("click");await flushPromises();
    expect(api.mock.calls.filter(([_path, init]) => init?.method === "POST")).toHaveLength(0);
    expect(wrapper.text()).toContain("generation.recoveryFailed");wrapper.unmount();spy.mockRestore();
  });
  it("persists before POST and can recover while the original response is still in flight", async () => {
    const inFlight = deferred<unknown>();const fallback = api.getMockImplementation()!;let attempts = 0;
    api.mockImplementation((path: string, init?: RequestInit) => {
      if (init?.method !== "POST") return fallback(path);
      expect(sessionStorage.getItem("nf:workflow-start:v1:author")).toContain(JSON.parse(init.body as string).idempotencyKey);
      return ++attempts === 1 ? inFlight.promise : Promise.resolve({ ...row("same-run"), statusUrl: "/same-run" });
    });
    const first = mount(GenerationPanel, { props });await flushPromises();await first.findAll("button").find(button => button.text() === "generation.startRun")!.trigger("click");await flushPromises();first.unmount();
    const restored = mount(GenerationPanel, { props });await flushPromises();await restored.get('[data-testid="retry-workflow-start"]').trigger("click");await flushPromises();
    inFlight.resolve({ ...row("same-run"), statusUrl: "/same-run" });await flushPromises();
    expect(first.emitted("run-started")).toBeUndefined();expect(restored.emitted("run-started")).toHaveLength(1);
    expect(api.mock.calls.filter(([_path, init]) => init?.method === "POST").map(([_path, init]) => init.body)[1]).toEqual(api.mock.calls.find(([_path, init]) => init?.method === "POST")![1].body);
    expect(sessionStorage.length).toBe(0);restored.unmount();
  });
  it("does not replay another account's pending request after an account switch", async () => {
    const fallback = api.getMockImplementation()!;let actor = "author";
    api.mockImplementation((path: string, init?: RequestInit) => path === "/auth/session" ? Promise.resolve({ userId: actor }) : init?.method === "POST" ? Promise.reject(new TypeError("lost")) : fallback(path));
    const first = mount(GenerationPanel, { props });await flushPromises();await first.findAll("button").find(button => button.text() === "generation.startRun")!.trigger("click");await flushPromises();
    actor = "another-author";await first.get('[data-testid="retry-workflow-start"]').trigger("click");await flushPromises();
    expect(api.mock.calls.filter(([_path, init]) => init?.method === "POST")).toHaveLength(1);
    expect(first.text()).not.toContain("generation.startUncertain");expect(sessionStorage.getItem("nf:workflow-start:v1:author")).not.toBeNull();first.unmount();
    const other = mount(GenerationPanel, { props });await flushPromises();expect(other.text()).not.toContain("generation.startUncertain");other.unmount();
  });
  it("blocks corrupt records and keeps a confirmed run retryable if journal cleanup fails", async () => {
    sessionStorage.setItem("nf:workflow-start:v1:author", "broken");
    const corrupt = mount(GenerationPanel, { props });await flushPromises();expect(corrupt.text()).toContain("generation.recoveryFailed");corrupt.unmount();sessionStorage.clear();
    const fallback = api.getMockImplementation()!;api.mockImplementation((path: string, init?: RequestInit) => init?.method === "POST" ? Promise.resolve({ ...row("confirmed"), statusUrl: "/confirmed" }) : fallback(path));
    const wrapper = mount(GenerationPanel, { props });await flushPromises();const remove = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("cannot clear"); });
    await wrapper.findAll("button").find(button => button.text() === "generation.startRun")!.trigger("click");await flushPromises();
    expect(wrapper.text()).toContain("generation.startUncertain");expect(sessionStorage.getItem("nf:workflow-start:v1:author")).not.toBeNull();expect(wrapper.emitted("run-started")).toBeUndefined();
    remove.mockRestore();await wrapper.get('[data-testid="retry-workflow-start"]').trigger("click");await flushPromises();expect(wrapper.emitted("run-started")).toHaveLength(1);expect(sessionStorage.length).toBe(0);wrapper.unmount();
  });
  it("hides old account context if the new account journal is corrupt", async () => {
    const fallback = api.getMockImplementation()!;let actor = "author";
    api.mockImplementation((path: string, init?: RequestInit) => path === "/auth/session" ? Promise.resolve({ userId: actor }) : init?.method === "POST" ? Promise.reject(new TypeError("lost")) : fallback(path));
    const wrapper = mount(GenerationPanel, { props: { ...props, chapter: { ...chapter, title: "Private original title" } } });await flushPromises();await wrapper.findAll("button").find(button => button.text() === "generation.startRun")!.trigger("click");await flushPromises();
    expect(wrapper.text()).toContain("Private original title");actor = "another-author";sessionStorage.setItem("nf:workflow-start:v1:another-author", "corrupt");
    await wrapper.get('[data-testid="retry-workflow-start"]').trigger("click");await flushPromises();
    expect(wrapper.text()).not.toContain("Private original title");expect(wrapper.text()).not.toContain("generation.startUncertain");expect(wrapper.text()).toContain("generation.recoveryFailed");
    expect(sessionStorage.getItem("nf:workflow-start:v1:author")).toContain("Private original title");expect(api.mock.calls.filter(([_path, init]) => init?.method === "POST")).toHaveLength(1);wrapper.unmount();
  });
  it("ignores an obsolete recovery response after a newer recheck", async () => {
    const old = deferred<{ userId: string }>();const current = deferred<{ userId: string }>();const fallback = api.getMockImplementation()!;let probes = 0;
    api.mockImplementation((path: string) => {
      if (path !== "/auth/session") return fallback(path);
      if (++probes === 1) return Promise.reject(new TypeError("offline"));
      return probes === 2 ? old.promise : current.promise;
    });
    const wrapper = mount(GenerationPanel, { props });await flushPromises();
    const recheck = wrapper.findAll("button").find(button => button.text() === "generation.recheckRecovery")!;
    await recheck.trigger("click");await recheck.trigger("click");
    current.resolve({ userId: "author" });await flushPromises();old.resolve({ userId: "broken/actor" });await flushPromises();
    expect(wrapper.text()).not.toContain("generation.recoveryFailed");expect(wrapper.findAll("button").find(button => button.text() === "generation.startRun")!.attributes("disabled")).toBeUndefined();wrapper.unmount();
  });
  it("retries an uncertain POST with the exact original payload/key even after navigation", async () => {
    const fallback = api.getMockImplementation()!;
    let attempts = 0;
    api.mockImplementation((path: string, init?: RequestInit) => {
      if (init?.method !== "POST") return fallback(path);
      if (++attempts === 1) throw new ApiError("UNAVAILABLE", 503);
      return Promise.resolve({ ...row("recovered"), statusUrl: "/recovered" });
    });
    const wrapper = mount(GenerationPanel, { props });await flushPromises();
    await wrapper.findAll("button").find(button => button.text() === "generation.startRun")!.trigger("click");await flushPromises();
    expect(wrapper.text()).toContain("generation.startUncertain");
    await wrapper.setProps({ novelId: "novel-b", chapter: { ...chapter, id: "chapter-b" } });await flushPromises();
    expect(wrapper.get("textarea").attributes("disabled")).toBeDefined();
    await wrapper.get('[data-testid="retry-workflow-start"]').trigger("click");await flushPromises();
    const posts = api.mock.calls.filter(([_path, init]) => init?.method === "POST");
    expect(posts).toHaveLength(2);expect(posts[1]).toEqual(posts[0]);
    expect(wrapper.emitted("run-started")).toBeUndefined();
    expect(wrapper.text()).not.toContain("generation.startUncertain");wrapper.unmount();
  });
  it("blocks starts until preview is ready and requires refresh after a stale-preview refusal", async () => {
    const pending = deferred<{ fingerprint: string; steps: [] }>();
    const fallback = api.getMockImplementation()!;
    let reads = 0;
    api.mockImplementation((path: string, init?: RequestInit) => {
      if (path.includes("/model-preferences?")) return ++reads === 1 ? pending.promise : Promise.resolve({ fingerprint: "b".repeat(64), steps: [] });
      if (init?.method === "POST") throw new ApiError("CONFLICT", 409);
      return fallback(path);
    });
    const wrapper = mount(GenerationPanel, { props });await flushPromises();
    const start = () => wrapper.findAll("button").find(button => button.text() === "generation.startRun")!;
    expect(start().attributes("disabled")).toBeDefined();
    pending.resolve({ fingerprint: "a".repeat(64), steps: [] });await flushPromises();
    expect(start().attributes("disabled")).toBeUndefined();await start().trigger("click");await flushPromises();
    expect(start().attributes("disabled")).toBeDefined();expect(wrapper.text()).toContain("workflowModelPreferences.changed");
    await wrapper.get('[data-testid="workflow-models-reload"]').trigger("click");await flushPromises();
    expect(start().attributes("disabled")).toBeUndefined();wrapper.unmount();
  });
  it("submits selected AI-step models with the server preview fingerprint", async () => {
    const fallback = api.getMockImplementation()!;
    api.mockImplementation((path: string, init?: RequestInit) => init?.method === "POST" ? Promise.resolve({ ...row("selected"), statusUrl: "/selected" }) : fallback(path));
    const wrapper = mount(GenerationPanel, { props });await flushPromises();
    await wrapper.get('[data-model-ref="chosen-writer"]').trigger("click");
    await wrapper.findAll("button").find(button => button.text() === "generation.startRun")!.trigger("click");await flushPromises();
    const call = api.mock.calls.find(([_path, init]) => init?.method === "POST")!;
    expect(JSON.parse(call[1].body)).toMatchObject({ stepModelRefs: { write: "chosen-writer" }, expectedModelPreferenceFingerprint: "a".repeat(64) });wrapper.unmount();
  });
  it("sends both filters, rejects foreign/null novel and other chapter rows, and selects only its parked approval", async () => {
    const fallback = api.getMockImplementation()!;
    api.mockImplementation((path: string) => path.includes("/workflow-runs?")
      ? Promise.resolve([row("foreign1", "novel-b"), row("unbound1", null), { ...row("replaced-chapter"), input: { chapterNumber: 1, chapterId: "deleted-old-chapter" } },
        row("chapter2", "novel-a", 2), row("matching")]) : fallback(path));
    const wrapper = mount(GenerationPanel, { props });
    await flushPromises();
    const call = api.mock.calls.find(([path]) => path.includes("/workflow-runs?"))!;
    const query = new URL(call[0], "http://test").searchParams;
    expect(query.get("novelId")).toBe("novel-a");
    expect(query.get("chapterNumber")).toBe("1");
    expect(wrapper.text()).not.toContain("foreign1");
    expect(wrapper.text()).not.toContain("chapter2");
    expect(wrapper.text()).not.toContain("replaced");
    const parked = wrapper.findAll("button").find((b) => b.text() === "generation.viewParkedRun")!;
    await parked.trigger("click");
    expect(wrapper.emitted("run-selected")).toEqual([["matching"], ["matching"]]);
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
