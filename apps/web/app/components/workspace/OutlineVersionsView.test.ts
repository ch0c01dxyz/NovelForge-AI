/**
 * OutlineVersionsView tests (NF-WF-016): version create/approve/supersede
 * over the frozen .../planning/outline-versions routes.
 *
 * Pins contract Q5: the approval decision is rendered VISUALLY SEPARATED
 * from outline-node editing (there is no node editing in this view at
 * all — nodes live in their own tab) and labelled as a canon:approve
 * decision. The approve call omits expectedHeadRevisionId entirely
 * (tri-state); a 409 from a concurrent approval surfaces on the row.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import OutlineVersionsView from "./OutlineVersionsView.vue";

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
const BASE = "/workspaces/ws-1/novels/novel-1/planning/outline-versions";

beforeEach(() => {
  apiMock.mockReset();
});

describe("OutlineVersionsView", () => {
  it("renders the approval decision region, separated and labelled", async () => {
    apiMock.mockResolvedValue([{ id: "v1", status: "DRAFT", note: "First draft" }]);
    const w = mount(OutlineVersionsView, { props });
    await flushPromises();
    const region = w.find("[data-testid='approval-decision']");
    expect(region.exists()).toBe(true);
    expect(region.text()).toContain("workspace.planning.versions.approval.heading");
    expect(region.text()).toContain("workspace.planning.versions.approval.body");
    // No outline-node editing lives in the versions view.
    expect(w.html()).not.toContain("data-testid=\"nodes-form\"");
    w.unmount();
  });

  it("refuses non-object JSON content without calling the API", async () => {
    apiMock.mockResolvedValue([]);
    const w = mount(OutlineVersionsView, { props });
    await flushPromises();
    await w.find("[data-testid='versions-new']").trigger("click");
    await w.find("[data-testid='versions-form'] textarea").setValue('"just a string"');
    await w.find("[data-testid='versions-form']").trigger("submit");
    await flushPromises();
    expect(w.text()).toContain("workspace.planning.versions.form.contentInvalid");
    expect(apiMock).toHaveBeenCalledTimes(1);
    w.unmount();
  });

  it("creates a version with a parsed JSON object payload", async () => {
    apiMock.mockResolvedValue([]);
    const w = mount(OutlineVersionsView, { props });
    await flushPromises();
    await w.find("[data-testid='versions-new']").trigger("click");
    await w.find("[data-testid='versions-form'] textarea").setValue('{"notes": "draft one"}');
    await w.find("[data-testid='versions-form']").trigger("submit");
    await flushPromises();
    const [, init] = apiMock.mock.calls[1]!;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      content: { notes: "draft one" },
      note: null,
    });
    w.unmount();
  });

  it("approves with a bodiless POST (expectedHeadRevisionId omitted entirely)", async () => {
    apiMock.mockResolvedValueOnce([{ id: "v1", status: "DRAFT" }]);
    apiMock.mockResolvedValueOnce({ id: "v1", status: "APPROVED" });
    const w = mount(OutlineVersionsView, { props });
    await flushPromises();
    await w.find("[data-testid='version-approve']").trigger("click");
    await flushPromises();
    expect(w.text()).toContain("workspace.planning.versions.approval.approveConfirmTitle");
    expect(apiMock).toHaveBeenCalledTimes(1); // nothing before confirmation
    await w.find("[data-testid='confirm-ok']").trigger("click");
    await flushPromises();
    const [path, init] = apiMock.mock.calls[1]!;
    expect(path).toBe(`${BASE}/v1/approve`);
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined(); // tri-state: field omitted entirely
    w.unmount();
  });

  it("surfaces a 409 concurrent-approval conflict on the version row", async () => {
    apiMock.mockResolvedValueOnce([{ id: "v1", status: "DRAFT" }]);
    apiMock.mockRejectedValueOnce(await apiError("CONCURRENT_APPROVAL", 409));
    const w = mount(OutlineVersionsView, { props });
    await flushPromises();
    await w.find("[data-testid='version-approve']").trigger("click");
    await flushPromises();
    await w.find("[data-testid='confirm-ok']").trigger("click");
    await flushPromises();
    const row = w.find("[data-testid='version-item']");
    expect(row.text()).toContain("workspace.planning.versions.approval.conflict");
    w.unmount();
  });

  it("supersedes only after explicit confirmation", async () => {
    apiMock.mockResolvedValueOnce([{ id: "v1", status: "APPROVED" }]);
    apiMock.mockResolvedValue([]); // POST supersede (204-style) + list reload
    const w = mount(OutlineVersionsView, { props });
    await flushPromises();
    await w.find("[data-testid='version-supersede']").trigger("click");
    await flushPromises();
    expect(w.text()).toContain("workspace.planning.versions.approval.supersedeConfirmTitle");
    expect(apiMock).toHaveBeenCalledTimes(1);
    await w.find("[data-testid='confirm-ok']").trigger("click");
    await flushPromises();
    expect(apiMock).toHaveBeenCalledWith(`${BASE}/supersede`, { method: "POST" });
    w.unmount();
  });
});
