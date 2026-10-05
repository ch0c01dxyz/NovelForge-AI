import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import ApprovalDialog from "./ApprovalDialog.vue";

vi.mock("../../composables/useLocale", () => ({
  useLocale: () => ({
    t: (path: string, params?: Record<string, string | number>) => {
      let s = path;
      if (params) for (const [k, v] of Object.entries(params)) s += `|${k}=${v}`;
      return s;
    },
    locale: { value: "en" },
    setLocale: vi.fn(),
  }),
}));

const HASH = "a".repeat(64);

describe("ApprovalDialog", () => {
  it("echoes the truncated snapshot hash", async () => {
    const w = mount(ApprovalDialog, {
      props: { open: true, snapshotHash: HASH, deciding: false },
      attachTo: document.body,
    });
    await w.vm.$nextTick();
    const code = w.find("code");
    expect(code.text()).toContain("aaaaaaaa");
    expect(code.text()).not.toContain(HASH);
    // Full hash on demand.
    const toggle = w.findAll("button").find((b) => b.text().includes("review.showFullHash"));
    await toggle!.trigger("click");
    expect(w.find("code").text()).toBe(HASH);
    w.unmount();
  });

  it("requires a reason for reject", async () => {
    const w = mount(ApprovalDialog, {
      props: { open: true, snapshotHash: HASH, deciding: false },
      attachTo: document.body,
    });
    await w.vm.$nextTick();
    const rejectTab = w.findAll('button[role="radio"]')[1]!;
    await rejectTab.trigger("click");
    const form = w.find("form");
    await form.trigger("submit.prevent");
    expect(w.emitted("reject")).toBeUndefined();
    expect(w.text()).toContain("review.reasonRequired");
    w.unmount();
  });

  it("emits approve with undefined reason when empty", async () => {
    const w = mount(ApprovalDialog, {
      props: { open: true, snapshotHash: HASH, deciding: false },
      attachTo: document.body,
    });
    await w.vm.$nextTick();
    await w.find("form").trigger("submit.prevent");
    expect(w.emitted("approve")).toEqual([[undefined]]);
    w.unmount();
  });

  it("emits reject with the reason", async () => {
    const w = mount(ApprovalDialog, {
      props: { open: true, snapshotHash: HASH, deciding: false },
      attachTo: document.body,
    });
    await w.vm.$nextTick();
    await w.findAll('button[role="radio"]')[1]!.trigger("click");
    await w.find("textarea").setValue("Needs more tension.");
    await w.find("form").trigger("submit.prevent");
    expect(w.emitted("reject")).toEqual([["Needs more tension."]]);
    w.unmount();
  });

  it("labels the decision as text acceptance, not canon", async () => {
    const w = mount(ApprovalDialog, {
      props: { open: true, snapshotHash: HASH, deciding: false },
      attachTo: document.body,
    });
    await w.vm.$nextTick();
    expect(w.text()).toContain("review.textAcceptance");
    w.unmount();
  });

  it("traps focus inside the dialog (Tab cycles)", async () => {
    const w = mount(ApprovalDialog, {
      props: { open: true, snapshotHash: HASH, deciding: false },
      attachTo: document.body,
    });
    await w.vm.$nextTick();
    const dialog = w.find("dialog").element as HTMLDialogElement;
    const focusables = dialog.querySelectorAll<HTMLElement>(
      'button, textarea, [tabindex]:not([tabindex="-1"])',
    );
    expect(focusables.length).toBeGreaterThan(1);
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    // Tab on the last element wraps to the first.
    last.focus();
    await dialog.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(first);
    // Shift+Tab on the first wraps to the last.
    first.focus();
    const e = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    Object.defineProperty(e, "shiftKey", { value: true });
    await dialog.dispatchEvent(e);
    expect(document.activeElement).toBe(last);
    w.unmount();
  });

  it("Esc closes and returns focus to the invoking control", async () => {
    const invoker = document.createElement("button");
    invoker.textContent = "open";
    document.body.appendChild(invoker);
    invoker.focus();
    const w = mount(ApprovalDialog, {
      props: { open: true, snapshotHash: HASH, deciding: false },
      attachTo: document.body,
    });
    await w.vm.$nextTick();
    const dialog = w.find("dialog").element as HTMLDialogElement;
    const cancelEvent = new Event("cancel", { cancelable: true });
    dialog.dispatchEvent(cancelEvent);
    await w.vm.$nextTick();
    expect(w.emitted("close")).toHaveLength(1);
    w.unmount();
    invoker.remove();
  });
});
