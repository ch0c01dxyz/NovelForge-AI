/**
 * Relationship workspace component tests (NF-WF-016).
 *
 * Same harness as the characters tests: global.fetch mocked, real
 * useApi, useLocale with real en resources (missing workspace keys
 * fall back to the key path). Covers: panel tab container + roster
 * load, stances (list/filter, create incl. same-character guard,
 * at-lookup hit/miss, 403), bonds (create with members, delete
 * two-step confirmation, transitions, interactions incl. weight
 * validation, stage-at and neglect readouts).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { nextTick } from "vue";
import RelationshipPanel from "./RelationshipPanel.vue";
import RelationshipStances from "./RelationshipStances.vue";
import Bonds from "./Bonds.vue";
import { en } from "../../i18n/en";

function tFor(locale: typeof en) {
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

vi.mock("../../composables/useLocale", () => ({
  useLocale: () => ({
    t: tFor(en),
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
function apiErr(code: string, status: number): Response {
  return json({ error: code }, status);
}
const noContent = () => new Response(null, { status: 204 });

const CHARS = [
  { id: "c1", key: "elena-marlowe", name: "Elena Marlowe" },
  { id: "c2", key: "dain", name: "Dain" },
  { id: "c3", key: "sira", name: "Sira" },
];

const STANCES = [
  {
    id: "st1",
    fromCharacterId: "c1",
    toCharacterId: "c2",
    stance: "WARY",
    fromChapter: 1,
    toChapter: null,
  },
];

const BONDS = [
  {
    id: "b1",
    novelId: "n1",
    structure: "MONOGAMY",
    memberIds: ["c1", "c2"],
    fromChapter: 3,
    toChapter: null,
  },
];

const TRANSITIONS = [
  { id: "t1", bondId: "b1", chapter: 3, stage: "COMMITMENT", kind: "ADVANCE" },
];

type Route = (url: string, init?: RequestInit) => Response | undefined;

function happyRouter(): Route {
  return (url, init) => {
    const method = (init?.method ?? "GET").toUpperCase();
    const u = new URL(url, "http://x");
    const p = u.pathname;
    if (p === "/api/workspaces/w1/novels/n1/characters" && method === "GET")
      return json(CHARS);
    if (p === "/api/workspaces/w1/novels/n1/relationships/stances") {
      if (method === "GET") return json(STANCES);
      return json({ id: "st2", ...JSON.parse(String(init?.body)) }, 201);
    }
    if (p === "/api/workspaces/w1/novels/n1/relationships/stances/at") {
      const ch = u.searchParams.get("chapter");
      return json(ch === "5" ? STANCES[0] : null);
    }
    if (p === "/api/workspaces/w1/novels/n1/relationships/bonds") {
      if (method === "GET") return json(BONDS);
      const b = JSON.parse(String(init?.body));
      return json({ id: "b2", novelId: "n1", ...b }, 201);
    }
    if (p === "/api/workspaces/w1/novels/n1/relationships/bonds/b1" && method === "DELETE")
      return noContent();
    if (p === "/api/workspaces/w1/novels/n1/relationships/bonds/b1/transitions") {
      if (method === "GET") return json(TRANSITIONS);
      return json({ id: "t2", bondId: "b1", ...JSON.parse(String(init?.body)) }, 201);
    }
    if (p === "/api/workspaces/w1/novels/n1/relationships/bonds/b1/stage") {
      const ch = Number(u.searchParams.get("chapter"));
      return json({ stage: ch >= 3 ? "COMMITMENT" : null });
    }
    if (p === "/api/workspaces/w1/novels/n1/relationships/bonds/b1/interactions" && method === "POST")
      return json({ id: "i1", bondId: "b1", ...JSON.parse(String(init?.body)) }, 201);
    if (p === "/api/workspaces/w1/novels/n1/relationships/bonds/b1/neglect") {
      return json({
        lastMeaningfulChapter: 4,
        chaptersSinceMeaningful: 6,
        neglected: true,
      });
    }
    return undefined;
  };
}

function installRouter(route: Route) {
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    const res = route(url, init);
    if (!res) throw new Error(`unrouted fetch: ${url}`);
    return Promise.resolve(res);
  });
}

beforeEach(() => {
  fetchMock.mockReset();
});

const props = { workspaceId: "w1", novelId: "n1" };

async function mountPanel() {
  const w = mount(RelationshipPanel, { props });
  await flushPromises();
  await nextTick();
  return w;
}

describe("RelationshipPanel", () => {
  it("loads the roster and shows the stances tab by default", async () => {
    installRouter(happyRouter());
    const w = await mountPanel();
    expect(w.find('[data-testid="relationship-stances"]').exists()).toBe(true);
    // pairLabel now renders real English; the interpolated names are visible.
    expect(w.find('[data-testid="stances-list"]').text()).toContain("Elena Marlowe → Dain");
    expect(w.find('[data-testid="relationship-tab-bonds"]').exists()).toBe(true);
  });

  it("switches to the bonds tab", async () => {
    installRouter(happyRouter());
    const w = await mountPanel();
    await w.find('[data-testid="relationship-tab-bonds"]').trigger("click");
    await flushPromises();
    await nextTick();
    expect(w.find('[data-testid="bonds"]').exists()).toBe(true);
    // Bond member names render raw (not through t()), so the roster names
    // are visible even under the key-path-fallback locale mock.
    expect(w.find('[data-testid="bonds-list"]').text()).toContain("Elena Marlowe");
  });

  it("shows a roster-load error with retry", async () => {
    let fails = true;
    installRouter((url, init) => {
      const u = new URL(url, "http://x");
      if (u.pathname === "/api/workspaces/w1/novels/n1/characters" && !init?.method) {
        if (fails) return apiErr("FORBIDDEN", 403);
        return json(CHARS);
      }
      return happyRouter()(url, init);
    });
    const w = await mountPanel();
    expect(w.text()).toContain("You don't have permission to do that.");
    fails = false;
    await w.find('[data-testid="relationship-panel-retry"]').trigger("click");
    await flushPromises();
    await nextTick();
    expect(w.find('[data-testid="relationship-stances"]').exists()).toBe(true);
  });
});

describe("RelationshipStances", () => {
  const stancesProps = { ...props, characters: CHARS };

  it("guards same-character pairs client-side and creates a stance", async () => {
    installRouter(happyRouter());
    const w = mount(RelationshipStances, { props: stancesProps });
    await flushPromises();
    await nextTick();

    const form = w.find('[data-testid="stance-create-form"]');
    await form.find('[data-testid="stance-from-input"]').setValue("c1");
    await form.find('[data-testid="stance-to-input"]').setValue("c1");
    await form.find('[data-testid="stance-fromchapter-input"]').setValue("2");
    await form.trigger("submit");
    await nextTick();
    expect(w.text()).toContain("A stance can't point a character at itself.");

    await form.find('[data-testid="stance-to-input"]').setValue("c3");
    await form.find('[data-testid="stance-stance-input"]').setValue("FRIENDLY");
    await form.trigger("submit");
    await flushPromises();
    await nextTick();
    const post = fetchMock.mock.calls.find(
      ([url, init]) =>
        url === "/api/workspaces/w1/novels/n1/relationships/stances" &&
        (init as RequestInit)?.method === "POST",
    );
    expect(post).toBeTruthy();
    expect(JSON.parse(String((post![1] as RequestInit).body))).toEqual({
      fromCharacterId: "c1",
      toCharacterId: "c3",
      stance: "FRIENDLY",
      fromChapter: 2,
      toChapter: null,
    });
  });

  it("looks up the stance at a chapter: hit and miss", async () => {
    installRouter(happyRouter());
    const w = mount(RelationshipStances, { props: stancesProps });
    await flushPromises();
    await nextTick();

    const at = w.find('[data-testid="stance-at-form"]');
    await at.find('[data-testid="stance-at-from-input"]').setValue("c1");
    await at.find('[data-testid="stance-at-to-input"]').setValue("c2");
    await at.find('[data-testid="stance-at-chapter-input"]').setValue("5");
    await at.trigger("submit");
    await flushPromises();
    await nextTick();
    expect(w.find('[data-testid="stance-at-result"]').text()).toContain("at chapter 5");

    await at.find('[data-testid="stance-at-chapter-input"]').setValue("50");
    await at.trigger("submit");
    await flushPromises();
    await nextTick();
    expect(w.find('[data-testid="stance-at-result"]').text()).toContain("No stance recorded at chapter");
  });

  it("applies from/to filters to the list query", async () => {
    installRouter(happyRouter());
    const w = mount(RelationshipStances, { props: stancesProps });
    await flushPromises();
    await nextTick();
    await w.find('[data-testid="stances-filter-from"]').setValue("c1");
    await w.find('[data-testid="stances-filter-form"]').trigger("submit");
    await flushPromises();
    await nextTick();
    const filtered = fetchMock.mock.calls.filter(
      ([url, init]) =>
        (url as string).startsWith("/api/workspaces/w1/novels/n1/relationships/stances?") &&
        !(init as RequestInit)?.method,
    );
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered[filtered.length - 1]![0] as string).toContain("fromCharacterId=c1");
  });
});

describe("Bonds", () => {
  const bondsProps = { ...props, characters: CHARS };

  it("creates a bond with members, structure and chapters", async () => {
    installRouter(happyRouter());
    const w = mount(Bonds, { props: bondsProps });
    await flushPromises();
    await nextTick();
    expect(w.find('[data-testid="bonds-list"]').text()).toContain("Dain");

    const form = w.find('[data-testid="bond-create-form"]');
    await form.find('[data-testid="bond-structure-input"]').setValue("POLYAMORY");
    await form.find('[data-testid="bond-member-c1"]').setValue(true);
    await form.find('[data-testid="bond-member-c3"]').setValue(true);
    await form.find('[data-testid="bond-from-input"]').setValue("7");
    await form.trigger("submit");
    await flushPromises();
    await nextTick();
    const post = fetchMock.mock.calls.find(
      ([url, init]) =>
        url === "/api/workspaces/w1/novels/n1/relationships/bonds" &&
        (init as RequestInit)?.method === "POST",
    );
    expect(post).toBeTruthy();
    expect(JSON.parse(String((post![1] as RequestInit).body))).toEqual({
      structure: "POLYAMORY",
      memberIds: ["c1", "c3"],
      fromChapter: 7,
      toChapter: null,
    });
  });

  it("requires at least one member client-side", async () => {
    installRouter(happyRouter());
    const w = mount(Bonds, { props: bondsProps });
    await flushPromises();
    await w.find('[data-testid="bond-create-form"]').trigger("submit");
    await nextTick();
    expect(w.text()).toContain("Select at least one member.");
  });

  it("delete requires explicit confirmation", async () => {
    installRouter(happyRouter());
    const w = mount(Bonds, { props: bondsProps });
    await flushPromises();
    await nextTick();

    await w.find('[data-testid="bond-delete-b1"]').trigger("click");
    await nextTick();
    expect(w.find('[data-testid="bond-confirm-b1"]').exists()).toBe(true);
    const strip = w.find('[data-testid="bond-confirm-b1"]');
    const buttons = strip.findAll("button");
    await buttons[1]!.trigger("click"); // Cancel
    await nextTick();
    expect(w.find('[data-testid="bond-confirm-b1"]').exists()).toBe(false);
    expect(
      fetchMock.mock.calls.some(([, init]) => (init as RequestInit)?.method === "DELETE"),
    ).toBe(false);

    await w.find('[data-testid="bond-delete-b1"]').trigger("click");
    await nextTick();
    await w.find('[data-testid="bond-confirm-yes-b1"]').trigger("click");
    await flushPromises();
    await nextTick();
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          url === "/api/workspaces/w1/novels/n1/relationships/bonds/b1" &&
          (init as RequestInit)?.method === "DELETE",
      ),
    ).toBe(true);
  });

  it("expands a bond: transitions, interaction weight guard, stage-at and neglect", async () => {
    installRouter(happyRouter());
    const w = mount(Bonds, { props: bondsProps });
    await flushPromises();
    await nextTick();

    await w.find('[data-testid="bond-toggle-b1"]').trigger("click");
    await flushPromises();
    await nextTick();
    expect(w.text()).toContain("Advance → Commitment at ch. 3");

    // Transition add.
    const tform = w.find('[data-testid="transition-form-b1"]');
    const tinputs = tform.findAll("input, select");
    await tinputs[0]!.setValue("9");
    await tinputs[1]!.setValue("MARRIAGE");
    await tinputs[2]!.setValue("ADVANCE");
    await tform.trigger("submit");
    await flushPromises();
    await nextTick();
    const tpost = fetchMock.mock.calls.find(
      ([url, init]) =>
        url === "/api/workspaces/w1/novels/n1/relationships/bonds/b1/transitions" &&
        (init as RequestInit)?.method === "POST",
    );
    expect(tpost).toBeTruthy();
    expect(JSON.parse(String((tpost![1] as RequestInit).body))).toEqual({
      chapter: 9,
      stage: "MARRIAGE",
      kind: "ADVANCE",
    });

    // Interaction: weight outside 0-1 is refused client-side.
    const iform = w.find('[data-testid="interaction-form-b1"]');
    const iinputs = iform.findAll("input");
    await iinputs[0]!.setValue("10");
    await iinputs[1]!.setValue("1.5");
    await iform.trigger("submit");
    await nextTick();
    expect(w.text()).toContain("Weight must be between 0 and 1.");
    await iinputs[1]!.setValue("0.8");
    await iinputs[2]!.setValue("A quiet dinner.");
    await iform.trigger("submit");
    await flushPromises();
    await nextTick();
    const ipost = fetchMock.mock.calls.find(
      ([url, init]) =>
        url === "/api/workspaces/w1/novels/n1/relationships/bonds/b1/interactions" &&
        (init as RequestInit)?.method === "POST",
    );
    expect(ipost).toBeTruthy();
    expect(JSON.parse(String((ipost![1] as RequestInit).body))).toEqual({
      chapter: 10,
      weight: 0.8,
      summary: "A quiet dinner.",
    });

    // Stage-at lookup.
    const sform = w.find('[data-testid="stage-form-b1"]');
    await sform.find("input").setValue("9");
    await sform.trigger("submit");
    await flushPromises();
    await nextTick();
    expect(w.find('[data-testid="stage-result-b1"]').text()).toContain("Stage at chapter 9");

    // Neglect readout.
    const nform = w.find('[data-testid="neglect-form-b1"]');
    await nform.find("input").setValue("10");
    await nform.trigger("submit");
    await flushPromises();
    await nextTick();
    expect(w.find('[data-testid="neglect-result-b1"]').text()).toContain("Neglected");
  });
});
