import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import FindingsPanel from "./FindingsPanel.vue";
import ProposalsPanel from "./ProposalsPanel.vue";
import OutlineMovedNotice from "./OutlineMovedNotice.vue";
import DraftDiffView from "./DraftDiffView.vue";

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

describe("FindingsPanel", () => {
  const findings = [
    {
      category: "Continuity",
      severity: "high",
      rule: "no-contradiction",
      remediation: "Fix the timeline.",
      evidence: { source: "canon", version: "v3", span: "ch2:10-14" },
    },
  ];

  it("renders the empty state", () => {
    const w = mount(FindingsPanel, { props: { findings: [] } });
    expect(w.text()).toContain("findings.none");
  });

  it("expands evidence in place (one click from the claim)", async () => {
    const w = mount(FindingsPanel, { props: { findings } });
    expect(w.text()).toContain("Continuity");
    expect(w.text()).not.toContain("ch2:10-14");
    const toggle = w.findAll("button").find((b) => b.text().includes("findings.evidence"));
    await toggle!.trigger("click");
    expect(w.text()).toContain("ch2:10-14");
    expect(w.text()).toContain("canon");
  });
});

describe("ProposalsPanel", () => {
  it("shows the Candidate Canon banner and no canon-apply action", () => {
    const w = mount(ProposalsPanel, {
      props: {
        proposals: [
          { kind: "fact", text: "The tower fell.", citations: [{ source: "ch1", span: "1-2" }] },
        ],
      },
    });
    expect(w.text()).toContain("proposals.banner");
    expect(w.text()).toContain("The tower fell.");
    // No promote-to-canon action exists.
    const buttons = w.findAll("button");
    expect(buttons).toHaveLength(0);
  });

  it("renders the empty state", () => {
    const w = mount(ProposalsPanel, { props: { proposals: [] } });
    expect(w.text()).toContain("proposals.none");
  });
});

describe("OutlineMovedNotice", () => {
  const changes = [
    { path: "beats[1]", kind: "changed" as const, before: "b", after: "c" },
    { path: "scenes[0]", kind: "added" as const, before: "—", after: "{…}" },
  ];

  it("shows the non-blocking message and highlights changed parts", async () => {
    const w = mount(OutlineMovedNotice, {
      props: { fromVersionNumber: 3, toVersionNumber: 4, changes, truncated: false },
    });
    expect(w.attributes("role")).toBe("note");
    expect(w.text()).toContain("outlineMoved.message");
    const toggle = w.find("button");
    await toggle.trigger("click");
    expect(w.text()).toContain("beats[1]");
    expect(w.text()).toContain("scenes[0]");
    expect(w.text()).toContain("v3 → v4");
  });

  it("handles no detected changes", async () => {
    const w = mount(OutlineMovedNotice, {
      props: { fromVersionNumber: 3, toVersionNumber: 4, changes: [], truncated: false },
    });
    await w.find("button").trigger("click");
    expect(w.text()).toContain("outlineMoved.noChanges");
  });
});

describe("DraftDiffView", () => {
  it("shows pending state instead of fabricating text", () => {
    const w = mount(DraftDiffView, {
      props: {
        draftProse: null,
        baseText: "existing",
        pinnedVersion: 2,
        ordinal: 0,
        total: 0,
      },
    });
    expect(w.text()).toContain("review.pendingStage");
    expect(w.text()).not.toContain("existing");
  });

  it("renders a line diff citing the pinned version", () => {
    const w = mount(DraftDiffView, {
      props: {
        draftProse: "line one\nline two changed",
        baseText: "line one\nline two",
        pinnedVersion: 2,
        ordinal: 1,
        total: 1,
      },
    });
    expect(w.text()).toContain("review.diffAgainst|version=2");
    expect(w.text()).toContain("line two changed");
    expect(w.get('[data-testid="generated-prose-preview"]').text()).toBe("line one\nline two changed");
    expect(w.find('[aria-label="Draft diff"][role="document"]').exists()).toBe(false);
  });
  it("shows a blocked artifact as a planning problem instead of pending prose", () => {
    const w = mount(DraftDiffView, { props: { draftProse: null, blocked: true, baseText: "Existing chapter", pinnedVersion: 1, ordinal: 1, total: 1 } });
    expect(w.text()).toContain("review.blockedDraft");expect(w.text()).not.toContain("review.pendingStage");
    expect(w.find('[data-testid="generated-prose-preview"]').exists()).toBe(false);
  });
});
