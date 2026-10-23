import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { axe } from "vitest-axe";
import StorySuggestionsPanel from "./StorySuggestionsPanel.vue";
import StoryIdentitySelect from "./StoryIdentitySelect.vue";
import ConfirmDialog from "../workspace/ConfirmDialog.vue";
import { en } from "../../i18n/en";
import { id } from "../../i18n/id";
import { ApiError } from "../../composables/useApi";
const { api, language } = vi.hoisted(() => ({ api: vi.fn(), language: { value: "en" } }));
vi.mock("../../composables/useApi", async original => ({ ...await original<typeof import("../../composables/useApi")>(), useApi: () => ({ api }) }));
vi.mock("../../composables/useLocale", () => ({ useLocale: () => ({ t: (key: string) => {
  const read = (locale: unknown) => key.split('.').reduce<unknown>((v, k) => (v as Record<string, unknown>)?.[k], locale);
  return read(language.value === 'id' ? id : en) ?? read(en) ?? key;
} }) }));
const props = { workspaceId: "w", novelId: "n", chapterId: "c", runId: "r", currentVersion: 1, runStatus: "SUCCEEDED" };
const base = "/workspaces/w/novels/n";
const group = { id: "g", kind: "GROUP", name: "Surya", summary: "A group", quotes: ["Husein leads Surya."], members: [{ name: "Husein", role: "LEADER", quote: "Husein leads Surya." }], version: 1, status: "PENDING" };
const research = { id: "s", kind: "RESEARCH", name: "Rumput Tuba", summary: "Fictional plant", quotes: ["Rumput Tuba is fictional."], mode: "FICTIONAL_ADAPTATION", version: 1, status: "PENDING" };
const view = () => ({ id: "b", runId: "r", chapterId: "c", status: "SUCCEEDED", candidates: [structuredClone(group), structuredClone(research)], canManage: true, canApprove: true, canManageReferences: true, blockedReason: null, expectedBranchId: "branch", expectedHeadRevisionId: "head", expectedChapterVersionId: "version" });
const wrappers: ReturnType<typeof mount>[] = [];
function render() { const w = mount(StorySuggestionsPanel, { props }); wrappers.push(w); return w; }
beforeEach(() => { language.value = "en"; api.mockReset().mockImplementation(async (url: string) => url.includes('/options') ? [] : view()); });
afterEach(() => { wrappers.splice(0).forEach(w => w.unmount()); vi.useRealTimers(); });
describe("story suggestions author decisions", () => {
  it("locks all edit fields while saving a proposal", async () => {
    const w = render();await flushPromises();await w.get('[data-testid="story-edit-g"]').trigger('click');
    let resolve!: (value: unknown) => void;
    api.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    await w.get('form').trigger('submit');
    expect(w.get('fieldset').attributes('disabled')).toBeDefined();
    for (const field of w.findAll('form input, form textarea, form select')) expect(field.element.closest('fieldset')?.disabled).toBe(true);
    resolve(view());await flushPromises();
  });
  it.each([['en', 'Approve', 'Edit', 'Reject'], ['id', 'Setujui', 'Ubah', 'Tolak']])("shows distinct decisions and evidence in %s", async (locale, approve, edit, reject) => {
    language.value = locale; const w = render(); await flushPromises();
    expect(w.get('[data-testid="story-approve-g"]').text()).toBe(approve);
    expect(w.get('[data-testid="story-edit-g"]').text()).toBe(edit);
    expect(w.get('[data-testid="story-reject-g"]').text()).toBe(reject);
    expect(w.text()).toContain(group.quotes[0]); expect(w.text()).not.toMatch(/storySuggestions\.|newCharacters\./);
    expect(api.mock.calls).toHaveLength(1);
    expect((await axe(w.element)).violations).toEqual([]);
  });
  it("never starts another model call on GET; empty results require an explicit analysis action", async () => {
    api.mockResolvedValueOnce(null); const w = render(); await flushPromises();
    expect(api.mock.calls).toHaveLength(1);
    await w.get('button').trigger('click'); await flushPromises();
    expect(api.mock.calls[1]?.[0]).toBe(`${base}/runs/r/story-discovery`);
    expect(api.mock.calls[1]?.[1].method).toBe('POST');
  });
  it("requires confirmation and sends current chapter/head/candidate pins without inferred acceptance", async () => {
    const w = render(); await flushPromises(); await w.get('[data-testid="story-approve-g"]').trigger('click');
    expect(api.mock.calls).toHaveLength(1); expect(w.findComponent(ConfirmDialog).props('body')).toContain('recovery checkpoint');
    w.findComponent(ConfirmDialog).vm.$emit('confirm'); await flushPromises();
    const call = api.mock.calls.find(([url]) => url.endsWith('/approve'));
    expect(JSON.parse(call?.[1].body)).toEqual({ expectedVersion: 1, expectedBranchId: 'branch', expectedHeadRevisionId: 'head', expectedChapterVersionId: 'version' });
  });
  it("edits reference links with quotations and keeps immutable evidence out of editable fields", async () => {
    const w = render(); await flushPromises(); await w.get('[data-testid="story-edit-s"]').trigger('click'); await flushPromises();
    w.findComponent(StoryIdentitySelect).vm.$emit('update:modelValue', 'reference-version'); await flushPromises();
    await w.get('select').setValue('REAL_REFERENCE');
    await w.findAll('textarea')[1]!.setValue('Exact source quote');
    await w.get('form').trigger('submit'); await flushPromises();
    const call = api.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse(call?.[1].body)).toEqual({ expectedVersion: 1, edit: { name: research.name, summary: research.summary, mode: 'REAL_REFERENCE', referenceVersionId: 'reference-version', supportingQuote: 'Exact source quote' } });
  });
  it("blocks premature approval and explains unresolved identities without exposing technical errors", async () => {
    api.mockResolvedValueOnce({ ...view(), blockedReason: 'APPLY_DRAFT_FIRST' }); const w = render(); await flushPromises();
    expect(w.get('[data-testid="story-approve-g"]').attributes('disabled')).toBeDefined();
    await w.setProps({ currentVersion: 2 }); await flushPromises();
    api.mockRejectedValueOnce(new ApiError('STORY_CHARACTER_UNRESOLVED', 409));
    await w.get('[data-testid="story-approve-g"]').trigger('click'); w.findComponent(ConfirmDialog).vm.$emit('confirm'); await flushPromises();
    expect(w.get('[role="alert"]').text()).toContain('Choose the existing character');
    expect(api.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });
  it("rejects by candidate version and discards a late response from another chapter", async () => {
    const w = render(); await flushPromises();
    await w.get('[data-testid="story-reject-s"]').trigger('click'); await flushPromises();
    expect(JSON.parse(api.mock.calls.find(([url]) => url.endsWith('/reject'))?.[1].body)).toEqual({ expectedVersion: 1 });
    let resolve!: (value: unknown) => void;
    api.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    await w.setProps({ currentVersion: 3 });
    api.mockResolvedValueOnce(null); await w.setProps({ chapterId: 'next', runId: 'next-run' }); await flushPromises();
    resolve(view()); await flushPromises();
    expect(w.find('[data-testid="story-approve-g"]').exists()).toBe(false);
  });
});
