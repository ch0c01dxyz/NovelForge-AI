/**
 * Component tests for the NF-WF-016 World & Lore and Canon Review panels.
 *
 * Mocks at the HTTP boundary (global.fetch) plus useLocale key-echo, per the
 * apps/web test convention. English in code/tests/comments.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { nextTick } from "vue";
import EntityBrowser from "./EntityBrowser.vue";
import FactList from "./FactList.vue";
import FactEditor from "./FactEditor.vue";
import WorldPanel from "./WorldPanel.vue";
import ProposalReview from "./ProposalReview.vue";
import CanonReviewPanel from "./CanonReviewPanel.vue";
import type { CanonFact } from "./canon-types";

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

const WS = "11111111-1111-1111-1111-111111111111";
const NOVEL = "22222222-2222-2222-2222-222222222222";
const E1 = "33333333-3333-3333-3333-333333333333";
const E2 = "44444444-4444-4444-4444-444444444444";
const F1 = "55555555-5555-5555-5555-555555555555";
const CV = "66666666-6666-6666-6666-666666666666";
const P1 = "77777777-7777-7777-7777-777777777777";

type Resp = { status: number; body: unknown };
type Handler = (url: string, init?: RequestInit) => Resp | Promise<Resp>;

function installFetch(handler: Handler) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const r = await handler(url, init);
      return {
        ok: r.status >= 200 && r.status < 300,
        status: r.status,
        json: async () => r.body,
      };
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

const json = (body: unknown, status = 200): Resp => ({ status, body });
const err = (code: string, status: number): Resp => ({ status, body: { error: code } });

const entities = [
  { id: E1, kind: "CHARACTER", name: "Kael", key: "kael" },
  { id: E2, kind: "LOCATION", name: "Ember Court", key: "ember-court" },
];

const fact1: CanonFact = {
  id: F1,
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
      chapterVersionId: CV,
      referenceVersionId: null,
    },
  ],
};

async function settle(ms = 0) {
  await flushPromises();
  await nextTick();
  if (ms) await new Promise((r) => setTimeout(r, ms));
}

function postCalls(calls: Array<{ url: string; init?: RequestInit }>, method: string) {
  return calls.filter((c) => c.init?.method === method);
}

describe("EntityBrowser", () => {
  it("browses entities by kind", async () => {
    const calls = installFetch((url) => {
      if (url.includes("/canon/entities")) {
        const u = new URL(url, "http://x");
        const kind = u.searchParams.get("kind");
        return json(kind ? entities.filter((e) => e.kind === kind) : entities);
      }
      return json(null, 404);
    });
    const w = mount(EntityBrowser, { props: { workspaceId: WS, novelId: NOVEL } });
    await settle();
    expect(w.text()).toContain("Kael");
    expect(w.text()).toContain("Ember Court");

    const locationRadio = w
      .findAll('[role="radio"]')
      .find((b) => b.text().includes("entities.kind.LOCATION"))!;
    await locationRadio.trigger("click");
    await settle();
    const last = calls[calls.length - 1]!;
    expect(last.url).toContain("kind=LOCATION");
    expect(w.text()).not.toContain("Kael");
    expect(w.text()).toContain("Ember Court");
    w.unmount();
  });

  it("surfaces the 409 message when a cited entity cannot be deleted", async () => {
    installFetch((url, init) => {
      if (url.includes("/canon/entities") && init?.method === "DELETE") return err("CONFLICT", 409);
      if (url.includes("/canon/entities")) return json(entities);
      return json(null, 404);
    });
    const w = mount(EntityBrowser, { props: { workspaceId: WS, novelId: NOVEL } });
    await settle();
    // Open the inline delete confirmation for the first row, then confirm.
    const rows = w.findAll("li");
    await rows[0]!.findAll("button")[1]!.trigger("click");
    await nextTick();
    expect(w.text()).toContain("workspace.world.entities.confirmDelete");
    const confirmBtn = w
      .findAll("button")
      .find((b) => b.text().includes("workspace.world.entities.confirmYes"))!;
    await confirmBtn.trigger("click");
    await settle();
    // 409 CONFLICT -> the honest server reason, not a generic error.
    expect(w.text()).toContain("workspace.world.entities.deleteConflict");
    expect(w.emitted("changed")).toBeUndefined();
    w.unmount();
  });

  it("creates an entity and refreshes", async () => {
    const calls = installFetch((url, init) => {
      if (url.includes("/canon/entities") && init?.method === "POST") return json({ id: E1 }, 201);
      if (url.includes("/canon/entities")) return json(entities);
      return json(null, 404);
    });
    const w = mount(EntityBrowser, { props: { workspaceId: WS, novelId: NOVEL } });
    await settle();
    await w.findAll("button").find((b) => b.text().includes("workspace.world.entities.new"))!.trigger("click");
    await nextTick();
    const inputs = w.findAll("form input");
    await inputs[0]!.setValue("Mira");
    await w.find("form").trigger("submit.prevent");
    await settle();
    const posts = postCalls(calls, "POST");
    expect(posts).toHaveLength(1);
    expect(JSON.parse(posts[0]!.init!.body as string)).toMatchObject({ name: "Mira" });
    expect(w.emitted("changed")).toHaveLength(1);
    w.unmount();
  });
});

describe("FactList", () => {
  it("navigates every fact page and resets the cursor when filters change", async () => {
    const second = { ...fact1, id: CV, statement: "Kael lives at the Ember Court." };
    const calls = installFetch((url) => {
      if (!url.includes("/canon/facts?")) return json(null, 404);
      const query = new URL(url, "https://example.test").searchParams;
      expect(query.get("limit")).toBe("100");
      return json(query.has("cursor")
        ? { facts: [second], withheldCount: 0, nextCursor: null }
        : { facts: [fact1], withheldCount: 0, nextCursor: F1 });
    });
    const w = mount(FactList, { props: { workspaceId: WS, novelId: NOVEL } });
    const pageButton = (name: string) => w.findAll("button").find((button) => button.text().includes(`workspace.world.facts.${name}`))!;
    await settle();
    expect(w.text()).toContain(fact1.statement);
    expect(pageButton("previousPage").attributes("disabled")).toBeDefined();
    await pageButton("nextPage").trigger("click");
    await settle();
    expect(w.text()).toContain(second.statement);
    expect(w.text()).not.toContain(fact1.statement);
    expect(pageButton("nextPage").attributes("disabled")).toBeDefined();
    expect(calls.at(-1)!.url).toContain(`cursor=${F1}`);
    await pageButton("previousPage").trigger("click");
    await settle();
    expect(w.text()).toContain(fact1.statement);
    expect(new URL(calls.at(-1)!.url, "https://example.test").searchParams.has("cursor")).toBe(false);
    await pageButton("nextPage").trigger("click");
    await settle();
    await w.find("input[type=checkbox]").setValue(true);
    await settle();
    let query = new URL(calls.at(-1)!.url, "https://example.test").searchParams;
    expect(query.has("cursor")).toBe(false);
    expect(query.get("includeSuperseded")).toBe("true");
    await pageButton("nextPage").trigger("click");
    await settle();
    await w.setProps({ entityId: E2 });
    await settle();
    query = new URL(calls.at(-1)!.url, "https://example.test").searchParams;
    expect(query.has("cursor")).toBe(false);
    expect(query.get("entityId")).toBe(E2);
    w.unmount();
  });

  function mountList(facts: CanonFact[] = [fact1]) {
    const calls = installFetch((url, init) => {
      if (url.includes("/canon/facts/") && url.endsWith("/retract") && init?.method === "POST")
        return { status: 204, body: undefined };
      if (url.includes("/canon/facts?")) {
        expect(url).toContain("mode=AUTHOR");
        return json({ facts, withheldCount: 0 });
      }
      return json(null, 404);
    });
    const w = mount(FactList, { props: { workspaceId: WS, novelId: NOVEL } });
    return { w, calls };
  }

  it("renders facts with evidence quotes as text and retracts with confirmation", async () => {
    const { w, calls } = mountList();
    await settle();
    expect(w.text()).toContain("Kael wields the Ember Blade.");
    expect(w.text()).toContain("Kael lifted the Ember Blade.");

    // First click only opens the confirmation — no request yet.
    await w.findAll("button").find((b) => b.text().includes("workspace.world.facts.retract"))!.trigger("click");
    await nextTick();
    expect(postCalls(calls, "POST")).toHaveLength(0);
    expect(w.text()).toContain("workspace.world.facts.retractTitle");

    await w.find("input[maxlength='2000']").setValue("miscopied quote");
    await w
      .findAll("button")
      .find((b) => b.text().includes("workspace.world.facts.retractConfirm"))!
      .trigger("click");
    await settle();
    const posts = postCalls(calls, "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0]!.url).toContain(`/canon/facts/${F1}/retract`);
    expect(JSON.parse(posts[0]!.init!.body as string)).toEqual({ reason: "miscopied quote" });
    expect(w.emitted("changed")).toHaveLength(1);
    w.unmount();
  });

  it("shows a 409 retract conflict honestly", async () => {
    const calls = installFetch((url) => {
      if (url.includes("/retract")) return err("CONFLICT", 409);
      if (url.includes("/canon/facts?")) return json({ facts: [fact1], withheldCount: 0 });
      return json(null, 404);
    });
    const w = mount(FactList, { props: { workspaceId: WS, novelId: NOVEL } });
    await settle();
    await w.findAll("button").find((b) => b.text().includes("workspace.world.facts.retract"))!.trigger("click");
    await nextTick();
    await w.findAll("button").find((b) => b.text().includes("workspace.world.facts.retractConfirm"))!.trigger("click");
    await settle();
    expect(postCalls(calls, "POST")).toHaveLength(1);
    expect(w.text()).toContain("workspace.world.facts.retractConflict");
    w.unmount();
  });
});

describe("FactEditor", () => {
  /** FactEditor renders via Teleport to body; dialog content is NOT in wrapper.text(). */
  function dialog() {
    const el = document.body.querySelector('section[role="dialog"]');
    if (!el) throw new Error("dialog not found");
    return el as HTMLElement;
  }
  function dialogText() {
    return document.body.textContent ?? "";
  }

  it("REFUSES fact creation without a citation (Q8 UI rule)", async () => {
    const calls = installFetch((url) => {
      if (url.includes("/canon/entities")) return json(entities);
      return json(null, 404);
    });
    const w = mount(FactEditor, {
      props: { workspaceId: WS, novelId: NOVEL, open: true, mode: "create" },
    });
    await settle();
    const dlg = dialog();
    // Fill everything except the citation.
    const selects = dlg.querySelectorAll("select");
    (selects[0] as HTMLSelectElement).value = E1;
    selects[0]!.dispatchEvent(new Event("change"));
    const predicate = dlg.querySelectorAll("input")[0] as HTMLInputElement;
    predicate.value = "wields";
    predicate.dispatchEvent(new Event("input"));
    const objectText = Array.from(dlg.querySelectorAll("input")).find(
      (i) => i.getAttribute("placeholder") === "workspace.world.editor.objectTextPlaceholder",
    ) as HTMLInputElement;
    objectText.value = "the Ember Blade";
    objectText.dispatchEvent(new Event("input"));
    await nextTick();
    (dlg.querySelector("form") as HTMLFormElement).dispatchEvent(
      new Event("submit", { cancelable: true }),
    );
    await settle();
    expect(dialogText()).toContain("workspace.world.editor.citationRequired");
    expect(postCalls(calls, "POST")).toHaveLength(0);
    w.unmount();
  });

  it("creates a fact with a valid citation", async () => {
    const calls = installFetch((url, init) => {
      if (url.includes("/canon/entities")) return json(entities);
      if (url.includes("/canon/facts") && init?.method === "POST") return json({ id: F1 }, 201);
      return json(null, 404);
    });
    const w = mount(FactEditor, {
      props: { workspaceId: WS, novelId: NOVEL, open: true, mode: "create" },
    });
    await settle();
    const dlg = dialog();
    const selects = dlg.querySelectorAll("select");
    (selects[0] as HTMLSelectElement).value = E1;
    selects[0]!.dispatchEvent(new Event("change"));
    const setInput = (placeholder: string | null, value: string, index = 0) => {
      const list = Array.from(dlg.querySelectorAll("input")).filter((i) =>
        placeholder ? i.getAttribute("placeholder") === placeholder : true,
      );
      const el = list[index] as HTMLInputElement;
      el.value = value;
      el.dispatchEvent(new Event("input"));
    };
    setInput("workspace.world.editor.predicatePlaceholder", "wields");
    setInput("workspace.world.editor.objectTextPlaceholder", "the Ember Blade");
    setInput("workspace.world.editor.versionIdPlaceholder", CV);
    const quote = dlg.querySelector(
      'textarea[placeholder="workspace.world.editor.quotePlaceholder"]',
    ) as HTMLTextAreaElement;
    quote.value = "Kael lifted the Ember Blade.";
    quote.dispatchEvent(new Event("input"));
    const nums = Array.from(dlg.querySelectorAll('input[type="number"]'));
    (nums[nums.length - 2] as HTMLInputElement).value = "10";
    nums[nums.length - 2]!.dispatchEvent(new Event("input"));
    (nums[nums.length - 1] as HTMLInputElement).value = "38";
    nums[nums.length - 1]!.dispatchEvent(new Event("input"));
    await nextTick();
    (dlg.querySelector("form") as HTMLFormElement).dispatchEvent(
      new Event("submit", { cancelable: true }),
    );
    await settle();
    const posts = postCalls(calls, "POST");
    expect(posts).toHaveLength(1);
    const body = JSON.parse(posts[0]!.init!.body as string);
    expect(body).toMatchObject({
      entityId: E1,
      predicate: "wields",
      objectText: "the Ember Blade",
      source: {
        chapterVersionId: CV,
        quote: "Kael lifted the Ember Blade.",
        start: 10,
        end: 38,
      },
    });
    expect(w.emitted("saved")).toHaveLength(1);
    expect(w.emitted("close")).toHaveLength(1);
    w.unmount();
  });

  it("surfaces the live-fact 409 on create", async () => {
    installFetch((url, init) => {
      if (url.includes("/canon/entities")) return json(entities);
      if (url.includes("/canon/facts") && init?.method === "POST") return err("CONFLICT", 409);
      return json(null, 404);
    });
    const w = mount(FactEditor, {
      props: { workspaceId: WS, novelId: NOVEL, open: true, mode: "create" },
    });
    await settle();
    const dlg = dialog();
    const selects = dlg.querySelectorAll("select");
    (selects[0] as HTMLSelectElement).value = E1;
    selects[0]!.dispatchEvent(new Event("change"));
    const setInput = (placeholder: string, value: string) => {
      const el = Array.from(dlg.querySelectorAll("input")).find(
        (i) => i.getAttribute("placeholder") === placeholder,
      ) as HTMLInputElement;
      el.value = value;
      el.dispatchEvent(new Event("input"));
    };
    setInput("workspace.world.editor.predicatePlaceholder", "wields");
    setInput("workspace.world.editor.objectTextPlaceholder", "the Ember Blade");
    setInput("workspace.world.editor.versionIdPlaceholder", CV);
    const quote = dlg.querySelector(
      'textarea[placeholder="workspace.world.editor.quotePlaceholder"]',
    ) as HTMLTextAreaElement;
    quote.value = "Kael lifted the Ember Blade.";
    quote.dispatchEvent(new Event("input"));
    const nums = Array.from(dlg.querySelectorAll('input[type="number"]'));
    (nums[nums.length - 2] as HTMLInputElement).value = "10";
    nums[nums.length - 2]!.dispatchEvent(new Event("input"));
    (nums[nums.length - 1] as HTMLInputElement).value = "38";
    nums[nums.length - 1]!.dispatchEvent(new Event("input"));
    await nextTick();
    (dlg.querySelector("form") as HTMLFormElement).dispatchEvent(
      new Event("submit", { cancelable: true }),
    );
    await settle();
    expect(dialogText()).toContain("workspace.world.editor.factConflict");
    w.unmount();
  });

  it("attaches and detaches a citation in sources mode", async () => {
    const sourceId = "88888888-8888-8888-8888-888888888888";
    const calls = installFetch((url, init) => {
      if (url.includes(`/canon/facts/${F1}/sources/`) && init?.method === "DELETE")
        return { status: 204, body: undefined };
      if (url.includes(`/canon/facts/${F1}/sources`) && init?.method === "POST")
        return json({ id: sourceId }, 201);
      return json(null, 404);
    });
    const w = mount(FactEditor, {
      props: {
        workspaceId: WS,
        novelId: NOVEL,
        open: true,
        mode: "sources",
        fact: fact1,
        knownIds: {},
      },
    });
    await settle();
    const dlg = dialog();
    // The listed source has no id -> detach unavailable note, no detach button.
    expect(dialogText()).toContain("workspace.world.facts.citationDetachUnavailable");

    // Attach a new citation.
    const versionInput = Array.from(dlg.querySelectorAll("input")).find(
      (i) => i.getAttribute("placeholder") === "workspace.world.editor.versionIdPlaceholder",
    ) as HTMLInputElement;
    versionInput.value = CV;
    versionInput.dispatchEvent(new Event("input"));
    const quote = dlg.querySelector(
      'textarea[placeholder="workspace.world.editor.quotePlaceholder"]',
    ) as HTMLTextAreaElement;
    quote.value = "The blade sang.";
    quote.dispatchEvent(new Event("input"));
    const nums = Array.from(dlg.querySelectorAll('input[type="number"]'));
    (nums[0] as HTMLInputElement).value = "0";
    nums[0]!.dispatchEvent(new Event("input"));
    (nums[1] as HTMLInputElement).value = "14";
    nums[1]!.dispatchEvent(new Event("input"));
    await nextTick();
    const attachBtn = Array.from(dlg.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("workspace.world.editor.attach"),
    ) as HTMLButtonElement;
    attachBtn.click();
    await settle();

    const posts = postCalls(calls, "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0]!.url).toContain(`/canon/facts/${F1}/sources`);
    expect(JSON.parse(posts[0]!.init!.body as string)).toMatchObject({
      chapterVersionId: CV,
      quote: "The blade sang.",
      start: 0,
      end: 14,
    });
    expect(w.emitted("source-attached")).toHaveLength(1);
    // The parent feeds the learned id back via the knownIds prop (props/emits).
    const [, fingerprint, newId] = w.emitted("source-attached")![0] as [string, string, string];
    expect(newId).toBe(sourceId);
    await w.setProps({ knownIds: { [fingerprint]: newId } });
    await nextTick();

    // The newly attached source is detachable (id known from the 201).
    // Detach is destructive: the first click opens the confirmation, the
    // second (detachYes) issues the DELETE.
    const detachBtn = Array.from(dlg.querySelectorAll("button")).find((b) =>
      b.textContent === "workspace.world.editor.detach",
    ) as HTMLButtonElement;
    expect(detachBtn).toBeTruthy();
    detachBtn.click();
    await nextTick();
    expect(dialogText()).toContain("workspace.world.editor.detachConfirm");
    const detachYes = Array.from(dlg.querySelectorAll("button")).find((b) =>
      b.textContent === "workspace.world.editor.detachYes",
    ) as HTMLButtonElement;
    expect(detachYes).toBeTruthy();
    detachYes.click();
    await settle();
    const dels = calls.filter((c) => c.init?.method === "DELETE");
    expect(dels).toHaveLength(1);
    expect(dels[0]!.url).toContain(`/canon/facts/${F1}/sources/${sourceId}`);
    expect(w.emitted("source-detached")).toHaveLength(1);
    w.unmount();
  });

  it("closes on Escape", async () => {
    installFetch(() => json([]));
    const w = mount(FactEditor, {
      props: { workspaceId: WS, novelId: NOVEL, open: true, mode: "create" },
      attachTo: document.body,
    });
    await settle();
    expect(document.body.querySelector('section[role="dialog"]')).toBeTruthy();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await nextTick();
    expect(w.emitted("close")).toHaveLength(1);
    w.unmount();
  });
});

describe("WorldPanel", () => {
  it("switches tabs and filters facts by the selected entity", async () => {
    const calls = installFetch((url) => {
      if (url.includes("/canon/entities")) return json(entities);
      if (url.includes("/canon/facts?")) return json({ facts: [fact1], withheldCount: 0 });
      return json(null, 404);
    });
    const w = mount(WorldPanel, { props: { workspaceId: WS, novelId: NOVEL } });
    await settle();
    // Click the first entity row's select button.
    const rowBtn = w.findAll("li button")[0]!;
    await rowBtn.trigger("click");
    await settle();
    expect(w.text()).toContain("workspace.world.entities.selected");
    const last = calls[calls.length - 1]!;
    expect(last.url).toContain(`entityId=${E1}`);
    expect(last.url).toContain("mode=AUTHOR");
    w.unmount();
  });
});

describe("ProposalReview", () => {
  const proposal = {
    id: P1,
    entityId: E1,
    predicate: "wields",
    statement: "Kael wields the Ember Blade.",
    status: "PROPOSED",
    conflictKind: "FUNCTIONAL_CONFLICT",
    conflictsWithFactId: F1,
    canonFactId: null,
  };

  function mountProposals(list: unknown[] = [proposal]) {
    const calls = installFetch((url, init) => {
      if (url.includes("/canon/proposals") && !url.includes("/approve") && !url.includes("/reject"))
        return json(list);
      if (url.includes("/approve") && init?.method === "POST") return json({ canonFactId: F1, supersededFactId: null });
      if (url.includes("/reject") && init?.method === "POST") return { status: 204, body: undefined };
      return json(null, 404);
    });
    const w = mount(ProposalReview, { props: { workspaceId: WS, novelId: NOVEL } });
    return { w, calls };
  }

  it("surfaces the conflict and requires acknowledgment before approving", async () => {
    const { w, calls } = mountProposals();
    await settle();
    expect(w.text()).toContain("workspace.canon.proposals.conflict.FUNCTIONAL_CONFLICT");

    await w.findAll("button").find((b) => b.text().includes("workspace.canon.proposals.approve"))!.trigger("click");
    await nextTick();
    // The row buttons are replaced by the approve confirmation; the confirm
    // button is blocked until the conflict is acknowledged.
    const dialogApprove = w
      .findAll("button")
      .filter((b) => b.text().includes("workspace.canon.proposals.approve"))
      .at(-1)!;
    expect((dialogApprove.element as HTMLButtonElement).disabled).toBe(true);

    await w.find('[role="alertdialog"] input[type="checkbox"]').setValue(true);
    await nextTick();
    expect((dialogApprove.element as HTMLButtonElement).disabled).toBe(false);
    await dialogApprove.trigger("click");
    await settle();

    const posts = postCalls(calls, "POST");
    expect(posts).toHaveLength(1);
    // F4 pin: approve/reject are WORKSPACE-scoped, not novel-scoped.
    expect(posts[0]!.url).toBe(`/api/workspaces/${WS}/canon/proposals/${P1}/approve`);
    w.unmount();
  });

  it("rejects with a note", async () => {
    const { w, calls } = mountProposals();
    await settle();
    await w.findAll("button").find((b) => b.text() === "workspace.canon.proposals.reject")!.trigger("click");
    await nextTick();
    await w.find('input[maxlength="2000"]').setValue("not supported by the text");
    await w
      .findAll("button")
      .find((b) => b.text().includes("workspace.canon.proposals.rejectConfirm"))!
      .trigger("click");
    await settle();
    const posts = postCalls(calls, "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0]!.url).toBe(`/api/workspaces/${WS}/canon/proposals/${P1}/reject`);
    expect(JSON.parse(posts[0]!.init!.body as string)).toEqual({ note: "not supported by the text" });
    w.unmount();
  });

  it("shows the head-mismatch message on approve 409", async () => {
    const calls = installFetch((url) => {
      if (url.includes("/canon/proposals") && !url.includes("/approve")) return json([proposal]);
      if (url.includes("/approve")) return err("CONFLICT", 409);
      return json(null, 404);
    });
    const w = mount(ProposalReview, { props: { workspaceId: WS, novelId: NOVEL } });
    await settle();
    await w.findAll("button").find((b) => b.text().includes("workspace.canon.proposals.approve"))!.trigger("click");
    await nextTick();
    await w.find('[role="alertdialog"] input[type="checkbox"]').setValue(true);
    await nextTick();
    await w
      .findAll("button")
      .filter((b) => b.text().includes("workspace.canon.proposals.approve"))
      .at(-1)!
      .trigger("click");
    await settle();
    expect(postCalls(calls, "POST")).toHaveLength(1);
    expect(w.text()).toContain("workspace.canon.proposals.headMismatch");
    w.unmount();
  });
});

describe("CanonReviewPanel", () => {
  it("reviews an application by ID (read-only; no list route exists)", async () => {
    const appId = "99999999-9999-9999-9999-999999999999";
    const calls = installFetch((url) => {
      if (url.includes("/canon/facts?")) return json({ facts: [], withheldCount: 0 });
      if (url.includes("/canon/proposals")) return json([]);
      if (url.includes(`/canon/applications/${appId}`))
        return json({
          id: appId,
          status: "VALIDATED",
          items: [
            {
              id: "a1",
              claimIndex: 0,
              kind: "FACT",
              text: "Kael wields the Ember Blade.",
              predicate: "wields",
              entity: { id: E1, key: "kael", name: "Kael", kind: "CHARACTER" },
              verdict: "APPLICABLE",
              verdictReasons: [],
              conflictsWithFact: null,
              canonFactId: null,
            },
          ],
        });
      return json(null, 404);
    });
    const w = mount(CanonReviewPanel, { props: { workspaceId: WS, novelId: NOVEL } });
    await settle();
    // Open the Applications tab.
    await w.findAll('[role="tab"]').find((b) => b.text().includes("workspace.canon.tabs.applications"))!.trigger("click");
    await nextTick();
    expect(w.text()).toContain("workspace.canon.applications.noList");

    await w.find('input[placeholder="workspace.canon.applications.applicationIdPlaceholder"]').setValue(appId);
    await w.find("#canon-panel-applications form").trigger("submit.prevent");
    await settle();
    const appCall = calls.find((c) => c.url.includes(`/canon/applications/${appId}`));
    expect(appCall).toBeTruthy();
    expect(w.text()).toContain("Kael wields the Ember Blade.");
    // Missing-key fallback: the component renders the raw verdict.
    expect(w.text()).toContain("APPLICABLE");
    w.unmount();
  });

  it("shows notFound on application 404", async () => {
    installFetch((url) => {
      if (url.includes("/canon/facts?")) return json({ facts: [], withheldCount: 0 });
      if (url.includes("/canon/proposals")) return json([]);
      if (url.includes("/canon/applications/")) return err("NOT_FOUND", 404);
      return json(null, 404);
    });
    const w = mount(CanonReviewPanel, { props: { workspaceId: WS, novelId: NOVEL } });
    await settle();
    await w.findAll('[role="tab"]').find((b) => b.text().includes("workspace.canon.tabs.applications"))!.trigger("click");
    await nextTick();
    await w
      .find('input[placeholder="workspace.canon.applications.applicationIdPlaceholder"]')
      .setValue("99999999-9999-9999-9999-999999999999");
    await w.find("#canon-panel-applications form").trigger("submit.prevent");
    await settle();
    expect(w.text()).toContain("workspace.canon.applications.notFound");
    w.unmount();
  });
});
