import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import CanonApplicationReview from "./CanonApplicationReview.vue";
import ProposalsPanel from "./ProposalsPanel.vue";

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
    locale: { value: "en" },
    setLocale: vi.fn(),
  }),
}));

const proposals = [
  {
    kind: "fact",
    text: "Wren swore an oath of silence",
    citations: [{ source: "draft_write", span: "Wren swore the oath of silence" }],
  },
  {
    kind: "fact",
    text: "The moon rose over the citadel",
    citations: [{ source: "draft_write", span: "The moon rose over the citadel walls" }],
  },
];

const baseProps = {
  workspaceId: "ws-1",
  novelId: "novel-1",
  runId: "run-1",
  chapterNumber: 3,
  proposals,
};

function validatedApplication() {
  return {
    id: "app-1",
    status: "VALIDATED",
    headRevisionId: "rev-1",
    items: [
      {
        id: "item-1",
        claimIndex: 0,
        kind: "fact",
        text: "Wren swore an oath of silence",
        entityId: null,
        entityName: "Wren",
        predicate: "oath",
        object: { text: "the oath of silence" },
        validFromChapter: 3,
        evidence: [{ inputName: "draft_write", quote: "Wren swore the oath of silence", start: 0, end: 31 }],
        verdict: "APPLICABLE",
        verdictReasons: [],
      },
      {
        id: "item-2",
        claimIndex: 1,
        kind: "fact",
        text: "The moon rose over the citadel",
        entityId: "ent-9",
        entityName: "Citadel",
        predicate: "location",
        object: { text: "the citadel" },
        validFromChapter: 3,
        evidence: [{ inputName: "draft_write", quote: "The moon rose over the citadel walls", start: 50, end: 84 }],
        verdict: "CONFLICT",
        verdictReasons: ["conflicts with a live canon fact"],
        conflictsWith: { factId: "fact-7", statement: "The moon hangs over the river" },
      },
    ],
  };
}

const routes: Record<string, (body?: string) => unknown> = {};

beforeEach(() => {
  apiMock.mockReset();
  for (const k of Object.keys(routes)) delete routes[k];
  routes["entities"] = async () => [];
  apiMock.mockImplementation(async (path: string, init?: { body?: string }) => {
    const hit = Object.entries(routes)
      .filter(([key]) => path.includes(key))
      .sort((a, b) => b[0].length - a[0].length)[0];
    if (hit) return hit[1](init?.body);
    throw new Error(`unexpected api call: ${path}`);
  });
});

describe("CanonApplicationReview", () => {
  it("renders contracting controls with validFromChapter defaulting to the run chapter", async () => {
    const w = mount(CanonApplicationReview, { props: baseProps });
    await flushPromises();
    expect(w.text()).toContain("canonReview.title");
    expect(w.text()).toContain("Wren swore an oath of silence");
    // validFromChapter inputs default to the run's chapterNumber (Q3).
    const vfcInputs = w.findAll('input[type="number"]');
    expect(vfcInputs.length).toBe(2);
    for (const input of vfcInputs) {
      expect((input.element as HTMLInputElement).value).toBe("3");
    }
    // Object input is prefilled with the extracted claim text.
    const textInputs = w.findAll('input[type="text"], input:not([type])');
    expect(textInputs.some((i) => (i.element as HTMLInputElement).value === "Wren swore an oath of silence")).toBe(true);
  });

  it("validates claims and shows verdict chips", async () => {
    const w = mount(CanonApplicationReview, { props: baseProps });
    await flushPromises();
    routes["canon/applications"] = async () => validatedApplication();
    const validateBtn = w.findAll("button").find((b) => b.text().includes("canonReview.validate"));
    await validateBtn!.trigger("click");
    await flushPromises();
    const createCall = apiMock.mock.calls.find((c) => c[0].endsWith("/canon/applications"));
    expect(createCall).toBeTruthy();
    const createBody = JSON.parse(createCall![1].body);
    expect(createBody.runId).toBe("run-1");
    expect(createBody.items).toHaveLength(2);
    expect(createBody.items[0].validFromChapter).toBe(3);
    expect(w.text()).toContain("APPLICABLE");
    expect(w.text()).toContain("CONFLICT");
  });

  it("shows the live fact side-by-side and requires explicit conflict confirmation", async () => {
    const w = mount(CanonApplicationReview, { props: baseProps });
    await flushPromises();
    routes["canon/applications"] = async () => validatedApplication();
    await w.findAll("button").find((b) => b.text().includes("canonReview.validate"))!.trigger("click");
    await flushPromises();
    // Live fact surfaced next to the conflicting claim.
    expect(w.text()).toContain("canonReview.liveFact");
    expect(w.text()).toContain("The moon hangs over the river");
    // Approve without confirming the conflict is refused client-side.
    apiMock.mockClear();
    await w.findAll("button").find((b) => b.text().includes("canonReview.approveSelected"))!.trigger("click");
    await flushPromises();
    expect(apiMock).not.toHaveBeenCalled();
    expect(w.text()).toContain("canonReview.errors.CONFLICT_NOT_CONFIRMED");
    // Confirming both (only one conflict) lets the approve through.
    const confirm = w.findAll('input[type="checkbox"]').find((c) => {
      const label = c.element.closest("label");
      return label?.textContent?.includes("canonReview.confirmConflict") ?? false;
    });
    expect(confirm).toBeTruthy();
    await confirm!.setValue(true);
    routes["canon/applications/app-1/approve"] = async () => ({
      applicationId: "app-1",
      status: "APPLIED",
      appliedItems: [{ itemId: "item-1", factId: "fact-1", entityId: "ent-1", supersededFactId: null }],
      invalidatedScopes: ["ent-1"],
    });
    await w.findAll("button").find((b) => b.text().includes("canonReview.approveSelected"))!.trigger("click");
    await flushPromises();
    const approveCall = apiMock.mock.calls.find((c) => c[0].endsWith("/approve"));
    const approveBody = JSON.parse(approveCall![1].body);
    expect(approveBody.confirmConflicts).toBe(true);
    expect(w.text()).toContain("canonReview.appliedNote|count=1");
    expect(w.emitted("decided")).toEqual([["APPLIED"]]);
  });

  it("maps STALE_APPLICATION to the revalidate affordance", async () => {
    const { ApiError } = await import("../../composables/useApi");
    const w = mount(CanonApplicationReview, { props: baseProps });
    await flushPromises();
    routes["canon/applications"] = async () => validatedApplication();
    await w.findAll("button").find((b) => b.text().includes("canonReview.validate"))!.trigger("click");
    await flushPromises();
    routes["canon/applications/app-1/approve"] = async () => {
      throw new ApiError("STALE_APPLICATION", 409);
    };
    const confirmStale = w.findAll('input[type="checkbox"]').find((c) => {
      const label = c.element.closest("label");
      return label?.textContent?.includes("canonReview.confirmConflict") ?? false;
    });
    await confirmStale!.setValue(true);
    await flushPromises();
    await w.findAll("button").find((b) => b.text().includes("canonReview.approveSelected"))!.trigger("click");
    await flushPromises();
    expect(w.text()).toContain("STALE_APPLICATION");
    // The raw code is the fallback when the locale key is missing.
    const revalidateBtn = w.findAll("button").find((b) => b.text().includes("canonReview.revalidate"));
    expect(revalidateBtn).toBeTruthy();
    routes["canon/applications/app-1/revalidate"] = async () => ({ ...validatedApplication(), status: "VALIDATED" });
    await revalidateBtn!.trigger("click");
    await flushPromises();
    expect(apiMock).toHaveBeenCalledWith(
      "/workspaces/ws-1/novels/novel-1/canon/applications/app-1/revalidate",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("rejects the application and emits the decision", async () => {
    const w = mount(CanonApplicationReview, { props: baseProps });
    await flushPromises();
    routes["canon/applications"] = async () => validatedApplication();
    await w.findAll("button").find((b) => b.text().includes("canonReview.validate"))!.trigger("click");
    await flushPromises();
    apiMock.mockImplementationOnce(async () => undefined);
    await w.findAll("button").find((b) => b.text().includes("canonReview.reject"))!.trigger("click");
    await flushPromises();
    expect(apiMock).toHaveBeenCalledWith(
      "/workspaces/ws-1/novels/novel-1/canon/applications/app-1/reject",
      expect.objectContaining({ method: "POST" }),
    );
    expect(w.emitted("decided")).toEqual([["REJECTED"]]);
  });
});

describe("ProposalsPanel review entry point", () => {
  it("offers Review for canon when run context is present, and reflects the decision", async () => {
    const w = mount(ProposalsPanel, {
      props: { proposals, workspaceId: "ws-1", novelId: "novel-1", runId: "run-1", chapterNumber: 3 },
    });
    const entry = w.findAll("button").find((b) => b.text().includes("proposals.reviewForCanon"));
    expect(entry).toBeTruthy();
    await entry!.trigger("click");
    expect(w.findComponent(CanonApplicationReview).exists()).toBe(true);
  });

  it("shows no review entry without run context (007 behavior preserved)", () => {
    const w = mount(ProposalsPanel, { props: { proposals } });
    expect(w.findAll("button")).toHaveLength(0);
  });
});
