import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import DefinitionCreateDialog from "./DefinitionCreateDialog.vue";
import { ApiError } from "../../composables/useApi";
import { axe } from "vitest-axe";
const { createDefinition, listDefinitions, getDefinition, api } = vi.hoisted(() => ({ createDefinition: vi.fn(), listDefinitions: vi.fn(), getDefinition: vi.fn(), api: vi.fn() }));
vi.mock("../../composables/useAiStudio", () => ({ useAiStudio: () => ({ createDefinition, listDefinitions, getDefinition }) }));
vi.mock("../../composables/useApi", async original => ({ ...await original<typeof import("../../composables/useApi")>(), useApi: () => ({ api }) }));
vi.mock("../../composables/useLocale", () => ({ useLocale: () => ({ t: (key: string) => key }) }));
beforeEach(() => {
  createDefinition.mockReset().mockResolvedValue({ id: "created", key: "my-agent" });
  listDefinitions.mockReset().mockResolvedValue([]);getDefinition.mockReset();
  api.mockReset().mockResolvedValue([{ modelRef: "chosen-model", displayName: "Writer", providerModelId: "writer", gatewayId: "gateway", selectable: true }]);
});
async function fill(w: ReturnType<typeof mount>) {
  await w.get('[data-testid="definition-name"]').setValue("My definition");
  await w.get('[data-testid="definition-key"]').setValue("my-agent");
}
describe("workspace definition creation", () => {
  it.each(["agent", "skill"] as const)("creates a %s draft with chosen execution model", async kind => {
    const w = mount(DefinitionCreateDialog, { props: { workspaceId: "workspace", kind } });await flushPromises();await fill(w);
    await w.get('[data-testid="definition-instructions"]').setValue("Keep causality and approved canon.");
    await w.get('[data-model-ref="chosen-model"]').trigger("click");await w.get("form").trigger("submit");await flushPromises();
    expect(createDefinition).toHaveBeenCalledWith("workspace", kind, expect.objectContaining({ key: "my-agent", name: "My definition", instructions: "Keep causality and approved canon.", modelProfile: "CREATIVE_WRITER", preferredModelRef: "chosen-model" }));
    expect(w.emitted("created")).toEqual([[{ id: "created", kind, workspaceId: "workspace" }]]);w.unmount();
  });
  it("retains fields and shows a refusal without emitting success", async () => {
    createDefinition.mockRejectedValue(new Error("offline"));const w = mount(DefinitionCreateDialog, { props: { workspaceId: "workspace", kind: "agent" } });await flushPromises();await fill(w);await w.get('[data-testid="definition-instructions"]').setValue("Retained draft");await w.get("form").trigger("submit");await flushPromises();
    expect(w.get('[data-testid="definition-instructions"]').element).toHaveProperty("value", "Retained draft");expect(w.emitted("created")).toBeUndefined();expect(w.get('[role="alert"]').text()).toContain("aiStudio.creation.uncertain");w.unmount();
  });
  it("creates workflow graph/default data and rejects malformed JSON before POST", async () => {
    const w = mount(DefinitionCreateDialog, { props: { workspaceId: "workspace", kind: "workflow" } });await flushPromises();await fill(w);
    await w.get('[data-testid="definition-graph"]').setValue("{broken");await w.get("form").trigger("submit");expect(createDefinition).not.toHaveBeenCalled();
    const graph = { steps: [{ key: "approval", kind: "HUMAN_APPROVAL" }], edges: [], maxSteps: 1 };
    await w.get('[data-testid="definition-graph"]').setValue(JSON.stringify(graph));await w.get("form").trigger("submit");await flushPromises();
    expect(createDefinition).toHaveBeenCalledWith("workspace", "workflow", expect.objectContaining({ graph, defaultModelRef: null }));expect(api).toHaveBeenCalledWith("/workspaces/workspace/model-catalog");w.unmount();
  });
  it("retains a rejected draft and allows an intentional correction", async () => {
    createDefinition.mockRejectedValueOnce(new ApiError("CONFLICT", 409));const w = mount(DefinitionCreateDialog, { props: { workspaceId: "workspace", kind: "agent" } });await flushPromises();await fill(w);await w.get('[data-testid="definition-instructions"]').setValue("Keep this");await w.get("form").trigger("submit");await flushPromises();
    expect(w.text()).toContain("aiStudio.creation.conflict");expect(w.get('[data-testid="definition-key"]').attributes("disabled")).toBeUndefined();
    await w.get('[data-testid="definition-key"]').setValue("another-key");await w.get("form").trigger("submit");await flushPromises();expect(createDefinition).toHaveBeenCalledTimes(2);w.unmount();
  });
  it("freezes unknown outcomes, retries the exact request and recovers only matching workspace data", async () => {
    createDefinition.mockRejectedValue(new TypeError("lost response"));const w = mount(DefinitionCreateDialog, { props: { workspaceId: "workspace", kind: "agent" } });await flushPromises();await fill(w);await w.get('[data-testid="definition-instructions"]').setValue("Exact instruction");await w.get("form").trigger("submit");await flushPromises();
    const original = createDefinition.mock.calls[0];if (!original) throw new Error("Expected initial creation request");expect(w.get('[data-testid="definition-key"]').attributes("disabled")).toBeDefined();
    expect(w.findAll("button").some(button => button.text() === "common.close")).toBe(true);expect(w.findAll("button").some(button => button.text() === "common.cancel")).toBe(false);
    await w.get("form").trigger("submit");expect(createDefinition).toHaveBeenCalledTimes(1);
    await w.get('[data-testid="definition-retry"]').trigger("click");await flushPromises();expect(createDefinition.mock.calls[1]).toEqual(original);
    await w.get('[data-testid="definition-recheck"]').trigger("click");await flushPromises();expect(w.text()).toContain("aiStudio.creation.notFoundYet");expect(w.emitted("created")).toBeUndefined();
    listDefinitions.mockResolvedValue([{ id: "other", key: "my-agent", scope: "PLATFORM", workspaceId: null }]);await w.get('[data-testid="definition-recheck"]').trigger("click");await flushPromises();expect(getDefinition).not.toHaveBeenCalled();
    listDefinitions.mockResolvedValue([{ id: "existing", key: "my-agent", scope: "WORKSPACE", workspaceId: "workspace" }]);getDefinition.mockResolvedValue({ ...original[2], scope: "WORKSPACE", workspaceId: "workspace", instructions: "Another instruction" });
    await w.get('[data-testid="definition-recheck"]').trigger("click");await flushPromises();expect(w.emitted("created")).toBeUndefined();
    getDefinition.mockResolvedValue({ ...original[2], scope: "WORKSPACE", workspaceId: "workspace" });await w.get('[data-testid="definition-recheck"]').trigger("click");await flushPromises();expect(w.emitted("created")).toHaveLength(1);w.unmount();
  });
  it("ignores an old creation response after navigation and blocks cancel while POST is pending", async () => {
    let resolve!: (value: { id: string }) => void;createDefinition.mockReturnValue(new Promise(done => { resolve = done; }));const w = mount(DefinitionCreateDialog, { props: { workspaceId: "a", kind: "agent" } });await flushPromises();await fill(w);await w.get('[data-testid="definition-instructions"]').setValue("Old request");await w.get("form").trigger("submit");
    await w.get("dialog").trigger("cancel");expect(w.emitted("close")).toBeUndefined();await w.setProps({ workspaceId: "b", kind: "workflow" });resolve({ id: "old" });await flushPromises();expect(w.emitted("created")).toBeUndefined();expect(w.get('[data-testid="definition-name"]').element).toHaveProperty("value", "");w.unmount();
  });
  it("keeps a changed-profile selection explicit and locks repeat submit after success", async () => {
    const w = mount(DefinitionCreateDialog, { props: { workspaceId: "workspace", kind: "agent" } });await flushPromises();await fill(w);await w.get('[data-testid="definition-instructions"]').setValue("Instruction");await w.get('[data-model-ref="chosen-model"]').trigger("click");await w.get('[data-profile="DEEP_PLANNER"]').trigger("click");await flushPromises();expect(api).toHaveBeenLastCalledWith("/workspaces/workspace/model-catalog?profile=DEEP_PLANNER");
    await w.get("form").trigger("submit");await flushPromises();await w.get("form").trigger("submit");expect(createDefinition).toHaveBeenCalledTimes(1);expect(createDefinition.mock.calls[0]![2]).toMatchObject({ modelProfile: "DEEP_PLANNER", preferredModelRef: "chosen-model" });w.unmount();
  });
  it("has no automated accessibility violations in the open native dialog", async () => {
    const host = document.createElement("main");document.body.append(host);const w = mount(DefinitionCreateDialog, { props: { workspaceId: "workspace", kind: "agent" }, attachTo: host });await flushPromises();w.get("dialog").element.setAttribute("open", "");expect((await axe(host)).violations).toEqual([]);w.unmount();host.remove();
  });
});
