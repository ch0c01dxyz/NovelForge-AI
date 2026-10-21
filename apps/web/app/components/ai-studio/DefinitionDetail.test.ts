import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import DefinitionDetail from "./DefinitionDetail.vue";
import { axe } from "vitest-axe";
const { getDefinition, listVersions, addVersion, api } = vi.hoisted(() => ({ getDefinition: vi.fn(), listVersions: vi.fn(), addVersion: vi.fn(), api: vi.fn() }));
vi.mock("../../composables/useAiStudio", () => ({ useAiStudio: () => ({ getDefinition, listVersions, addVersion }) }));
vi.mock("../../composables/useApi", async original => ({ ...await original<typeof import("../../composables/useApi")>(), useApi: () => ({ api }) }));
vi.mock("../../composables/useLocale", () => ({ useLocale: () => ({ t: (key: string) => key }) }));
const props = { workspaceId: "workspace", kind: "agent" as const, id: "agent", canManage: true };
beforeEach(() => {
  getDefinition.mockReset().mockResolvedValue({ id: "agent", instructions: "Keep these instructions", modelProfile: "CREATIVE_WRITER", preferredModelRef: "old-model", skillKeys: ["context"], temperature: 0.3, maxTokens: 1024, status: "PUBLISHED" });
  listVersions.mockReset().mockResolvedValue([]);addVersion.mockReset().mockResolvedValue({});api.mockReset().mockResolvedValue([{ modelRef: "new-model", displayName: "Writer", providerModelId: "writer", gatewayId: "gateway", selectable: true }]);
});
it.each(["agent", "skill"] as const)("changes the %s profile with a visible control while retaining other draft fields", async kind => {
  const w = await open({ ...props, kind });
  const field = w.get("textarea");const content = JSON.parse((field.element as HTMLTextAreaElement).value);content.instructions = "Retain this edited instruction";await field.setValue(JSON.stringify(content));
  await w.get('[data-profile="DEEP_PLANNER"]').trigger("click");await flushPromises();
  expect(api).toHaveBeenLastCalledWith("/workspaces/workspace/model-catalog?profile=DEEP_PLANNER");
  expect(JSON.parse((field.element as HTMLTextAreaElement).value)).toMatchObject({ instructions: "Retain this edited instruction", modelProfile: "DEEP_PLANNER", preferredModelRef: "old-model", skillKeys: ["context"], temperature: 0.3, maxTokens: 1024 });
  await w.get('[data-model-ref="new-model"]').trigger("click");await w.findAll("button").find(b => b.text() === "common.save")!.trigger("click");await flushPromises();
  expect(addVersion).toHaveBeenCalledWith(kind, "agent", expect.objectContaining({ instructions: "Retain this edited instruction", modelProfile: "DEEP_PLANNER", preferredModelRef: "new-model" }));w.unmount();
});
it("locks profile changes while saving and never adds a profile to workflow content", async () => {
  let resolve!: (value: unknown) => void;addVersion.mockReturnValue(new Promise(done => { resolve = done; }));
  const w = await open();await w.findAll("button").find(b => b.text() === "common.save")!.trigger("click");
  expect(w.get('[data-profile="DEEP_PLANNER"]').attributes("disabled")).toBeDefined();resolve({});await flushPromises();w.unmount();
  getDefinition.mockResolvedValue({ graph: { steps: [], edges: [], maxSteps: 1 }, defaultModelRef: null });
  const flow = await open({ ...props, kind: "workflow" });expect(flow.find("[data-profile]").exists()).toBe(false);expect(flow.text()).toContain("aiStudio.definitions.workflowModelHint");flow.unmount();
});
async function open(options: { workspaceId: string; kind: "agent" | "skill" | "workflow"; id: string; canManage: boolean } = props) { const w = mount(DefinitionDetail, { props: options });await flushPromises();await w.findAll("button").find(b => b.text() === "aiStudio.definitions.newVersion")!.trigger("click");await flushPromises();return w; }
describe("versioned definition model controls", () => {
  it.each(["agent", "skill"] as const)("preserves %s content while selecting a profile-compatible model", async kind => {
    const w = await open({ ...props, kind });expect(api).toHaveBeenCalledWith("/workspaces/workspace/model-catalog?profile=CREATIVE_WRITER");
    expect(w.text()).toContain("workflowModelPreferences.inherit");
    await w.get('[data-model-ref="new-model"]').trigger("click");await w.findAll("button").find(b => b.text() === "common.save")!.trigger("click");await flushPromises();
    expect(addVersion).toHaveBeenCalledWith(kind, "agent", expect.objectContaining({ instructions: "Keep these instructions", preferredModelRef: "new-model", modelProfile: "CREATIVE_WRITER", skillKeys: ["context"], temperature: 0.3, maxTokens: 1024 }));w.unmount();
  });
  it("uses the union catalog for a workflow default and preserves its graph", async () => {
    const graph = { steps: [], edges: [], maxSteps: 1 };getDefinition.mockResolvedValue({ graph, defaultModelRef: "old-model" });const w = await open({ ...props, kind: "workflow" });
    expect(api).toHaveBeenCalledWith("/workspaces/workspace/model-catalog");await w.get('[data-model-ref=""]').trigger("click");await w.findAll("button").find(b => b.text() === "common.save")!.trigger("click");await flushPromises();expect(addVersion).toHaveBeenCalledWith("workflow", "agent", { graph, defaultModelRef: null });w.unmount();
  });
  it("synchronizes JSON edits/profile changes, retains missing choices and refuses invalid JSON", async () => {
    const w = await open();expect(w.text()).toContain("modelPreference.stale");
    const field = w.get("textarea");await field.setValue('{"instructions":"Changed","modelProfile":"DEEP_PLANNER","preferredModelRef":"old-model"}');await flushPromises();
    expect(api).toHaveBeenLastCalledWith("/workspaces/workspace/model-catalog?profile=DEEP_PLANNER");
    await w.get('[data-model-ref="new-model"]').trigger("click");expect(JSON.parse((field.element as HTMLTextAreaElement).value)).toMatchObject({ instructions: "Changed", modelProfile: "DEEP_PLANNER", preferredModelRef: "new-model" });
    await field.setValue("{broken");expect(w.findComponent({ name: "ModelPreferenceSelect" }).exists()).toBe(false);
    await w.findAll("button").find(b => b.text() === "common.save")!.trigger("click");expect(addVersion).not.toHaveBeenCalled();expect(w.text()).toContain("aiStudio.definitions.errors.invalid");w.unmount();
  });
  it("preserves the selected model and draft after server rejection", async () => {
    addVersion.mockRejectedValue(new Error("rejected"));const w = await open();await w.get('[data-model-ref="new-model"]').trigger("click");
    await w.findAll("button").find(b => b.text() === "common.save")!.trigger("click");await flushPromises();expect(w.find('[role="dialog"]').exists()).toBe(true);
    expect(JSON.parse((w.get("textarea").element as HTMLTextAreaElement).value).preferredModelRef).toBe("new-model");expect(w.text()).toContain("aiStudio.definitions.errors.generic");w.unmount();
  });
  it("ignores old definition loads and closes the editor when workspace/kind changes", async () => {
    let resolve!: (value: Record<string, unknown>) => void;getDefinition.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const w = mount(DefinitionDetail, { props });await flushPromises();getDefinition.mockResolvedValue({ name: "Current workflow", graph: { steps: [] } });
    await w.setProps({ workspaceId: "workspace-b", kind: "workflow", id: "flow" });await flushPromises();resolve({ name: "Old private agent" });await flushPromises();expect(w.text()).toContain("Current workflow");expect(w.text()).not.toContain("Old private agent");
    await w.findAll("button").find(b => b.text() === "aiStudio.definitions.newVersion")!.trigger("click");await w.setProps({ id: "another-flow" });await flushPromises();expect(w.find('[role="dialog"]').exists()).toBe(false);w.unmount();
  });
  it("does not emit or close a different definition after an old submission resolves", async () => {
    let resolve!: (value: unknown) => void;addVersion.mockReturnValue(new Promise(done => { resolve = done; }));const w = await open();
    await w.findAll("button").find(b => b.text() === "common.save")!.trigger("click");await w.setProps({ id: "other" });await flushPromises();resolve({});await flushPromises();expect(w.emitted("changed")).toBeUndefined();w.unmount();
  });
  it("does not expose mutations to a read-only collaborator", async () => {
    const w = mount(DefinitionDetail, { props: { ...props, canManage: false } });await flushPromises();expect(w.text()).not.toContain("aiStudio.definitions.newVersion");expect(w.find("textarea").exists()).toBe(false);w.unmount();
  });
  it("keeps Escape inside the open model menu and has no automated dialog accessibility violations", async () => {
    const host = document.createElement("main");document.body.append(host);
    const w = mount(DefinitionDetail, { props, attachTo: host });await flushPromises();
    await w.findAll("button").find(b => b.text() === "aiStudio.definitions.newVersion")!.trigger("click");await flushPromises();
    const menu = w.get(".nf-model-preference");(menu.element as HTMLDetailsElement).open = true;
    await menu.trigger("keydown", { key: "Escape" });expect((menu.element as HTMLDetailsElement).open).toBe(false);expect(w.find('[role="dialog"]').exists()).toBe(true);
    expect((await axe(host)).violations).toEqual([]);w.unmount();host.remove();
  });
});
