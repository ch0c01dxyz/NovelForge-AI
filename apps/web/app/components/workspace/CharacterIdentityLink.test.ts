import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { axe } from "vitest-axe";
import CharacterIdentityLink from "./CharacterIdentityLink.vue";
import { ApiError } from "../../composables/useApi";
import { en } from "../../i18n/en";
import { id } from "../../i18n/id";
const { api } = vi.hoisted(() => ({ api: vi.fn() }));
let language: "en" | "id" = "en";
vi.mock("../../composables/useApi", async original => ({ ...await original<typeof import("../../composables/useApi")>(), useApi: () => ({ api }) }));
vi.mock("../../composables/useLocale", () => ({ useLocale: () => ({ t: (key: string, params?: Record<string, string>) => {
  const value = key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], language === "en" ? en : id);
  return typeof value === "string" ? value.replace(/\{(\w+)\}/g, (match, name: string) => params?.[name] ?? match) : key;
} }) }));
const props = { workspaceId: "workspace", novelId: "novel", characterId: "character" };
const option = { id: "entity", name: "Sofian Magani", key: "char-sofian-magani" };
const data = { character: { id: "character", name: "Sofian Magani", storyEntityId: null }, branchId: "branch", headRevisionId: "head", candidates: [option], hasMore: false };
beforeEach(() => { language = "en"; api.mockReset().mockResolvedValue(data); });
async function opened() {
  const wrapper = mount(CharacterIdentityLink, { props, attachTo: document.body });
  await wrapper.get('[data-testid="identity-open"]').trigger("click"); await flushPromises(); return wrapper;
}
async function reviewed(wrapper: Awaited<ReturnType<typeof opened>>) {
  await wrapper.get('[data-testid="identity-option"]').trigger("click");
  await wrapper.get('[data-testid="identity-review"]').trigger("click");
}
describe("explicit character identity linking", () => {
  it("never preselects a same-name identity and only writes after explicit review and confirmation", async () => {
    const w = await opened();
    expect(w.get('[data-testid="identity-review"]').attributes("disabled")).toBeDefined();
    expect(api.mock.calls.every(([, init]) => !init?.method)).toBe(true);
    await reviewed(w);
    expect(api.mock.calls).toHaveLength(1);
    expect(w.get('[data-testid="identity-confirmation"]').text()).toContain(option.key);
    expect(document.activeElement).toBe(w.get('[data-testid="identity-confirmation"]').element);
    api.mockResolvedValueOnce({ characterId: "character", storyEntityId: "entity", revisionId: "next", checkpointId: "checkpoint" });
    await w.get('[data-testid="identity-confirm"]').trigger("click"); await flushPromises();
    expect(JSON.parse(api.mock.calls[1]![1].body)).toEqual({ storyEntityId: "entity", expectedBranchId: "branch", expectedHeadRevisionId: "head" });
    expect(api.mock.calls[1]![0]).toBe("/workspaces/workspace/novels/novel/characters/character/story-entity");
    expect(w.emitted("linked")).toHaveLength(1); expect(w.find('[role="dialog"]').exists()).toBe(false); w.unmount();
  });
  it("searches on demand and pages candidates without writing or retaining an unchecked selection", async () => {
    api.mockResolvedValueOnce({ ...data, hasMore: true });
    const w = await opened();
    api.mockResolvedValueOnce({ ...data, candidates: [{ ...option, id: "other" }], hasMore: false });
    await w.get('[data-testid="identity-more"]').trigger("click"); await flushPromises();
    expect(api.mock.calls[1]![0]).toContain("skip=1");
    expect(w.findAll('[data-testid="identity-option"]')).toHaveLength(2);
    await w.get('[type="search"]').setValue("Sofian");
    await w.get("form").trigger("submit"); await flushPromises();
    expect(api.mock.calls[2]![0]).toContain("q=Sofian");
    expect(api.mock.calls[2]![0]).toContain("skip=0"); w.unmount();
  });
  it("shows an actionable empty state without offering automatic identity creation", async () => {
    api.mockResolvedValueOnce({ ...data, candidates: [] }); const w = await opened();
    expect(w.text()).toContain(en.characterIdentity.empty);
    expect(w.get('[data-testid="identity-review"]').attributes("disabled")).toBeDefined(); w.unmount();
  });
  it("requires a reload after a stale confirmation and never retries the mutation automatically", async () => {
    const w = await opened(); await reviewed(w);
    api.mockRejectedValueOnce(new ApiError("CONFLICT", 409));
    await w.get('[data-testid="identity-confirm"]').trigger("click"); await flushPromises();
    expect(w.get('[role="alert"]').text()).toBe(en.characterIdentity.conflict);
    expect(w.find('[data-testid="identity-confirm"]').exists()).toBe(false);
    expect(api.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(1); w.unmount();
  });
  it("checks an uncertain result without sending another link mutation", async () => {
    const w = await opened(); await reviewed(w); api.mockRejectedValueOnce(new TypeError("lost response"));
    await w.get('[data-testid="identity-confirm"]').trigger("click"); await flushPromises();
    expect(w.get('[role="alert"]').text()).toBe(en.characterIdentity.uncertain);
    api.mockResolvedValueOnce({ ...data, character: { ...data.character, storyEntityId: "entity" }, candidates: [] });
    await w.get('[data-testid="identity-check"]').trigger("click"); await flushPromises();
    expect(w.emitted("linked")).toHaveLength(1);
    expect(api.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(1); w.unmount();
  });
  it("ignores late options when the character changes", async () => {
    let resolve!: (value: typeof data) => void;
    api.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const w = mount(CharacterIdentityLink, { props });
    await w.get('[data-testid="identity-open"]').trigger("click");
    await w.setProps({ characterId: "another" }); resolve(data); await flushPromises();
    expect(w.find('[role="dialog"]').exists()).toBe(false); expect(w.emitted("linked")).toBeUndefined(); w.unmount();
  });
  it.each(["en", "id"] as const)("provides labeled controls and a keyboard-accessible dialog in %s", async locale => {
    language = locale; const w = await opened();
    expect(w.get('[role="dialog"]').attributes("aria-label")).toBe((locale === "en" ? en : id).characterIdentity.title);
    expect((await axe(w.element)).violations).toEqual([]);
    await w.get('[role="dialog"]').trigger("keydown", { key: "Escape" });
    expect(w.find('[role="dialog"]').exists()).toBe(false); w.unmount();
  });
});
