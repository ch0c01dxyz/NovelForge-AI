/**
 * Accessibility tests (NF-WF-018A, WCAG 2.2 AA contract): zero axe
 * violations (wcag2aa + wcag22aa tags) on every AI Studio surface in
 * both locales. The checked-in suite is the automated half of the
 * audit; the manual checklist (keyboard, named screen reader,
 * contrast, viewports, reduced motion, 200% zoom, lang) follows the
 * apps/web/a11y/AUDIT-014.md pattern. The full screen-reader pass is
 * a human task (GAP-051).
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref, computed, onMounted, onUnmounted } from "vue";
import { axe, configureAxe } from "vitest-axe";
import DefinitionList from "../components/ai-studio/DefinitionList.vue";
import DefinitionDetail from "../components/ai-studio/DefinitionDetail.vue";
import RunList from "../components/ai-studio/RunList.vue";
import RunGraph from "../components/ai-studio/RunGraph.vue";
import ApprovalsInbox from "../components/ai-studio/ApprovalsInbox.vue";
import { en } from "../i18n/en";
import { id } from "../i18n/id";
import type { RunDetail } from "../composables/useAiStudio";

vi.stubGlobal("ref", ref);
vi.stubGlobal("computed", computed);
vi.stubGlobal("onMounted", onMounted);
vi.stubGlobal("onUnmounted", onUnmounted);

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

const definitions = [
  {
    id: "wf-1",
    scope: "WORKSPACE",
    workspaceId: "ws-1",
    key: "chapter-draft",
    name: "Chapter Draft",
    description: "Drafts a chapter.",
    status: "PUBLISHED",
    version: 3,
    versionId: "v-3",
    createdAt: "2026-10-06T00:00:00Z",
    updatedAt: "2026-10-06T00:00:00Z",
  },
];

const definitionDetail = {
  ...definitions[0],
  currentBody: "instruction: draft\n",
  steps: [{ key: "draft", kind: "AGENT", agentKey: "writer" }],
};

const versions = [
  { id: "v-1", number: 1, status: "PUBLISHED", createdAt: "2026-10-01T00:00:00Z", createdBy: "Ada" },
  { id: "v-3", number: 3, status: "PUBLISHED", createdAt: "2026-10-06T00:00:00Z", createdBy: "Ada" },
];

const runs = [
  {
    id: "run-1",
    workflowId: "wf-1",
    workflowKey: "chapter-draft",
    workflowVersionNumber: 2,
    novelId: null,
    status: "AWAITING_APPROVAL",
    stepCount: 2,
    startedAt: "2026-10-06T00:00:00Z",
    completedAt: null,
  },
];

const runDetail: RunDetail = {
  ...runs[0]!,
  input: {},
  output: null,
  errorMessage: null,
  steps: [
    {
      stepKey: "draft",
      sequence: 0,
      kind: "AGENT",
      status: "SUCCEEDED",
      agentKey: "writer",
      agentVersionNumber: 3,
      skillKey: null,
      skillVersionNumber: null,
      generationId: "gen-1",
      output: "some prose",
      errorMessage: null,
      latencyMs: 1200,
      approvalSnapshot: null,
    },
    {
      stepKey: "human-review",
      sequence: 1,
      kind: "HUMAN_APPROVAL",
      status: "AWAITING_APPROVAL",
      agentKey: null,
      agentVersionNumber: null,
      skillKey: null,
      skillVersionNumber: null,
      generationId: null,
      output: null,
      errorMessage: null,
      latencyMs: null,
      approvalSnapshot: {
        material: {
          instruction: "Review the draft chapter.",
          priorOutcomes: {},
          workflowVersionNumber: 2,
          agentVersions: {},
          skillVersions: {},
        },
        snapshotHash: "a".repeat(64),
      },
    },
  ],
};

const studioMock = {
  listDefinitions: vi.fn().mockResolvedValue(definitions),
  getDefinition: vi.fn().mockResolvedValue(definitionDetail),
  listDefinitionVersions: vi.fn().mockResolvedValue(versions),
  createDefinitionVersion: vi.fn(),
  publishDefinitionVersion: vi.fn(),
  listRuns: vi.fn().mockResolvedValue(runs),
  getRun: vi.fn().mockResolvedValue(runDetail),
  launchRun: vi.fn(),
  decideRun: vi.fn(),
  getWorkspaceRole: vi.fn().mockResolvedValue("ADMIN"),
};

vi.mock("../composables/useAiStudio", async (importOriginal) => {
  const original = await importOriginal<typeof import("../composables/useAiStudio")>();
  return { ...original, useAiStudio: () => studioMock };
});

const stubs = {
  NuxtLink: { props: ["to"], template: '<a :href="to"><slot /></a>' },
};

configureAxe({ rules: {} });

const WCAG22_AA = {
  runOnly: { type: "tag" as const, values: ["wcag2aa", "wcag22aa"] },
};

describe.each([
  ["en", en],
  ["id", id],
] as const)("AI Studio a11y (%s)", (_name, locale) => {
  beforeEach(() => {
    currentT = tFor(locale);
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("DefinitionList has no violations", async () => {
    const wrapper = mount(DefinitionList, {
      props: { workspaceId: "ws-1", kind: "workflow", canManage: true, canRun: true },
      attachTo: document.body,
      global: { stubs },
    });
    await flushPromises();
    const results = await axe(wrapper.element, WCAG22_AA);
    expect(results.violations, "axe violations").toEqual([]);
  });

  it("DefinitionDetail (detail + version history) has no violations", async () => {
    const wrapper = mount(DefinitionDetail, {
      props: { kind: "workflow", id: "wf-1", workspaceId: "ws-1", canManage: true },
      attachTo: document.body,
      global: { stubs },
    });
    await flushPromises();
    const results = await axe(wrapper.element, WCAG22_AA);
    expect(results.violations, "axe violations").toEqual([]);
  });

  it("RunList has no violations", async () => {
    const wrapper = mount(RunList, {
      props: { workspaceId: "ws-1" },
      attachTo: document.body,
      global: { stubs },
    });
    await flushPromises();
    const results = await axe(wrapper.element, WCAG22_AA);
    expect(results.violations, "axe violations").toEqual([]);
  });

  it("RunGraph has no violations", async () => {
    const wrapper = mount(RunGraph, {
      props: { run: runDetail },
      attachTo: document.body,
      global: { stubs },
    });
    await flushPromises();
    const results = await axe(wrapper.element, WCAG22_AA);
    expect(results.violations, "axe violations").toEqual([]);
  });

  it("ApprovalsInbox (detail + decide dialog) has no violations", async () => {
    const wrapper = mount(ApprovalsInbox, {
      props: { workspaceId: "ws-1", canDecide: true },
      attachTo: document.body,
      global: { stubs },
    });
    await flushPromises();
    await wrapper.find("[data-testid='parked-run-1']").trigger("click");
    await flushPromises();
    // Open the approve dialog too: the dialog landmark must be clean.
    const approveBtn = wrapper
      .findAll("button")
      .find((b) => b.text().includes(locale.aiStudio.approvals.approve));
    await approveBtn!.trigger("click");
    await flushPromises();
    const results = await axe(wrapper.element, WCAG22_AA);
    expect(results.violations, "axe violations").toEqual([]);
  });
});
