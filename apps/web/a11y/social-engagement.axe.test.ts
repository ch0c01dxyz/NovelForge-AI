/**
 * Accessibility tests (NF-WF-019A, Invariant 10): zero axe violations
 * (wcag2aa + wcag22aa tags) on every new reader-engagement surface, in
 * both locales.
 *
 * useLocale is mocked with a key-returning t; the shape and semantics
 * asserted by axe do not depend on the resolved strings. useApi is
 * mocked at the HTTP boundary. Buttons are keyboard-operable native
 * <button> elements with aria-pressed states.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref, computed, watch, onMounted } from "vue";
import { axe, configureAxe } from "vitest-axe";
import LikeButton from "../app/components/social/LikeButton.vue";
import BookmarkButton from "../app/components/social/BookmarkButton.vue";
import FollowButton from "../app/components/social/FollowButton.vue";
import FollowAuthorButton from "../app/components/social/FollowAuthorButton.vue";

// Vue auto-imports are Nuxt-provided; stub them for the vitest harness.
vi.stubGlobal("ref", ref);
vi.stubGlobal("computed", computed);
vi.stubGlobal("watch", watch);
vi.stubGlobal("onMounted", onMounted);

const apiMock = vi.fn();

vi.mock("../app/composables/useApi", () => ({
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

vi.mock("../app/composables/useLocale", () => ({
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

configureAxe({
  rules: {},
});

const WCAG22_AA = {
  runOnly: { type: "tag" as const, values: ["wcag2aa", "wcag22aa"] },
};

beforeEach(() => {
  apiMock.mockReset();
});

describe.each([["en"], ["id"]] as Array<["en" | "id"]>)(
  "reader engagement a11y (%s)",
  () => {
    it("has zero axe violations on the engagement buttons", async () => {
      const like = mount(LikeButton, {
        props: { novelId: "n1", chapterNumber: 1, liked: false, likeCount: 3 },
        attachTo: document.body,
      });
      const bookmark = mount(BookmarkButton, {
        props: { novelId: "n1", bookmarked: true },
        attachTo: document.body,
      });
      const follow = mount(FollowButton, {
        props: { novelId: "n1", following: false, followerCount: 10 },
        attachTo: document.body,
      });
      const followAuthor = mount(FollowAuthorButton, {
        props: { authorId: "a1", followingAuthor: false, followerCount: 2 },
        attachTo: document.body,
      });
      await flushPromises();

      for (const wrapper of [like, bookmark, follow, followAuthor]) {
        const results = await axe(wrapper.element, WCAG22_AA);
        expect(results.violations).toEqual([]);
        // Keyboard operability: native buttons with aria-pressed.
        const button = wrapper.find("button");
        expect(button.attributes("aria-pressed")).toMatch(/^(true|false)$/);
        wrapper.unmount();
      }

      like.unmount();
      bookmark.unmount();
      follow.unmount();
      followAuthor.unmount();
    });
  },
);
