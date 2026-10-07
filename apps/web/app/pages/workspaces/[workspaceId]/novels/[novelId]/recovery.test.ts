import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { axe } from "vitest-axe";
import RecoveryPage from "./recovery.vue";
import { useLocale } from "../../../../../composables/useLocale";
import { id } from "../../../../../i18n/id";

vi.stubGlobal("useRoute", () => ({ params: { workspaceId: "ws-1", novelId: "novel-1" } }));
const api = vi.fn();
vi.mock("../../../../../composables/useApi", () => ({
  useApi: () => ({ api }),
  ApiError: class extends Error {},
}));
const branches = [
  { id: "main", name: "main", isCheckedOut: true, headRevisionId: "rev-3" },
  { id: "other", name: "experiment", isCheckedOut: false, headRevisionId: "rev-other" },
];
const checkpoints = [{ id: "cp-1", label: "Before edit", revisionNumber: 3 }];
const wrappers: ReturnType<typeof mount>[] = [];
function mountPage() {
  const wrapper = mount(RecoveryPage, { attachTo: document.body,
    global: { stubs: { NuxtLink: { props: ["to"], template: '<a :href="to"><slot /></a>' } } } });
  wrappers.push(wrapper);
  return wrapper;
}
beforeEach(() => {
  useLocale().setLocale("en");
  api.mockReset();
  api.mockImplementation(async (url: string, options?: { method: string }) => {
    if (url.endsWith("/branches")) return { branches };
    if (url.includes("/checkpoints?") || (url.endsWith("/checkpoints") && !options)) return { checkpoints };
    if (url.endsWith("/recoverable-checkpoints")) return { checkpoints: [] };
    if (url.endsWith("/merge/preview")) return { preview: { sourceBranch: { name: "experiment" },
      targetBranch: { name: "main", headRevisionId: "rev-3" }, changes: [],
      summary: { clean: 0, conflict: 0, deletedModified: 0, orphanRisk: 0 }, canApply: true } };
    return {};
  });
});
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()));

describe("reachable recovery page", () => {
  it("mounts all four real surfaces with server-owned checkpoint/branch selections", async () => {
    const wrapper = mountPage();
    await flushPromises();
    expect(wrapper.find('[data-testid="recovery-center"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="recoverable-operations"]').exists()).toBe(true);
    expect(api).toHaveBeenCalledWith(expect.stringContaining("/checkpoints?branchId=main"));
    expect(wrapper.find('[data-testid="selective-restore"]').exists()).toBe(false);
    await wrapper.find('[data-testid="recovery-checkpoint-select"]').setValue("cp-1");
    expect(wrapper.find('[data-testid="selective-restore"]').exists()).toBe(true);
    const options = wrapper.findAll('[data-testid="recovery-source-select"] option').map((option) => option.attributes("value"));
    expect(options).toEqual(["", "other"]);
    await wrapper.find('[data-testid="recovery-source-select"]').setValue("other");
    await flushPromises();
    expect(wrapper.find('[data-testid="merge-preview"]').exists()).toBe(true);
    expect(JSON.parse(api.mock.calls.find(([url]) => url.endsWith("/merge/preview"))![1].body)).toMatchObject({ targetBranchId: "main" });
  });

  it("creates a checkpoint explicitly and refreshes server lists and selections", async () => {
    const wrapper = mountPage();
    await flushPromises();
    await wrapper.find('[data-testid="recovery-checkpoint-select"]').setValue("cp-1");
    await wrapper.find("form input").setValue("Before merge");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(api).toHaveBeenCalledWith(expect.stringMatching(/\/checkpoints$/), expect.objectContaining({
      method: "POST", body: JSON.stringify({ label: "Before merge", branchId: "main", expectedHeadRevisionId: "rev-3" }),
    }));
    expect(wrapper.find('[data-testid="selective-restore"]').exists()).toBe(false);
    expect(api.mock.calls.filter(([url]) => url.includes("/checkpoints?branchId=main"))).toHaveLength(2);
  });

  it("shows a retryable load error without mounting mutation controls", async () => {
    api.mockRejectedValueOnce(new Error("offline"));
    const wrapper = mountPage();
    await flushPromises();
    expect(wrapper.find('[role="alert"]').text()).toContain("Failed to load recovery data");
    expect(wrapper.find('[data-testid="recovery-center"]').exists()).toBe(false);
    await wrapper.find("button").trigger("click");
    await flushPromises();
    expect(wrapper.find('[data-testid="recovery-center"]').exists()).toBe(true);
  });

  it("renders both locales and passes axe with all selected surfaces", async () => {
    for (const locale of ["en", "id"] as const) {
      useLocale().setLocale(locale);
      const wrapper = mountPage();
      await flushPromises();
      await wrapper.find('[data-testid="recovery-checkpoint-select"]').setValue("cp-1");
      await wrapper.find('[data-testid="recovery-source-select"]').setValue("other");
      await flushPromises();
      expect(wrapper.text()).not.toContain("recovery.backToWorkspace");
      expect((await axe(wrapper.element, { runOnly: ["wcag2aa", "wcag22aa"] })).violations).toEqual([]);
      wrapper.unmount();
    }
  });

  it("uses English fallback for a missing Indonesian page key", async () => {
    const original = id.recovery.backToWorkspace;
    Reflect.deleteProperty(id.recovery, "backToWorkspace");
    try {
      useLocale().setLocale("id");
      const wrapper = mountPage();
      await flushPromises();
      expect(wrapper.text()).toContain("Back to the workspace");
    } finally {
      Reflect.set(id.recovery, "backToWorkspace", original);
    }
  });
});
