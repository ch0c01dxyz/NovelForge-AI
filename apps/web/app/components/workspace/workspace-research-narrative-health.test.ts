/**
 * Workspace research/narrative/health component tests (NF-WF-016).
 *
 * HTTP mocked at the useApi boundary (the 007/013/014 harness pattern);
 * useLocale returns the key path so every assertion names the key it
 * pins. Covers CRUD flows, the non-canon boundary label, SCALE
 * display-only, the memory rebuild confirmation, and 403/404 handling.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { nextTick } from "vue";
import { ApiError } from "../../composables/useApi";
import ResearchPanel from "./ResearchPanel.vue";
import ReferenceLibrary from "./ReferenceLibrary.vue";
import ReferenceIngest from "./ReferenceIngest.vue";
import RetrievalSearch from "./RetrievalSearch.vue";
import NarrativePanel from "./NarrativePanel.vue";
import DnaEditor from "./DnaEditor.vue";
import PolicyList from "./PolicyList.vue";
import Antagonists from "./Antagonists.vue";
import HealthMemoryPanel from "./HealthMemoryPanel.vue";

const apiMock = vi.fn();

vi.mock("../../composables/useApi", () => ({
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

vi.mock("../../composables/useLocale", () => ({
  useLocale: () => ({
    t: (path: string, params?: Record<string, string | number>) => {
      let s = path;
      if (params) for (const [k, v] of Object.entries(params)) s += `|${k}=${v}`;
      return s;
    },
  }),
}));

const props = { workspaceId: "ws-1", novelId: "novel-1" };

const tick = () => nextTick().then(() => flushPromises());

function lastCall(): [string, RequestInit | undefined] {
  const calls = apiMock.mock.calls as Array<[string, RequestInit | undefined]>;
  return calls[calls.length - 1]!;
}

beforeEach(() => {
  apiMock.mockReset();
});

const refList = [
  {
    id: "r1",
    workspaceId: "ws-1",
    novelId: "novel-1",
    key: "court-etiquette",
    title: "Court Etiquette",
    kind: "RESEARCH",
    source: "A manual",
    status: "DRAFT",
    version: 1,
    chunkCount: 0,
    createdAt: "2026-10-06T00:00:00Z",
    updatedAt: "2026-10-06T00:00:00Z",
  },
];

const refDetail = {
  ...refList[0]!,
  content: "Version one text.",
  versions: [
    { id: "v1", version: 1, note: "first", charCount: 17, ingested: false, createdAt: "2026-10-06T00:00:00Z" },
  ],
};

describe("ResearchPanel", () => {
  const auditEntry = {
    id: "a1",
    query: "etiquette",
    mode: "AUTHOR",
    readerChapter: null,
    returnedCount: 3,
    withheldCount: 0,
    retrievers: ["fts", "vector"],
    latencyMs: 12,
    createdAt: "2026-10-06T00:00:00Z",
  };

  it("labels the non-canon boundary and loads the audit list", async () => {
    // The references tab child also fetches on mount; route by path.
    apiMock.mockImplementation(async (path: string) =>
      String(path).includes("/retrievals") ? [auditEntry] : refList,
    );
    const w = mount(ResearchPanel, { props });
    expect(w.text()).toContain("workspace.research.panel.nonCanonBoundary");
    await tick();
    expect(apiMock).toHaveBeenCalledWith("/workspaces/ws-1/retrievals?limit=50");
    await w.findAll('[role="tab"]')[2]!.trigger("click");
    expect(w.text()).toContain("etiquette");
  });

  it("switches tabs with keyboard-navigable tab roles", async () => {
    apiMock.mockResolvedValue([]);
    const w = mount(ResearchPanel, { props });
    const tablist = w.find('[role="tablist"]');
    expect(tablist.exists()).toBe(true);
    const tabButtons = w.findAll('[role="tab"]');
    expect(tabButtons).toHaveLength(3);
    await tabButtons[1]!.trigger("click");
    expect(tabButtons[1]!.attributes("aria-selected")).toBe("true");
    await tabButtons[1]!.trigger("keydown", { key: "ArrowRight" });
    expect(tabButtons[2]!.attributes("aria-selected")).toBe("true");
  });

  it("maps a 403 audit failure to the forbidden message", async () => {
    apiMock.mockImplementation(async (path: string) => {
      if (String(path).includes("/retrievals")) throw new ApiError("FORBIDDEN", 403);
      return refList;
    });
    const w = mount(ResearchPanel, { props });
    await tick();
    await w.findAll('[role="tab"]')[2]!.trigger("click");
    await tick();
    const alert = w.find('[role="tab"] + div, [role="tabpanel"]').find('[role="alert"]');
    expect(alert.exists()).toBe(true);
    expect(alert.text()).toContain("workspace.research.errors.forbidden");
  });
});

describe("ReferenceLibrary", () => {
  it("lists references and creates one", async () => {
    apiMock.mockResolvedValueOnce(refList);
    const w = mount(ReferenceLibrary, { props });
    await tick();
    expect(w.text()).toContain("Court Etiquette");

    await w.findAll("button")[0]!.trigger("click"); // new reference toggle
    const inputs = w.findAll("input");
    await inputs[0]!.setValue("new-key");
    await inputs[1]!.setValue("New Title");
    apiMock.mockResolvedValueOnce({ ...refList[0]!, id: "r2", key: "new-key", title: "New Title" });
    await w.find("form").trigger("submit.prevent");
    await tick();
    expect(apiMock).toHaveBeenCalledWith(
      "/workspaces/ws-1/references",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse(lastCall()[1]!.body as string);
    expect(body).toMatchObject({ key: "new-key", title: "New Title", novelId: "novel-1" });
  });

  it("refuses an invalid reference key client-side without calling the API", async () => {
    apiMock.mockResolvedValueOnce([]);
    const w = mount(ReferenceLibrary, { props });
    await tick();
    await w.findAll("button")[0]!.trigger("click");
    await w.findAll("input")[0]!.setValue("Bad Key!");
    await w.findAll("input")[1]!.setValue("T");
    await w.find("form").trigger("submit.prevent");
    await tick();
    expect(apiMock).toHaveBeenCalledTimes(1); // the initial list only
    expect(w.find('[role="alert"]').text()).toContain("workspace.research.library.keyInvalid");
  });

  it("opens the reference detail shell on selection", async () => {
    apiMock.mockResolvedValueOnce(refList);
    const w = mount(ReferenceLibrary, { props });
    await tick();
    apiMock.mockResolvedValueOnce(refDetail);
    await w.findAll("ul button")[0]!.trigger("click");
    await tick();
    expect(apiMock).toHaveBeenCalledWith("/references/r1");
    expect(w.text()).toContain("Court Etiquette");
  });
});

describe("ReferenceIngest", () => {
  it("adds a version, then publishes only after explicit confirmation", async () => {
    apiMock.mockResolvedValueOnce(refDetail);
    const w = mount(ReferenceIngest, { props: { referenceId: "r1" } });
    await tick();

    // add version
    await w
      .findAll("button")
      .find((b) => b.text() === "workspace.research.ingest.addVersion")!
      .trigger("click");
    await w.find("form").trigger("submit.prevent"); // empty content -> client-side error
    await tick();
    expect(w.find('[role="alert"]').text()).toContain(
      "workspace.research.ingest.versionContentRequired",
    );

    const ta = w.find("textarea");
    await ta.setValue("second version text");
    apiMock.mockResolvedValueOnce({ id: "v2" });
    apiMock.mockResolvedValueOnce({
      ...refDetail,
      versions: [
        ...refDetail.versions,
        { id: "v2", version: 2, note: null, charCount: 19, ingested: false, createdAt: "" },
      ],
    });
    await w.find("form").trigger("submit.prevent");
    await tick();
    expect(apiMock).toHaveBeenCalledWith(
      "/references/r1/versions",
      expect.objectContaining({ method: "POST" }),
    );

    // publish: first click only opens the confirm step
    await w
      .findAll("button")
      .find((b) => b.text() === "workspace.research.ingest.publish")!
      .trigger("click");
    expect(w.find('[role="alertdialog"]').exists()).toBe(true);
    expect(apiMock).not.toHaveBeenCalledWith(
      "/references/r1/publish",
      expect.objectContaining({ method: "POST" }),
    );
    apiMock.mockResolvedValueOnce({ status: "ok" });
    apiMock.mockResolvedValueOnce({ ...refDetail, status: "ACTIVE" });
    await w.find('[role="alertdialog"]').findAll("button")[0]!.trigger("click");
    await tick();
    expect(apiMock).toHaveBeenCalledWith("/references/r1/publish", { method: "POST" });
  });

  it("triggers ingest per version and displays the result as text", async () => {
    apiMock.mockResolvedValueOnce(refDetail);
    const w = mount(ReferenceIngest, { props: { referenceId: "r1" } });
    await tick();
    apiMock.mockResolvedValueOnce({ chunks: 3, replaced: true });
    await w
      .findAll("button")
      .find((b) => b.text() === "workspace.research.ingest.ingestSubmit")!
      .trigger("click");
    await tick();
    expect(apiMock).toHaveBeenCalledWith(
      "/reference-versions/v1/ingest",
      expect.objectContaining({ method: "POST" }),
    );
    expect(w.find("pre").text()).toContain('"chunks": 3');
  });
});

describe("RetrievalSearch", () => {
  it("requires a query and sends mode AUTHOR", async () => {
    const w = mount(RetrievalSearch, { props });
    await w.find("form").trigger("submit.prevent");
    await tick();
    expect(apiMock).not.toHaveBeenCalled();
    expect(w.find('[role="alert"]').text()).toContain("workspace.research.search.queryRequired");

    await w.find('input[type="text"]').setValue("court etiquette");
    apiMock.mockResolvedValueOnce({
      hits: [
        {
          chunkId: "c1",
          referenceId: "r1",
          referenceVersionId: "v1",
          referenceTitle: "Court Etiquette",
          start: 0,
          end: 42,
          text: "bow before the throne",
          score: 0.9,
          foundBy: ["fts"],
        },
      ],
      withheldCount: 0,
      retrievers: ["fts"],
      mode: "AUTHOR",
      readerChapter: null,
      auditId: "a1",
    });
    await w.find("form").trigger("submit.prevent");
    await tick();
    const body = JSON.parse(lastCall()[1]!.body as string);
    expect(body).toMatchObject({ query: "court etiquette", mode: "AUTHOR", novelId: "novel-1" });
    expect(w.text()).toContain("bow before the throne");
  });

  it("maps a 404 to the not-found message", async () => {
    const w = mount(RetrievalSearch, { props });
    await w.find('input[type="text"]').setValue("x");
    apiMock.mockRejectedValueOnce(new ApiError("NOT_FOUND", 404));
    await w.find("form").trigger("submit.prevent");
    await tick();
    expect(w.find('[role="alert"]').text()).toContain("workspace.research.errors.notFound");
  });
});

describe("DnaEditor", () => {
  it("shows the empty state for null DNA and blocks invalid JSON", async () => {
    apiMock.mockResolvedValueOnce(null);
    const w = mount(DnaEditor, { props });
    await tick();
    expect(w.text()).toContain("workspace.narrative.dna.empty");

    await w.findAll("button")[0]!.trigger("click");
    const ta = w.find("textarea");
    await ta.setValue("{not json");
    await w.find("form").trigger("submit.prevent");
    await tick();
    expect(apiMock).toHaveBeenCalledTimes(1); // no PUT
    expect(w.find('[role="alert"]').text()).toContain("workspace.narrative.dna.invalidJson");
  });

  it("rejects a non-object JSON value", async () => {
    apiMock.mockResolvedValueOnce(null);
    const w = mount(DnaEditor, { props });
    await tick();
    await w.findAll("button")[0]!.trigger("click");
    await w.find("textarea").setValue('["array"]');
    await w.find("form").trigger("submit.prevent");
    await tick();
    expect(w.find('[role="alert"]').text()).toContain("workspace.narrative.dna.objectRequired");
  });

  it("PUTs parsed JSON and confirms the save", async () => {
    apiMock.mockResolvedValueOnce({ tone: "grim" });
    const w = mount(DnaEditor, { props });
    await tick();
    await w.findAll("button")[0]!.trigger("click");
    await w.find("textarea").setValue('{"tone":"grim"}');
    apiMock.mockResolvedValueOnce({ tone: "grim" });
    await w.find("form").trigger("submit.prevent");
    await tick();
    const [path, init] = lastCall();
    expect(path).toBe("/workspaces/ws-1/novels/novel-1/narrative/dna");
    expect(init!.method).toBe("PUT");
    expect(JSON.parse(init!.body as string)).toEqual({ dna: { tone: "grim" } });
    expect(w.text()).toContain("workspace.narrative.dna.saved");
  });
});

describe("PolicyList", () => {
  const policies = [
    { kind: "DRAMA_GAP", hardness: "SOFT", hardReason: null, payload: { window: 5 } },
    { kind: "SCALE", hardness: "HARD", hardReason: "narrative scope", payload: { maxTier: 3 } },
  ];

  it("renders SCALE as display-only: no delete button and a pinned note", async () => {
    apiMock.mockResolvedValueOnce(policies);
    const w = mount(PolicyList, { props });
    await tick();
    expect(w.text()).toContain("workspace.narrative.policies.scaleNote");
    // SCALE payload is shown verbatim; the only delete button belongs to DRAMA_GAP
    expect(w.text()).toContain('"maxTier": 3');
    const deletes = w.findAll("button").filter((b) => b.text() === "workspace.common.delete");
    expect(deletes).toHaveLength(1);
  });

  it("deletes a policy only after explicit confirmation", async () => {
    apiMock.mockResolvedValueOnce(policies);
    const w = mount(PolicyList, { props });
    await tick();
    const del = w.findAll("button").filter((b) => b.text() === "workspace.common.delete")[0]!;
    await del.trigger("click");
    const dialog = w.find('[role="alertdialog"]');
    expect(dialog.exists()).toBe(true);
    expect(dialog.text()).toContain("workspace.narrative.policies.deleteConfirm");
    apiMock.mockResolvedValueOnce(undefined);
    apiMock.mockResolvedValueOnce([policies[1]]);
    await dialog.findAll("button")[0]!.trigger("click");
    await tick();
    expect(apiMock).toHaveBeenCalledWith(
      "/workspaces/ws-1/novels/novel-1/narrative/policies/DRAMA_GAP",
      { method: "DELETE" },
    );
  });
});

describe("Antagonists", () => {
  const chars = [{ id: "ch1", name: "Lord Vane", key: "lord-vane" }];

  it("creates an antagonist against a selected character with 1-based chapters", async () => {
    apiMock.mockResolvedValueOnce([]).mockResolvedValueOnce(chars);
    const w = mount(Antagonists, { props });
    await tick();
    await w.findAll("button")[0]!.trigger("click");
    const selects = w.findAll("select");
    await selects[0]!.setValue("ch1");
    const inputs = w.findAll('input[inputmode="numeric"]');
    await inputs[0]!.setValue("12");
    apiMock.mockResolvedValueOnce({
      id: "a1",
      characterId: "ch1",
      characterName: "Lord Vane",
      role: "MAIN",
      stage: "INTRODUCTION",
      outcome: null,
      purpose: null,
      fromChapter: 12,
      toChapter: null,
    });
    await w.find("form").trigger("submit.prevent");
    await tick();
    const [path, init] = lastCall();
    expect(path).toBe("/workspaces/ws-1/novels/novel-1/narrative/antagonists");
    const body = JSON.parse(init!.body as string);
    expect(body).toMatchObject({ characterId: "ch1", fromChapter: 12 });
  });

  it("advances an antagonist stage", async () => {
    const list = [
      {
        id: "a1",
        characterId: "ch1",
        characterName: "Lord Vane",
        role: "MAIN",
        stage: "INTRODUCTION",
        outcome: null,
        purpose: null,
        fromChapter: 12,
        toChapter: null,
      },
    ];
    apiMock.mockResolvedValueOnce(list).mockResolvedValueOnce(chars);
    const w = mount(Antagonists, { props });
    await tick();
    await w
      .findAll("button")
      .find((b) => b.text() === "workspace.narrative.antagonists.advance")!
      .trigger("click");
    await w.findAll("select")[0]!.setValue("ESCALATION");
    apiMock.mockResolvedValueOnce({ ...list[0]!, stage: "ESCALATION" });
    await w
      .findAll("button")
      .find((b) => b.text() === "workspace.narrative.antagonists.advanceSubmit")!
      .trigger("click");
    await tick();
    expect(apiMock).toHaveBeenCalledWith(
      "/workspaces/ws-1/novels/novel-1/narrative/antagonists/a1/stage",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse(lastCall()[1]!.body as string);
    expect(body).toMatchObject({ stage: "ESCALATION" });
  });
});

describe("NarrativePanel", () => {
  it("renders all five tabs including SCALE and keeps readouts reachable", async () => {
    apiMock.mockResolvedValue(null);
    const w = mount(NarrativePanel, { props });
    const tabs = w.findAll('[role="tab"]');
    expect(tabs).toHaveLength(5);
    expect(tabs.map((t) => t.text())).toEqual([
      "workspace.narrative.panel.tabDna",
      "workspace.narrative.panel.tabPolicies",
      "workspace.narrative.panel.tabAntagonists",
      "workspace.narrative.scaleReview.title",
      "workspace.narrative.panel.tabReadouts",
    ]);
    // SCALE tab is reachable and renders the SCALE review surface.
    await tabs[3]!.trigger("click");
    await tick();
    expect(w.text()).toContain("workspace.narrative.scaleReview.title");
    // Readouts selected by accessible label, not numeric tab index.
    await tabs
      .find((t) => t.text() === "workspace.narrative.panel.tabReadouts")!
      .trigger("click");
    await tick();
    expect(w.text()).toContain("workspace.narrative.readouts.drama.title");
    expect(w.text()).toContain("workspace.narrative.readouts.cooldown.title");
    expect(w.text()).toContain("workspace.narrative.readouts.patterns.title");
  });

  it("runs the drama-window readout and displays the result", async () => {
    apiMock.mockResolvedValue(null);
    const w = mount(NarrativePanel, { props });
    await w
      .findAll('[role="tab"]')
      .find((t) => t.text() === "workspace.narrative.panel.tabReadouts")!
      .trigger("click");
    await w.findAll('input[inputmode="numeric"]')[0]!.setValue("7");
    apiMock.mockResolvedValueOnce({ withinWindow: true });
    await w.findAll("form")[0]!.trigger("submit.prevent");
    await tick();
    expect(apiMock).toHaveBeenCalledWith(
      "/workspaces/ws-1/novels/novel-1/narrative/drama-window",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse(lastCall()[1]!.body as string);
    expect(body).toEqual({ chaptersSinceDrama: 7 });
    expect(w.find("pre").text()).toContain('"withinWindow": true');
  });
});

describe("HealthMemoryPanel", () => {
  const healthResult = {
    findings: [
      {
        rule: "stale-thread",
        severity: "WARNING",
        status: "OPEN",
        evidence: [{ kind: "timelineEvent", id: "t1", chapter: 4, detail: "no event in 6 chapters" }],
        affectedEntities: [{ type: "thread", id: "t1" }],
        remediation: "Resolve or retire the thread.",
        sourceRevisionId: "rev-1",
        evaluatedAt: "2026-10-06T00:00:00Z",
      },
      {
        rule: "orphan-fact",
        severity: "INFO",
        status: "OPEN",
        evidence: [{ kind: "fact", id: "f1" }],
        affectedEntities: [],
        remediation: null,
        sourceRevisionId: "rev-1",
        evaluatedAt: "2026-10-06T00:00:00Z",
      },
    ],
    unresolved: [],
    sourceRevisionId: "rev-1",
  };

  function mountHealth() {
    // onMounted order: loadHealth, loadUnresolved, loadStatus.
    apiMock
      .mockResolvedValueOnce(healthResult)
      .mockResolvedValueOnce({ unresolved: [{ identity: "shadow figure" }] })
      .mockResolvedValueOnce({ statuses: [] });
    return mount(HealthMemoryPanel, { props });
  }

  it("lists findings with severity filter and expandable evidence", async () => {
    const w = mountHealth();
    await tick();
    expect(w.text()).toContain("stale-thread");
    expect(w.text()).toContain("orphan-fact");

    await w.find("select").setValue("CRITICAL");
    await tick();
    expect(w.text()).not.toContain("stale-thread");
    await w.find("select").setValue("ALL");
    await tick();
    expect(w.text()).toContain("stale-thread");

    const toggle = w
      .findAll("button")
      .find((b) => b.text() === "workspace.health.findings.evidenceToggle")!;
    await toggle.trigger("click");
    expect(w.text()).toContain("no event in 6 chapters");
    expect(w.text()).toContain("Resolve or retire the thread.");
  });

  it("lists unresolved identities as cards with re-check and go-to actions", async () => {
    apiMock
      .mockResolvedValueOnce(healthResult)
      .mockResolvedValueOnce({
        unresolved: [
          {
            rule: "UNRESOLVED_IDENTITY",
            severity: "WARNING",
            status: "UNRESOLVED",
            evidence: [
              { kind: "character", id: "c1".padEnd(36, "0"), revisionId: "rev-1", detail: 'character "Bob" has NULL story_entity_id' },
            ],
            affectedEntities: [{ type: "character", id: "c1" }],
            remediation: null,
            sourceRevisionId: "rev-1",
            evaluatedAt: "2026-10-06T00:00:00Z",
          },
        ],
      })
      .mockResolvedValueOnce({ statuses: [] });
    const w = mount(HealthMemoryPanel, { props });
    await tick();
    expect(w.text()).toContain("workspace.health.unresolved.title");
    expect(w.find('[data-testid="unresolved-item-0"]').text()).toContain("has NULL story_entity_id");
    expect(w.find('[data-testid="unresolved-goto-0"]').text()).toContain(
      "workspace.health.unresolved.goto",
    );
    await w.find('[data-testid="unresolved-goto-0"]').trigger("click");
    expect(w.emitted("goto")).toEqual([
      [{ kind: "character", id: "c1".padEnd(36, "0"), rule: "UNRESOLVED_IDENTITY" }],
    ]);
    await w.find('[data-testid="unresolved-refresh"]').trigger("click");
    const unresolvedCalls = (apiMock.mock.calls as unknown[][]).filter((c) =>
      String(c[0]).endsWith("/story-health/unresolved"),
    );
    expect(unresolvedCalls.length).toBe(2);
  });


  it("maps a 403 health failure to the forbidden message", async () => {
    apiMock
      .mockRejectedValueOnce(new ApiError("FORBIDDEN", 403))
      .mockResolvedValueOnce({ unresolved: [] })
      .mockResolvedValueOnce({ statuses: [] });
    const w = mount(HealthMemoryPanel, { props });
    await tick();
    expect(w.find('[role="alert"]').text()).toContain("workspace.health.errors.forbidden");
  });

  it("rebuilds memory only after explicit confirmation and never sends a simulation flag", async () => {
    const w = mountHealth();
    await tick();
    await w.findAll('[role="tab"]')[1]!.trigger("click");
    await w
      .findAll("button")
      .find((b) => b.text() === "workspace.health.memory.rebuildSubmit")!
      .trigger("click");
    const dialog = w.find('[role="alertdialog"]');
    expect(dialog.exists()).toBe(true);
    expect(dialog.text()).toContain("workspace.health.memory.rebuildConfirm");
    expect(apiMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/memory/rebuild"),
      expect.anything(),
    );
    apiMock.mockResolvedValueOnce({ accepted: true });
    apiMock.mockResolvedValueOnce({ statuses: [] });
    await dialog.findAll("button")[0]!.trigger("click");
    await tick();
    const rebuildCall = (apiMock.mock.calls as Array<[string, RequestInit | undefined]>).find((c) =>
      String(c[0]!).includes("/memory/rebuild"),
    )!;
    expect(rebuildCall[0]!).toBe("/workspaces/ws-1/novels/novel-1/memory/rebuild");
    const body = JSON.parse(rebuildCall[1]!.body as string);
    expect(body).not.toHaveProperty("simulation");
    expect(w.text()).toContain("workspace.health.memory.rebuildAccepted");
  });

  it("reads the memory as-of projection read-only", async () => {
    const w = mountHealth();
    await tick();
    await w.findAll('[role="tab"]')[1]!.trigger("click");
    await tick();
    await w.findAll('input[inputmode="numeric"]')[0]!.setValue("42");
    apiMock.mockResolvedValueOnce({ scopes: { timeline: {} } });
    await w.find("form").trigger("submit.prevent");
    await tick();
    expect(apiMock).toHaveBeenCalledWith("/workspaces/ws-1/novels/novel-1/memory/as-of?chapter=42");
  });
});
