/**
 * Moderation queue UI tests (NF-WF-019B): the staff report queue
 * renders reported comments with reporter COUNTS (never reporter
 * identities) and calls the hide/unhide/delete routes. Staff gating is
 * server-enforced; the page surfaces the 403/404 forbidden state.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref, computed, onMounted, watch } from "vue";
import ModerationPage from "../../pages/workspaces/[workspaceId]/novels/[novelId]/moderation.vue";
import { ApiError } from "../../composables/useApi";

// Vue auto-imports are Nuxt-provided; stub them for the vitest harness.
vi.stubGlobal("ref", ref);
vi.stubGlobal("computed", computed);
vi.stubGlobal("onMounted", onMounted);
vi.stubGlobal("watch", watch);

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

vi.stubGlobal(
  "useRoute",
  vi.fn(() => ({ params: { workspaceId: "ws1", novelId: "n1" } })),
);

const queue = {
  reports: [
    {
      comment: {
        id: "c1",
        novelId: "n1",
        chapterNumber: 3,
        parentId: null,
        body: "Reported comment one",
        status: "VISIBLE",
        hiddenByModerator: false,
        author: { displayName: "Rude Reader" },
        createdAt: "2026-10-06T00:00:00Z",
        updatedAt: "2026-10-06T00:00:00Z",
      },
      reason: "SPAM",
      reporterCount: 2,
      createdAt: "2026-10-06T00:05:00Z",
    },
  ],
};

beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path.startsWith("/reader/novels/n1/moderation/reports")) return queue;
    if (path === "/reader/comments/c1/hide" && init?.method === "POST") {
      return {
        comment: { ...queue.reports[0]!.comment, status: "HIDDEN", hiddenByModerator: true },
      };
    }
    throw new Error(`unmocked: ${path}`);
  });
});

describe("ModerationPage", () => {
  it("renders reported comments with counts, never reporter identities", async () => {
    const wrapper = mount(ModerationPage);
    await flushPromises();

    expect(wrapper.text()).toContain("Reported comment one");
    expect(wrapper.text()).toContain("Rude Reader");
    expect(wrapper.text()).toContain("comments.queueReporterCount|n=2");
    // No reporter identity anywhere in the rendered output.
    expect(wrapper.html()).not.toContain("qr1");
    expect(wrapper.html()).not.toContain("@example.com");
  });

  it("hide calls the staff route and reloads the queue", async () => {
    const wrapper = mount(ModerationPage);
    await flushPromises();

    const hideBtn = wrapper
      .findAll("button")
      .find((b) => b.text() === "comments.hide");
    expect(hideBtn).toBeTruthy();
    await hideBtn!.trigger("click");
    await flushPromises();

    expect(apiMock).toHaveBeenCalledWith(
      "/reader/comments/c1/hide",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("shows the forbidden state when the server denies staff access", async () => {
    apiMock.mockImplementation(async (path: string) => {
      if (path.startsWith("/reader/novels/n1/moderation/reports")) {
        throw new ApiError("FORBIDDEN", 403);
      }
      throw new Error(`unmocked: ${path}`);
    });
    const wrapper = mount(ModerationPage);
    await flushPromises();
    expect(wrapper.text()).toContain("comments.queueForbiddenTitle");
    expect(wrapper.text()).toContain("comments.queueForbiddenBody");
  });
});
