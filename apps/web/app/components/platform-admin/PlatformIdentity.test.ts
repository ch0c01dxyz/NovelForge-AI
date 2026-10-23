import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { ref, type Ref } from "vue";
import PlatformIdentity from "./PlatformIdentity.vue";
import BrandLogo from "../ui/BrandLogo.vue";
import { ApiError } from "../../composables/useApi";
import { en } from "../../i18n/en";
import { id } from "../../i18n/id";
import { DEFAULT_BRANDING } from "../../composables/useBranding";
const { api } = vi.hoisted(() => ({ api: vi.fn() }));
const state = new Map<string, Ref<unknown>>();
let language = "en";
vi.stubGlobal("useState", (key: string, init: () => unknown) => { if (!state.has(key)) state.set(key, ref(init())); return state.get(key); });
vi.mock("../../composables/useApi", async original => ({ ...await original<typeof import("../../composables/useApi")>(), useApi: () => ({ api }) }));
vi.mock("../../composables/useLocale", () => ({ useLocale: () => ({ t: (key: string) => {
  const read = (dictionary: unknown) => key.split('.').reduce<unknown>((v, k) => (v as Record<string, unknown>)?.[k], dictionary);
  return read(language === "id" ? id : en) ?? read(en) ?? key;
} }) }));
const original = { name: "NovelForge", mark: "N", markColor: "#1c1207", version: 3 };
let wrapper: VueWrapper | undefined;
beforeEach(() => { language = "en"; state.clear(); api.mockReset().mockResolvedValue({ ...original }); });
afterEach(() => { wrapper?.unmount(); wrapper = undefined; });
describe("platform identity", () => {
  it("keeps defaults and offers visible retry for malformed public settings", async () => {
    api.mockResolvedValueOnce({ name: "Broken", version: 4 }); wrapper = mount(PlatformIdentity); await flushPromises();
    expect(wrapper.text()).toContain(en.platformIdentity.loadFailed); expect(wrapper.getComponent(BrandLogo).text()).toContain("NNovelForge");
    expect(state.get("platform-branding")!.value).toEqual(DEFAULT_BRANDING);
  });
  it.each(["en", "id"])("loads settings and renders localized controls in %s", async locale => {
    language = locale; wrapper = mount(PlatformIdentity); await flushPromises();
    expect(wrapper.get<HTMLInputElement>('[data-testid="brand-name"]').element.value).toBe("NovelForge");
    expect(wrapper.text()).not.toMatch(/platformIdentity\.|common\./); expect(api).toHaveBeenCalledTimes(1);
  });
  it("previews case and safe color then saves with the observed version", async () => {
    wrapper = mount(PlatformIdentity); await flushPromises();
    await wrapper.get('[data-testid="brand-name"]').setValue("novel forge"); await wrapper.get('[data-testid="brand-mark"]').setValue("n"); await wrapper.get('[data-testid="brand-color"]').setValue("#123456");
    expect(wrapper.getComponent(BrandLogo).text()).toContain("nnovel forge");
    api.mockResolvedValueOnce({ name: "novel forge", mark: "n", markColor: "#123456", version: 4 }); await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(JSON.parse(api.mock.calls.at(-1)![1].body)).toEqual({ name: "novel forge", mark: "n", markColor: "#123456", expectedVersion: 3 });
    expect(wrapper.text()).toContain(en.platformIdentity.saved);
  });
  it("blocks invalid color and requires explicit reload after CAS conflict", async () => {
    wrapper = mount(PlatformIdentity); await flushPromises(); await wrapper.get('[data-testid="brand-color"]').setValue("red");
    expect(wrapper.get('[data-testid="brand-save"]').attributes('disabled')).toBeDefined();
    await wrapper.get('[data-testid="brand-color"]').setValue("#123456"); api.mockRejectedValueOnce(new ApiError("BRANDING_CHANGED", 409));
    await wrapper.get('form').trigger('submit'); await flushPromises(); expect(wrapper.text()).toContain(en.platformIdentity.conflict);
    expect(wrapper.get('[data-testid="brand-save"]').attributes('disabled')).toBeDefined();
    api.mockResolvedValueOnce({ ...original, version: 4 }); await wrapper.get('button[type="button"]').trigger('click'); await flushPromises();
    expect(wrapper.get<HTMLInputElement>('[data-testid="brand-color"]').element.value).toBe("#1c1207"); expect(wrapper.get('[data-testid="brand-save"]').attributes('disabled')).toBeUndefined();
  });
  it("retains draft on failed save and offers retry for initial load failure", async () => {
    api.mockRejectedValueOnce(new Error("unavailable")); wrapper = mount(PlatformIdentity); await flushPromises(); expect(wrapper.text()).toContain(en.platformIdentity.loadFailed);
    expect(wrapper.get('[data-testid="brand-save"]').attributes('disabled')).toBeDefined();
    api.mockResolvedValueOnce(original); await wrapper.get('button[type="button"]').trigger('click'); await flushPromises();
    await wrapper.get('[data-testid="brand-name"]').setValue("New name"); api.mockRejectedValueOnce(new Error("failed")); await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(wrapper.text()).toContain(en.platformIdentity.saveFailed); expect(wrapper.get<HTMLInputElement>('[data-testid="brand-name"]').element.value).toBe("New name");
  });
});
