/**
 * SagasView tests (NF-WF-016): create/delete over the frozen
 * .../planning/sagas routes. Deletion requires explicit confirmation.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import SagasView from "./SagasView.vue";

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
const BASE = "/workspaces/ws-1/novels/novel-1/planning/sagas";

beforeEach(() => {
  apiMock.mockReset();
});

describe("SagasView", () => {
  it("creates a saga with kind, title, and optional parent/intent", async () => {
    apiMock.mockResolvedValue([]);
    const w = mount(SagasView, { props });
    await flushPromises();
    await w.find("[data-testid='sagas-new']").trigger("click");
    const selects = w.findAll("[data-testid='sagas-form'] select");
    await selects[0]!.setValue("ARC");
    await w.find("[data-testid='sagas-form'] input[type='text']").setValue("The Northern Arc");
    await w.find("[data-testid='sagas-form'] textarea").setValue("The sect war begins.");
    await w.find("[data-testid='sagas-form']").trigger("submit");
    await flushPromises();
    const [, init] = apiMock.mock.calls[1]!;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      kind: "ARC",
      title: "The Northern Arc",
      parentId: null,
      intent: "The sect war begins.",
    });
    w.unmount();
  });

  it("deletes only after explicit confirmation", async () => {
    apiMock.mockResolvedValue([{ id: "g1", kind: "SAGA", title: "First Saga" }]);
    const w = mount(SagasView, { props });
    await flushPromises();
    await w.find("[data-testid='saga-delete']").trigger("click");
    await flushPromises();
    expect(w.text()).toContain("workspace.planning.sagas.deleteConfirmTitle");
    expect(apiMock).toHaveBeenCalledTimes(1); // no request before confirm
    await w.find("[data-testid='confirm-ok']").trigger("click");
    await flushPromises();
    expect(apiMock).toHaveBeenCalledWith(`${BASE}/g1`, { method: "DELETE" });
    w.unmount();
  });

  it("offers the existing sagas as parent options", async () => {
    apiMock.mockResolvedValue([
      { id: "g1", kind: "SAGA", title: "First Saga" },
      { id: "g2", kind: "ARC", title: "Second Arc" },
    ]);
    const w = mount(SagasView, { props });
    await flushPromises();
    await w.find("[data-testid='sagas-new']").trigger("click");
    const parentSelect = w.findAll("[data-testid='sagas-form'] select")[1]!;
    expect(parentSelect.text()).toContain("First Saga");
    expect(parentSelect.text()).toContain("Second Arc");
    w.unmount();
  });
});
