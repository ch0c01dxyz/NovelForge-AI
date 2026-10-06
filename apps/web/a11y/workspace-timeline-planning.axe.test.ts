/**
 * Accessibility tests (NF-WF-016): zero axe violations (wcag2aa + wcag22aa
 * tags) on the timeline and planning workspace panels in both locales.
 *
 * Follows apps/web/app/a11y/editor.axe.test.ts: useLocale is mocked with
 * the real en/id resources via tFor. The workspace.timeline/planning
 * strings are written centrally by the parent after this handoff, so a
 * missing key falls back to the key path — axe asserts structure, roles,
 * labels, and names, not the resolved copy. useApi is mocked at the HTTP
 * boundary with representative payloads, and every create form is opened
 * before the scan so form controls and their labels are covered too.
 */
import { describe, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { axe, configureAxe } from "vitest-axe";
import TimelinePanel from "../app/components/workspace/TimelinePanel.vue";
import PlanningPanel from "../app/components/workspace/PlanningPanel.vue";
import { en } from "../app/i18n/en";
import { id } from "../app/i18n/id";

function tFor(locale: typeof en | typeof id) {
  return (path: string, params?: Record<string, string | number>) => {
    const parts = path.split(".");
    let node: unknown = locale;
    for (const p of parts) node = (node as Record<string, unknown>)?.[p];
    let s = typeof node === "string" ? node : path;
    if (params) for (const [k, v] of Object.entries(params)) s = s.replace(`{${k}}`, String(v));
    return s;
  };
}

let currentT: (path: string, params?: Record<string, string | number>) => string = tFor(en);

vi.mock("../app/composables/useLocale", () => ({
  useLocale: () => ({
    t: (p: string, params?: Record<string, string | number>) => currentT(p, params),
    locale: { value: "en" },
    setLocale: vi.fn(),
  }),
}));

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

configureAxe({
  rules: {},
});

const WCAG22_AA = {
  runOnly: { type: "tag" as const, values: ["wcag2aa", "wcag22aa"] },
};

const props = { workspaceId: "ws-1", novelId: "novel-1" };

apiMock.mockImplementation(async (path: string) => {
  const p = String(path);
  if (p.includes("/story/events"))
    return [{ id: "e1", description: "The tower falls.", availableFromChapter: null, chapterId: null }];
  if (p.includes("/story/timeline"))
    return [{ id: "t1", description: "The Era of Ash begins.", availableFromChapter: 3 }];
  if (p.includes("/story/threads"))
    return [
      {
        id: "th1",
        kind: "MYSTERY",
        title: "Who opened the gate?",
        status: "ACTIVE",
        description: "A lingering mystery.",
        importance: 4,
        introducedAtChapter: 2,
      },
    ];
  if (p.includes("/story/promises"))
    return [{ id: "p1", title: "The sword will return.", status: "SETUP", importance: 5 }];
  if (p.includes("/story/causal-edges"))
    return [{ id: "c1", causeEventId: "e1", effectEventId: "e2", confidence: "INFERRED" }];
  if (p.includes("/planning/synopses"))
    return [{ id: "s1", content: "A hero rises from the ashes.", archived: false }];
  if (p.includes("/planning/sagas"))
    return [{ id: "g1", kind: "SAGA", title: "The Ash Saga", intent: "Rebuild the realm." }];
  if (p.includes("/planning/outline-nodes"))
    return [{ id: "n1", kind: "CHAPTER", title: "Chapter 3", order: 3, summary: "The fall." }];
  if (p.includes("/planning/outline-versions"))
    return [{ id: "v1", status: "DRAFT", note: "First draft" }];
  if (p.includes("/planning/horizon")) return { nearChapters: 10, farChapters: 50 };
  return [];
});

describe.each([
  ["en", en],
  ["id", id],
] as Array<["en" | "id", typeof en]>)("workspace timeline/planning a11y (%s)", (_name, locale) => {
  it("has zero axe violations on both panels with forms open", async () => {
    currentT = tFor(locale);

    const timeline = mount(TimelinePanel, { props, attachTo: document.body });
    const planning = mount(PlanningPanel, { props, attachTo: document.body });
    await flushPromises();

    // Open every create form so controls and their labels are scanned.
    // v-show keeps all tabs in the DOM, so hidden-tab buttons are reachable.
    for (const testid of [
      "events-new",
      "timeline-new",
      "threads-new",
      "promises-new",
      "edges-new",
      "synopses-new",
      "sagas-new",
      "nodes-new",
      "versions-new",
    ] as const) {
      const btn = timeline.find(`[data-testid='${testid}']`).exists()
        ? timeline.find(`[data-testid='${testid}']`)
        : planning.find(`[data-testid='${testid}']`);
      await btn.trigger("click");
    }
    await flushPromises();

    for (const [label, wrapper] of [
      ["TimelinePanel", timeline],
      ["PlanningPanel", planning],
    ] as const) {
      const results = await axe(wrapper.element, WCAG22_AA);
      expect(results.violations, `${label} violations`).toEqual([]);
    }

    timeline.unmount();
    planning.unmount();
  }, 60000);
});
