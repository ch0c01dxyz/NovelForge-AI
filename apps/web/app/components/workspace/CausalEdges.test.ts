/**
 * CausalEdges tests (NF-WF-016): causal-edge list + creation over the
 * frozen .../story/causal-edges routes. Pins the 403 surfacing: edge
 * creation may escalate to canon:approve server-side and the UI reports
 * the refusal honestly.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import CausalEdges from "./CausalEdges.vue";

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
const BASE = "/workspaces/ws-1/novels/novel-1/story/causal-edges";

beforeEach(() => {
  apiMock.mockReset();
});

describe("CausalEdges", () => {
  it("renders edges with cause → effect and confidence", async () => {
    apiMock.mockResolvedValue([
      { id: "c1", causeEventId: "e1", effectEventId: "e2", confidence: "INFERRED" },
    ]);
    const w = mount(CausalEdges, { props });
    await flushPromises();
    expect(w.findAll("[data-testid='edge-item']")).toHaveLength(1);
    expect(w.text()).toContain("e1");
    expect(w.text()).toContain("e2");
    expect(w.text()).toContain("workspace.timeline.edges.confidence.INFERRED");
    w.unmount();
  });

  it("creates an edge with the exact POST payload", async () => {
    apiMock.mockResolvedValue([]);
    const w = mount(CausalEdges, { props });
    await flushPromises();
    await w.find("[data-testid='edges-new']").trigger("click");
    const inputs = w.findAll("[data-testid='edges-form'] input[type='text']");
    await inputs[0]!.setValue("e1");
    await inputs[1]!.setValue("e2");
    await w.find("[data-testid='edges-form'] select").setValue("SPECULATIVE");
    await w.find("[data-testid='edges-form']").trigger("submit");
    await flushPromises();
    const [path, init] = apiMock.mock.calls[1]!;
    expect(path).toBe(BASE);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      causeEventId: "e1",
      effectEventId: "e2",
      confidence: "SPECULATIVE",
    });
    w.unmount();
  });

  it("surfaces a 403 (canon:approve escalation) honestly", async () => {
    apiMock.mockResolvedValueOnce([]).mockRejectedValueOnce(await apiError("FORBIDDEN", 403));
    const w = mount(CausalEdges, { props });
    await flushPromises();
    await w.find("[data-testid='edges-new']").trigger("click");
    const inputs = w.findAll("[data-testid='edges-form'] input[type='text']");
    await inputs[0]!.setValue("e1");
    await inputs[1]!.setValue("e2");
    await w.find("[data-testid='edges-form']").trigger("submit");
    await flushPromises();
    expect(w.text()).toContain("workspace.timeline.common.errorForbidden");
    w.unmount();
  });
});
