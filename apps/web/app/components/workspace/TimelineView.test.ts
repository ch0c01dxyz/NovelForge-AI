/**
 * TimelineView tests (NF-WF-016): timeline-entry list + creation over the
 * frozen .../story/timeline routes.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import TimelineView from "./TimelineView.vue";

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
const BASE = "/workspaces/ws-1/novels/novel-1/story/timeline";

beforeEach(() => {
  apiMock.mockReset();
});

describe("TimelineView", () => {
  it("loads entries from the timeline route", async () => {
    apiMock.mockResolvedValue([{ id: "t1", description: "Year one.", availableFromChapter: 0 }]);
    const w = mount(TimelineView, { props });
    await flushPromises();
    expect(apiMock).toHaveBeenCalledWith(BASE);
    expect(w.findAll("[data-testid='timeline-entry-item']")).toHaveLength(1);
    expect(w.text()).toContain("Year one.");
    // 0 is an explicit chapter — not treated as "hidden".
    expect(w.text()).toContain("workspace.timeline.timelineEntries.availableFrom|chapter=0");
    w.unmount();
  });

  it("creates an entry with description + availableFromChapter", async () => {
    apiMock.mockResolvedValue([]);
    const w = mount(TimelineView, { props });
    await flushPromises();
    await w.find("[data-testid='timeline-new']").trigger("click");
    await w.find("textarea").setValue("Year two.");
    await w.find("input[inputmode='numeric']").setValue("5");
    await w.find("[data-testid='timeline-form']").trigger("submit");
    await flushPromises();
    const [, init] = apiMock.mock.calls[1]!;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      description: "Year two.",
      availableFromChapter: 5,
    });
    w.unmount();
  });

  it("surfaces a 404 from the server honestly", async () => {
    apiMock.mockRejectedValueOnce(await apiError("NOT_FOUND", 404));
    const w = mount(TimelineView, { props });
    await flushPromises();
    expect(w.text()).toContain("workspace.timeline.common.errorNotFound");
    w.unmount();
  });
});
