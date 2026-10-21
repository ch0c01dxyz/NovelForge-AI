import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { ref } from "vue";
import Dialog from "./ChapterCreateDialog.vue";
const states = new Map();
vi.stubGlobal("useCookie", () => ref(null));
vi.stubGlobal("useState", (key: string, init: () => unknown) => {
  if (!states.has(key)) states.set(key, ref(init()));
  return states.get(key);
});
vi.stubGlobal("onNuxtReady", () => {});
let wrapper: VueWrapper;
afterEach(() => { wrapper?.unmount(); states.clear(); });
describe("manual chapter creation", () => {
  it("offers the approved manual and AI alternatives and resumes an uncertain original request without a new form", async () => {
    wrapper = mount(Dialog, { props: { busy: false, error: null, workspaceId: "workspace", novelId: "novel" }, global: { stubs: { ChapterAiSetup: { template: '<button data-testid="ai-form">AI setup</button>' } } } });
    const modes = wrapper.findAll('[aria-pressed]');expect(modes).toHaveLength(2);
    await modes[1]!.trigger("click");expect(wrapper.find('[data-testid="ai-form"]').exists()).toBe(true);expect(wrapper.find('form').exists()).toBe(false);
    await wrapper.setProps({ pendingAi: true });expect(wrapper.find('[data-testid="ai-form"]').exists()).toBe(false);
    await wrapper.findAll("button")[0]!.trigger("click");expect(wrapper.emitted("resumeAi")).toHaveLength(1);expect(wrapper.emitted("manual")).toBeUndefined();
  });
  it("validates the title and emits one deliberate create without a browser prompt", async () => {
    wrapper = mount(Dialog, { props: { busy: false, error: null } });
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("manual")).toBeUndefined();
    await wrapper.get("input").setValue("  A quiet dawn  ");
    await wrapper.get("form").trigger("submit");
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("manual")).toEqual([[{ title: "A quiet dawn" }]]);
  });
  it("allows cancel, but not dismissal while saving, and keeps rejected input", async () => {
    wrapper = mount(Dialog, { props: { busy: false, error: null } });
    await wrapper.get("input").setValue("Retain my title");
    await wrapper.setProps({ busy: true });
    await wrapper.get("dialog").trigger("cancel");
    expect(wrapper.emitted("close")).toBeUndefined();
    await wrapper.setProps({ busy: false, error: "Creation refused" }); await flushPromises();
    expect((wrapper.get("input").element as HTMLInputElement).value).toBe("Retain my title");
    expect(wrapper.get('[role="alert"]').text()).toBe("Creation refused");
    await wrapper.get("dialog").trigger("cancel");
    expect(wrapper.emitted("close")).toHaveLength(1);
  });
});
