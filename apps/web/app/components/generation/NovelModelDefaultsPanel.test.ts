import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import NovelModelDefaultsPanel from "./NovelModelDefaultsPanel.vue";
import ModelPreferenceSelect from "./ModelPreferenceSelect.vue";
import { ApiError } from "../../composables/useApi";
import { axe } from "vitest-axe";
import { en } from "../../i18n/en";
import { id } from "../../i18n/id";
const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../../composables/useApi", async original => ({ ...await original<typeof import("../../composables/useApi")>(), useApi: () => ({ api }) }));
vi.mock("../../composables/useLocale", () => ({ useLocale: () => ({ t: (key: string) => key }) }));
const props = { workspaceId: "workspace", novelId: "novel" };
const view = (number = 7) => ({ id: `version-${number}`, number, generationModelRef: "writer", analysisModelRef: "reviewer" });
beforeEach(() => { api.mockReset().mockImplementation(async (url: string) => url.includes("/model-catalog?") ? [] : view()); });
describe("versioned novel model defaults", () => {
  it("has aligned en/id resources and labeled controls without axe violations", async () => {
    expect(Object.keys(en.novelModelDefaults).sort()).toEqual(Object.keys(id.novelModelDefaults).sort());
    const wrapper = mount(NovelModelDefaultsPanel, { props });await flushPromises();
    expect((await axe(wrapper.element)).violations).toEqual([]);wrapper.unmount();
  });
  it("saves nullable model choices with the loaded CAS version and trimmed reason", async () => {
    const wrapper = mount(NovelModelDefaultsPanel, { props });await flushPromises();
    const pickers = wrapper.findAllComponents(ModelPreferenceSelect);
    expect(pickers.map(picker => picker.props("profile"))).toEqual(["CREATIVE_WRITER", "STRUCTURED_EXTRACTOR"]);
    pickers[0]!.vm.$emit("update:modelValue", "");
    await wrapper.get("textarea").setValue("  Prefer automatic chapter routing  ");
    api.mockResolvedValueOnce({ ...view(8), generationModelRef: null });
    await wrapper.get("form").trigger("submit");await flushPromises();
    expect(api).toHaveBeenLastCalledWith("/workspaces/workspace/novels/novel/model-defaults", { method: "PUT", body: JSON.stringify({ expectedVersion: 7, generationModelRef: null, analysisModelRef: "reviewer", reason: "Prefer automatic chapter routing" }) });
    expect(wrapper.get('[data-testid="defaults-version"]').text()).toContain("8");
    expect(wrapper.text()).toContain("novelModelDefaults.saved");wrapper.unmount();
  });
  it("retains rejected edits and requires explicit reload after CAS conflict or unknown save", async () => {
    for (const error of [new ApiError("CONFLICT", 409), new Error("offline")]) {
      const wrapper = mount(NovelModelDefaultsPanel, { props });await flushPromises();
      await wrapper.get("textarea").setValue("Keep my draft");
      api.mockRejectedValueOnce(error);
      await wrapper.get("form").trigger("submit");await flushPromises();
      expect(wrapper.get("textarea").element.value).toBe("Keep my draft");
      expect(wrapper.get('button[type="submit"]').attributes("disabled")).toBeDefined();
      expect(wrapper.get('[role="alert"]').text()).toContain(error instanceof ApiError ? "novelModelDefaults.conflict" : "novelModelDefaults.uncertain");
      api.mockResolvedValueOnce(view(9));await wrapper.get('[data-testid="defaults-reload"]').trigger("click");await flushPromises();
      expect(wrapper.get('[data-testid="defaults-version"]').text()).toContain("9");
      expect(wrapper.get("textarea").element.value).toBe("");wrapper.unmount();
    }
  });
  it("ignores a previous novel's delayed load and save error", async () => {
    let finish!: (value: unknown) => void;
    api.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const wrapper = mount(NovelModelDefaultsPanel, { props });
    await wrapper.setProps({ novelId: "new-novel" });await flushPromises();
    finish(view(99));await flushPromises();expect(wrapper.get('[data-testid="defaults-version"]').text()).not.toContain("99");
    let fail!: (reason: Error) => void;
    await wrapper.get("textarea").setValue("Old save");api.mockReturnValueOnce(new Promise((_resolve, reject) => { fail = reject; }));
    await wrapper.get("form").trigger("submit");await wrapper.setProps({ novelId: "third-novel" });await flushPromises();
    fail(new Error("Late failure"));await flushPromises();expect(wrapper.find('[role="alert"]').exists()).toBe(false);wrapper.unmount();
  });
});
