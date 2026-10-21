import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import WorkspaceDrawer from "./WorkspaceDrawer.vue";
import ActionMenu from "../ui/ActionMenu.vue";
import { h } from "vue";

vi.mock("../../composables/useLocale", () => ({
  useLocale: () => ({ t: (key: string) => key }),
}));

describe("WorkspaceDrawer keyboard ownership", () => {
  it("still closes from an ordinary open disclosure without a menu handler", () => {
    const wrapper = mount(WorkspaceDrawer, { props: { open: true, title: "History" },
      slots: { default: '<details open><summary>History</summary><button>Inspect</button></details>' } });
    document.querySelector('[role="dialog"] details button')!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    const close = wrapper.emitted("close");
    wrapper.unmount();
    expect(close).toHaveLength(1);
  });
  it("lets an open nested menu own the first Escape and closes the drawer on the next", async () => {
    const wrapper = mount(WorkspaceDrawer, { props: { open: true, title: "Analysis" },
      slots: { default: () => h(ActionMenu, { label: "Models" }, () => h("button", "Automatic")) } });
    const panel = document.querySelector('[role="dialog"]')!;
    const details = panel.querySelector("details")!;
    const button = details.querySelector("button")!;
    details.open = true;
    button.focus();
    button.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(wrapper.emitted("close")).toBeUndefined();
    expect(details.open).toBe(false);
    expect(document.activeElement).toBe(details.querySelector("summary"));
    details.querySelector("summary")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(wrapper.emitted("close")).toHaveLength(1);
    wrapper.unmount();
  });
  it("lets another surface receive Escape when mounted but closed", async () => {
    const listener = vi.fn();
    const wrapper = mount(WorkspaceDrawer, { props: { open: false, title: "Planning" } });
    const button = document.createElement("button");
    document.body.append(button);
    button.addEventListener("keydown", listener);
    button.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(listener).toHaveBeenCalledOnce();
    expect(wrapper.emitted("close")).toBeUndefined();
    await wrapper.setProps({ open: true });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(wrapper.emitted("close")).toHaveLength(1);
    wrapper.unmount();
    button.remove();
  });
});
