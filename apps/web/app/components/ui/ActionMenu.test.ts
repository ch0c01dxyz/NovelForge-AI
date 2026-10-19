import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ActionMenu from "./ActionMenu.vue";

describe("ActionMenu", () => {
  it("returns keyboard focus after a same-page action closes the menu", async () => {
    const wrapper = mount(ActionMenu, {
      attachTo: document.body,
      props: { label: "Tools" },
      slots: { default: "<button>Generation</button>" },
    });
    const details = wrapper.get("details").element as HTMLDetailsElement;
    details.open = true;
    (wrapper.get("button").element as HTMLElement).focus();
    await wrapper.get("button").trigger("click");
    expect(details.open).toBe(false);
    expect(document.activeElement).toBe(wrapper.get("summary").element);
    wrapper.unmount();
  });
  it("closes with Escape and returns focus to its native trigger", async () => {
    const wrapper = mount(ActionMenu, {
      attachTo: document.body,
      props: { label: "Workspace tools" },
      slots: { default: '<a href="/admin">Admin</a>' },
    });
    const details = wrapper.get("details").element as HTMLDetailsElement;
    details.open = true;
    (wrapper.get("a").element as HTMLElement).focus();
    await wrapper.get("a").trigger("keydown", { key: "Escape" });
    expect(details.open).toBe(false);
    expect(document.activeElement).toBe(wrapper.get("summary").element);
    wrapper.unmount();
  });
  it("closes after selection and outside interaction without suppressing the link", async () => {
    const wrapper = mount(ActionMenu, {
      attachTo: document.body,
      props: { label: "Workspace tools" },
      slots: { default: '<a href="#destination">Admin</a>' },
    });
    const details = wrapper.get("details").element as HTMLDetailsElement;
    details.open = true;
    await wrapper.get("a").trigger("click");
    expect(details.open).toBe(false);
    expect(wrapper.get("a").attributes("href")).toBe("#destination");
    details.open = true;
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(details.open).toBe(false);
    wrapper.unmount();
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  });
});
