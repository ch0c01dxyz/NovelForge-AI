/**
 * RunGraph component tests (NF-WF-018A).
 *
 * - Renders the run header with status and pinned version numbers.
 * - Renders every step with key, kind, status, agent/skill version pins,
 *   latency, and outcome/error text.
 * - The step list is the screen-reader text equivalent (all content in
 *   text, no canvas/SVG-only information).
 */
import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import RunGraph from "./RunGraph.vue";

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

const run = {
  id: "run-1",
  workflowId: "wf-1",
  workflowKey: "chapter-draft",
  workflowVersionNumber: 2,
  novelId: null,
  status: "FAILED",
  stepCount: 2,
  startedAt: "2026-10-06T00:00:00Z",
  completedAt: "2026-10-06T00:01:00Z",
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
      stepKey: "review",
      sequence: 1,
      kind: "AGENT",
      status: "FAILED",
      agentKey: "reviewer",
      agentVersionNumber: 1,
      skillKey: "continuity",
      skillVersionNumber: 2,
      generationId: null,
      output: null,
      errorMessage: "boom: model refused",
      latencyMs: 50,
      approvalSnapshot: null,
    },
  ],
};

describe("RunGraph", () => {
  it("renders the run header with pinned workflow version", () => {
    const wrapper = mount(RunGraph, { props: { run } });
    const text = wrapper.text();
    expect(text).toContain("chapter-draft");
    expect(text).toContain("aiStudio.steps.stepStatus.FAILED");
    expect(text).toContain("aiStudio.runs.workflowVersion|version=2");
  });

  it("renders every step with status, version pins, latency, and outcome/error", () => {
    const wrapper = mount(RunGraph, { props: { run } });
    const text = wrapper.text();
    expect(text).toContain("draft");
    expect(text).toContain("review");
    expect(text).toContain("aiStudio.steps.stepStatus.SUCCEEDED");
    expect(text).toContain("some prose");
    expect(text).toContain("boom: model refused");
    expect(text).toContain("aiStudio.runs.agentVersion|key=writer|version=3");
    expect(text).toContain("aiStudio.runs.skillVersion|key=continuity|version=2");
    expect(text).toContain("aiStudio.steps.latency|ms=1200");
  });

  it("renders the pinned-version summary", () => {
    const wrapper = mount(RunGraph, { props: { run } });
    const text = wrapper.text();
    expect(text).toContain("aiStudio.runs.pinnedVersions");
  });
});
