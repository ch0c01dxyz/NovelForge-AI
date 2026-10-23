import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { ref, type Ref } from "vue";
import Editor from "./NovelDiscoveryEditor.vue";
import { ApiError } from "../../composables/useApi";
import { useLocale } from "../../composables/useLocale";

const api = vi.hoisted(() => vi.fn());
vi.mock("../../composables/useApi", async (original) => ({
  ...(await original<object>()),
  useApi: () => ({ api }),
}));
const states = new Map<string, Ref<unknown>>();
const cookie = ref<string | null>(null);
vi.stubGlobal("useState", (key: string, init: () => unknown) => {
  if (!states.has(key)) states.set(key, ref(init()));
  return states.get(key)!;
});
vi.stubGlobal("useCookie", () => cookie);
vi.stubGlobal("onNuxtReady", () => {});
const wrappers: VueWrapper[] = [];
function mounted() {
  const wrapper = mount(Editor, { props: { workspaceId: "ws-1", novelId: "nv-1" } });
  wrappers.push(wrapper);
  return wrapper;
}
beforeEach(() => {
  states.clear();
  cookie.value = null;
  localStorage.clear();
  api.mockReset().mockImplementation(async (path: string) => {
    if (path === "/workspaces/ws-1/novels/nv-1")
      return { genres: ["fantasy"], audience: "teen" };
    return {};
  });
});
afterEach(() => wrappers.splice(0).forEach((w) => w.unmount()));
const chip = (w: VueWrapper, key: string) => w.get(`[data-testid="genre-chip-${key}"]`);

describe("novel discovery editor", () => {
  it("retains the acknowledged synopsis after a sibling write fails so retry uses the latest comparison", async () => {
    let genreAttempts = 0;
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.endsWith('/reader-details')) return init?.method === 'PATCH' ? { publicSynopsis: 'Saved introduction' } : { publicSynopsis: null };
      if (path.endsWith('/genres')) { if (++genreAttempts === 1) throw new Error('Connection lost'); return { genres: ['fantasy'] }; }
      return { genres: ['fantasy'], audience: 'teen' };
    });
    const w = mounted(); await flushPromises();
    await w.get('[data-testid="discovery-synopsis"]').setValue('Saved introduction');
    await w.get('[data-testid="discovery-save"]').trigger('click'); await flushPromises();
    await w.get('[data-testid="discovery-save"]').trigger('click'); await flushPromises();
    const calls = api.mock.calls.filter(([path, init]) => path.endsWith('/reader-details') && init?.method === 'PATCH');
    expect(JSON.parse(calls[1]![1].body).expectedPublicSynopsis).toBe('Saved introduction');
    expect(w.find('[data-testid="discovery-saved"]').exists()).toBe(true);
  });
  it("loads and explicitly saves the public synopsis with its comparison value", async () => {
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.endsWith('/reader-details')) return init?.method === 'PATCH' ? { publicSynopsis: 'A new introduction.' } : { publicSynopsis: 'Old public text' };
      if (path.endsWith('/genres')) return { genres: ['fantasy'] };
      return { genres: ['fantasy'], audience: 'teen' };
    });
    const w = mounted(); await flushPromises();
    expect((w.get('[data-testid="discovery-synopsis"]').element as HTMLTextAreaElement).value).toBe('Old public text');
    await w.get('[data-testid="discovery-synopsis"]').setValue('A new introduction.');
    await w.get('[data-testid="discovery-save"]').trigger('click'); await flushPromises();
    const call = api.mock.calls.find(([path, init]) => path.endsWith('/reader-details') && init?.method === 'PATCH');
    expect(JSON.parse(call![1].body)).toEqual({ publicSynopsis: 'A new introduction.', expectedPublicSynopsis: 'Old public text' });
    expect(w.find('[data-testid="discovery-saved"]').exists()).toBe(true);
  });
  it("locks editing until both successful writes settle", async () => {
    let finishGenres!: (value: { genres: string[] }) => void;
    let finishAudience!: (value: { audience: string }) => void;
    api.mockImplementation((path: string) => {
      if (path.endsWith("/genres")) return new Promise((resolve) => { finishGenres = resolve; });
      if (path.endsWith("/audience")) return new Promise((resolve) => { finishAudience = resolve; });
      return Promise.resolve({ genres: ["fantasy"], audience: "teen" });
    });
    const w = mounted();
    await flushPromises();
    await w.get('[data-testid="discovery-save"]').trigger("click");
    expect(w.findAll("fieldset").every((f) => f.attributes("disabled") !== undefined)).toBe(true);
    await chip(w, "action").trigger("click");
    expect(chip(w, "action").attributes("aria-pressed")).toBe("false");
    finishGenres({ genres: ["fantasy"] });
    await flushPromises();
    expect(w.find('[data-testid="discovery-saved"]').exists()).toBe(false);
    expect(w.get('[data-testid="discovery-save"]').attributes("disabled")).toBeDefined();
    finishAudience({ audience: "teen" });
    await flushPromises();
    expect(w.find('[data-testid="discovery-saved"]').exists()).toBe(true);
  });

  it("waits for the sibling write after a failure before permitting retry", async () => {
    let finishAudience!: (value: { audience: string }) => void;
    api.mockImplementation((path: string) => {
      if (path.endsWith("/genres")) return Promise.reject(new Error("connection lost"));
      if (path.endsWith("/audience")) return new Promise((resolve) => { finishAudience = resolve; });
      return Promise.resolve({ genres: ["fantasy"], audience: "teen" });
    });
    const w = mounted();
    await flushPromises();
    const save = w.get('[data-testid="discovery-save"]');
    await save.trigger("click");
    await flushPromises();
    expect(save.attributes("disabled")).toBeDefined();
    await save.trigger("click");
    expect(api.mock.calls.filter(([path]) => path.endsWith("/audience"))).toHaveLength(1);
    finishAudience({ audience: "teen" });
    await flushPromises();
    expect(save.attributes("disabled")).toBeUndefined();
    expect(w.get('[data-testid="discovery-error"]').text()).toBe(useLocale().t("workspace.discovery.saveError"));
    expect(w.find('[data-testid="discovery-saved"]').exists()).toBe(false);
  });

  it("loads and shows the saved genres and audience", async () => {
    const w = mounted();
    await flushPromises();
    expect(chip(w, "fantasy").attributes("aria-pressed")).toBe("true");
    // Hover tooltip carries the localized genre description.
    expect(chip(w, "fantasy").attributes("title")).toBe(
      useLocale().t("genreDesc.fantasy"),
    );
    expect(
      (w.get('[data-testid="discovery-audience"]').element as HTMLSelectElement).value,
    ).toBe("teen");
    expect(api).toHaveBeenCalledWith("/workspaces/ws-1/novels/nv-1");
  });

  it("toggles genres, enforces the cap of 5, and saves the full set plus audience", async () => {
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "/workspaces/ws-1/novels/nv-1")
        return { genres: ["fantasy"], audience: "teen" };
      if (path.endsWith("/genres"))
        return { genres: (JSON.parse(init!.body as string) as { genres: string[] }).genres };
      if (path.endsWith("/audience"))
        return { audience: (JSON.parse(init!.body as string) as { audience: string }).audience };
      return { genres: [], audience: null };
    });
    const w = mounted();
    await flushPromises();
    // Removing the saved genre works (edit = full replace).
    await chip(w, "fantasy").trigger("click");
    await flushPromises();
    for (const key of ["action", "adventure", "mystery", "romance", "horror"]) {
      await chip(w, key).trigger("click");
      await flushPromises();
    }
    // 5 selected: unselected chips are disabled, selecting a 6th is impossible.
    expect(chip(w, "xianxia").attributes("disabled")).toBeDefined();
    await w.get('[data-testid="discovery-save"]').trigger("click");
    await flushPromises();
    const genreCall = api.mock.calls.find(([p]) => p === "/workspaces/ws-1/novels/nv-1/genres");
    expect(JSON.parse(genreCall![1]!.body as string)).toEqual({
      genres: ["action", "adventure", "mystery", "romance", "horror"],
    });
    const audienceCall = api.mock.calls.find(
      ([p]) => p === "/workspaces/ws-1/novels/nv-1/audience",
    );
    expect(JSON.parse(audienceCall![1]!.body as string)).toEqual({ audience: "teen" });
    expect(w.find('[data-testid="discovery-saved"]').element).toBeTruthy();
  });

  it("changes and clears the audience through the select", async () => {
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "/workspaces/ws-1/novels/nv-1")
        return { genres: ["fantasy"], audience: "teen" };
      if (path.endsWith("/audience"))
        return { audience: (JSON.parse(init!.body as string) as { audience: string | null }).audience };
      return { genres: ["fantasy"] };
    });
    const w = mounted();
    await flushPromises();
    const select = w.get('[data-testid="discovery-audience"]');
    await select.setValue("adult");
    await w.get('[data-testid="discovery-save"]').trigger("click");
    await flushPromises();
    let audienceCall = api.mock.calls.find(([p]) => p === "/workspaces/ws-1/novels/nv-1/audience");
    expect(JSON.parse(audienceCall![1]!.body as string)).toEqual({ audience: "adult" });
    await select.setValue("");
    await w.get('[data-testid="discovery-save"]').trigger("click");
    await flushPromises();
    audienceCall = api.mock.calls
      .slice()
      .reverse()
      .find(([p]) => p === "/workspaces/ws-1/novels/nv-1/audience");
    expect(JSON.parse(audienceCall![1]!.body as string)).toEqual({ audience: null });
  });

  it("maps a forbidden save to the localized copy", async () => {
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (init?.method === "PATCH") throw new ApiError("FORBIDDEN", 403);
      return { genres: [], audience: null };
    });
    const w = mounted();
    await flushPromises();
    await w.get('[data-testid="discovery-save"]').trigger("click");
    await flushPromises();
    expect(w.get('[data-testid="discovery-error"]').text()).toBe(
      useLocale().t("workspace.discovery.forbidden"),
    );
  });
});
