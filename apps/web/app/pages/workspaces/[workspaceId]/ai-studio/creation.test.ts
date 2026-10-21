import { beforeEach, describe, expect, it, vi } from "vitest";
import { shallowMount, flushPromises } from "@vue/test-utils";
import { reactive } from "vue";
import Studio from "./index.vue";
const { getWorkspaceRole, getRun } = vi.hoisted(() => ({ getWorkspaceRole: vi.fn(), getRun: vi.fn() }));
vi.mock("../../../../composables/useAiStudio", async original => ({ ...await original<typeof import("../../../../composables/useAiStudio")>(), useAiStudio: () => ({ getWorkspaceRole, getRun }) }));
vi.mock("../../../../composables/useLocale", () => ({ useLocale: () => ({ t: (key: string) => key }) }));
const route = reactive({ params: { workspaceId: "a" }, query: {} });vi.stubGlobal("useRoute", () => route);
beforeEach(() => { route.params.workspaceId = "a";getWorkspaceRole.mockReset().mockResolvedValue("OWNER");getRun.mockReset(); });
const mountPage = () => shallowMount(Studio, { global: { stubs: { NuxtLink: true } } });
describe("workspace Studio creation integration", () => {
  it("selects the installed workflow only for the active workspace manager", async () => {
    const w = mountPage();await flushPromises();
    const starter = w.findComponent({ name: "StarterPackInstall" });expect(starter.exists()).toBe(true);
    starter.vm.$emit("installed", { workspaceId: "b", workflowId: "foreign" });await flushPromises();expect(w.findComponent({ name: "DefinitionDetail" }).exists()).toBe(false);
    starter.vm.$emit("installed", { workspaceId: "a", workflowId: "starter" });await flushPromises();expect(w.findComponent({ name: "DefinitionDetail" }).props()).toMatchObject({ id: "starter", kind: "workflow" });
    getWorkspaceRole.mockResolvedValueOnce("AUTHOR");route.params.workspaceId = "b";await flushPromises();expect(w.findComponent({ name: "StarterPackInstall" }).exists()).toBe(false);w.unmount();
  });
  it("opens creation only for managers and selects its confirmed definition", async () => {
    const w = mountPage();await flushPromises();await w.get('[data-testid="create-definition"]').trigger("click");
    const dialog = w.findComponent({ name: "DefinitionCreateDialog" });expect(dialog.props()).toMatchObject({ workspaceId: "a", kind: "agent" });
    dialog.vm.$emit("created", { id: "foreign", kind: "agent", workspaceId: "b" });await flushPromises();expect(w.findComponent({ name: "DefinitionDetail" }).exists()).toBe(false);
    dialog.vm.$emit("created", { id: "created", kind: "agent", workspaceId: "a" });await flushPromises();expect(w.findComponent({ name: "DefinitionDetail" }).props("id")).toBe("created");w.unmount();
  });
  it("does not let a late old-workspace OWNER response expose creation", async () => {
    let resolve!: (role: string) => void;getWorkspaceRole.mockReturnValueOnce(new Promise(done => { resolve = done; })).mockResolvedValueOnce("VIEWER");
    const w = mountPage();await flushPromises();route.params.workspaceId = "b";await flushPromises();resolve("OWNER");await flushPromises();expect(w.find('[data-testid="create-definition"]').exists()).toBe(false);w.unmount();
  });
  it("ignores a late run read after leaving its workspace", async () => {
    let resolve!: (row: unknown) => void;getRun.mockReturnValue(new Promise(done => { resolve = done; }));const w = mountPage();await flushPromises();
    const state = (w.vm.$ as unknown as { setupState: Record<string, unknown> }).setupState;const reading = (state.selectRun as (id: string) => Promise<void>)("old-run");route.params.workspaceId = "b";await flushPromises();resolve({ id: "old-run" });await reading;expect(state.runDetail).toBeNull();w.unmount();
  });
});
