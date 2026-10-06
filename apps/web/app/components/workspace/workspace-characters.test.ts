/**
 * Character workspace component tests (NF-WF-016).
 *
 * Mocks at the global.fetch boundary (the 007/013 harness pattern: the
 * real useApi runs against the mock) and useLocale with the real en
 * resources (missing workspace keys fall back to the key path, which is
 * what the assertions pin). No mock screens: assertions are about data
 * the components actually render.
 *
 * Covers: list happy path + 403/retry, create (validation + POST +
 * refetch), delete two-step confirmation (cancel + confirm + 404),
 * states (list, 409 overlap, at-lookup hit/miss), knowledge (UUID
 * validation, create, access verdicts), arcs (create, milestone,
 * progress).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { nextTick } from "vue";
import CharacterPanel from "./CharacterPanel.vue";
import CharacterStates from "./CharacterStates.vue";
import CharacterKnowledge from "./CharacterKnowledge.vue";
import CharacterArcs from "./CharacterArcs.vue";
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

// Spy on t so interpolation params are asserted directly. workspace.*
// keys exist in en.ts now, so rendered text is real English.
const { tMock } = vi.hoisted(() => ({ tMock: vi.fn() }));
tMock.mockImplementation(
  (path: string, params?: Record<string, string | number>) => tFor(en)(path, params),
);

vi.mock("../../composables/useLocale", () => ({
  useLocale: () => ({
    t: tMock,
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
  {
    id: "c1",
    key: "elena-marlowe",
    name: "Elena Marlowe",
    summary: "A cartographer.",
    storyEntityId: null,
  },
  {
    id: "c2",
    key: "dain",
    name: "Dain",
    summary: null,
    storyEntityId: "se-9",
  },
];

const STATES = [
  {
    id: "s1",
    characterId: "c1",
    fromChapter: 1,
    toChapter: 10,
    summary: "Apprentice years.",
  },
];

const KNOWLEDGE = [
  {
    id: "k1",
    characterId: "c1",
    factId: "11111111-1111-1111-1111-111111111111",
    stance: "KNOWN",
    source: "REMEMBERED",
    fromChapter: 1,
    toChapter: null,
  },
];

const ARCS = [{ id: "a1", characterId: "c1", status: "ACTIVE", title: "The Long Road" }];

type Route = (url: string, init?: RequestInit) => Response | undefined;

/** Default happy-path router; tests override individual routes. */
function happyRouter(): Route {
  return (url, init) => {
    const method = (init?.method ?? "GET").toUpperCase();
    const u = new URL(url, "http://x");
    const p = u.pathname;
    if (p === "/api/workspaces/w1/novels/n1/characters") {
      if (method === "GET") return json(CHARS);
      const b = JSON.parse(String(init?.body));
      return json(
        { id: "c3", key: b.key, name: b.name, summary: b.summary, storyEntityId: null },
        201,
      );
    }
    if (p === "/api/workspaces/w1/novels/n1/characters/c1" && method === "DELETE")
      return noContent();
    if (p === "/api/workspaces/w1/novels/n1/characters/c1/states") {
      if (method === "GET") return json(STATES);
      return json({ id: "s2", characterId: "c1", ...JSON.parse(String(init?.body)) }, 201);
    }
    if (p === "/api/workspaces/w1/novels/n1/characters/c1/states/at") {
      const ch = u.searchParams.get("chapter");
      return json(ch === "5" ? STATES[0] : null);
    }
    if (p === "/api/workspaces/w1/novels/n1/characters/c1/knowledge") {
      if (method === "GET") return json(KNOWLEDGE);
      return json({ id: "k2", characterId: "c1", ...JSON.parse(String(init?.body)) }, 201);
    }
    if (p === "/api/workspaces/w1/novels/n1/characters/c1/knowledge/access") {
      const fid = u.searchParams.get("factId");
      return json(
        fid === "11111111-1111-1111-1111-111111111111"
          ? { accessible: true, stance: "KNOWN", source: "REMEMBERED" }
          : { accessible: false, stance: "UNKNOWN", source: null },
      );
    }
    if (p === "/api/workspaces/w1/novels/n1/characters/c1/arcs") {
      if (method === "GET") return json(ARCS);
      const b = JSON.parse(String(init?.body));
      return json({ id: "a2", characterId: "c1", status: b.status, title: b.title }, 201);
    }
    if (p === "/api/workspaces/w1/novels/n1/arcs/a1/milestones" && method === "POST") {
      const b = JSON.parse(String(init?.body));
      return json({ id: "m1", arcId: "a1", chapter: b.chapter, summary: b.summary }, 201);
    }
    if (p === "/api/workspaces/w1/novels/n1/arcs/a1/progress") {
      return json({
        reached: [{ id: "m1", arcId: "a1", chapter: 5, summary: "Leaves home." }],
        total: 2,
        latest: { id: "m1", arcId: "a1", chapter: 5, summary: "Leaves home." },
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
  tMock.mockClear();
});

const panelProps = { workspaceId: "w1", novelId: "n1" };

async function mountPanel() {
  const w = mount(CharacterPanel, { props: panelProps });
  await flushPromises();
  await nextTick();
  return w;
}

describe("CharacterPanel", () => {
  it("renders tabs and the character list (happy path)", async () => {
    installRouter(happyRouter());
    const w = await mountPanel();
    const text = w.text();
    expect(text).toContain("Elena Marlowe");
    expect(text).toContain("Dain");
    expect(w.find('[data-testid="character-tab-characters"]').exists()).toBe(true);
    expect(w.find('[data-testid="character-tab-states"]').exists()).toBe(true);
    expect(w.find('[data-testid="character-tab-knowledge"]').exists()).toBe(true);
    expect(w.find('[data-testid="character-tab-arcs"]').exists()).toBe(true);
    // Sheet shows the no-edit honesty note area only after selection; the
    // select-first notice is visible instead.
    expect(w.find('[data-testid="select-character-first"]').exists()).toBe(true);
  });

  it("selects a character and shows its sheet with the read-only entity link", async () => {
    installRouter(happyRouter());
    const w = await mountPanel();
    await w.find('[data-testid="character-select-c2"]').trigger("click");
    await nextTick();
    expect(w.find('[data-testid="character-sheet-name"]').text()).toBe("Dain");
    expect(w.find('[data-testid="character-sheet-entity"]').text()).toBe("se-9");
    // No-edit note is honest about GAP-058.
    expect(w.find('[data-testid="character-sheet-noedit"]').exists()).toBe(true);
  });

  it("shows an error with retry on 403 and recovers", async () => {
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
    await w.find('[data-testid="character-list"] button').trigger("click");
    await flushPromises();
    await nextTick();
    expect(w.text()).toContain("Elena Marlowe");
  });

  it("creates a character: validates key client-side, POSTs, refetches", async () => {
    installRouter(happyRouter());
    const w = await mountPanel();
    const form = w.find('[data-testid="character-create-form"]');
    await form.find('[data-testid="character-key-input"]').setValue("Bad Key!");
    await form.find('[data-testid="character-name-input"]').setValue("Bad");
    await form.trigger("submit");
    await nextTick();
    expect(w.text()).toContain("Key must be 1–120 lowercase letters/digits");
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/characters"),
      expect.objectContaining({ method: "POST" }),
    );

    await form.find('[data-testid="character-key-input"]').setValue("bad-key");
    await form.find('[data-testid="character-name-input"]').setValue("Bad");
    await form.find('[data-testid="character-summary-input"]').setValue("S");
    await form.trigger("submit");
    await flushPromises();
    await nextTick();
    const post = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit)?.method === "POST",
    );
    expect(post).toBeTruthy();
    expect(JSON.parse(String((post![1] as RequestInit).body))).toEqual({
      key: "bad-key",
      name: "Bad",
      summary: "S",
    });
    // Refetch after create: GET characters called at least twice.
    const gets = fetchMock.mock.calls.filter(
      ([url, init]) =>
        typeof url === "string" &&
        url.startsWith("/api/workspaces/w1/novels/n1/characters?") &&
        !(init as RequestInit)?.method,
    );
    expect(gets.length).toBeGreaterThanOrEqual(2);
  });

  it("delete requires explicit confirmation: cancel keeps, confirm deletes", async () => {
    installRouter(happyRouter());
    const w = await mountPanel();

    // Open the confirm strip.
    await w.find('[data-testid="character-delete-c1"]').trigger("click");
    await nextTick();
    const strip = w.find('[data-testid="character-confirm-c1"]');
    expect(strip.exists()).toBe(true);
    // The name is interpolated into the confirm copy; assert the t() params.
    expect(tMock).toHaveBeenCalledWith(
      "workspace.characters.delete.confirmBody",
      { name: "Elena Marlowe" },
    );

    // Cancel: strip closes, no DELETE issued.
    const buttons = strip.findAll("button");
    await buttons[1]!.trigger("click"); // Cancel
    await nextTick();
    expect(w.find('[data-testid="character-confirm-c1"]').exists()).toBe(false);
    expect(
      fetchMock.mock.calls.some(
        ([, init]) => (init as RequestInit)?.method === "DELETE",
      ),
    ).toBe(false);

    // Confirm: DELETE issued.
    await w.find('[data-testid="character-delete-c1"]').trigger("click");
    await nextTick();
    await w.find('[data-testid="character-confirm-yes-c1"]').trigger("click");
    await flushPromises();
    await nextTick();
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          url === "/api/workspaces/w1/novels/n1/characters/c1" &&
          (init as RequestInit)?.method === "DELETE",
      ),
    ).toBe(true);
  });

  it("surfaces delete 404 honestly inside the confirm strip", async () => {
    installRouter((url, init) => {
      const u = new URL(url, "http://x");
      if (
        u.pathname === "/api/workspaces/w1/novels/n1/characters/c1" &&
        init?.method === "DELETE"
      )
        return apiErr("NOT_FOUND", 404);
      return happyRouter()(url, init);
    });
    const w = await mountPanel();
    await w.find('[data-testid="character-delete-c1"]').trigger("click");
    await nextTick();
    await w.find('[data-testid="character-confirm-yes-c1"]').trigger("click");
    await flushPromises();
    await nextTick();
    expect(w.find('[data-testid="character-confirm-c1"]').text()).toContain("Not found — it may have been deleted.");
  });

  it("switches tabs with arrow keys (roving tabindex)", async () => {
    installRouter(happyRouter());
    const w = await mountPanel();
    const tabs = w.find('[data-testid="character-tab-characters"]');
    await tabs.trigger("keydown", { key: "ArrowRight" });
    await nextTick();
    expect(
      w.find('[data-testid="character-tab-states"]').attributes("aria-selected"),
    ).toBe("true");
  });
});

describe("CharacterStates", () => {
  const props = { ...panelProps, characterId: "c1", characterName: "Elena Marlowe" };

  it("lists spans, surfaces 409 overlap honestly, and looks up at-chapter", async () => {
    installRouter((url, init) => {
      const u = new URL(url, "http://x");
      if (
        u.pathname === "/api/workspaces/w1/novels/n1/characters/c1/states" &&
        init?.method === "POST"
      )
        return apiErr("STATE_OVERLAP", 409);
      return happyRouter()(url, init);
    });
    const w = mount(CharacterStates, { props });
    await flushPromises();
    await nextTick();
    expect(w.find('[data-testid="states-list"]').text()).toContain("Apprentice years.");

    const form = w.find('[data-testid="state-create-form"]');
    await form.find('[data-testid="state-from-input"]').setValue("5");
    await form.find('[data-testid="state-to-input"]').setValue("8");
    await form.find('[data-testid="state-summary-input"]').setValue("Overlap.");
    await form.trigger("submit");
    await flushPromises();
    await nextTick();
    expect(w.find('[data-testid="state-submit-error"]').text()).toContain("That chapter range overlaps an existing state.");

    const at = w.find('[data-testid="state-at-form"]');
    await at.find('[data-testid="state-at-input"]').setValue("5");
    await at.trigger("submit");
    await flushPromises();
    await nextTick();
    expect(w.find('[data-testid="state-at-result"]').text()).toContain("Apprentice years.");

    await at.find('[data-testid="state-at-input"]').setValue("99");
    await at.trigger("submit");
    await flushPromises();
    await nextTick();
    expect(w.find('[data-testid="state-at-result"]').text()).toContain("No state recorded at chapter");
  });

  it("rejects a bad chapter range client-side", async () => {
    installRouter(happyRouter());
    const w = mount(CharacterStates, { props });
    await flushPromises();
    const form = w.find('[data-testid="state-create-form"]');
    await form.find('[data-testid="state-from-input"]').setValue("10");
    await form.find('[data-testid="state-to-input"]').setValue("5");
    await form.find('[data-testid="state-summary-input"]').setValue("X");
    await form.trigger("submit");
    await nextTick();
    expect(w.text()).toContain("The to chapter can't be before the from chapter.");
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/states"),
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("CharacterKnowledge", () => {
  const props = { ...panelProps, characterId: "c1", characterName: "Elena Marlowe" };
  const FID = "11111111-1111-1111-1111-111111111111";

  it("validates the fact UUID client-side, creates, and checks access verdicts", async () => {
    installRouter(happyRouter());
    const w = mount(CharacterKnowledge, { props });
    await flushPromises();
    await nextTick();
    expect(w.find('[data-testid="knowledge-list"]').text()).toContain(FID);

    const form = w.find('[data-testid="knowledge-create-form"]');
    await form.find('[data-testid="knowledge-fact-input"]').setValue("not-a-uuid");
    await form.find('[data-testid="knowledge-from-input"]').setValue("1");
    await form.trigger("submit");
    await nextTick();
    expect(w.text()).toContain("Fact ID must be a valid UUID.");

    await form.find('[data-testid="knowledge-fact-input"]').setValue(FID);
    await form.trigger("submit");
    await flushPromises();
    await nextTick();
    const post = fetchMock.mock.calls.find(
      ([url, init]) =>
        url === "/api/workspaces/w1/novels/n1/characters/c1/knowledge" &&
        (init as RequestInit)?.method === "POST",
    );
    expect(post).toBeTruthy();
    expect(JSON.parse(String((post![1] as RequestInit).body))).toMatchObject({
      factId: FID,
      stance: "KNOWN",
      source: "REMEMBERED",
      fromChapter: 1,
      toChapter: null,
    });

    const access = w.find('[data-testid="knowledge-access-form"]');
    await access.find('[data-testid="knowledge-access-fact-input"]').setValue(FID);
    await access.find('[data-testid="knowledge-access-chapter-input"]').setValue("3");
    await access.trigger("submit");
    await flushPromises();
    await nextTick();
    expect(w.find('[data-testid="knowledge-access-result"]').text()).toContain("holds this fact as");

    await access.find('[data-testid="knowledge-access-fact-input"]').setValue(
      "22222222-2222-2222-2222-222222222222",
    );
    await access.trigger("submit");
    await flushPromises();
    await nextTick();
    expect(w.find('[data-testid="knowledge-access-result"]').text()).toContain("has no access to this fact");
  });
});

describe("CharacterArcs", () => {
  const props = { ...panelProps, characterId: "c1", characterName: "Elena Marlowe" };

  it("creates an arc, adds a milestone, and reads progress at chapter", async () => {
    installRouter(happyRouter());
    const w = mount(CharacterArcs, { props });
    await flushPromises();
    await nextTick();
    expect(w.find('[data-testid="arcs-list"]').text()).toContain("The Long Road");

    const form = w.find('[data-testid="arc-create-form"]');
    await form.find('[data-testid="arc-title-input"]').setValue("A New Arc");
    await form.trigger("submit");
    await flushPromises();
    await nextTick();
    const post = fetchMock.mock.calls.find(
      ([url, init]) =>
        url === "/api/workspaces/w1/novels/n1/characters/c1/arcs" &&
        (init as RequestInit)?.method === "POST",
    );
    expect(post).toBeTruthy();

    await w.find('[data-testid="arc-toggle-a1"]').trigger("click");
    await nextTick();
    const mform = w.find('[data-testid="milestone-form-a1"]');
    const inputs = mform.findAll("input");
    await inputs[0]!.setValue("12");
    await inputs[1]!.setValue("A turning point.");
    await mform.trigger("submit");
    await flushPromises();
    await nextTick();
    const mpost = fetchMock.mock.calls.find(
      ([url, init]) =>
        url === "/api/workspaces/w1/novels/n1/arcs/a1/milestones" &&
        (init as RequestInit)?.method === "POST",
    );
    expect(mpost).toBeTruthy();
    expect(JSON.parse(String((mpost![1] as RequestInit).body))).toEqual({
      chapter: 12,
      summary: "A turning point.",
    });

    const pform = w.find('[data-testid="progress-form-a1"]');
    await pform.find("input").setValue("10");
    await pform.trigger("submit");
    await flushPromises();
    await nextTick();
    const result = w.find('[data-testid="progress-result-a1"]');
    expect(result.text()).toContain("milestones reached");
    expect(result.text()).toContain("Leaves home.");
  });

  it("requires a title client-side", async () => {
    installRouter(happyRouter());
    const w = mount(CharacterArcs, { props });
    await flushPromises();
    await w.find('[data-testid="arc-create-form"]').trigger("submit");
    await nextTick();
    expect(w.text()).toContain("Title is required");
  });
});
