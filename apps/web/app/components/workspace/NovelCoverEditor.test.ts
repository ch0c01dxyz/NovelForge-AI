import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { axe } from "vitest-axe";
import NovelCoverEditor from "./NovelCoverEditor.vue";
import ModelPreferenceSelect from "../generation/ModelPreferenceSelect.vue";
import ConfirmDialog from "./ConfirmDialog.vue";
import { ApiError } from "../../composables/useApi";
import { en } from "../../i18n/en";
import { id } from "../../i18n/id";
const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../../composables/useApi", async original => ({ ...await original<typeof import("../../composables/useApi")>(), useApi: () => ({ api }) }));
vi.mock("../../composables/useLocale", () => ({ useLocale: () => ({ t: (key: string) => key }) }));
const props = { workspaceId: "workspace", novelId: "novel" };
const base = "/workspaces/workspace/novels/novel";
const batch = { id: "batch", count: 1, status: "SUCCEEDED", expectedCoverHash: null, items: [{ id: "candidate", slot: 1, state: "SUCCEEDED", imageUrl: "/api/candidate/image" }] };
let authUser = "author";
beforeEach(() => { sessionStorage.clear(); authUser = "author"; api.mockReset().mockImplementation(async (url: string, init?: RequestInit) => {
  if (url === "/auth/session") return { userId: authUser };
  if (url.endsWith("/cover-brief")) return { prompt: "Story-specific cover prompt", sourceFingerprint: "source", expectedCoverHash: null, coverUrl: null, recommendedStyles: ["manhwa"] };
  if (url.includes("/model-catalog?")) return [];
  if (url.endsWith("/cover-history")) return [];
  if (url.endsWith("/cover-generations") && !init) return [];
  return batch;
}); });

describe("cover candidate author flow", () => {
  it("offers observation of the same job separately from a new image retry", async () => {
    const w = mount(NovelCoverEditor, { props }); await flushPromises();
    api.mockResolvedValueOnce({ ...batch, status: "UNCERTAIN", items: [{ id: "waiting", slot: 1, state: "UNCERTAIN", imageUrl: null, errorCategory: "TRANSIENT", resumeExisting: true, progress: { queuePosition: 0, waitSeconds: 1200 } }] });
    await w.get("form").trigger("submit"); await flushPromises();
    const check = w.findAll("button").find(button => button.text() === "coverGeneration.checkExisting"); expect(check).toBeDefined();
    await check!.trigger("click"); expect(w.findComponent(ConfirmDialog).props("body")).toBe("coverGeneration.checkWarning");
    w.findComponent(ConfirmDialog).vm.$emit("confirm"); await flushPromises();
    const request = api.mock.calls.find(([url]) => url.endsWith("/items/waiting/retry"));
    expect(JSON.parse(request?.[1].body)).toEqual({ acknowledgeUncertain: false }); w.unmount();
  });
  it.each([
    ["RATE_LIMIT", "itemRateLimited"], ["INVALID_REQUEST", "itemInvalidResponse"],
    ["AUTH", "itemProviderAccess"], ["FUTURE_CATEGORY", "itemFailed"],
  ])("explains failed image category %s without technical codes or automatic retries", async (category, key) => {
    const w = mount(NovelCoverEditor, { props }); await flushPromises();
    api.mockResolvedValueOnce({ ...batch, status: "FAILED", items: [{ id: "failed", slot: 1, state: "FAILED", errorCategory: category, imageUrl: null }] });
    await w.get("form").trigger("submit"); await flushPromises();
    expect(w.text()).toContain(`coverGeneration.${key}`);
    expect(api.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    w.unmount();
  });
  it("uses labeled controls, recommendation badges, image-only searchable models and aligned locales", async () => {
    const w = mount(NovelCoverEditor, { props }); await flushPromises();
    expect(w.findComponent(ModelPreferenceSelect).props("profile")).toBe("IMAGE_GENERATOR");
    expect(w.get<HTMLTextAreaElement>('[data-testid="cover-prompt"]').element.value).toBe("Story-specific cover prompt");
    expect(w.findAll('[data-testid="cover-recommendation"]')).toHaveLength(1);
    expect(Object.keys(en.coverGeneration).sort()).toEqual(Object.keys(id.coverGeneration).sort());
    expect((await axe(w.element)).violations).toEqual([]); w.unmount();
  });
  it("submits count, editable prompt, notes and selected model; candidate selection alone does not Apply", async () => {
    const w = mount(NovelCoverEditor, { props }); await flushPromises();
    await w.get('[data-testid="cover-count"]').setValue(9);
    await w.get('[data-testid="cover-notes"]').setValue("Keep the red cloak");
    await w.get('[data-testid="cover-prompt"]').setValue("My revised prompt");
    w.findComponent(ModelPreferenceSelect).vm.$emit("update:modelValue", "model-ref");
    await w.get("form").trigger("submit"); await flushPromises();
    const submission = api.mock.calls.find(([url, init]) => url === `${base}/cover-generations` && init?.method === "POST");
    expect(JSON.parse(submission?.[1].body)).toMatchObject({ count: 9, prompt: "My revised prompt", notes: "Keep the red cloak", preferredModelRef: "model-ref", expectedSourceFingerprint: "source" });
    await w.get('[data-testid="cover-candidate-candidate"]').setValue();
    expect(api.mock.calls.some(([url]) => url.endsWith("/apply"))).toBe(false); w.unmount();
  });
  it("keeps the exact uncertain request for explicit recovery without automatic resubmission", async () => {
    const w = mount(NovelCoverEditor, { props }); await flushPromises();
    api.mockRejectedValueOnce(new Error("offline"));
    await w.get("form").trigger("submit"); await flushPromises();
    const first = api.mock.calls.at(-1)?.[1].body;
    expect(w.get('[data-testid="cover-notes"]').attributes("disabled")).toBeDefined();
    await w.get('[data-testid="cover-recover-request"]').trigger("click"); await flushPromises();
    const attempts = api.mock.calls.filter(([url, init]) => url === `${base}/cover-generations` && init?.method === "POST");
    expect(attempts).toHaveLength(2); expect(attempts[1]?.[1].body).toBe(first); w.unmount();
  });
  it("preserves author edits on a refused source and allows a context refresh", async () => {
    const w = mount(NovelCoverEditor, { props }); await flushPromises();
    await w.get('[data-testid="cover-notes"]').setValue("Keep this note");
    api.mockRejectedValueOnce(new ApiError("COVER_SOURCE_CHANGED", 409));
    await w.get("form").trigger("submit"); await flushPromises();
    expect(w.get('[role="alert"]').text()).toContain("coverGeneration.sourceChanged");
    expect(w.get<HTMLTextAreaElement>('[data-testid="cover-notes"]').element.value).toBe("Keep this note"); w.unmount();
  });

  it("recovers an uncertain request after remount only for the same signed-in actor, without automatic POST", async () => {
    const w = mount(NovelCoverEditor, { props }); await flushPromises();
    await w.get('[data-testid="cover-notes"]').setValue("Private author direction");
    api.mockRejectedValueOnce(new Error("offline")); await w.get("form").trigger("submit"); await flushPromises();
    const first = api.mock.calls.at(-1)?.[1].body; w.unmount();
    authUser = "other-author"; const other = mount(NovelCoverEditor, { props }); await flushPromises();
    expect(other.find('[data-testid="cover-recover-request"]').exists()).toBe(false);
    expect(other.get<HTMLTextAreaElement>('[data-testid="cover-notes"]').element.value).toBe(""); other.unmount();
    authUser = "author"; const resumed = mount(NovelCoverEditor, { props }); await flushPromises();
    expect(resumed.get<HTMLTextAreaElement>('[data-testid="cover-notes"]').element.value).toBe("Private author direction");
    expect(api.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    await resumed.get('[data-testid="cover-recover-request"]').trigger("click"); await flushPromises();
    expect(api.mock.calls.filter(([, init]) => init?.method === "POST").at(-1)?.[1].body).toBe(first); resumed.unmount();
  });
});
