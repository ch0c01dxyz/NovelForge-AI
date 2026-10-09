/**
 * ScaleReviewPanel accessibility tests (NF-WF-050B Slice 3).
 *
 * Verifies zero axe violations for the no-selection and unsaved-edits
 * states. Interactive states require a live backend and are covered by
 * manual verification.
 */
import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { axe } from "vitest-axe";
import ScaleReviewPanel from "./ScaleReviewPanel.vue";

vi.mock("../../composables/useLocale", () => ({
  useLocale: () => ({
    t: (key: string) => key,
    locale: { value: "en" },
  }),
}));

vi.mock("../../composables/useApi", () => ({
  useApi: () => ({
    api: vi.fn(),
  }),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number) {
      super(`API error ${status}`);
      this.status = status;
    }
  },
}));

describe("ScaleReviewPanel accessibility", () => {
  it("has no violations in no-selection state", async () => {
    const wrapper = mount(ScaleReviewPanel, {
      props: {
        workspaceId: "ws-1",
        novelId: "novel-1",
        chapterId: null,
        chapterVersionId: null,
      },
      attachTo: document.body,
    });
    const results = await axe(wrapper.element);
    expect(results.violations).toEqual([]);
    wrapper.unmount();
  });

  it("has no violations in unsaved-edits state", async () => {
    const wrapper = mount(ScaleReviewPanel, {
      props: {
        workspaceId: "ws-1",
        novelId: "novel-1",
        chapterId: "ch-1",
        chapterVersionId: null,
      },
      attachTo: document.body,
    });
    const results = await axe(wrapper.element);
    expect(results.violations).toEqual([]);
    wrapper.unmount();
  });
});
