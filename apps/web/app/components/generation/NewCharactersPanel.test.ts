import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { axe } from "vitest-axe";
import NewCharactersPanel from "./NewCharactersPanel.vue";
import ConfirmDialog from "../workspace/ConfirmDialog.vue";
import { ApiError } from "../../composables/useApi";
import { en } from "../../i18n/en";
import { id } from "../../i18n/id";

const { api, language } = vi.hoisted(() => ({ api: vi.fn(), language: { value: "keys" } }));
vi.mock("../../composables/useApi", async original => ({ ...await original<typeof import("../../composables/useApi")>(), useApi: () => ({ api }) }));
vi.mock("../../composables/useLocale", () => ({ useLocale: () => ({ t: (key: string) => {
  if (language.value === "keys") return key;
  const field = key.split(".")[1] as keyof typeof en.newCharacters;
  return (language.value === "id" ? id : en).newCharacters[field] ?? key;
} }) }));
const props = { workspaceId: "w", novelId: "n", chapterId: "c", runId: "r", currentVersion: 1, runStatus: "SUCCEEDED" };
const base = "/workspaces/w/novels/n";
const candidate = { id: "person", name: "Sofian", summary: "A visitor", quotes: ["Sofian entered."], status: "PENDING", version: 1, originalName: "Sofian", originalSummary: "A visitor", conflict: null };
const view = () => ({ id: "batch", runId: "r", chapterId: "c", status: "SUCCEEDED", candidates: [{ ...candidate }], canApprove: true, blockedReason: null, sourceBranchId: "branch", expectedHeadRevisionId: "head", expectedChapterVersionId: "version" });
const wrappers: ReturnType<typeof mount>[] = [];
function render() { const wrapper = mount(NewCharactersPanel, { props }); wrappers.push(wrapper); return wrapper; }
beforeEach(() => { language.value = "keys"; api.mockReset().mockResolvedValue(view()); });
afterEach(() => { wrappers.splice(0).forEach(w => w.unmount()); vi.useRealTimers(); });

describe("new character suggestions", () => {
  it("does not show apply-first guidance for already-decided candidates", async () => {
    const result = { ...view(), canApprove: false, blockedReason: "APPLY_DRAFT_FIRST", candidates: [{ ...candidate, status: "APPROVED" }] };
    api.mockResolvedValue(result);
    const w = render(); await flushPromises();
    expect(w.text()).not.toContain("newCharacters.applyFirst");
    expect(w.text()).toContain("newCharacters.approved");
    result.candidates.push({ ...candidate, id: "pending", status: "PENDING" });
    await w.setProps({ currentVersion: 4 }); await flushPromises();
    expect(w.text()).toContain("newCharacters.applyFirst");
  });
  it.each([["id", "Setujui", "Ubah", "Tolak"], ["en", "Approve", "Edit", "Reject"]])("renders explicit decision buttons in %s", async (locale, approve, edit, reject) => {
    language.value = locale;
    const w = render(); await flushPromises();
    expect(w.get('[data-testid="character-approve-person"]').text()).toBe(approve);
    expect(w.get('[data-testid="character-edit-person"]').text()).toBe(edit);
    expect(w.get('[data-testid="character-reject-person"]').text()).toBe(reject);
    expect(w.text()).not.toContain("newCharacters.");
  });
  it("detects once after an empty read, shows evidence and never approves automatically", async () => {
    api.mockResolvedValueOnce(null).mockResolvedValueOnce(view());
    const w = render(); await flushPromises();
    expect(api.mock.calls.map(([path, init]) => [path, init?.method])).toEqual([[`${base}/runs/r/character-discovery`, undefined], [`${base}/runs/r/character-discovery`, "POST"]]);
    expect(JSON.parse(api.mock.calls[1]![1].body)).toEqual({});
    expect(w.text()).toContain("Sofian entered.");
    expect(w.find('[data-testid="character-approve-person"]').exists()).toBe(true);
    expect(w.find('[data-testid="character-edit-person"]').exists()).toBe(true);
    expect(w.find('[data-testid="character-reject-person"]').exists()).toBe(true);
    expect((await axe(w.element)).violations).toEqual([]);
  });

  it("confirms approval and submits only server pins and the candidate version", async () => {
    const w = render(); await flushPromises();
    await w.get('[data-testid="character-approve-person"]').trigger("click");
    expect(api).toHaveBeenCalledTimes(1);
    w.findComponent(ConfirmDialog).vm.$emit("confirm"); await flushPromises();
    const call = api.mock.calls.find(([path]) => path.endsWith("/approve"));
    expect(call?.[0]).toBe(`${base}/character-discoveries/batch/candidates/person/approve`);
    expect(JSON.parse(call?.[1].body)).toEqual({ expectedVersion: 1, expectedHeadRevisionId: "head", expectedChapterVersionId: "version", expectedBranchId: "branch" });
  });

  it("edits explicitly and rejects with a strict version-only body", async () => {
    const w = render(); await flushPromises();
    await w.get('[data-testid="character-edit-person"]').trigger("click");
    await w.get('[data-testid="character-name"]').setValue("Sofian Magani");
    await w.get('[data-testid="character-summary"]').setValue("Author-reviewed summary");
    await w.get("form").trigger("submit"); await flushPromises();
    const patch = api.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(JSON.parse(patch?.[1].body)).toEqual({ expectedVersion: 1, name: "Sofian Magani", summary: "Author-reviewed summary" });
    await w.get('[data-testid="character-reject-person"]').trigger("click"); await flushPromises();
    const rejected = api.mock.calls.find(([path]) => path.endsWith("/reject"));
    expect(JSON.parse(rejected?.[1].body)).toEqual({ expectedVersion: 1 });
  });

  it("requires Apply first, refreshes readiness on chapter version change and explains conflicts", async () => {
    api.mockResolvedValueOnce({ ...view(), canApprove: false, blockedReason: "APPLY_DRAFT_FIRST" });
    const w = render(); await flushPromises();
    expect(w.get('[data-testid="character-approve-person"]').attributes("disabled")).toBeDefined();
    expect(w.text()).toContain("newCharacters.applyFirst");
    api.mockResolvedValueOnce({ ...view(), candidates: [{ ...candidate, conflict: "CHARACTER_EXISTS" }] });
    await w.setProps({ currentVersion: 2 }); await flushPromises();
    expect(w.text()).toContain("newCharacters.characterExists");
    expect(w.get('[data-testid="character-approve-person"]').attributes("disabled")).toBeDefined();
    expect(api.mock.calls.every(([, init]) => !init)).toBe(true);
  });
  it("explains ambiguous existing names and blocks new identity creation", async () => {
    api.mockResolvedValueOnce({ ...view(), candidates: [{ ...candidate, conflict: "IDENTITY_AMBIGUOUS" }] });
    const w = render(); await flushPromises();
    expect(w.text()).toContain("newCharacters.identityAmbiguous");
    expect(w.get('[data-testid="character-approve-person"]').attributes("disabled")).toBeDefined();
    expect(api.mock.calls.every(([, init]) => !init)).toBe(true);
  });

  it("polls by GET and requires confirmation for a failed or uncertain new AI request", async () => {
    vi.useFakeTimers(); api.mockResolvedValueOnce({ ...view(), status: "RUNNING" }).mockResolvedValueOnce({ ...view(), status: "UNCERTAIN", candidates: [] });
    const w = render(); await flushPromises();
    await vi.advanceTimersByTimeAsync(2500); await flushPromises();
    expect(api.mock.calls.every(([, init]) => !init)).toBe(true);
    await w.get('[data-testid="character-analysis-retry"]').trigger("click");
    expect(w.findComponent(ConfirmDialog).props("body")).toBe("newCharacters.retryWarning");
    w.findComponent(ConfirmDialog).vm.$emit("confirm"); await flushPromises();
    const post = api.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(post?.[1].body)).toEqual({ retry: true });
  });

  it("reads back a lost mutation without blindly retrying or exposing technical errors", async () => {
    const w = render(); await flushPromises();
    api.mockRejectedValueOnce(new Error("private provider failure")).mockResolvedValueOnce({ ...view(), candidates: [{ ...candidate, status: "REJECTED" }] });
    await w.get('[data-testid="character-reject-person"]').trigger("click"); await flushPromises();
    expect(api.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    expect(w.text()).toContain("newCharacters.rejected");
    expect(w.text()).not.toContain("private provider failure");
    expect(w.find('[data-testid="character-approve-person"]').exists()).toBe(false);
  });

  it("preserves edit input on a stale refusal and drops old-scope late responses", async () => {
    const w = render(); await flushPromises();
    await w.get('[data-testid="character-edit-person"]').trigger("click");
    await w.get('[data-testid="character-name"]').setValue("Keep this name");
    api.mockRejectedValueOnce(new ApiError("CONFLICT", 409));
    await w.get("form").trigger("submit"); await flushPromises();
    expect(w.get<HTMLInputElement>('[data-testid="character-name"]').element.value).toBe("Keep this name");
    expect(w.text()).toContain("newCharacters.changed");
    let resolve!: (value: unknown) => void;
    api.mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockResolvedValueOnce({ ...view(), runId: "new", candidates: [] });
    await w.setProps({ currentVersion: 2 });
    await w.setProps({ runId: "new" }); await flushPromises();
    resolve(view()); await flushPromises();
    expect(w.text()).not.toContain("Sofian entered.");
  });
  it("locks editable fields while the saved values are pending", async () => {
    const w = render();await flushPromises();
    await w.get('[data-testid="character-edit-person"]').trigger('click');
    let resolve!: (value: unknown) => void;
    api.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    await w.get('form').trigger('submit');
    expect(w.get('fieldset').attributes('disabled')).toBeDefined();
    expect(w.get('[data-testid="character-name"]').element.closest('fieldset')?.disabled).toBe(true);
    resolve(view());await flushPromises();
  });
});
