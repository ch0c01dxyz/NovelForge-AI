import { expect, it, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import StarterPackInstall from "./StarterPackInstall.vue";
import { ApiError } from "../../composables/useApi";
import { en } from "../../i18n/en";
import { id } from "../../i18n/id";
const { installStarterPack } = vi.hoisted(() => ({ installStarterPack: vi.fn() }));
vi.mock("../../composables/useAiStudio", () => ({ useAiStudio: () => ({ installStarterPack }) }));
vi.mock("../../composables/useLocale", () => ({ useLocale: () => ({ t: (key: string) => key }) }));
beforeEach(() => installStarterPack.mockReset().mockResolvedValue({ workflowId: "workflow", created: true }));
it("requires explicit publication consent, prevents duplicate submits, and returns scoped success", async () => {
  let resolve!: (value: unknown) => void;installStarterPack.mockReturnValue(new Promise(done => { resolve = done; }));
  const w = mount(StarterPackInstall, { props: { workspaceId: "own" } });
  expect(w.get("button").attributes("disabled")).toBeDefined();expect(installStarterPack).not.toHaveBeenCalled();
  await w.get("input").setValue(true);await w.get("button").trigger("click");await w.get("button").trigger("click");
  expect(installStarterPack).toHaveBeenCalledExactlyOnceWith("own");
  resolve({ workflowId: "workflow", created: true });await flushPromises();
  expect(w.emitted("installed")).toEqual([[{ workspaceId: "own", workflowId: "workflow" }]]);
  expect(w.find('[role="status"]').text()).toBe("studioStarter.success");expect(w.get("button").attributes("disabled")).toBeDefined();w.unmount();
});
it("allows explicit safe retry after a lost response", async () => {
  installStarterPack.mockRejectedValueOnce(new TypeError("network lost")).mockResolvedValueOnce({ workflowId: "same", created: false });
  const w = mount(StarterPackInstall, { props: { workspaceId: "own" } });
  await w.get("input").setValue(true);await w.get("button").trigger("click");await flushPromises();
  expect(w.get('[role="alert"]').text()).toBe("studioStarter.failed");expect(w.emitted("installed")).toBeUndefined();
  await w.get("button").trigger("click");await flushPromises();
  expect(installStarterPack.mock.calls).toEqual([["own"], ["own"]]);expect(w.emitted("installed")![0]).toEqual([{ workspaceId: "own", workflowId: "same" }]);w.unmount();
});
it("shows the safe occupied definition key and ignores obsolete workspace responses", async () => {
  installStarterPack.mockRejectedValueOnce(new ApiError("STARTER_PACK_KEY_CONFLICT", 409, "agent/chapter-writer"));
  const w = mount(StarterPackInstall, { props: { workspaceId: "own" } });
  await w.get("input").setValue(true);await w.get("button").trigger("click");await flushPromises();
  expect(w.get('[role="alert"]').text()).toContain("agent/chapter-writer");
  let resolve!: (value: unknown) => void;installStarterPack.mockReturnValue(new Promise(done => { resolve = done; }));
  await w.get("button").trigger("click");await w.setProps({ workspaceId: "other" });resolve({ workflowId: "old", created: true });await flushPromises();
  expect(w.emitted("installed")).toBeUndefined();expect(w.find('[role="status"]').exists()).toBe(false);expect(w.get("button").attributes("disabled")).toBeDefined();w.unmount();
});
it("has matching English and Indonesian copy including explicit publication and retry boundaries", () => {
  expect(Object.keys(id.studioStarter).sort()).toEqual(Object.keys(en.studioStarter).sort());
  for (const locale of [en, id]) for (const value of Object.values(locale.studioStarter)) expect(value.trim()).not.toBe("");
});
