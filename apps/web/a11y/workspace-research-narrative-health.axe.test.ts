/**
 * Accessibility tests (NF-WF-016, Invariant 8): zero axe violations
 * (wcag2aa + wcag22aa tags) on every new research / narrative /
 * health-memory workspace surface, in both locales.
 *
 * useLocale is mocked with a key-returning t (the en/id resources are
 * written centrally by the parent after this actor's handoff, so real
 * resources cannot be asserted here yet); the shape and semantics
 * asserted by axe do not depend on the resolved strings. useApi is
 * mocked at the HTTP boundary.
 */
import { describe, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { nextTick } from "vue";
import { axe, configureAxe } from "vitest-axe";
import ResearchPanel from "../app/components/workspace/ResearchPanel.vue";
import ReferenceLibrary from "../app/components/workspace/ReferenceLibrary.vue";
import ReferenceIngest from "../app/components/workspace/ReferenceIngest.vue";
import RetrievalSearch from "../app/components/workspace/RetrievalSearch.vue";
import NarrativePanel from "../app/components/workspace/NarrativePanel.vue";
import DnaEditor from "../app/components/workspace/DnaEditor.vue";
import PolicyList from "../app/components/workspace/PolicyList.vue";
import Antagonists from "../app/components/workspace/Antagonists.vue";
import HealthMemoryPanel from "../app/components/workspace/HealthMemoryPanel.vue";

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

const props = { workspaceId: "ws-1", novelId: "novel-1" };
const tick = () => nextTick().then(() => flushPromises());

apiMock.mockImplementation(async (path: string) => {
  const p = String(path);
  if (p.includes("/retrievals")) return [];
  if (p.includes("/references/") && !p.endsWith("/references")) {
    return {
      id: "r1",
      key: "k",
      title: "T",
      kind: "NOTE",
      source: null,
      status: "DRAFT",
      version: 1,
      chunkCount: 0,
      content: null,
      versions: [
        { id: "v1", version: 1, note: null, charCount: 0, ingested: false, createdAt: "" },
      ],
    };
  }
  if (p.endsWith("/references")) return [];
  if (p.includes("/story-health/unresolved")) return { unresolved: [] };
  if (p.endsWith("/story-health")) return { findings: [], unresolved: [], sourceRevisionId: "rev-1" };
  if (p.includes("/memory/status")) return { statuses: [] };
  if (p.includes("/characters")) return [];
  if (p.includes("/antagonists")) return [];
  if (p.includes("/policies")) return [];
  if (p.includes("/dna")) return null;
  return [];
});

describe.each([["en"], ["id"]] as Array<["en" | "id"]>)(
  "workspace research/narrative/health a11y (%s)",
  () => {
    it("has zero axe violations on all new workspace surfaces", async () => {
      const research = mount(ResearchPanel, { props });
      const library = mount(ReferenceLibrary, { props });
      const ingest = mount(ReferenceIngest, { props: { referenceId: "r1" } });
      const search = mount(RetrievalSearch, { props });
      const narrative = mount(NarrativePanel, { props });
      const dna = mount(DnaEditor, { props });
      const policies = mount(PolicyList, { props });
      const antagonists = mount(Antagonists, { props });
      const health = mount(HealthMemoryPanel, { props });
      await tick();

      for (const [label, wrapper] of [
        ["ResearchPanel", research],
        ["ReferenceLibrary", library],
        ["ReferenceIngest", ingest],
        ["RetrievalSearch", search],
        ["NarrativePanel", narrative],
        ["DnaEditor", dna],
        ["PolicyList", policies],
        ["Antagonists", antagonists],
        ["HealthMemoryPanel", health],
      ] as const) {
        const results = await axe(wrapper.element, WCAG22_AA);
        expect(results.violations, `${label} violations`).toEqual([]);
      }
    }, 60000);
  },
);
