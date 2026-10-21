import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import ModelPreferenceSelect from "./ModelPreferenceSelect.vue";
const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../../composables/useApi", () => ({ useApi: () => ({ api }) }));
vi.mock("../../composables/useLocale", () => ({ useLocale: () => ({ t: (key: string) => key }) }));
const props = { workspaceId: "workspace-a", profile: "STRUCTURED_EXTRACTOR", modelValue: "" };
const option = (modelRef: string, gatewayId: string) => ({ modelRef, gatewayId, providerModelId: "shared/model", displayName: "Shared model", profile: props.profile, selectable: true });
beforeEach(() => { api.mockReset().mockResolvedValue([option("one", "gateway-a"), option("two", "gateway-b")]); });
describe("author model preference", () => {
  it("focuses an editable search while the live catalog is still loading", async () => {
    let resolve!: (value: unknown) => void;api.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const wrapper = mount(ModelPreferenceSelect, { props, attachTo: document.body });
    const details = wrapper.get("details").element as HTMLDetailsElement;details.open = true;await wrapper.get("details").trigger("toggle");await flushPromises();
    expect(wrapper.get("input").attributes("disabled")).toBeUndefined();expect(document.activeElement).toBe(wrapper.get("input").element);
    await wrapper.get("input").setValue("shared");resolve([option("one", "gateway-a")]);await flushPromises();expect(wrapper.find('[data-model-ref="one"]').exists()).toBe(true);wrapper.unmount();
  });
  it("shows inherited identity without emitting it as an explicit override", async () => {
    const wrapper = mount(ModelPreferenceSelect, { props: { ...props, inheritedModelRef: "two", automaticLabel: "Inherit" } });await flushPromises();
    expect(wrapper.get("summary").text()).toContain("Inherit");expect(wrapper.get("summary").text()).toContain("gateway-b");
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();wrapper.unmount();
  });
  it("uses internal identity, distinguishes gateways and offers explicit Automatic", async () => {
    const wrapper = mount(ModelPreferenceSelect, { props });
    await flushPromises();
    expect(api).toHaveBeenCalledWith("/workspaces/workspace-a/model-catalog?profile=STRUCTURED_EXTRACTOR");
    expect(wrapper.text()).toContain("gateway-a");
    expect(wrapper.text()).toContain("gateway-b");
    await wrapper.get('[data-model-ref="two"]').trigger("click");
    await wrapper.get('[data-model-ref=""]').trigger("click");
    expect(wrapper.emitted("update:modelValue")).toEqual([["two"], [""]]);
  });
  it("retains an unavailable choice across empty/error refresh and offers retry", async () => {
    api.mockRejectedValueOnce(new Error("offline"));
    const wrapper = mount(ModelPreferenceSelect, { props: { ...props, modelValue: "removed" } });
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    expect(wrapper.get("summary").text()).toContain("removed");
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    api.mockResolvedValueOnce([]);
    await wrapper.get('[role="alert"] button').trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("modelPreference.empty");
    expect(wrapper.get("summary").text()).toContain("removed");
  });
  it("ignores stale catalog responses after tenant changes and unmount", async () => {
    let finish!: (value: unknown) => void;
    api.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const wrapper = mount(ModelPreferenceSelect, { props });
    await wrapper.setProps({ workspaceId: "workspace-b" });
    await flushPromises();
    finish([option("old", "old-gateway")]);
    await flushPromises();
    expect(wrapper.text()).not.toContain("old-gateway");
    wrapper.unmount();
  });
  it("searches the whole large catalog and keeps every model reachable in bounded batches", async () => {
    api.mockResolvedValue(Array.from({ length: 2498 }, (_, i) => ({ ...option(`id-${i}`, "Router"), providerModelId: `provider/model-${i}`, displayName: `Model ${i}` })));
    const wrapper = mount(ModelPreferenceSelect, { props });await flushPromises();
    expect(wrapper.findAll("button[data-model-ref]")).toHaveLength(101);
    await wrapper.findAll("button").find(button => button.text() === "modelPreference.showMore")!.trigger("click");
    expect(wrapper.findAll("button[data-model-ref]")).toHaveLength(201);
    await wrapper.get('input[type="search"]').setValue("MODEL-2497");
    expect(wrapper.findAll("button[data-model-ref]")).toHaveLength(2);expect(wrapper.find('[data-model-ref="id-2497"]').exists()).toBe(true);
    await wrapper.get('input[type="search"]').setValue("not-present");expect(wrapper.text()).toContain("modelPreference.noMatches");
    await wrapper.get('input[type="search"]').setValue("router");expect(wrapper.findAll("button[data-model-ref]")).toHaveLength(101);wrapper.unmount();
  });
  it("hides unmapped and unsynced catalog choices", async () => {
    api.mockResolvedValue([{ ...option("unmapped", "Router"), selectable: false, unavailableReason: "NOT_MAPPED" }, { ...option("unsynced", "Router2"), modelRef: null, selectable: false, unavailableReason: "NOT_SYNCED" }]);
    const wrapper = mount(ModelPreferenceSelect, { props });await flushPromises();
    expect(wrapper.find('[data-model-ref="unmapped"]').exists()).toBe(false);
    expect(wrapper.findAll("button[data-model-ref]")).toHaveLength(1);
    expect(wrapper.text()).not.toContain("modelPreference.reasons.NOT_MAPPED");expect(wrapper.text()).not.toContain("modelPreference.reasons.NOT_SYNCED");
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();wrapper.unmount();
  });
  it("focuses search when opened and keeps Show more open; Escape restores trigger focus", async () => {
    api.mockResolvedValue(Array.from({ length: 120 }, (_, i) => ({ ...option(`id-${i}`, "Router"), providerModelId: `model-${i}` })));
    const wrapper = mount(ModelPreferenceSelect, { props, attachTo: document.body });await flushPromises();
    const details = wrapper.get("details").element as HTMLDetailsElement;details.open = true;await wrapper.get("details").trigger("toggle");await flushPromises();
    expect(document.activeElement).toBe(wrapper.get("input").element);
    await wrapper.findAll("button").find(button => button.text() === "modelPreference.showMore")!.trigger("click");expect(details.open).toBe(true);
    await wrapper.get("input").trigger("keydown", { key: "Escape" });expect(details.open).toBe(false);expect(document.activeElement).toBe(wrapper.get("summary").element);wrapper.unmount();
  });
});
