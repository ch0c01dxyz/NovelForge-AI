import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { ref } from "vue";
import Mappings from "./ProfileMappings.vue";
const states = new Map();
vi.stubGlobal("useCookie", () => ref(null));
vi.stubGlobal("useState", (key: string, init: () => unknown) => { if (!states.has(key)) states.set(key, ref(init())); return states.get(key); });
vi.stubGlobal("onNuxtReady", () => {});
let w: VueWrapper;
afterEach(() => { w?.unmount();states.clear(); });
const first = { profile: "CREATIVE_WRITER", modelRef: "first", modelId: "provider/model", gatewayId: "gateway-one", priority: 1, enabled: true };
const second = { ...first, modelRef: "second", gatewayId: "gateway-two" };
function setup(mappings = [first, second]) { return w = mount(Mappings, { props: { mappings, models: [], catalog: [], profiles: ["CREATIVE_WRITER"], loading: false, error: null, saving: false }, attachTo: document.body }); }
function catalog(id: string, gatewayId = "gateway-one", modelId = "provider/model") { return { modelRef: id, gatewayId, gatewayName: gatewayId, providerModelId: modelId, displayName: "Same model", selectable: false, unavailableReason: "NOT_MAPPED" as const }; }
describe("profile mapping actions", () => {
  it("offers searchable model selection instead of an unsearchable native model select", async () => {
    setup();expect(w.find('[data-testid="profile-model-select"] input[type="search"]').exists()).toBe(true);
  });
  it("distinguishes identical model names from different gateways in creation options", async () => {
    setup();
    await w.setProps({ catalog: [catalog("first", "gateway-one"), catalog("second", "gateway-two")] });
    const options = w.get('[data-testid="profile-model-select"]').findAll("button[data-model-id]");
    expect(options.map(o => o.attributes("data-model-id"))).toEqual(["first", "second"]);
    expect(options.map(o => o.text())).toEqual(["Same model · provider/model · gateway-one", "Same model · provider/model · gateway-two"]);
  });
  it("searches thousands of unmapped admin models, retains selected identity and submits the actual model UUID", async () => {
    setup();await w.setProps({ catalog: Array.from({ length: 2498 }, (_, i) => catalog(`id-${i}`, "router", `provider/model-${i}`)) });
    const picker = w.get('[data-testid="profile-model-select"]');expect(picker.findAll("button[data-model-id]")).toHaveLength(100);
    await picker.findAll("button").find(b => b.text() === "Show more models")!.trigger("click");expect(picker.findAll("button[data-model-id]")).toHaveLength(200);
    await picker.get("input").setValue("MODEL-2497");expect(picker.findAll("button[data-model-id]")).toHaveLength(1);await picker.get('[data-model-id="id-2497"]').trigger("click");await w.get('[data-testid="profile-select"]').setValue("CREATIVE_WRITER");await w.get("form").trigger("submit");
    expect(w.emitted("save")).toEqual([[{ profile: "CREATIVE_WRITER", modelId: "id-2497", priority: 100, enabled: true }]]);
    await picker.get("input").setValue("not-matched");expect(picker.text()).toContain("No matching models.");expect(picker.get("summary").text()).toContain("provider/model-2497");
  });
  it("blocks unsynced choices and stale submission during catalog failure, with retry", async () => {
    setup();await w.setProps({ catalog: [{ ...catalog("missing"), modelRef: null, unavailableReason: "NOT_SYNCED" }] });
    const picker = w.get('[data-testid="profile-model-select"]');expect(picker.findAll("button")[1]!.attributes("disabled")).toBeDefined();
    await w.setProps({ catalogError: "offline" });await w.get("form").trigger("submit");expect(w.emitted("save")).toBeUndefined();
    await w.get('[role="alert"] button').trigger("click");expect(w.emitted("reload-catalog")).toHaveLength(1);
  });
  it("focuses search, prevents Enter submit and restores focus with Escape", async () => {
    setup();const picker = w.get('[data-testid="profile-model-select"]');vi.spyOn(picker.element, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 650, 200, 30));(picker.element as HTMLDetailsElement).open = true;await picker.trigger("toggle");await flushPromises();expect(document.activeElement).toBe(picker.get("input").element);expect(picker.attributes("data-open-above")).toBe("true");
    await picker.get("input").trigger("keydown", { key: "Enter" });expect(w.emitted("save")).toBeUndefined();await picker.get("input").trigger("keydown", { key: "Escape" });expect((picker.element as HTMLDetailsElement).open).toBe(false);expect(document.activeElement).toBe(picker.get("summary").element);
  });
  it("disables the exact internal model reference when provider names collide", async () => {
    setup();await w.get("tbody tr").findAll("button")[0]!.trigger("click");
    expect(w.emitted("save")).toEqual([[{ profile: first.profile, modelId: "first", priority: 1, enabled: false }]]);
  });
  it("requires confirmation and keeps the row after a failed mapping removal", async () => {
    setup();await w.findAll("tbody tr")[1]!.findAll("button")[1]!.trigger("click");await flushPromises();
    expect(w.emitted("remove")).toBeUndefined();
    await w.get('[data-testid="confirm-ok"]').trigger("click");
    expect(w.emitted("remove")).toEqual([[second]]);
    await w.setProps({ saving: true });await w.setProps({ saving: false, actionError: "Refused" });
    expect(w.get('[role="alertdialog"] [role="alert"]').text()).toBe("Refused");
    expect(w.findAll("tbody tr")).toHaveLength(2);
    await w.setProps({ mappings: [first], actionError: null });await flushPromises();
    expect(w.find('[role="alertdialog"]').exists()).toBe(false);
  });
  it("does not target legacy mappings without a stable model reference", async () => {
    setup([{ ...first, modelRef: undefined } as unknown as typeof first]);
    expect(w.get("tbody tr").findAll("button").every(b => b.attributes("disabled") !== undefined)).toBe(true);
  });
});
