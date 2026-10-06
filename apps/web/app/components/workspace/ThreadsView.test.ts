/**
 * ThreadsView tests (NF-WF-016): thread creation and status transitions
 * over the frozen .../story/threads routes. Also pins the GAP-056 rule:
 * no thread↔event linking UI is rendered — the tab states that instead.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import ThreadsView from "./ThreadsView.vue";

const apiMock = vi.fn();

async function apiError(code: string, status: number): Promise<Error> {
  // The mocked useApi module (vi.mock is hoisted, so grab its ApiError here).
  const { ApiError } = await import("../../composables/useApi");
  return new ApiError(code, status);
}

vi.mock("../../composables/useApi", () => ({
  useApi: () => ({ api: apiMock }),
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

const props = { workspaceId: "ws-1", novelId: "novel-1" };
const BASE = "/workspaces/ws-1/novels/novel-1/story/threads";

beforeEach(() => {
  apiMock.mockReset();
});

describe("ThreadsView", () => {
  it("states the GAP-056 no-linking rule instead of offering linking UI", async () => {
    apiMock.mockResolvedValue([]);
    const w = mount(ThreadsView, { props });
    await flushPromises();
    expect(w.text()).toContain("workspace.timeline.threads.noLinkingNote");
    // No event-link affordance anywhere on the tab.
    expect(w.html()).not.toContain("data-testid=\"thread-link\"");
    w.unmount();
  });

  it("creates a thread with the exact POST payload", async () => {
    apiMock.mockResolvedValue([]);
    const w = mount(ThreadsView, { props });
    await flushPromises();
    await w.find("[data-testid='threads-new']").trigger("click");
    const selects = w.findAll("[data-testid='threads-form'] select");
    await selects[0]!.setValue("QUESTION");
    await selects[1]!.setValue("5");
    await w.find("[data-testid='threads-form'] input[type='text']").setValue("Who took the seal?");
    await w.find("input[inputmode='numeric']").setValue("12");
    await w.find("[data-testid='threads-form']").trigger("submit");
    await flushPromises();
    const [, init] = apiMock.mock.calls[1]!;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      kind: "QUESTION",
      title: "Who took the seal?",
      description: null,
      importance: 5,
      introducedAtChapter: 12,
      payoffIntent: null,
    });
    w.unmount();
  });

  it("transitions a thread's status with the exact payload", async () => {
    const thread = { id: "th-1", kind: "MYSTERY", title: "The seal", status: "ACTIVE" };
    apiMock.mockResolvedValueOnce([thread]);
    apiMock.mockResolvedValueOnce({ ...thread, status: "RESOLVED", resolvedAtChapter: 30 });
    const w = mount(ThreadsView, { props });
    await flushPromises();
    const form = w.find("[data-testid='thread-status-form']");
    await form.find("select").setValue("RESOLVED");
    await form.find("input[inputmode='numeric']").setValue("30");
    await form.trigger("submit");
    await flushPromises();
    const [path, init] = apiMock.mock.calls[1]!;
    expect(path).toBe(`${BASE}/th-1/status`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ status: "RESOLVED", resolvedAtChapter: 30 });
    w.unmount();
  });

  it("surfaces a 404 on transition as a row-level error", async () => {
    const thread = { id: "th-1", kind: "MYSTERY", title: "The seal", status: "ACTIVE" };
    apiMock.mockResolvedValueOnce([thread]);
    apiMock.mockRejectedValueOnce(await apiError("NOT_FOUND", 404));
    const w = mount(ThreadsView, { props });
    await flushPromises();
    await w.find("[data-testid='thread-status-form']").trigger("submit");
    await flushPromises();
    expect(w.text()).toContain("workspace.timeline.common.errorNotFound");
    w.unmount();
  });
});
