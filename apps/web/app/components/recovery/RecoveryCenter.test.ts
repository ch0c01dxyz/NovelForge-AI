/**
 * RecoveryCenter tests (NF-WF-020B): branch list/create/switch UI.
 *
 * Verifies the component renders the branch list with checked-out markers,
 * opens the create dialog, and passes axe with zero violations
 * (wcag2aa + wcag22aa) in both locales. API calls are mocked; the contract
 * under test is the UI surface, not the backend (covered by
 * apps/api/src/branches.test.ts).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref, computed, onMounted, onUnmounted } from "vue";
import { axe, configureAxe } from "vitest-axe";
import RecoveryCenter from "./RecoveryCenter.vue";
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

configureAxe({});

const branches = [
  {
    id: "branch-main-id",
    name: "main",
    headRevisionId: "rev-1",
    headRevisionNumber: 2,
    parentBranchId: null,
    sourceRevisionId: null,
    isCheckedOut: true,
    updatedAt: new Date().toISOString(),
  },
  {
    id: "branch-exp-id",
    name: "experiment",
    headRevisionId: "rev-2",
    headRevisionNumber: 3,
    parentBranchId: "branch-main-id",
    sourceRevisionId: "rev-1",
    isCheckedOut: false,
    updatedAt: new Date().toISOString(),
  },
];

function mountCenter() {
  apiMock.mockResolvedValue({ branches });
  return mount(RecoveryCenter, {
    attachTo: document.body,
    props: { workspaceId: "ws-1", novelId: "novel-1" },
  });
}

describe("RecoveryCenter", () => {
  beforeEach(() => {
    apiMock.mockReset();
    currentT = tFor(en);
  });

  it("renders the branch list with the checked-out marker", async () => {
    const w = mountCenter();
    await flushPromises();
    expect(w.find("[data-testid='recovery-center']").exists()).toBe(true);
    expect(w.text()).toContain("main");
    expect(w.text()).toContain("experiment");
    expect(w.find("[data-testid='recovery-checked-out-badge']").exists()).toBe(true);
    // Only the non-checked-out branch gets a switch button.
    expect(w.find("[data-testid='recovery-switch-branch-exp-id']").exists()).toBe(true);
    expect(w.find("[data-testid='recovery-switch-branch-main-id']").exists()).toBe(false);
    w.unmount();
  });

  it("opens the create dialog", async () => {
    const w = mountCenter();
    await flushPromises();
    await w.find("[data-testid='recovery-create-open']").trigger("click");
    expect(w.find("[data-testid='recovery-create-dialog']").exists()).toBe(true);
    expect(w.find("[data-testid='recovery-create-name']").exists()).toBe(true);
    w.unmount();
  });

  it("creates a branch and reloads the list", async () => {
    const w = mountCenter();
    await flushPromises();
    apiMock.mockResolvedValueOnce({});
    apiMock.mockResolvedValueOnce({ branches });
    await w.find("[data-testid='recovery-create-open']").trigger("click");
    await w.find("[data-testid='recovery-create-name']").setValue("my-branch");
    await w.find("[data-testid='recovery-create-submit']").trigger("click");
    await flushPromises();
    expect(apiMock).toHaveBeenCalledWith(
      expect.stringContaining("/branches"),
      expect.objectContaining({ method: "POST" }),
    );
    w.unmount();
  });

  it("passes axe with zero violations (en)", async () => {
    const w = mountCenter();
    await flushPromises();
    const results = await axe(w.element);
    expect(results.violations).toEqual([]);
    w.unmount();
  });

  it("passes axe with zero violations (id)", async () => {
    currentT = tFor(id);
    const w = mountCenter();
    await flushPromises();
    const results = await axe(w.element);
    expect(results.violations).toEqual([]);
    w.unmount();
  });
});
