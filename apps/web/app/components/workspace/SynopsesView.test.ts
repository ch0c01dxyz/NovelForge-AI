/**
 * SynopsesView tests (NF-WF-016): create/archive/delete over the frozen
 * .../planning/synopses routes. Archive and delete both require explicit
 * confirmation; cancelling performs no request.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import SynopsesView from "./SynopsesView.vue";

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
const BASE = "/workspaces/ws-1/novels/novel-1/planning/synopses";

beforeEach(() => {
  apiMock.mockReset();
});

describe("SynopsesView", () => {
  it("creates a synopsis with the exact POST payload", async () => {
    apiMock.mockResolvedValue([]);
    const w = mount(SynopsesView, { props });
    await flushPromises();
    await w.find("[data-testid='synopses-new']").trigger("click");
    await w.find("textarea").setValue("A tale of two sects.");
    await w.find("[data-testid='synopses-form']").trigger("submit");
    await flushPromises();
    const [, init] = apiMock.mock.calls[1]!;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ content: "A tale of two sects." });
    w.unmount();
  });

  it("archives only after explicit confirmation", async () => {
    apiMock.mockResolvedValue([{ id: "s1", content: "Old tale.", archived: false }]);
    const w = mount(SynopsesView, { props, attachTo: document.body });
    await flushPromises();
    await w.find("[data-testid='synopsis-archive']").trigger("click");
    await flushPromises();
    expect(document.body.textContent).toContain(
      "workspace.planning.synopses.archiveConfirmTitle",
    );
    expect(apiMock).toHaveBeenCalledTimes(1); // no request before confirm
    await w.find("[data-testid='confirm-ok']").trigger("click");
    await flushPromises();
    expect(apiMock).toHaveBeenCalledWith(`${BASE}/s1/archive`, { method: "POST" });
    w.unmount();
  });

  it("cancelling the delete confirmation performs no request", async () => {
    apiMock.mockResolvedValue([{ id: "s1", content: "Old tale.", archived: false }]);
    const w = mount(SynopsesView, { props, attachTo: document.body });
    await flushPromises();
    await w.find("[data-testid='synopsis-delete']").trigger("click");
    await flushPromises();
    await w.find("[data-testid='confirm-cancel']").trigger("click");
    await flushPromises();
    expect(apiMock).toHaveBeenCalledTimes(1);
    w.unmount();
  });

  it("deletes after explicit confirmation with a 204-style empty body", async () => {
    apiMock.mockResolvedValue([{ id: "s1", content: "Old tale.", archived: false }]);
    const w = mount(SynopsesView, { props, attachTo: document.body });
    await flushPromises();
    await w.find("[data-testid='synopsis-delete']").trigger("click");
    await flushPromises();
    await w.find("[data-testid='confirm-ok']").trigger("click");
    await flushPromises();
    expect(apiMock).toHaveBeenCalledWith(`${BASE}/s1`, { method: "DELETE" });
    w.unmount();
  });

  it("passes includeArchived=true when the filter is checked", async () => {
    apiMock.mockResolvedValue([]);
    const w = mount(SynopsesView, { props });
    await flushPromises();
    await w.find("[data-testid='synopses-include-archived']").setValue(true);
    await flushPromises();
    expect(apiMock.mock.calls[1]![0]).toBe(`${BASE}?includeArchived=true`);
    w.unmount();
  });
});
