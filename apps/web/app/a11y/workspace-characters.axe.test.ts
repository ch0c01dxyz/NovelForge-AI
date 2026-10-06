/**
 * Accessibility tests (NF-WF-016, Invariant 8 / WCAG 2.2 AA contract):
 * zero axe violations (wcag2aa + wcag22aa tags) on the character and
 * relationship workspace panels in both locales.
 *
 * The fetch boundary is mocked (real useApi); useLocale resolves the
 * real en/id resources with the editor.axe.test.ts fallback pattern
 * (missing workspace.* keys render as their key path — still valid
 * accessible names for the audit).
 */
import { describe, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { nextTick } from "vue";
import { axe, configureAxe } from "vitest-axe";
import CharacterPanel from "../components/workspace/CharacterPanel.vue";
import CharacterStates from "../components/workspace/CharacterStates.vue";
import CharacterKnowledge from "../components/workspace/CharacterKnowledge.vue";
import CharacterArcs from "../components/workspace/CharacterArcs.vue";
import RelationshipPanel from "../components/workspace/RelationshipPanel.vue";
import { en } from "../i18n/en";
import { id } from "../i18n/id";

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

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const CHARS = [
  {
    id: "c1",
    key: "elena-marlowe",
    name: "Elena Marlowe",
    summary: "A cartographer.",
    storyEntityId: null,
  },
  { id: "c2", key: "dain", name: "Dain", summary: null, storyEntityId: "se-9" },
];

fetchMock.mockImplementation((url: string, init?: RequestInit) => {
  const method = (init?.method ?? "GET").toUpperCase();
  const u = new URL(url, "http://x");
  const p = u.pathname;
  if (p === "/api/workspaces/w1/novels/n1/characters" && method === "GET")
    return Promise.resolve(json(CHARS));
  if (p === "/api/workspaces/w1/novels/n1/characters/c1/states")
    return Promise.resolve(
      json([
        {
          id: "s1",
          characterId: "c1",
          fromChapter: 1,
          toChapter: 10,
          summary: "Apprentice years.",
        },
      ]),
    );
  if (p === "/api/workspaces/w1/novels/n1/characters/c1/knowledge")
    return Promise.resolve(
      json([
        {
          id: "k1",
          characterId: "c1",
          factId: "11111111-1111-1111-1111-111111111111",
          stance: "KNOWN",
          source: "REMEMBERED",
          fromChapter: 1,
          toChapter: null,
        },
      ]),
    );
  if (p === "/api/workspaces/w1/novels/n1/characters/c1/arcs")
    return Promise.resolve(
      json([{ id: "a1", characterId: "c1", status: "ACTIVE", title: "The Long Road" }]),
    );
  if (p === "/api/workspaces/w1/novels/n1/relationships/stances")
    return Promise.resolve(
      json([
        {
          id: "st1",
          fromCharacterId: "c1",
          toCharacterId: "c2",
          stance: "WARY",
          fromChapter: 1,
          toChapter: null,
        },
      ]),
    );
  if (p === "/api/workspaces/w1/novels/n1/relationships/bonds")
    return Promise.resolve(
      json([
        {
          id: "b1",
          novelId: "n1",
          structure: "MONOGAMY",
          memberIds: ["c1", "c2"],
          fromChapter: 3,
          toChapter: null,
        },
      ]),
    );
  if (p === "/api/workspaces/w1/novels/n1/relationships/bonds/b1/transitions")
    return Promise.resolve(
      json([{ id: "t1", bondId: "b1", chapter: 3, stage: "COMMITMENT", kind: "ADVANCE" }]),
    );
  throw new Error(`unrouted fetch: ${url}`);
});

configureAxe({ rules: {} });

const WCAG22_AA = {
  runOnly: { type: "tag" as const, values: ["wcag2aa", "wcag22aa"] },
};

describe.each([
  ["en", en],
  ["id", id],
] as Array<["en" | "id", typeof en | typeof id]>)("workspace characters a11y (%s)", (_name, locale) => {
  it("has zero axe violations on the character and relationship panels", async () => {
    currentT = tFor(locale);

    const panel = mount(CharacterPanel, {
      props: { workspaceId: "w1", novelId: "n1" },
    });
    await flushPromises();
    await nextTick();

    // Select a character so the sheet renders with data.
    await panel.find('[data-testid="character-select-c1"]').trigger("click");
    await nextTick();

    const states = mount(CharacterStates, {
      props: { workspaceId: "w1", novelId: "n1", characterId: "c1", characterName: "Elena" },
    });
    const knowledge = mount(CharacterKnowledge, {
      props: { workspaceId: "w1", novelId: "n1", characterId: "c1", characterName: "Elena" },
    });
    const arcs = mount(CharacterArcs, {
      props: { workspaceId: "w1", novelId: "n1", characterId: "c1", characterName: "Elena" },
    });
    await flushPromises();
    await nextTick();

    const rel = mount(RelationshipPanel, {
      props: { workspaceId: "w1", novelId: "n1" },
    });
    await flushPromises();
    await nextTick();
    // Open the bonds tab and expand a bond so its forms render.
    await rel.find('[data-testid="relationship-tab-bonds"]').trigger("click");
    await flushPromises();
    await nextTick();
    await rel.find('[data-testid="bond-toggle-b1"]').trigger("click");
    await flushPromises();
    await nextTick();

    for (const [label, wrapper] of [
      ["CharacterPanel", panel],
      ["CharacterStates", states],
      ["CharacterKnowledge", knowledge],
      ["CharacterArcs", arcs],
      ["RelationshipPanel", rel],
    ] as const) {
      const results = await axe(wrapper.element, WCAG22_AA);
      expect(results.violations, `${label} violations`).toEqual([]);
    }
  }, 30000);
});
