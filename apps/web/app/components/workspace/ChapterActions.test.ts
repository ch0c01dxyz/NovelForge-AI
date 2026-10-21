import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { ref } from "vue";
import Actions from "./ChapterActions.vue";
import { ApiError } from "../../composables/useApi";
const api = vi.hoisted(() => vi.fn());
vi.mock("../../composables/useApi", async original => ({ ...(await original<object>()), useApi: () => ({ api }) }));
const states = new Map();
vi.stubGlobal("useCookie", () => ref(null));
vi.stubGlobal("useState", (key: string, init: () => unknown) => { if (!states.has(key)) states.set(key, ref(init())); return states.get(key); });
vi.stubGlobal("onNuxtReady", () => {});
let w: VueWrapper;
const prepare = vi.fn(async () => true);
const chapter = { id: "chapter", title: "Before", status: "DRAFT" };
function mountActions() { return w = mount(Actions, { props: { base: "/workspaces/w/novels/n", chapter, beforeChange: prepare }, attachTo: document.body }); }
beforeEach(() => { prepare.mockReset().mockResolvedValue(true); api.mockReset().mockImplementation(async (_path, init) => init ? { title: "After", currentVersion: 2 } : { title: "Before", status: "DRAFT", currentVersionId: "version" }); });
afterEach(() => { w?.unmount(); states.clear(); });
describe("chapter actions", () => {
  it.each(["rename", "delete"])("rechecks newly unsaved text before confirming %s", async kind => {
    prepare.mockResolvedValueOnce(true).mockResolvedValue(false);
    mountActions(); await w.findAll("button")[kind === "rename" ? 0 : 1]!.trigger("click"); await flushPromises();
    if (kind === "rename") { await w.get("input").setValue("After"); await w.get("form").trigger("submit"); }
    else await w.get('[data-testid="confirm-ok"]').trigger("click");
    await flushPromises();
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(api.mock.calls).toHaveLength(1);
    expect(w.emitted("changed")).toBeUndefined();expect(w.emitted("deleted")).toBeUndefined();
  });
  it("pins the current title/version and retains author input after a stale rename refusal", async () => {
    mountActions(); await w.findAll("button")[0]!.trigger("click"); await flushPromises();
    await w.get("input").setValue("After");
    api.mockRejectedValueOnce(new ApiError("CONFLICT", 409));
    await w.get("form").trigger("submit"); await flushPromises();
    expect((w.get("input").element as HTMLInputElement).value).toBe("After");
    expect(w.get('[role="alert"]').text()).toContain("changed or is protected");
    expect(JSON.parse(api.mock.calls[1]![1].body)).toEqual({ title: "After", expectedTitle: "Before", expectedChapterVersionId: "version" });
    expect(w.emitted("changed")).toBeUndefined();
  });
  it("emits the confirmed metadata update after rename", async () => {
    mountActions(); await w.findAll("button")[0]!.trigger("click"); await flushPromises();
    await w.get("input").setValue("After"); await w.get("form").trigger("submit"); await flushPromises();
    expect(w.emitted("changed")).toEqual([[{ id: "chapter", title: "After", currentVersion: 2 }]]);
  });
  it("requires confirmation for deletion and shows evidence-backed refusals", async () => {
    mountActions(); await w.findAll("button")[1]!.trigger("click"); await flushPromises();
    expect(api.mock.calls).toHaveLength(1);
    api.mockRejectedValueOnce(new ApiError("CONFLICT", 409));
    await w.get('[data-testid="confirm-ok"]').trigger("click"); await flushPromises();
    expect(w.get('[role="alertdialog"] [role="alert"]').text()).toContain("retained evidence");
    expect(w.emitted("deleted")).toBeUndefined();
    expect(JSON.parse(api.mock.calls[1]![1].body)).toEqual({ expectedTitle: "Before", expectedChapterVersionId: "version" });
  });
  it("does not request a mutation while unsaved text cannot be safely left", async () => {
    prepare.mockResolvedValue(false); mountActions();
    await w.findAll("button")[0]!.trigger("click"); await flushPromises();
    expect(api).not.toHaveBeenCalled();expect(w.find("dialog").exists()).toBe(false);
  });
});
