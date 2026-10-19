import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import WorkspaceDrawer from "./WorkspaceDrawer.vue";

vi.mock("../../composables/useLocale", () => ({
  useLocale: () => ({ t: (key: string) => key }),
}));

describe("WorkspaceDrawer keyboard ownership", () => {
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
