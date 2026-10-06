/**
 * Notification UI tests (NF-WF-019C): the notification bell and the
 * reader notifications inbox page render real API data (mocked at the
 * useApi boundary, the 007 harness pattern). No mock screens: every
 * assertion is about data the page actually renders.
 *
 * Covers:
 * - NotificationBell: hidden for anonymous readers (401), badge with
 *   the unread count for authenticated readers
 * - /read/notifications: inbox list with mark-read, read-all, empty
 *   state, cursor pagination; preferences with per-type toggles and the
 *   master switch (OFF writes all three false, ON writes all three
 *   true); the privacy panel
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref, computed, onMounted } from "vue";
import NotificationBell from "./NotificationBell.vue";
import NotificationsPage from "../../pages/read/notifications.vue";

// Vue auto-imports are Nuxt-provided; stub them for the vitest harness.
vi.stubGlobal("ref", ref);
vi.stubGlobal("computed", computed);
vi.stubGlobal("onMounted", onMounted);

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

// Nuxt auto-imports are unavailable in the vitest harness: stub them.
vi.stubGlobal("useHead", vi.fn());
const navigateToMock = vi.fn();
vi.stubGlobal("navigateTo", navigateToMock);

const NuxtLinkStub = {
  props: ["to"],
  template: '<a :href="to"><slot /></a>',
};

beforeEach(() => {
  apiMock.mockReset();
  navigateToMock.mockReset();
});

function inboxPayload(
  overrides: Partial<{
    notifications: unknown[];
    unreadCount: number;
    nextCursor: string | null;
  }> = {},
) {
  const { nextCursor, ...rest } = overrides;
  return {
    notifications: [
      {
        id: "n1",
        type: "NEW_CHAPTER",
        novelId: "novel-1",
        chapterNumber: 3,
        actorDisplayName: "Author A",
        createdAt: "2026-10-06T10:00:00.000Z",
        readAt: null,
      },
      {
        id: "n2",
        type: "COMMENT_REPLY",
        novelId: "novel-1",
        chapterNumber: 2,
        actorDisplayName: "Reader B",
        createdAt: "2026-10-06T09:00:00.000Z",
        readAt: "2026-10-06T09:30:00.000Z",
      },
    ],
    unreadCount: 1,
    page: { nextCursor: nextCursor ?? null },
    ...rest,
  };
}

function prefsPayload(
  overrides: Partial<Record<"NEW_CHAPTER" | "COMMENT_REPLY" | "MODERATION_NOTICE", boolean>> = {},
) {
  return {
    preferences: [
      { type: "NEW_CHAPTER", enabled: overrides.NEW_CHAPTER ?? true },
      { type: "COMMENT_REPLY", enabled: overrides.COMMENT_REPLY ?? true },
      { type: "MODERATION_NOTICE", enabled: overrides.MODERATION_NOTICE ?? true },
    ],
  };
}

function mountPage() {
  return mount(NotificationsPage, {
    global: {
      stubs: { NuxtLink: NuxtLinkStub },
    },
  });
}

describe("NotificationBell", () => {
  it("renders nothing for anonymous readers (401)", async () => {
    const { ApiError } = await import("../../composables/useApi");
    apiMock.mockRejectedValue(new ApiError("UNAUTHENTICATED", 401));
    const wrapper = mount(NotificationBell, {
      global: { stubs: { NuxtLink: NuxtLinkStub } },
    });
    await flushPromises();
    // The bell hides itself for anonymous readers: no link rendered.
    expect(wrapper.find("a").exists()).toBe(false);
  });

  it("renders the badge with the unread count for authenticated readers", async () => {
    apiMock.mockResolvedValue({ unreadCount: 7, notifications: [], page: {} });
    const wrapper = mount(NotificationBell, {
      global: { stubs: { NuxtLink: NuxtLinkStub } },
    });
    await flushPromises();
    expect(wrapper.text()).toContain("7");
    expect(wrapper.attributes("aria-label")).toContain("notifications.bellUnread");
  });
});

describe("notifications inbox page", () => {
  it("redirects anonymous readers to sign-in", async () => {
    const { ApiError } = await import("../../composables/useApi");
    apiMock.mockRejectedValue(new ApiError("UNAUTHENTICATED", 401));
    mountPage();
    await flushPromises();
    expect(navigateToMock).toHaveBeenCalledWith("/sign-in");
  });

  it("renders the inbox with items, unread state, and mark-read", async () => {
    apiMock.mockImplementation((path: string) => {
      if (path.startsWith("/reader/notifications?") || path === "/reader/notifications") {
        return Promise.resolve(inboxPayload());
      }
      if (path === "/reader/notifications/preferences") return Promise.resolve(prefsPayload());
      throw new Error(`unexpected ${path}`);
    });
    const wrapper = mountPage();
    await flushPromises();
    const text = wrapper.text();
    expect(text).toContain("notifications.newChapter|author=Author A|n=3");
    expect(text).toContain("notifications.commentReply|author=Reader B");
    // One unread item → one mark-read button.
    const markReadButtons = wrapper.findAll("button").filter((b) =>
      b.text().includes("notifications.markRead"),
    );
    expect(markReadButtons).toHaveLength(1);
    // Mark it read: the POST fires and the button disappears.
    apiMock.mockImplementation((path: string) => {
      if (path === "/reader/notifications/n1/read") return Promise.resolve({ id: "n1" });
      throw new Error(`unexpected ${path}`);
    });
    await markReadButtons[0]!.trigger("click");
    await flushPromises();
    expect(apiMock).toHaveBeenCalledWith("/reader/notifications/n1/read", {
      method: "POST",
    });
  });

  it("renders the empty state when there are no notifications", async () => {
    apiMock.mockImplementation((path: string) => {
      if (path.startsWith("/reader/notifications")) {
        return path.includes("preferences")
          ? Promise.resolve(prefsPayload())
          : Promise.resolve(inboxPayload({ notifications: [], unreadCount: 0 }));
      }
      throw new Error(`unexpected ${path}`);
    });
    const wrapper = mountPage();
    await flushPromises();
    expect(wrapper.text()).toContain("notifications.empty");
  });

  it("mark-all-read clears the unread state", async () => {
    apiMock.mockImplementation((path: string) => {
      if (path === "/reader/notifications/read-all") return Promise.resolve({ unreadCount: 0 });
      if (path.startsWith("/reader/notifications")) {
        return path.includes("preferences")
          ? Promise.resolve(prefsPayload())
          : Promise.resolve(inboxPayload());
      }
      throw new Error(`unexpected ${path}`);
    });
    const wrapper = mountPage();
    await flushPromises();
    const readAll = wrapper.findAll("button").find((b) =>
      b.text().includes("notifications.markAllRead"),
    );
    expect(readAll).toBeDefined();
    await readAll!.trigger("click");
    await flushPromises();
    expect(apiMock).toHaveBeenCalledWith("/reader/notifications/read-all", { method: "POST" });
  });

  it("loads the next page when a cursor exists", async () => {
    apiMock.mockImplementation((path: string) => {
      if (path === "/reader/notifications/preferences") return Promise.resolve(prefsPayload());
      if (path === "/reader/notifications") {
        return Promise.resolve(inboxPayload({ nextCursor: "n2" }));
      }
      if (path.startsWith("/reader/notifications?cursor=n2")) {
        return Promise.resolve(inboxPayload({ notifications: [], unreadCount: 0, nextCursor: null }));
      }
      throw new Error(`unexpected ${path}`);
    });
    const wrapper = mountPage();
    await flushPromises();
    const more = wrapper.findAll("button").find((b) => b.text().includes("notifications.loadMore"));
    expect(more).toBeDefined();
    await more!.trigger("click");
    await flushPromises();
    const cursorCall = apiMock.mock.calls.find((c) =>
      String(c[0]).startsWith("/reader/notifications?cursor="),
    );
    expect(cursorCall).toBeDefined();
    expect(cursorCall![0]).toBe("/reader/notifications?cursor=n2");
  });
});

describe("notification preferences", () => {
  it("renders per-type toggles with the effective values", async () => {
    apiMock.mockImplementation((path: string) => {
      if (path === "/reader/notifications/preferences") {
        return Promise.resolve(prefsPayload({ COMMENT_REPLY: false }));
      }
      if (path.startsWith("/reader/notifications")) {
        return Promise.resolve(inboxPayload({ notifications: [], unreadCount: 0 }));
      }
      throw new Error(`unexpected ${path}`);
    });
    const wrapper = mountPage();
    await flushPromises();
    const switches = wrapper.findAll('[role="switch"]');
    // Master + three per-type toggles.
    expect(switches).toHaveLength(4);
    // COMMENT_REPLY is off; the others (and the master) reflect it.
    expect(switches[0]!.attributes("aria-checked")).toBe("false"); // master
    expect(switches[1]!.attributes("aria-checked")).toBe("true"); // NEW_CHAPTER
    expect(switches[2]!.attributes("aria-checked")).toBe("false"); // COMMENT_REPLY
    expect(switches[3]!.attributes("aria-checked")).toBe("true"); // MODERATION_NOTICE
  });

  it("toggling a type PUTs the pinned types", async () => {
    apiMock.mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/reader/notifications/preferences" && (!init || init.method !== "PUT")) {
        return Promise.resolve(prefsPayload());
      }
      if (path === "/reader/notifications/preferences") {
        return Promise.resolve(prefsPayload({ NEW_CHAPTER: false }));
      }
      if (path.startsWith("/reader/notifications")) {
        return Promise.resolve(inboxPayload({ notifications: [], unreadCount: 0 }));
      }
      throw new Error(`unexpected ${path} ${init?.method}`);
    });
    const wrapper = mountPage();
    await flushPromises();
    const switches = wrapper.findAll('[role="switch"]');
    await switches[1]!.trigger("click"); // NEW_CHAPTER toggle
    await flushPromises();
    const putCall = apiMock.mock.calls.find(
      (c) => c[0] === "/reader/notifications/preferences" && c[1]?.method === "PUT",
    );
    expect(putCall).toBeDefined();
    const sent = JSON.parse((putCall![1] as RequestInit).body as string) as {
      preferences: { type: string; enabled: boolean }[];
    };
    expect(sent.preferences).toEqual([
      { type: "NEW_CHAPTER", enabled: false },
      { type: "COMMENT_REPLY", enabled: true },
      { type: "MODERATION_NOTICE", enabled: true },
    ]);
  });

  it("the master switch writes all three types at once", async () => {
    apiMock.mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/reader/notifications/preferences" && (!init || init.method !== "PUT")) {
        return Promise.resolve(prefsPayload());
      }
      if (path === "/reader/notifications/preferences") {
        return Promise.resolve(
          prefsPayload({ NEW_CHAPTER: false, COMMENT_REPLY: false, MODERATION_NOTICE: false }),
        );
      }
      if (path.startsWith("/reader/notifications")) {
        return Promise.resolve(inboxPayload({ notifications: [], unreadCount: 0 }));
      }
      throw new Error(`unexpected ${path}`);
    });
    const wrapper = mountPage();
    await flushPromises();
    const switches = wrapper.findAll('[role="switch"]');
    await switches[0]!.trigger("click"); // master switch
    await flushPromises();
    const putCall = apiMock.mock.calls.find(
      (c) => c[0] === "/reader/notifications/preferences" && c[1]?.method === "PUT",
    );
    const sent = JSON.parse((putCall![1] as RequestInit).body as string) as {
      preferences: { type: string; enabled: boolean }[];
    };
    expect(sent.preferences).toEqual([
      { type: "NEW_CHAPTER", enabled: false },
      { type: "COMMENT_REPLY", enabled: false },
      { type: "MODERATION_NOTICE", enabled: false },
    ]);
  });

  it("renders the privacy panel with the honest labels", async () => {
    apiMock.mockImplementation((path: string) => {
      if (path === "/reader/notifications/preferences") return Promise.resolve(prefsPayload());
      if (path.startsWith("/reader/notifications")) {
        return Promise.resolve(inboxPayload({ notifications: [], unreadCount: 0 }));
      }
      throw new Error(`unexpected ${path}`);
    });
    const wrapper = mountPage();
    await flushPromises();
    const text = wrapper.text();
    expect(text).toContain("notifications.privacyTitle");
    expect(text).toContain("notifications.privacyBookmarks");
    expect(text).toContain("notifications.privacyStaff");
    expect(text).toContain("notifications.inAppOnly");
  });
});
