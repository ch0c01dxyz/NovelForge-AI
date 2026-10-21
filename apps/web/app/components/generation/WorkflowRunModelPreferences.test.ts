import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import WorkflowRunModelPreferences from "./WorkflowRunModelPreferences.vue";
import ModelPreferenceSelect from "./ModelPreferenceSelect.vue";
import { axe } from "vitest-axe";
import { en } from "../../i18n/en";
import { id } from "../../i18n/id";
const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../../composables/useApi", () => ({ useApi: () => ({ api }) }));
vi.mock("../../composables/useLocale", () => ({ useLocale: () => ({ t: (key: string) => key }) }));
const fingerprint = "a".repeat(64);
const preview = { fingerprint, steps: [{ stepKey: "write", kind: "AGENT", definitionKey: "writer", profile: "CREATIVE_WRITER", inheritedModelRef: "inherited", inheritedSource: "AGENT" }] };
const props = { workspaceId: "workspace", workflowId: "workflow", novelId: "novel", modelValue: {} };
beforeEach(() => { api.mockReset().mockImplementation(async (path: string) => path.includes("/model-preferences?") ? preview : [{ modelRef: "inherited", providerModelId: "provider/writer", displayName: "Writer model", gatewayId: "gateway", selectable: true }]); });
describe("per-step workflow model controls", () => {
  it("loads metadata even while interaction is disabled and has aligned accessible controls", async () => {
    const host = document.createElement("main");document.body.append(host);
    const wrapper = mount(WorkflowRunModelPreferences, { props: { ...props, disabled: true }, attachTo: host });await flushPromises();
    expect(wrapper.emitted("fingerprint")?.at(-1)).toEqual([fingerprint]);
    expect(wrapper.getComponent(ModelPreferenceSelect).props("disabled")).toBe(true);
    expect(Object.keys(en.workflowModelPreferences).sort()).toEqual(Object.keys(id.workflowModelPreferences).sort());
    expect(Object.keys(en.workflowModelPreferences.sources).sort()).toEqual(Object.keys(id.workflowModelPreferences.sources).sort());
    wrapper.get("details").element.open = true;
    try { expect((await axe(host)).violations).toEqual([]); }
    finally { wrapper.unmount();host.remove(); }
  });
  it("loads server profiles, exposes inherited model/source and emits step choices with a ready fingerprint", async () => {
    const wrapper = mount(WorkflowRunModelPreferences, { props });await flushPromises();
    expect(api).toHaveBeenCalledWith("/workspaces/workspace/workflows/workflow/model-preferences?novelId=novel");
    expect(wrapper.getComponent(ModelPreferenceSelect).props()).toMatchObject({ profile: "CREATIVE_WRITER", inheritedModelRef: "inherited" });
    expect(wrapper.text()).toContain("workflowModelPreferences.sources.AGENT");
    expect(wrapper.text()).toContain("Writer model");
    expect(wrapper.emitted("fingerprint")?.at(-1)).toEqual([fingerprint]);
    wrapper.getComponent(ModelPreferenceSelect).vm.$emit("update:modelValue", "chosen");
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([{ write: "chosen" }]);wrapper.unmount();
  });
  it("does not accept a delayed preview from a previous novel", async () => {
    let resolve!: (value: unknown) => void;api.mockReturnValueOnce(new Promise(finish => { resolve = finish; }));
    const wrapper = mount(WorkflowRunModelPreferences, { props });await wrapper.setProps({ novelId: "next" });await flushPromises();
    resolve({ ...preview, fingerprint: "old" });await flushPromises();
    expect(wrapper.emitted("fingerprint")?.at(-1)).toEqual([fingerprint]);wrapper.unmount();
  });
  it("fails closed on preview error and explicitly discards choices on reload", async () => {
    api.mockRejectedValueOnce(new Error("offline"));const wrapper = mount(WorkflowRunModelPreferences, { props: { ...props, modelValue: { write: "chosen" } } });await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);expect(wrapper.emitted("fingerprint")?.at(-1)).toEqual([null]);
    await wrapper.get('button[data-testid="workflow-models-reload"]').trigger("click");await flushPromises();
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([{}]);expect(wrapper.emitted("fingerprint")?.at(-1)).toEqual([fingerprint]);wrapper.unmount();
  });
});
