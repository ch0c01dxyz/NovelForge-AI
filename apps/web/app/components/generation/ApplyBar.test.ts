import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { flushPromises } from "@vue/test-utils";
import ApplyBar from "./ApplyBar.vue";
import { ApiError } from "../../composables/useApi";
const { api, history } = vi.hoisted(() => ({ api: vi.fn(), history: vi.fn() }));

vi.mock("../../composables/useApi", () => ({
  useApi: () => ({
    api: (path: string, init?: RequestInit) => path.endsWith("/versions") ? history(path) : api(path, init),
  }),
  ApiError: class ApiError extends Error {
    constructor(
      readonly code: string,
      readonly status: number,
    ) {
      super(`${status} ${code}`);
      this.name = "ApiError";
    }
  },
}));

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

const baseProps = {
  workspaceId: "ws",
  novelId: "novel",
  chapterId: "ch",
  chapterNumber: 1,
  chapterStatus: "DRAFT",
  currentVersion: 3,
  diffPinnedVersion: 3,
  saveState: "saved" as const,
  runStatus: "SUCCEEDED",
  runId: "run-1",
  draftProse: "Once upon a time…",
};

describe("ApplyBar", () => {
  it("keeps apply disabled when history cannot be verified and retries only the history read", async () => {
    history.mockRejectedValueOnce(new Error("Unavailable"));
    const w = mount(ApplyBar, { props: baseProps }); await flushPromises();
    expect(w.get("button").attributes("disabled")).toBeDefined();
    expect(w.text()).toContain("apply.historyUnavailable");
    await w.findAll("button").find(b => b.text() === "common.retry")!.trigger("click"); await flushPromises();
    expect(w.get("button").attributes("disabled")).toBeUndefined();
    expect(api).not.toHaveBeenCalled(); w.unmount();
  });
  it("restores historical application at v1 after remount at edited v4 without reapplying", async () => {
    history.mockResolvedValue([{ number: 1, note: JSON.stringify({ operation: "chapter.apply_title_and_prose", creationRunId: "run-1" }) }]);
    const w = mount(ApplyBar, { props: { ...baseProps, currentVersion: 4, diffPinnedVersion: 4 } });
    await flushPromises();
    expect(w.text()).toContain("apply.appliedAndEdited");
    expect(w.text()).toContain("currentVersion=4");
    expect(w.text()).not.toContain("apply.applyDraft");
    expect(api).not.toHaveBeenCalled(); w.unmount();
  });
  it("does not infer application from another run or a version later than the current restored text", async () => {
    history.mockResolvedValue([{ number: 1, note: JSON.stringify({ operation: "chapter.apply_title_and_prose", creationRunId: "other" }) }, { number: 5, note: JSON.stringify({ operation: "chapter.apply_title_and_prose", creationRunId: "run-1" }) }]);
    const w = mount(ApplyBar, { props: baseProps }); await flushPromises();
    expect(w.get("button").attributes("disabled")).toBeUndefined();
    expect(w.text()).not.toContain("apply.appliedAndEdited"); w.unmount();
  });
  it("blocks an unresolved history lookup and fences delayed evidence after switching chapters", async () => {
    let resolve!: (value: unknown[]) => void;
    history.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const w = mount(ApplyBar, { props: baseProps });
    expect(w.get("button").attributes("disabled")).toBeDefined();
    await w.setProps({ chapterId: "other", runId: "other-run" }); await flushPromises();
    resolve([{ number: 1, note: JSON.stringify({ operation: "chapter.apply_title_and_prose", creationRunId: "run-1" }) }]); await flushPromises();
    expect(w.text()).not.toContain("apply.appliedAndEdited");
    expect(w.get("button").attributes("disabled")).toBeUndefined(); w.unmount();
  });
  it("requires explicit title-only recovery, makes no automatic retry and retains the server-applied title", async () => {
    api.mockRejectedValueOnce(new ApiError("AI_CREATION_TITLE_ONLY_CHANGED", 409));
    const w = mount(ApplyBar, { props: { ...baseProps, draftTitle: "AI title", chapterTitle: "My title" } });
    await flushPromises();await w.get("button").trigger("click");await new Promise(done => setTimeout(done, 0));
    expect(api).toHaveBeenCalledTimes(1);expect(w.text()).toContain("apply.titleOnlyChanged");
    expect(w.get("button").attributes("disabled")).toBeDefined();
    await w.get('[data-testid="allow-title-only-recovery"]').setValue(true);
    api.mockResolvedValueOnce({ version: 4, title: "My title" });await flushPromises();await w.get("button").trigger("click");await new Promise(done => setTimeout(done, 0));
    expect(JSON.parse(api.mock.calls[1]![1].body)).toMatchObject({ allowTitleOnlyRebase: true, expectedVersion: 3, expectedTitle: "My title", title: "AI title" });
    expect(w.emitted("applied")).toEqual([[4, "My title"]]);w.unmount();
  });
  it("does not offer title recovery for real source drift", async () => {
    api.mockRejectedValueOnce(new ApiError("AI_CREATION_SOURCE_CHANGED", 409));
    const w = mount(ApplyBar, { props: { ...baseProps, draftTitle: "AI title", chapterTitle: "My title" } });
    await flushPromises();await w.get("button").trigger("click");await new Promise(done => setTimeout(done, 0));
    expect(w.text()).toContain("apply.sourceChanged");expect(w.find('[data-testid="allow-title-only-recovery"]').exists()).toBe(false);
    expect(api).toHaveBeenCalledTimes(1);w.unmount();
  });
  it("does not emit a delayed apply response into a newly selected chapter", async () => {
    let resolve!: (value: { version: number }) => void;
    api.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const w = mount(ApplyBar, { props: { ...baseProps, draftTitle: "Reviewed title", chapterTitle: "Pending" } });
    await flushPromises();await w.get("button").trigger("click");
    expect(JSON.parse(api.mock.calls.at(-1)![1].body)).toMatchObject({ title: "Reviewed title", expectedTitle: "Pending", content: baseProps.draftProse });
    await w.setProps({ chapterId: "another-chapter", runId: "another-run" });
    resolve({ version: 4 });await new Promise(done => setTimeout(done, 0));
    expect(w.emitted("applied")).toBeUndefined();
    w.unmount();
  });
  it("blocks strict creation artifacts with a missing title and displays the coherent reviewed title", async () => {
    const w = mount(ApplyBar, { props: { ...baseProps, draftTitle: null, chapterTitle: "Pending" } });
    expect(w.find("button").attributes("disabled")).toBeDefined();
    expect(w.text()).toContain("chapterCreation.invalidTitle");
    await w.setProps({ draftTitle: "A quiet dawn" });
    expect(w.find("button").attributes("disabled")).toBeUndefined();expect(w.text()).toContain("A quiet dawn");
  });
  beforeEach(() => { vi.clearAllMocks(); history.mockReset().mockResolvedValue([]); });

  it("enables apply when all guards pass", async () => {
    const w = mount(ApplyBar, { props: baseProps });
    await flushPromises();
    const btn = w.find("button");
    expect(btn.attributes("disabled")).toBeUndefined();
  });

  it("disables apply with a dirty editor", () => {
    const w = mount(ApplyBar, { props: { ...baseProps, saveState: "dirty" } });
    expect(w.find("button").attributes("disabled")).toBeDefined();
    expect(w.text()).toContain("apply.blockedDirty");
  });

  it("blocks apply when the version moved (stale-source)", () => {
    const w = mount(ApplyBar, {
      props: { ...baseProps, currentVersion: 4, diffPinnedVersion: 3 },
    });
    expect(w.find("button").attributes("disabled")).toBeDefined();
    expect(w.text()).toContain("apply.blockedStale");
    expect(w.text()).toContain("apply.reloadRediff");
  });

  it("shows 'unpublish first' for published chapters", () => {
    const w = mount(ApplyBar, { props: { ...baseProps, chapterStatus: "PUBLISHED" } });
    expect(w.find("button").attributes("disabled")).toBeDefined();
    expect(w.text()).toContain("apply.blockedPublished");
  });

  it("hides the bar unless the run succeeded", () => {
    const w = mount(ApplyBar, { props: { ...baseProps, runStatus: "RUNNING" } });
    expect(w.html()).not.toContain("apply.applyDraft");
  });

  it("emits reload-rediff from the stale recovery path", async () => {
    const w = mount(ApplyBar, {
      props: { ...baseProps, currentVersion: 4, diffPinnedVersion: 3 },
    });
    const recovery = w.findAll("button").find((b) => b.text().includes("apply.reloadRediff"));
    expect(recovery).toBeDefined();
    await recovery!.trigger("click");
    expect(w.emitted("reload-rediff")).toHaveLength(1);
  });
});
