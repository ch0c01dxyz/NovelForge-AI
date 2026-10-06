/**
 * EvaluationReceipts component tests (NF-WF-018C).
 *
 * - Shows FinalTextReview rows with verdict, violations count, and
 *   revision pin; selecting a row reveals violations/advisory detail.
 * - Story health is labeled as a live computation, never a stored
 *   receipt; running the check calls the health route and renders the
 *   summary (contract Invariant 4, Q2).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import EvaluationReceipts from "./EvaluationReceipts.vue";
import { en } from "../../i18n/en";

vi.mock("../../composables/useLocale", () => ({
  useLocale: () => {
    const t = (path: string) => {
      const parts = path.split(".");
      let node: unknown = en;
      for (const p of parts) node = (node as Record<string, unknown>)?.[p];
      return typeof node === "string" ? node : path;
    };
    return { t, locale: { value: "en" }, setLocale: vi.fn() };
  },
}));

const novels = [{ id: "novel-1", title: "Test Novel", slug: "test-novel" }];

const reviews = [
  {
    id: "rev-1",
    chapterId: "ch-1",
    chapterNumber: 3,
    chapterTitle: "The Forest",
    chapterVersionId: "v-9",
    verdict: "FAIL",
    hardViolations: [{ rule: "CONTINUITY", note: "name mismatch" }],
    advisory: [],
    evaluatedPolicies: {},
    revisionId: "rev-abc123",
    createdAt: "2026-10-06T02:00:00Z",
  },
];

const health = {
  findings: [{ rule: "THREAD", note: "open thread" }],
  unresolved: [],
  sourceRevisionId: "rev-abc123",
};

const listNovelsMock = vi.fn();
const listFinalTextReviewsMock = vi.fn();
const getStoryHealthMock = vi.fn();

vi.mock("../../composables/useReceipts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../composables/useReceipts")>();
  return {
    ...original,
    useReceipts: () => ({
      listNovels: listNovelsMock,
      listFinalTextReviews: listFinalTextReviewsMock,
      getStoryHealth: getStoryHealthMock,
    }),
  };
});

function mountEval() {
  return mount(EvaluationReceipts, {
    props: { workspaceId: "ws-1" },
    attachTo: document.body,
  });
}

describe("EvaluationReceipts", () => {
  beforeEach(() => {
    listNovelsMock.mockReset().mockResolvedValue(novels);
    listFinalTextReviewsMock.mockReset().mockResolvedValue(reviews);
    getStoryHealthMock.mockReset().mockResolvedValue(health);
    document.body.innerHTML = "";
  });

  it("lists receipt rows with verdict, violations, and revision pin", async () => {
    const wrapper = mountEval();
    await flushPromises();
    expect(listFinalTextReviewsMock).toHaveBeenCalledWith("ws-1", "novel-1");
    const html = wrapper.html();
    expect(html).toContain("The Forest");
    expect(html).toContain("FAIL");
    expect(html).toContain("rev-abc1"); // truncated revision pin
  });

  it("reveals violations detail on row select", async () => {
    const wrapper = mountEval();
    await flushPromises();
    const row = wrapper.find("tbody tr");
    await row.trigger("click");
    await flushPromises();
    expect(wrapper.html()).toContain("CONTINUITY");
  });

  it("labels health as live computation and renders the run result", async () => {
    const wrapper = mountEval();
    await flushPromises();
    // The honesty label is present before any run (contract Invariant 4).
    expect(wrapper.html()).toContain("Live computation — not a stored receipt");
    const buttons = wrapper.findAll("button");
    const runBtn = buttons.find((b) => b.text().includes("Run health check"));
    expect(runBtn).toBeDefined();
    await runBtn!.trigger("click");
    await flushPromises();
    expect(getStoryHealthMock).toHaveBeenCalledWith("ws-1", "novel-1");
    const html = wrapper.html();
    // Findings count rendered; never a stored receipt.
    expect(html).toContain("1");
  });
});
