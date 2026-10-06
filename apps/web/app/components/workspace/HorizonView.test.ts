/**
 * HorizonView tests (NF-WF-016): horizon read/update over the frozen
 * .../planning/horizon routes. Invalid JSON never reaches the server.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import HorizonView from "./HorizonView.vue";

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
const BASE = "/workspaces/ws-1/novels/novel-1/planning/horizon";

beforeEach(() => {
  apiMock.mockReset();
});

describe("HorizonView", () => {
  it("shows the empty state when no horizon policy exists", async () => {
    apiMock.mockResolvedValue(null);
    const w = mount(HorizonView, { props });
    await flushPromises();
    expect(apiMock).toHaveBeenCalledWith(BASE);
    expect(w.text()).toContain("workspace.planning.horizon.none");
    w.unmount();
  });

  it("displays the current policy as formatted JSON", async () => {
    apiMock.mockResolvedValue({ detailDepth: "shallow", chapters: 5 });
    const w = mount(HorizonView, { props });
    await flushPromises();
    expect(w.find("[data-testid='horizon-current']").text()).toContain('"detailDepth"');
    w.unmount();
  });

  it("saves a parsed policy object with PUT", async () => {
    apiMock.mockResolvedValueOnce(null);
    apiMock.mockResolvedValueOnce({ chapters: 5 });
    const w = mount(HorizonView, { props });
    await flushPromises();
    await w.find("[data-testid='horizon-form'] textarea").setValue('{"chapters": 5}');
    await w.find("[data-testid='horizon-form']").trigger("submit");
    await flushPromises();
    const [path, init] = apiMock.mock.calls[1]!;
    expect(path).toBe(BASE);
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ policy: { chapters: 5 } });
    expect(w.text()).toContain("workspace.planning.horizon.saved");
    w.unmount();
  });

  it("refuses invalid JSON without calling the API", async () => {
    apiMock.mockResolvedValue(null);
    const w = mount(HorizonView, { props });
    await flushPromises();
    await w.find("[data-testid='horizon-form'] textarea").setValue("{not json");
    await w.find("[data-testid='horizon-form']").trigger("submit");
    await flushPromises();
    expect(w.text()).toContain("workspace.planning.horizon.form.policyInvalid");
    expect(apiMock).toHaveBeenCalledTimes(1);
    w.unmount();
  });
});
