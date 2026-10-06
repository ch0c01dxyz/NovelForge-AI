/**
 * OutlineNodesView tests (NF-WF-016): node create/delete over the frozen
 * .../planning/outline-nodes routes. Pins the GAP-055 interplay: a 409
 * from deleting a scene-referenced node surfaces honestly.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import OutlineNodesView from "./OutlineNodesView.vue";

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
const BASE = "/workspaces/ws-1/novels/novel-1/planning/outline-nodes";
const SAGAS = "/workspaces/ws-1/novels/novel-1/planning/sagas";

beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockImplementation((path: string) => {
    if (path.startsWith(SAGAS)) return Promise.resolve([{ id: "g1", title: "First Saga" }]);
    return Promise.resolve([]);
  });
});

describe("OutlineNodesView", () => {
  it("fetches the saga list for the saga select and filter", async () => {
    const w = mount(OutlineNodesView, { props });
    await flushPromises();
    expect(apiMock).toHaveBeenCalledWith(SAGAS);
    expect(w.find("[data-testid='nodes-saga-filter']").text()).toContain("First Saga");
    w.unmount();
  });

  it("filters nodes by saga", async () => {
    const w = mount(OutlineNodesView, { props });
    await flushPromises();
    await w.find("[data-testid='nodes-saga-filter']").setValue("g1");
    await flushPromises();
    expect(apiMock).toHaveBeenCalledWith(`${BASE}?sagaId=g1`);
    w.unmount();
  });

  it("creates a node with the exact POST payload", async () => {
    const w = mount(OutlineNodesView, { props });
    await flushPromises();
    await w.find("[data-testid='nodes-new']").trigger("click");
    const selects = w.findAll("[data-testid='nodes-form'] select");
    await selects[0]!.setValue("g1");
    await selects[1]!.setValue("CHAPTER");
    const inputs = w.findAll("[data-testid='nodes-form'] input[type='text']");
    await inputs[0]!.setValue("Chapter 3");
    await inputs[1]!.setValue("3");
    await w.find("[data-testid='nodes-form']").trigger("submit");
    await flushPromises();
    const postCall = apiMock.mock.calls.find((c) => c[1]?.method === "POST")!;
    expect(postCall[0]).toBe(BASE);
    expect(JSON.parse(postCall[1].body)).toEqual({
      sagaId: "g1",
      kind: "CHAPTER",
      title: "Chapter 3",
      summary: null,
      order: 3,
      chapterId: null,
      sceneId: null,
    });
    w.unmount();
  });

  it("rejects an invalid order without calling the API", async () => {
    const w = mount(OutlineNodesView, { props });
    await flushPromises();
    await w.find("[data-testid='nodes-new']").trigger("click");
    const selects = w.findAll("[data-testid='nodes-form'] select");
    await selects[0]!.setValue("g1");
    const inputs = w.findAll("[data-testid='nodes-form'] input[type='text']");
    await inputs[0]!.setValue("Chapter 3");
    await inputs[1]!.setValue("-1");
    await w.find("[data-testid='nodes-form']").trigger("submit");
    await flushPromises();
    expect(w.text()).toContain("workspace.planning.nodes.form.orderInvalid");
    expect(apiMock.mock.calls.some((c) => c[1]?.method === "POST")).toBe(false);
    w.unmount();
  });

  it("surfaces a 409 on delete (GAP-055: scene-referenced node) honestly", async () => {
    apiMock.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.startsWith(SAGAS)) return Promise.resolve([{ id: "g1", title: "First Saga" }]);
      if (init?.method === "DELETE") return Promise.reject(await apiError("CONFLICT", 409));
      return Promise.resolve([{ id: "n1", kind: "CHAPTER", title: "Chapter 3", order: 3 }]);
    });
    const w = mount(OutlineNodesView, { props });
    await flushPromises();
    await w.find("[data-testid='node-delete']").trigger("click");
    await flushPromises();
    expect(w.text()).toContain("workspace.planning.nodes.deleteConfirmBody");
    await w.find("[data-testid='confirm-ok']").trigger("click");
    await flushPromises();
    expect(w.text()).toContain("workspace.planning.common.errorConflict");
    w.unmount();
  });
});
