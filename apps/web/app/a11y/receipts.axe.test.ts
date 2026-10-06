/**
 * Accessibility tests (NF-WF-018C, WCAG 2.2 AA contract): zero axe
 * violations (wcag2aa + wcag22aa tags) on every receipts surface in
 * both locales. The checked-in suite is the automated half of the
 * audit; the manual checklist (keyboard, named screen reader,
 * contrast, viewports, reduced motion, 200% zoom, lang) follows the
 * apps/web/a11y/AUDIT-014.md pattern. The full screen-reader pass is
 * a human task (GAP-051).
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { axe, configureAxe } from "vitest-axe";
import GenerationLedger from "../components/ai-studio/GenerationLedger.vue";
import FailureLog from "../components/ai-studio/FailureLog.vue";
import EvaluationReceipts from "../components/ai-studio/EvaluationReceipts.vue";
import AuditTrail from "../components/ai-studio/AuditTrail.vue";
import { en } from "../i18n/en";
import { id } from "../i18n/id";

vi.stubGlobal("ref", ref);
vi.stubGlobal("computed", computed);
vi.stubGlobal("onMounted", onMounted);
vi.stubGlobal("onUnmounted", onUnmounted);
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

const generations = [
  {
    id: "gen-1",
    novelId: null,
    userId: "u-1",
    task: "selection.rewrite-tone",
    modelProfile: "CREATIVE_WRITER",
    status: "FAILED",
    inputTokens: 50,
    outputTokens: null,
    latencyMs: 120,
    errorCategory: "DETERMINISTIC",
    errorMessage: "no model is configured for profile CREATIVE_WRITER",
    createdAt: "2026-10-06T00:00:00Z",
    completedAt: "2026-10-06T00:00:01Z",
    attempts: [
      {
        attemptNumber: 1,
        gatewayId: null,
        modelId: null,
        status: "FAILED",
        errorCategory: "DETERMINISTIC",
        latencyMs: 120,
      },
    ],
  },
];

const novels = [{ id: "novel-1", title: "Test Novel", slug: "test-novel" }];

const reviews = [
  {
    id: "rev-1",
    chapterId: "ch-1",
    chapterNumber: 3,
    chapterTitle: "The Forest",
    chapterVersionId: "v-9",
    verdict: "FAIL",
    hardViolations: [{ rule: "CONTINUITY" }],
    advisory: [],
    evaluatedPolicies: {},
    revisionId: "rev-abc123",
    createdAt: "2026-10-06T02:00:00Z",
  },
];

const auditRows = [
  {
    id: "a-1",
    actorUserId: "u-1",
    actorEmail: "owner@example.com",
    action: "workflow.run",
    entityType: "WorkflowRun",
    entityId: "run-1",
    payload: {},
    createdAt: "2026-10-06T03:00:00Z",
  },
];

const receiptsMock = {
  listGenerations: vi.fn(),
  getGeneration: vi.fn(),
  listNovels: vi.fn(),
  listFinalTextReviews: vi.fn(),
  getStoryHealth: vi.fn(),
  listWorkspaceAuditLog: vi.fn(),
};

vi.mock("../composables/useReceipts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../composables/useReceipts")>();
  return { ...original, useReceipts: () => receiptsMock };
});

configureAxe({ rules: {} });

const WCAG22_AA = {
  runOnly: { type: "tag" as const, values: ["wcag2aa", "wcag22aa"] },
};

describe.each([
  ["en", en],
  ["id", id],
] as const)("Receipts a11y (%s)", (_name, locale) => {
  beforeEach(() => {
    currentT = tFor(locale);
    receiptsMock.listGenerations.mockReset().mockResolvedValue(generations);
    receiptsMock.getGeneration.mockReset().mockResolvedValue(generations[0]);
    receiptsMock.listNovels.mockReset().mockResolvedValue(novels);
    receiptsMock.listFinalTextReviews.mockReset().mockResolvedValue(reviews);
    receiptsMock.getStoryHealth.mockReset().mockResolvedValue({
      findings: [],
      unresolved: [],
      sourceRevisionId: "rev-abc123",
    });
    receiptsMock.listWorkspaceAuditLog.mockReset().mockResolvedValue(auditRows);
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("GenerationLedger has no violations", async () => {
    const wrapper = mount(GenerationLedger, {
      props: { workspaceId: "ws-1" },
      attachTo: document.body,
    });
    await flushPromises();
    const results = await axe(wrapper.element, WCAG22_AA);
    expect(results.violations, "axe violations").toEqual([]);
  });

  it("FailureLog has no violations", async () => {
    const wrapper = mount(FailureLog, {
      props: { workspaceId: "ws-1" },
      attachTo: document.body,
    });
    await flushPromises();
    const results = await axe(wrapper.element, WCAG22_AA);
    expect(results.violations, "axe violations").toEqual([]);
  });

  it("EvaluationReceipts has no violations", async () => {
    const wrapper = mount(EvaluationReceipts, {
      props: { workspaceId: "ws-1" },
      attachTo: document.body,
    });
    await flushPromises();
    const results = await axe(wrapper.element, WCAG22_AA);
    expect(results.violations, "axe violations").toEqual([]);
  });

  it("AuditTrail has no violations", async () => {
    const wrapper = mount(AuditTrail, {
      props: { workspaceId: "ws-1" },
      attachTo: document.body,
    });
    await flushPromises();
    const results = await axe(wrapper.element, WCAG22_AA);
    expect(results.violations, "axe violations").toEqual([]);
  });
});
