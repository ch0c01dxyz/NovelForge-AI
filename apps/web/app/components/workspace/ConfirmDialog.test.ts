/**
 * ConfirmDialog tests (NF-WF-016): explicit confirmation for every
 * destructive workspace action. Verifies confirm/cancel emissions,
 * backdrop-click cancel, and Esc dismissal.
 */
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ConfirmDialog from "./ConfirmDialog.vue";

function mountDialog(extra: Record<string, unknown> = {}) {
  return mount(ConfirmDialog, {
    attachTo: document.body,
    props: {
      open: true,
      title: "Delete this saga?",
      body: "This cannot be undone.",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      ...extra,
    },
  });
}

describe("ConfirmDialog", () => {
  it("renders the title, body, and both labels", () => {
    const w = mountDialog();
    expect(w.text()).toContain("Delete this saga?");
    expect(w.text()).toContain("This cannot be undone.");
    expect(w.find("[data-testid='confirm-ok']").text()).toBe("Delete");
    expect(w.find("[data-testid='confirm-cancel']").text()).toBe("Cancel");
    w.unmount();
  });

  it("emits confirm when the confirm button is clicked", async () => {
    const w = mountDialog();
    await w.find("[data-testid='confirm-ok']").trigger("click");
    expect(w.emitted("confirm")).toHaveLength(1);
    w.unmount();
  });

  it("emits cancel when the cancel button is clicked", async () => {
    const w = mountDialog();
    await w.find("[data-testid='confirm-cancel']").trigger("click");
    expect(w.emitted("cancel")).toHaveLength(1);
    w.unmount();
  });

  it("emits cancel when the backdrop is clicked", async () => {
    const w = mountDialog();
    await w.find("[data-testid='confirm-backdrop']").trigger("click");
    expect(w.emitted("cancel")).toHaveLength(1);
    w.unmount();
  });

  it("emits cancel on Escape", async () => {
    const w = mountDialog();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(w.emitted("cancel")).toHaveLength(1);
    w.unmount();
  });

  it("renders nothing when closed", () => {
    const w = mountDialog({ open: false });
    expect(w.html()).toBe("<!--v-if-->");
    w.unmount();
  });

  it("applies the danger style when danger is set", () => {
    const w = mountDialog({ danger: true });
    expect(w.find("[data-testid='confirm-ok']").classes().join(" ")).toContain("red-");
    w.unmount();
  });
});
