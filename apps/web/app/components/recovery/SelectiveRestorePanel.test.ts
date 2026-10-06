/**
 * SelectiveRestorePanel tests (NF-WF-020A): scope picker, conflict report,
 * and the acknowledgment gate. Axe with zero violations (wcag2aa +
 * wcag22aa) in both locales. API calls are mocked; the backend contract
 * is covered by apps/api/src/selective-restore.test.ts.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref, computed, onMounted, onUnmounted } from "vue";
import { axe, configureAxe } from "vitest-axe";
import SelectiveRestorePanel from "./SelectiveRestorePanel.vue";
import { en } from "../../i18n/en";
import { id } from "../../i18n/id";

vi.stubGlobal("ref", ref);
vi.stubGlobal("computed", computed);
vi.stubGlobal("onMounted", onMounted);
vi.stubGlobal("onUnmounted", onUnmounted);

function tFor(locale: typeof en | typeof id) {
  return (path: string, params?: Record<string, string | number>) => {
    const parts = path.split(".");
    let node: unknown = locale;
    for (const p of parts) node = (node as Record<string, unknown>)?.[p];
    if (typeof node !== "string") return path;
    if (!params) return node;
    return node.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? ""));
  };
}

let currentT = tFor(en);

vi.mock("../../composables/useLocale", () => ({
  useLocale: () => ({ t: (p: string, params?: Record<string, string | number>) => currentT(p, params) }),
}));

const apiMock = vi.fn();
vi.mock("../../composables/useApi", () => ({
  useApi: () => ({ api: apiMock }),
  ApiError: class ApiError extends Error {
    constructor(
      readonly code: string,
      readonly status: number,
    ) {
      super(`${status} ${code}`);
    }
  },
}));

configureAxe({
  rules: {},
});

const WCAG22_AA = {
  runOnly: { type: "tag" as const, values: ["wcag2aa", "wcag22aa"] },
};

const previewWithOrphan = {
  restoreOperationId: "op-1",
  preview: {
    dependencyConflicts: [
      {
        kind: "ORPHAN_REFERENCE",
        dependentTable: "character_knowledge",
        dependentId: "knowledge-12345678",
        via: "fact_id",
        referencedTable: "canon_facts",
        referencedId: "fact-12345678",
      },
    ],
    selection: { scope: "DOMAIN", domain: "canon", tables: ["canon_facts"], entityRefs: [], rowFilter: {}, acknowledged: false },
  },
};

const previewClean = {
  restoreOperationId: "op-2",
  preview: {
    dependencyConflicts: [],
    selection: { scope: "DOMAIN", domain: "canon", tables: ["canon_facts"], entityRefs: [], rowFilter: {}, acknowledged: false },
  },
};

function mountPanel() {
  return mount(SelectiveRestorePanel, {
    attachTo: document.body,
    props: { workspaceId: "ws-1", novelId: "novel-1", checkpointId: "cp-1" },
  });
}

describe("SelectiveRestorePanel", () => {
  beforeEach(() => {
    apiMock.mockReset();
    currentT = tFor(en);
  });

  it("renders the scope picker", async () => {
    const w = mountPanel();
    await flushPromises();
    expect(w.find("[data-testid='selective-restore']").exists()).toBe(true);
    expect(w.find("[data-testid='selective-scope']").exists()).toBe(true);
  });

  it("shows the conflict report and gates apply behind the acknowledgment", async () => {
    apiMock.mockResolvedValueOnce(previewWithOrphan);
    const w = mountPanel();
    await w.find("[data-testid='selective-preview-btn']").trigger("click");
    await flushPromises();

    expect(w.find("[data-testid='selective-conflict']").exists()).toBe(true);
    expect(w.text()).toContain("character_knowledge");
    // The apply button is disabled until the acknowledgment is checked.
    const applyBtn = w.find("[data-testid='selective-apply-btn']");
    expect((applyBtn.element as HTMLButtonElement).disabled).toBe(true);
    await w.find("[data-testid='selective-ack']").setValue(true);
    expect((applyBtn.element as HTMLButtonElement).disabled).toBe(false);

    apiMock.mockResolvedValueOnce({ revisionId: "rev-1" });
    await applyBtn.trigger("click");
    await flushPromises();
    expect(w.find("[data-testid='selective-applied']").exists()).toBe(true);
    // The acknowledged flag is sent.
    const applyCall = apiMock.mock.calls[1];
    expect(applyCall?.[1].body).toContain('"acknowledged":true');
  });

  it("applies without a gate when there are no conflicts", async () => {
    apiMock.mockResolvedValueOnce(previewClean);
    const w = mountPanel();
    await w.find("[data-testid='selective-preview-btn']").trigger("click");
    await flushPromises();

    expect(w.find("[data-testid='selective-no-conflicts']").exists()).toBe(true);
    expect(w.find("[data-testid='selective-ack']").exists()).toBe(false);
    const applyBtn = w.find("[data-testid='selective-apply-btn']");
    expect((applyBtn.element as HTMLButtonElement).disabled).toBe(false);
  });

  it("passes axe with zero violations (en)", async () => {
    apiMock.mockResolvedValueOnce(previewWithOrphan);
    const w = mountPanel();
    await w.find("[data-testid='selective-preview-btn']").trigger("click");
    await flushPromises();
    await w.find("[data-testid='selective-ack']").setValue(true);
    const results = await axe(w.element, WCAG22_AA);
    expect(results.violations).toEqual([]);
  });

  it("passes axe with zero violations (id)", async () => {
    currentT = tFor(id);
    apiMock.mockResolvedValueOnce(previewWithOrphan);
    const w = mountPanel();
    await w.find("[data-testid='selective-preview-btn']").trigger("click");
    await flushPromises();
    const results = await axe(w.element, WCAG22_AA);
    expect(results.violations).toEqual([]);
  });
});
