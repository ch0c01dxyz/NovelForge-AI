import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import RunStatusPanel from "./RunStatusPanel.vue";

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../../composables/useApi", async (original) => ({
  ...await original<typeof import("../../composables/useApi")>(), useApi: () => ({ api }),
}));
vi.mock("../../composables/useLocale", () => ({ useLocale: () => ({ t: (key: string) => key }) }));
const props = { workspaceId: "workspace-a", runId: "run-a", statusUrl: null };
const row = (id: string, status = "AWAITING_APPROVAL") => ({
  id, novelId: `novel-${id}`, workflowId: "workflow", workflowKey: "chapter-generation-review",
  workflowVersionNumber: 1, status, input: { chapterNumber: 1 }, output: {},
  errorMessage: null, stepCount: 0, startedAt: "2026-10-07T00:00:00Z", completedAt: null, steps: [],
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => { api.mockReset(); });

describe("run selection response isolation", () => {
  it("explains an undersized draft without presenting a technical code as the instruction", async () => {
    api.mockResolvedValue({ ...row("run-a", "FAILED"), steps: [{ stepKey: "write", kind: "AGENT", sequence: 1, status: "FAILED", errorMessage: "AI_CHAPTER_TOO_SHORT: expected at least 2500 words; received 1000" }] });
    const wrapper = mount(RunStatusPanel, { props });await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe("run.tooShortMessage");wrapper.unmount();
  });
  it("forwards failed-settings recovery without starting or retrying a run", async () => {
    api.mockResolvedValue(row("run-a", "FAILED"));
    const wrapper = mount(RunStatusPanel, { props: { ...props, canConfigure: true } });await flushPromises();
    await wrapper.get('[data-testid="configure-failed-run"]').trigger('click');
    expect(wrapper.emitted("configure")).toEqual([["run-a"]]);
    expect(api.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true);wrapper.unmount();
  });
  it.each([true, false])("keeps raw diagnostics in collapsed support details (run error: %s)", async (hasRunError) => {
    const diagnostic = 'step "plan" output violated its contract: $.cast missing';
    api.mockResolvedValue({ ...row("run-a", "FAILED"), errorMessage: hasRunError ? diagnostic : null,
      steps: [{ stepKey: "plan", kind: "AGENT", sequence: 1, status: "FAILED", latencyMs: 1, errorMessage: diagnostic }] });
    const wrapper = mount(RunStatusPanel, { props });
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe("run.failedMessage");
    expect(wrapper.get("details").attributes("open")).toBeUndefined();
    expect(wrapper.get("summary").text()).toBe("run.technicalDetails");
    expect(wrapper.get("details").text()).toContain(diagnostic);
    wrapper.unmount();
  });
  it.each(["run", "workspace", "clear", "unmount"])("ignores delayed detail after %s changes", async (change) => {
    const old = deferred<ReturnType<typeof row>>();
    api.mockImplementationOnce(() => old.promise).mockResolvedValue(row("run-b"));
    const wrapper = mount(RunStatusPanel, { props });
    await flushPromises();
    if (change === "unmount") wrapper.unmount();
    else {
      await wrapper.setProps(change === "run" ? { runId: "run-b" }
        : change === "workspace" ? { workspaceId: "workspace-b" } : { runId: null });
      await flushPromises();
    }
    old.resolve(row("run-a"));
    await flushPromises();
    const updates = wrapper.emitted("run-updated") ?? [];
    expect(updates.some(([run]) => (run as { id: string }).id === "run-a")).toBe(false);
    if (change === "run" || change === "workspace") expect(updates).toHaveLength(1);
    if (change !== "unmount") wrapper.unmount();
  });

  it("does not emit a cancellation from the previous selected run", async () => {
    const cancel = deferred<ReturnType<typeof row>>();
    api.mockImplementation((path: string, init?: RequestInit) => init?.method === "POST"
      ? cancel.promise : Promise.resolve(row(path.includes("run-b") ? "run-b" : "run-a", path.includes("run-b") ? "SUCCEEDED" : "RUNNING")));
    const wrapper = mount(RunStatusPanel, { props });
    await flushPromises();
    await wrapper.find("button").trigger("click");
    await wrapper.setProps({ runId: "run-b" });
    await flushPromises();
    cancel.resolve(row("run-a", "CANCELLED"));
    await flushPromises();
    expect(wrapper.emitted("cancelled")).toBeUndefined();
    expect((wrapper.emitted("run-updated") ?? []).at(-1)).toEqual([row("run-b", "SUCCEEDED")]);
    wrapper.unmount();
  });

  it("loads and cancels the current run normally", async () => {
    api.mockImplementation((_path: string, init?: RequestInit) => Promise.resolve(row("run-a", init?.method === "POST" ? "CANCELLED" : "RUNNING")));
    const wrapper = mount(RunStatusPanel, { props });
    await flushPromises();
    await wrapper.find("button").trigger("click");
    await flushPromises();
    expect(wrapper.emitted("cancelled")).toEqual([[row("run-a", "CANCELLED")]]);
    wrapper.unmount();
  });

  it("keeps a new cancellation busy when an older selection's cancellation finishes", async () => {
    const old = deferred<ReturnType<typeof row>>();
    const current = deferred<ReturnType<typeof row>>();
    api.mockImplementation((path: string, init?: RequestInit) => init?.method === "POST"
      ? (path.includes("run-b") ? current.promise : old.promise)
      : Promise.resolve(row(path.includes("run-b") ? "run-b" : "run-a", "RUNNING")));
    const wrapper = mount(RunStatusPanel, { props });
    await flushPromises();
    await wrapper.find("button").trigger("click");
    await wrapper.setProps({ runId: "run-b" });
    await flushPromises();
    expect(wrapper.find("button").attributes("disabled")).toBeUndefined();
    await wrapper.find("button").trigger("click");
    old.resolve(row("run-a", "CANCELLED"));
    await flushPromises();
    expect(wrapper.find("button").attributes("disabled")).toBeDefined();
    expect(wrapper.emitted("cancelled")).toBeUndefined();
    current.resolve(row("run-b", "CANCELLED"));
    await flushPromises();
    expect(wrapper.emitted("cancelled")).toEqual([[row("run-b", "CANCELLED")]]);
    wrapper.unmount();
  });
});
