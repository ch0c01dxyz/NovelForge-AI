import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import FinalTextReviewPanel, { type FinalTextReviewResult } from "./FinalTextReviewPanel.vue";
vi.mock("../../composables/useLocale", () => ({ useLocale: () => ({ t: (key: string) => key }) }));
const review: FinalTextReviewResult = { verdict: "FAIL", chapterVersionId: "v", hardViolations: [], scaleReview: { blocking: true, claims: [{ ok: false, coveredByException: false, gap: "Beyond standing", quote: "The city falls.", span: { start: 3, end: 18 } }], missingData: [] } };
describe("failed final-text review panel", () => {
  it("emits the retained exact quote/span and disables stale navigation", async () => {
    const w = mount(FinalTextReviewPanel, { props: { review, stale: false, navigationError: null } });
    await w.get('[data-testid="review-show-text"]').trigger("click");expect(w.emitted("show")![0]![0]).toEqual({ quote: "The city falls.", span: { start: 3, end: 18 } });
    await w.setProps({ stale: true });expect(w.get("button").attributes("disabled")).toBeDefined();expect(w.text()).toContain("reviewIssues.stale");w.unmount();
  });
  it("never invents a location for policy-only or missing-data findings", () => {
    const w = mount(FinalTextReviewPanel, { props: { review: { verdict: "FAIL", chapterVersionId: "v", hardViolations: [{ rule: "COOLDOWN_VIOLATION", remediation: "Review policy", evidence: [{ detail: "Prior event at chapter 1" }] }] }, stale: false, navigationError: null } });
    expect(w.find("button").exists()).toBe(false);expect(w.text()).toContain("reviewIssues.noTextPosition");w.unmount();
  });
  it("removes previous failure cards when the rerun passes", async () => {
    const w = mount(FinalTextReviewPanel, { props: { review, stale: false, navigationError: null } });
    await w.setProps({ review: { ...review, verdict: "PASS" } });expect(w.find("section").exists()).toBe(false);w.unmount();
  });
});
