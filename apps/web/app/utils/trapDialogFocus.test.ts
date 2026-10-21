import { describe, expect, it } from "vitest";
import { trapDialogFocus } from "./trapDialogFocus";
describe("dialog focus with native menus", () => {
  it("treats summary as a focusable control and excludes its closed options", () => {
    const host = document.createElement("div");host.innerHTML = '<button id="first">First</button><details><summary>Models</summary><button>Hidden model</button></details><button id="last">Last</button>';document.body.append(host);
    const summary = host.querySelector("summary")!;summary.focus();const next = new KeyboardEvent("keydown", { key: "Tab", cancelable: true });trapDialogFocus(next, host);expect(next.defaultPrevented).toBe(false);
    host.querySelector("#last")!.remove();summary.focus();const wrap = new KeyboardEvent("keydown", { key: "Tab", cancelable: true });trapDialogFocus(wrap, host);expect(wrap.defaultPrevented).toBe(true);expect(document.activeElement).toBe(host.querySelector("#first"));host.remove();
  });
});
