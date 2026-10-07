/**
 * MergePreview + RecoverableOperations tests (NF-WF-020C).
 *
 * Verifies the merge preview renders the pinned taxonomy (CLEAN / CONFLICT /
 * DELETED_MODIFIED / ORPHAN_RISK) with conflict evidence, gates the apply
 * button on zero conflicts, and that the recoverable-operations list offers
 * one-action rollback with confirmation. Axe-tested with zero violations
 * (wcag2aa + wcag22aa) in both locales. API calls are mocked; the contract
 * under test is the UI surface, not the backend (covered by
 * apps/api/src/merge.test.ts).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref, computed, onMounted, onUnmounted } from "vue";
import { axe, configureAxe } from "vitest-axe";
import MergePreview from "./MergePreview.vue";
import RecoverableOperations from "./RecoverableOperations.vue";
import { en } from "../../i18n/en";
import { id } from "../../i18n/id";

vi.stubGlobal("ref", ref);
vi.stubGlobal("computed", computed);
vi.stubGlobal("onMounted", onMounted);
vi.stubGlobal("onUnmounted", onUnmounted);

function tFor(locale: typeof en | typeof id) {
  return (path: string) => {
    const parts = path.split(".");
    let node: unknown = locale;
    for (const p of parts) node = (node as Record<string, unknown>)?.[p];
    return typeof node === "string" ? node : path;
  };
}

let currentT = tFor(en);

vi.mock("../../composables/useLocale", () => ({
  useLocale: () => ({ t: (p: string) => currentT(p) }),
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
  rules: {
    "color-contrast": { enabled: true },
  },
});

const conflictPreview = {
  preview: {
    sourceBranch: { name: "feature" },
    targetBranch: { name: "main", headRevisionId: "rev-target" },
    changes: [
      {
        entityType: "CanonFact",
        entityId: "fact-1",
        kind: "CONFLICT",
        changedOn: ["source", "target"],
        base: { predicate: "hair-colour", object_text: "true" },
        sourceVersion: { predicate: "hair-colour", object_text: "blue" },
        targetVersion: { predicate: "hair-colour", object_text: "red" },
      },
      {
        entityType: "CanonFact",
        entityId: "fact-2",
        kind: "CLEAN",
        changedOn: ["source"],
      },
      {
        entityType: "CanonFact",
        entityId: "fact-3",
        kind: "ORPHAN_RISK",
        changedOn: ["source"],
        warning: "character_knowledge k-1 diverged on target",
      },
    ],
    summary: { clean: 1, conflict: 1, deletedModified: 0, orphanRisk: 1 },
    canApply: false,
  },
};

const cleanPreview = {
  preview: {
    sourceBranch: { name: "feature" },
    targetBranch: { name: "main", headRevisionId: "rev-target" },
    changes: [
      { entityType: "CanonFact", entityId: "fact-2", kind: "CLEAN", changedOn: ["source"] },
    ],
    summary: { clean: 1, conflict: 0, deletedModified: 0, orphanRisk: 0 },
    canApply: true,
  },
};

const recoverable = {
  checkpoints: [
    {
      id: "cp-1",
      label: "ai.bulkRewrite @ R5",
      note: null,
      kind: "PRE_MUTATION",
      revisionNumber: 5,
      branchName: "main",
      createdAt: new Date().toISOString(),
    },
  ],
};

describe("MergePreview", () => {
  it("applies the selected semantic mode and pins the preview target head", async () => {
    apiMock.mockResolvedValue(cleanPreview);
    const w = mount(MergePreview, { props: { workspaceId: "ws-1", novelId: "novel-1", sourceBranchId: "branch-feature" } });
    await flushPromises();
    await w.find('[data-testid="merge-mode-semantic"]').trigger("click");
    await flushPromises();
    apiMock.mockResolvedValueOnce({ revisionId: "rev-new" });
    await w.find('[data-testid="merge-apply-button"]').trigger("click");
    await flushPromises();
    const call = apiMock.mock.calls.find(([url]) => url.endsWith("/merge/apply"));
    expect(JSON.parse(call![1].body)).toMatchObject({ mode: "semantic", expectedHeadRevisionId: "rev-target" });
    w.unmount();
  });

  it("invalidates stale previews and ignores out-of-order mode responses", async () => {
    apiMock.mockResolvedValueOnce(cleanPreview);
    const w = mount(MergePreview, { props: { workspaceId: "ws-1", novelId: "novel-1", sourceBranchId: "branch-feature" } });
    await flushPromises();
    let resolveOld!: (value: unknown) => void;
    apiMock.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    await w.find('[data-testid="merge-mode-semantic"]').trigger("click");
    expect(w.find('[data-testid="merge-apply-button"]').exists()).toBe(false);
    apiMock.mockRejectedValueOnce(new Error("current preview failed"));
    await w.find('[data-testid="merge-mode-conservative"]').trigger("click");
    await flushPromises();
    resolveOld(cleanPreview);
    await flushPromises();
    expect(w.find('[data-testid="merge-apply-button"]').exists()).toBe(false);
    expect(w.find('[data-testid="merge-preview-error"]').text()).toContain("current preview failed");
    w.unmount();
  });

  beforeEach(() => {
    apiMock.mockReset();
    currentT = tFor(en);
  });

  it("renders the taxonomy with conflict evidence and disables apply on conflicts", async () => {
    apiMock.mockResolvedValue(conflictPreview);
    const w = mount(MergePreview, {
      attachTo: document.body,
      props: { workspaceId: "ws-1", novelId: "novel-1", sourceBranchId: "branch-feature" },
    });
    await flushPromises();

    expect(w.find("[data-testid='merge-preview']").exists()).toBe(true);
    // All three pinned kinds render.
    expect(w.find("[data-testid='merge-kind-CONFLICT']").exists()).toBe(true);
    expect(w.find("[data-testid='merge-kind-CLEAN']").exists()).toBe(true);
    expect(w.find("[data-testid='merge-kind-ORPHAN_RISK']").exists()).toBe(true);
    // Conflict evidence: base / source / target versions.
    expect(w.text()).toContain("true");
    expect(w.text()).toContain("blue");
    expect(w.text()).toContain("red");
    // Orphan-risk warning renders.
    expect(w.text()).toContain("character_knowledge");
    // Apply is gated: the button is disabled and the cannot-apply alert shows.
    const btn = w.find("[data-testid='merge-apply-button']");
    expect((btn.element as HTMLButtonElement).disabled).toBe(true);
    expect(w.find("[data-testid='merge-cannot-apply']").exists()).toBe(true);
    w.unmount();
  });

  it("enables apply on a clean preview and posts the apply", async () => {
    apiMock.mockResolvedValueOnce(cleanPreview);
    const w = mount(MergePreview, {
      attachTo: document.body,
      props: { workspaceId: "ws-1", novelId: "novel-1", sourceBranchId: "branch-feature" },
    });
    await flushPromises();

    expect(w.find("[data-testid='merge-can-apply']").exists()).toBe(true);
    const btn = w.find("[data-testid='merge-apply-button']");
    expect((btn.element as HTMLButtonElement).disabled).toBe(false);

    apiMock.mockResolvedValueOnce({ revisionId: "rev-new" });
    await btn.trigger("click");
    await flushPromises();

    expect(apiMock).toHaveBeenCalledWith(
      expect.stringContaining("/merge/apply"),
      expect.objectContaining({ method: "POST" }),
    );
    expect(w.find("[data-testid='merge-applied']").exists()).toBe(true);
    expect(w.emitted("applied")).toBeTruthy();
    w.unmount();
  });

  it("passes axe with zero violations (en + id)", async () => {
    for (const locale of [en, id]) {
      currentT = tFor(locale);
      apiMock.mockResolvedValue(cleanPreview);
      const w = mount(MergePreview, {
        attachTo: document.body,
        props: { workspaceId: "ws-1", novelId: "novel-1", sourceBranchId: "branch-feature" },
      });
      await flushPromises();
      const results = await axe(w.element, {
        runOnly: ["wcag2aa", "wcag22aa"],
      });
      expect(results.violations).toEqual([]);
      w.unmount();
    }
  });
});

describe("RecoverableOperations", () => {
  beforeEach(() => {
    apiMock.mockReset();
    currentT = tFor(en);
  });

  it("lists recoverable checkpoints and rolls back with confirmation", async () => {
    apiMock.mockResolvedValue(recoverable);
    const w = mount(RecoverableOperations, {
      attachTo: document.body,
      props: { workspaceId: "ws-1", novelId: "novel-1" },
    });
    await flushPromises();

    expect(w.find("[data-testid='recoverable-operations']").exists()).toBe(true);
    expect(w.text()).toContain("ai.bulkRewrite @ R5");

    // Opens the confirm dialog.
    await w.find("[data-testid='recoverable-rollback-cp-1']").trigger("click");
    expect(w.find("[data-testid='rollback-confirm']").exists()).toBe(true);

    // Confirms: posts the rollback.
    apiMock.mockResolvedValueOnce({ revisionId: "rev-rb" });
    await w.find("[data-testid='rollback-confirm-ok']").trigger("click");
    await flushPromises();

    expect(apiMock).toHaveBeenCalledWith(
      expect.stringContaining("/checkpoints/cp-1/rollback"),
      expect.objectContaining({ method: "POST" }),
    );
    expect(w.find("[data-testid='recoverable-done-cp-1']").exists()).toBe(true);
    expect(w.emitted("rolledBack")).toBeTruthy();
    w.unmount();
  });

  it("cancelling the confirm dialog does not roll back", async () => {
    apiMock.mockResolvedValue(recoverable);
    const w = mount(RecoverableOperations, {
      attachTo: document.body,
      props: { workspaceId: "ws-1", novelId: "novel-1" },
    });
    await flushPromises();

    await w.find("[data-testid='recoverable-rollback-cp-1']").trigger("click");
    expect(w.find("[data-testid='rollback-confirm']").exists()).toBe(true);
    await w.find("[data-testid='rollback-confirm-cancel']").trigger("click");
    await flushPromises();

    expect(w.find("[data-testid='rollback-confirm']").exists()).toBe(false);
    // Only the initial list call; no rollback POST.
    expect(apiMock).toHaveBeenCalledTimes(1);
    w.unmount();
  });

  it("passes axe with zero violations (en + id)", async () => {
    for (const locale of [en, id]) {
      currentT = tFor(locale);
      apiMock.mockResolvedValue(recoverable);
      const w = mount(RecoverableOperations, {
        attachTo: document.body,
        props: { workspaceId: "ws-1", novelId: "novel-1" },
      });
      await flushPromises();
      const results = await axe(w.element, {
        runOnly: ["wcag2aa", "wcag22aa"],
      });
      expect(results.violations).toEqual([]);
      w.unmount();
    }
  });
});
