/**
 * StoryEvents tests (NF-WF-016): event list + creation over the frozen
 * .../story/events routes. Covers the create payload shape, client-side
 * validation, 409 surfacing, and the load-error retry path.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import StoryEvents from "./StoryEvents.vue";

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
const EVENTS = "/workspaces/ws-1/novels/novel-1/story/events";

beforeEach(() => {
  apiMock.mockReset();
});

describe("StoryEvents", () => {
  it("shows the empty state when no events exist", async () => {
    apiMock.mockResolvedValue([]);
    const w = mount(StoryEvents, { props });
    await flushPromises();
    expect(apiMock).toHaveBeenCalledWith(EVENTS);
    expect(w.text()).toContain("workspace.timeline.events.empty");
    w.unmount();
  });

  it("renders events and marks reader-hidden ones honestly", async () => {
    apiMock.mockResolvedValue([
      { id: "e1", description: "The gate falls.", availableFromChapter: 3 },
      { id: "e2", description: "A secret oath.", availableFromChapter: null },
    ]);
    const w = mount(StoryEvents, { props });
    await flushPromises();
    expect(w.findAll("[data-testid='event-item']")).toHaveLength(2);
    expect(w.text()).toContain("The gate falls.");
    expect(w.text()).toContain("workspace.timeline.events.availableFrom|chapter=3");
    expect(w.text()).toContain("workspace.timeline.events.hiddenFromReaders");
    w.unmount();
  });

  it("creates an event with the exact POST payload (nulls, not zeros)", async () => {
    apiMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const w = mount(StoryEvents, { props });
    await flushPromises();
    await w.find("[data-testid='events-new']").trigger("click");
    await w.find("textarea").setValue("The gate falls.");
    await w.find("[data-testid='events-form']").trigger("submit");
    await flushPromises();
    const [, init] = apiMock.mock.calls[1]!;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      description: "The gate falls.",
      chapterId: null,
      availableFromChapter: null,
    });
    w.unmount();
  });

  it("sends a 0-based chapter number when provided", async () => {
    apiMock.mockResolvedValue([]);
    const w = mount(StoryEvents, { props });
    await flushPromises();
    await w.find("[data-testid='events-new']").trigger("click");
    await w.find("textarea").setValue("A battle.");
    await w.find("input[inputmode='numeric']").setValue("0");
    await w.find("[data-testid='events-form']").trigger("submit");
    await flushPromises();
    const [, init] = apiMock.mock.calls[1]!;
    expect(JSON.parse(init.body).availableFromChapter).toBe(0);
    w.unmount();
  });

  it("refuses an empty description without calling the API", async () => {
    apiMock.mockResolvedValue([]);
    const w = mount(StoryEvents, { props });
    await flushPromises();
    await w.find("[data-testid='events-new']").trigger("click");
    await w.find("[data-testid='events-form']").trigger("submit");
    await flushPromises();
    expect(w.text()).toContain("workspace.timeline.common.fieldRequired");
    expect(apiMock).toHaveBeenCalledTimes(1); // only the initial GET
    w.unmount();
  });

  it("refuses an out-of-range chapter number without calling the API", async () => {
    apiMock.mockResolvedValue([]);
    const w = mount(StoryEvents, { props });
    await flushPromises();
    await w.find("[data-testid='events-new']").trigger("click");
    await w.find("textarea").setValue("A battle.");
    await w.find("input[inputmode='numeric']").setValue("100001");
    await w.find("[data-testid='events-form']").trigger("submit");
    await flushPromises();
    expect(w.text()).toContain("workspace.timeline.events.form.chapterInvalid");
    expect(apiMock).toHaveBeenCalledTimes(1);
    w.unmount();
  });

  it("surfaces a 409 from the server honestly", async () => {
    apiMock.mockResolvedValueOnce([]).mockRejectedValueOnce(await apiError("CONFLICT", 409));
    const w = mount(StoryEvents, { props });
    await flushPromises();
    await w.find("[data-testid='events-new']").trigger("click");
    await w.find("textarea").setValue("A battle.");
    await w.find("[data-testid='events-form']").trigger("submit");
    await flushPromises();
    expect(w.text()).toContain("workspace.timeline.common.errorConflict");
    w.unmount();
  });

  it("shows the load error with a retry button", async () => {
    apiMock.mockRejectedValueOnce(await apiError("FORBIDDEN", 403));
    apiMock.mockResolvedValueOnce([]);
    const w = mount(StoryEvents, { props });
    await flushPromises();
    expect(w.text()).toContain("workspace.timeline.common.errorForbidden");
    const retry = w
      .findAll("button")
      .find((b) => b.text().includes("workspace.timeline.common.retry"))!;
    await retry.trigger("click"); // retry
    await flushPromises();
    expect(apiMock).toHaveBeenCalledTimes(2);
    w.unmount();
  });
});
