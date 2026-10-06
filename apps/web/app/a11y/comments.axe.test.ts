/**
 * Accessibility tests (NF-WF-019B, WCAG 2.2 AA contract): zero axe
 * violations (wcag2aa + wcag22aa tags) on the comment thread and the
 * staff moderation queue in both locales. The checked-in suite is the
 * automated half of the audit; the manual checklist (keyboard, named
 * screen reader, contrast, viewports, reduced motion, 200% zoom, lang)
 * follows the apps/web/a11y/AUDIT-014.md pattern. The full
 * screen-reader pass is a human task (GAP-051).
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref, computed, onMounted, watch } from "vue";
import { axe, configureAxe } from "vitest-axe";
import CommentThread from "../components/reader/CommentThread.vue";
import ModerationPage from "../pages/workspaces/[workspaceId]/novels/[novelId]/moderation.vue";
import { en } from "../i18n/en";
import { id } from "../i18n/id";

vi.stubGlobal("ref", ref);
vi.stubGlobal("computed", computed);
vi.stubGlobal("onMounted", onMounted);
vi.stubGlobal("watch", watch);

// Real i18n resources (both locales), minimal interpolation.
function tFor(locale: typeof en | typeof id) {
  return (path: string, params?: Record<string, string | number>) => {
    const parts = path.split(".");
    let node: unknown = locale;
    for (const p of parts) node = (node as Record<string, unknown>)?.[p];
    let s = typeof node === "string" ? node : path;
    if (params)
      for (const [k, v] of Object.entries(params))
        s = s.replace(`{${k}}`, String(v));
    return s;
  };
}

let currentT: (path: string, params?: Record<string, string | number>) => string =
  tFor(en);

vi.mock("../composables/useLocale", () => ({
  useLocale: () => ({
    t: (p: string, params?: Record<string, string | number>) => currentT(p, params),
    locale: { value: "en" },
    setLocale: vi.fn(),
  }),
}));

const apiMock = vi.fn();
vi.mock("../composables/useApi", () => ({
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

vi.stubGlobal(
  "useRoute",
  vi.fn(() => ({ params: { workspaceId: "ws1", novelId: "n1" } })),
);

configureAxe({ rules: {} });

const WCAG22_AA = {
  runOnly: { type: "tag" as const, values: ["wcag2aa", "wcag22aa"] },
};

const threadComments = [
  {
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
  },
];

const queueReports = {
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
  apiMock.mockImplementation(async (path: string) => {
    if (path.startsWith("/public/novels/")) {
      return { novel: { id: "n1" }, chapters: [] };
    }
    if (path === "/auth/session") return { userId: "u-reader" };
    if (path.startsWith("/reader/comments?")) {
      return { comments: threadComments, page: { cursor: null, hasMore: false } };
    }
    if (path.startsWith("/reader/novels/n1/moderation/reports")) return queueReports;
    throw new Error(`unmocked: ${path}`);
  });
});

async function axeViolations(wrapper: { element: Element }) {
  const results = await axe(wrapper.element, WCAG22_AA);
  return results.violations;
}

describe.each([
  ["en", en],
  ["id", id],
] as const)("comments a11y (%s)", (_name, locale) => {
  beforeEach(() => {
    currentT = tFor(locale);
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("comment thread has zero violations", async () => {
    const wrapper = mount(CommentThread, {
      props: { novelSlug: "my-novel", chapterNumber: 2 },
      attachTo: document.body,
    });
    await flushPromises();
    const violations = await axeViolations(wrapper);
    expect(violations, "axe violations").toEqual([]);
    wrapper.unmount();
  });

  it("moderation queue has zero violations", async () => {
    const wrapper = mount(ModerationPage, { attachTo: document.body });
    await flushPromises();
    const violations = await axeViolations(wrapper);
    expect(violations, "axe violations").toEqual([]);
    wrapper.unmount();
  });
});
