/**
 * PromisesView tests (NF-WF-016): promise creation and lifecycle
 * transitions over the frozen .../story/promises routes.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import PromisesView from "./PromisesView.vue";

const apiMock = vi.fn();


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
const BASE = "/workspaces/ws-1/novels/novel-1/story/promises";

beforeEach(() => {
  apiMock.mockReset();
});

describe("PromisesView", () => {
  it("creates a promise with the exact POST payload", async () => {
    apiMock.mockResolvedValue([]);
    const w = mount(PromisesView, { props });
    await flushPromises();
    await w.find("[data-testid='promises-new']").trigger("click");
    await w.find("[data-testid='promises-form'] input[type='text']").setValue("The sword returns");
    await w.find("input[inputmode='numeric']").setValue("2");
    await w.find("[data-testid='promises-form']").trigger("submit");
    await flushPromises();
    const [, init] = apiMock.mock.calls[1]!;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      title: "The sword returns",
      description: null,
      importance: 3,
      introducedAtChapter: 2,
      payoffIntent: null,
    });
    w.unmount();
  });

  it("records a transition to PAID_OFF with payoffAtChapter", async () => {
    const promise = { id: "p-1", title: "The sword returns", status: "SETUP" };
    apiMock.mockResolvedValueOnce([promise]);
    apiMock.mockResolvedValueOnce({ ...promise, status: "PAID_OFF" });
    const w = mount(PromisesView, { props });
    await flushPromises();
    const form = w.find("[data-testid='promise-transition-form']");
    await form.find("select").setValue("PAID_OFF");
    await form.find("input[inputmode='numeric']").setValue("40");
    await form.trigger("submit");
    await flushPromises();
    const [path, init] = apiMock.mock.calls[1]!;
    expect(path).toBe(`${BASE}/p-1/transition`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ to: "PAID_OFF", payoffAtChapter: 40 });
    w.unmount();
  });

  it("rejects an invalid transition chapter without calling the API", async () => {
    const promise = { id: "p-1", title: "The sword returns", status: "SETUP" };
    apiMock.mockResolvedValue([promise]);
    const w = mount(PromisesView, { props });
    await flushPromises();
    const form = w.find("[data-testid='promise-transition-form']");
    await form.find("input[inputmode='numeric']").setValue("abc");
    await form.trigger("submit");
    await flushPromises();
    expect(w.text()).toContain("workspace.timeline.promises.form.chapterInvalid");
    expect(apiMock).toHaveBeenCalledTimes(1);
    w.unmount();
  });
});
