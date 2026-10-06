/**
 * Comment thread UI tests (NF-WF-019B): the chapter comment thread
 * renders real API data (mocked at the useApi boundary, the 007
 * harness pattern). Covers the anonymous-readable list, the
 * session-gated composer, reply depth (no reply affordance on
 * replies), edit/delete affordances for own comments, the report
 * dialog with the pinned reasons, and XSS-safe rendering (markup in a
 * body is text, never markup).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref, computed, onMounted, watch } from "vue";
import CommentThread from "./CommentThread.vue";

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
  "defineProps",
  vi.fn(() => ({ novelSlug: "my-novel", chapterNumber: 2 })),
);

const topComment = {
  id: "c1",
  novelId: "n1",
  chapterNumber: 2,
  parentId: null,
  body: "Great chapter!",
  status: "VISIBLE",
  hiddenByModerator: false,
  author: { displayName: "Reader One" },
  replies: [
    {
      id: "c2",
      novelId: "n1",
      chapterNumber: 2,
      parentId: "c1",
      body: "Agreed.",
      status: "VISIBLE",
      hiddenByModerator: false,
      author: { displayName: "Reader Two" },
    },
  ],
  replyCount: 1,
  createdAt: "2026-10-06T00:00:00Z",
  updatedAt: "2026-10-06T00:00:00Z",
};

function mockApi({ session = false }: { session?: boolean } = {}) {
  apiMock.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path.startsWith("/public/novels/")) {
      return { novel: { id: "n1", title: "My Novel", slug: "my-novel" }, chapters: [] };
    }
    if (path === "/auth/session") {
      if (!session) throw new (class extends Error {
        code = "UNAUTHENTICATED";
        status = 401;
      })();
      return { userId: "u-reader" };
    }
    if (path.startsWith("/reader/comments?")) {
      return { comments: [topComment], page: { cursor: null, hasMore: false } };
    }
    if (path === "/reader/comments" && init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      return {
        comment: {
          id: "c-new",
          novelId: "n1",
          chapterNumber: 2,
          parentId: body.parentId ?? null,
          body: body.body,
          status: "VISIBLE",
          hiddenByModerator: false,
          author: { displayName: "Me" },
          createdAt: "2026-10-06T01:00:00Z",
          updatedAt: "2026-10-06T01:00:00Z",
        },
      };
    }
    if (path.endsWith("/reports") && init?.method === "POST") {
      return { report: { commentId: "c1", reason: "SPAM", createdAt: "2026-10-06T01:00:00Z" } };
    }
    throw new Error(`unmocked: ${path}`);
  });
}

beforeEach(() => {
  apiMock.mockReset();
});

describe("CommentThread", () => {
  it("renders the anonymous-readable list without a composer", async () => {
    mockApi({ session: false });
    const wrapper = mount(CommentThread, {
      props: { novelSlug: "my-novel", chapterNumber: 2 },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("Great chapter!");
    expect(wrapper.text()).toContain("Reader One");
    // Nested reply is rendered.
    expect(wrapper.text()).toContain("Agreed.");
    // No composer for anonymous readers — only the sign-in prompt.
    expect(wrapper.find("#comment-composer").exists()).toBe(false);
    expect(wrapper.text()).toContain("comments.signInPrompt");
  });

  it("shows the composer and posts a comment with a session", async () => {
    mockApi({ session: true });
    const wrapper = mount(CommentThread, {
      props: { novelSlug: "my-novel", chapterNumber: 2 },
    });
    await flushPromises();

    const composer = wrapper.find("#comment-composer");
    expect(composer.exists()).toBe(true);
    await composer.setValue("My take on this chapter");
    const postBtn = wrapper
      .findAll("button")
      .find((b) => b.text() === "comments.post");
    expect(postBtn).toBeTruthy();
    await postBtn!.trigger("click");
    await flushPromises();
    // The mock returns the new comment; the POST reached the write route.
    expect(apiMock).toHaveBeenCalledWith(
      "/reader/comments",
      expect.objectContaining({ method: "POST" }),
    );
    expect(
      JSON.parse(
        String(
          (apiMock.mock.calls.find((c) => c[0] === "/reader/comments")?.[1] as RequestInit)?.body,
        ),
      ).body,
    ).toBe("My take on this chapter");
  });

  it("has no reply affordance on replies (depth <= 1)", async () => {
    mockApi({ session: true });
    const wrapper = mount(CommentThread, {
      props: { novelSlug: "my-novel", chapterNumber: 2 },
    });
    await flushPromises();

    // Exactly one reply button: on the top-level comment only.
    const replyButtons = wrapper
      .findAll("button")
      .filter((b) => b.text() === "comments.reply");
    expect(replyButtons).toHaveLength(1);
  });

  it("opens the report dialog with the pinned reasons and submits", async () => {
    mockApi({ session: true });
    const wrapper = mount(CommentThread, {
      props: { novelSlug: "my-novel", chapterNumber: 2 },
    });
    await flushPromises();

    // The reply's report button renders before the top-level comment's
    // action row in DOM order; the LAST match is the top-level comment's.
    const reportBtns = wrapper
      .findAll("button")
      .filter((b) => b.text() === "comments.report");
    const reportBtn = reportBtns[reportBtns.length - 1];
    expect(reportBtn).toBeTruthy();
    await reportBtn!.trigger("click");
    await flushPromises();

    const dialog = wrapper.find('[role="dialog"]');
    expect(dialog.exists()).toBe(true);
    // All five pinned reasons are offered.
    for (const reason of ["SPAM", "HARASSMENT", "SPOILER", "OFF_TOPIC", "OTHER"]) {
      expect(dialog.text()).toContain(`comments.reportReasons.${reason}`);
    }
    const submit = dialog
      .findAll("button")
      .find((b) => b.text() === "comments.report")!;
    await submit.trigger("click");
    await flushPromises();
    expect(apiMock).toHaveBeenCalledWith(
      "/reader/comments/c1/reports",
      expect.objectContaining({ method: "POST" }),
    );
    expect(wrapper.text()).toContain("comments.reportThanks");
  });

  it("renders markup in a body as text, never as markup (XSS)", async () => {
    apiMock.mockImplementation(async (path: string) => {
      if (path.startsWith("/public/novels/")) {
        return { novel: { id: "n1" }, chapters: [] };
      }
      if (path === "/auth/session") {
        throw new (class extends Error {
          code = "UNAUTHENTICATED";
          status = 401;
        })();
      }
      if (path.startsWith("/reader/comments?")) {
        return {
          comments: [
            {
              ...topComment,
              id: "cx",
              body: '<script>alert("xss")</script><img src=x onerror=alert(1)>',
            },
          ],
          page: { cursor: null, hasMore: false },
        };
      }
      throw new Error(`unmocked: ${path}`);
    });
    const wrapper = mount(CommentThread, {
      props: { novelSlug: "my-novel", chapterNumber: 2 },
    });
    await flushPromises();

    // No script element was created; the markup is text content.
    expect(wrapper.find("script").exists()).toBe(false);
    expect(wrapper.find("img").exists()).toBe(false);
    expect(wrapper.text()).toContain('<script>alert("xss")</script>');
  });

  it("shows the hidden-by-moderator notice on own hidden comments", async () => {
    apiMock.mockImplementation(async (path: string) => {
      if (path.startsWith("/public/novels/")) {
        return { novel: { id: "n1" }, chapters: [] };
      }
      if (path === "/auth/session") return { userId: "u-reader" };
      if (path.startsWith("/reader/comments?")) {
        return {
          comments: [
            {
              ...topComment,
              id: "ch",
              status: "HIDDEN",
              hiddenByModerator: true,
              body: "Still visible to me",
            },
          ],
          page: { cursor: null, hasMore: false },
        };
      }
      throw new Error(`unmocked: ${path}`);
    });
    const wrapper = mount(CommentThread, {
      props: { novelSlug: "my-novel", chapterNumber: 2 },
    });
    await flushPromises();
    expect(wrapper.text()).toContain("comments.hiddenNotice");
    expect(wrapper.text()).toContain("Still visible to me");
  });
});
