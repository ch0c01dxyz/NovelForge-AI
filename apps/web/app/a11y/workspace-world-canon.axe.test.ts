/**
 * Accessibility tests (NF-WF-016, WCAG 2.2 AA contract): zero axe
 * violations (wcag2aa + wcag22aa tags) on every World & Lore / Canon Review
 * surface in both locales, following the 014/015 apps/web/app/a11y
 * precedent.
 *
 * Components fetch on mount; fetch is stubbed with canned canon payloads.
 * Dialogs render via Teleport to document.body, so axe runs against the
 * mounted wrapper element plus the dialog node when open.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { nextTick } from "vue";
import { axe, configureAxe } from "vitest-axe";
import WorldPanel from "../components/workspace/WorldPanel.vue";
import CanonReviewPanel from "../components/workspace/CanonReviewPanel.vue";
import EntityBrowser from "../components/workspace/EntityBrowser.vue";
import FactList from "../components/workspace/FactList.vue";
import FactEditor from "../components/workspace/FactEditor.vue";
import ProposalReview from "../components/workspace/ProposalReview.vue";
import { en } from "../i18n/en";
import { id } from "../i18n/id";

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

vi.mock("../composables/useLocale", () => ({
  useLocale: () => ({
    t: (p: string, params?: Record<string, string | number>) => currentT(p, params),
    locale: { value: "en" },
    setLocale: vi.fn(),
  }),
}));

configureAxe({ rules: {} });

const WCAG22_AA = {
  runOnly: { type: "tag" as const, values: ["wcag2aa", "wcag22aa"] },
};

const WS = "11111111-1111-1111-1111-111111111111";
const NOVEL = "22222222-2222-2222-2222-222222222222";
const E1 = "33333333-3333-3333-3333-333333333333";

const entities = [{ id: E1, kind: "CHARACTER", name: "Kael", key: "kael" }];
const facts = [
  {
    id: "55555555-5555-5555-5555-555555555555",
    entityId: E1,
    predicate: "wields",
    statement: "Kael wields the Ember Blade.",
    objectText: "the Ember Blade",
    objectEntityId: null,
    status: "ACTIVE",
    validFromChapter: 3,
    validUntilChapter: null,
    availableFromChapter: 3,
    sources: [
      {
        sourceKind: "CHAPTER",
        quote: "Kael lifted the Ember Blade.",
        start: 10,
        end: 38,
        chapterVersionId: "66666666-6666-6666-6666-666666666666",
        referenceVersionId: null,
      },
    ],
  },
];
const proposals = [
  {
    id: "77777777-7777-7777-7777-777777777777",
    entityId: E1,
    predicate: "wields",
    statement: "Kael wields the Ember Blade.",
    status: "PROPOSED",
    conflictKind: "FUNCTIONAL_CONFLICT",
    conflictsWithFactId: "55555555-5555-5555-5555-555555555555",
    canonFactId: null,
  },
];

vi.stubGlobal(
  "fetch",
  vi.fn(async (url: string) => {
    const u = String(url);
    let body: unknown = null;
    if (u.includes("/canon/entities")) body = entities;
    else if (u.includes("/canon/facts?")) body = { facts, withheldCount: 0 };
    else if (u.includes("/canon/proposals")) body = proposals;
    return { ok: true, status: 200, json: async () => body };
  }),
);

afterEach(() => {
  document.body.innerHTML = "";
});

async function settle() {
  await flushPromises();
  await nextTick();
  await new Promise((r) => setTimeout(r, 0));
}

describe.each([
  ["en", en],
  ["id", id],
] as Array<["en" | "id", typeof en]>)("world & canon a11y (%s)", (_name, locale) => {
  it("has zero axe violations on all panels", async () => {
    currentT = tFor(locale);

    const world = mount(WorldPanel, { props: { workspaceId: WS, novelId: NOVEL } });
    const canon = mount(CanonReviewPanel, { props: { workspaceId: WS, novelId: NOVEL } });
    const browser = mount(EntityBrowser, { props: { workspaceId: WS, novelId: NOVEL } });
    const factsList = mount(FactList, { props: { workspaceId: WS, novelId: NOVEL } });
    const review = mount(ProposalReview, { props: { workspaceId: WS, novelId: NOVEL } });
    const editor = mount(FactEditor, {
      props: { workspaceId: WS, novelId: NOVEL, open: true, mode: "create" },
    });
    await settle();

    const dialog = document.body.querySelector('section[role="dialog"]');
    expect(dialog, "FactEditor dialog rendered").toBeTruthy();

    const targets: Array<[string, Element]> = [
      ["WorldPanel", world.element],
      ["CanonReviewPanel", canon.element],
      ["EntityBrowser", browser.element],
      ["FactList", factsList.element],
      ["ProposalReview", review.element],
      ["FactEditor dialog", dialog!],
    ];
    for (const [label, el] of targets) {
      const results = await axe(el, WCAG22_AA);
      expect(results.violations, `${label} violations`).toEqual([]);
    }

    for (const w of [world, canon, browser, factsList, review, editor]) w.unmount();
  }, 60000);
});
