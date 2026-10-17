import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { ref, type Ref } from "vue";
import ModelCatalog from "./ModelCatalog.vue";
import { useLocale } from "../../composables/useLocale";
import type { GatewayView, ModelView } from "../../composables/usePlatformAdmin";

const states = new Map<string, Ref<unknown>>();
const cookie = ref<string | null>(null);
vi.stubGlobal("useState", (key: string, init: () => unknown) => {
  if (!states.has(key)) states.set(key, ref(init()));
  return states.get(key)!;
});
vi.stubGlobal("useCookie", () => cookie);
vi.stubGlobal("onNuxtReady", () => {});

const gateways: GatewayView[] = [
  {
    id: "gw-1",
    name: "Primary",
    baseUrl: "https://gw.example",
    enabled: true,
    priority: 1,
    weight: 1,
    timeoutMs: 30_000,
    maxRetries: 2,
    health: "healthy",
    lastHealthCheckAt: null,
    lastErrorAt: null,
    lastErrorCategory: null,
    consecutiveFailures: 0,
    hasCredential: true,
  },
];

function model(i: number, overrides: Partial<ModelView> = {}): ModelView {
  return {
    id: `m-${i}`,
    gatewayId: "gw-1",
    modelId: `model-${i}`,
    displayName: i % 2 === 0 ? `Model ${i}` : null,
    capabilities: ["vision", "pdf"],
    contextWindow: 128_000,
    enabled: true,
    ...overrides,
  };
}

const wrappers: VueWrapper[] = [];
function mountCatalog(models: ModelView[]): VueWrapper {
  const wrapper = mount(ModelCatalog, {
    props: { models, gateways, loading: false, error: null },
  });
  wrappers.push(wrapper);
  return wrapper;
}
beforeEach(() => {
  states.clear();
  cookie.value = null;
  localStorage.clear();
  useLocale().setLocale("en");
});
afterEach(() => wrappers.splice(0).forEach((w) => w.unmount()));

describe("model catalog pagination, search and formatting", () => {
  it("renders one 20-row page at a time and pages forward", async () => {
    const w = mountCatalog(Array.from({ length: 25 }, (_, i) => model(i + 1)));
    await flushPromises();
    expect(w.findAll("tbody tr")).toHaveLength(20);
    expect(w.get('[data-testid="pager-status"]').text()).toContain("Page 1 of 2");
    await w.get('[data-testid="pager-next"]').trigger("click");
    await flushPromises();
    expect(w.findAll("tbody tr")).toHaveLength(5);
    await w.get('[data-testid="model-search"]').setValue("model-1");
    await flushPromises();
    expect(w.get('[data-testid="pager-status"]').text()).toContain("Page 1 of 1");
    expect(w.findAll("tbody tr")).toHaveLength(11);
  });

  it("clamps the page after the refreshed catalog shrinks", async () => {
    const w = mountCatalog(Array.from({ length: 25 }, (_, i) => model(i + 1)));
    await w.get('[data-testid="pager-next"]').trigger("click");
    await w.setProps({ models: [model(1)] });
    await flushPromises();
    expect(w.get('[data-testid="pager-status"]').text()).toContain("Page 1 of 1");
    expect(w.findAll("tbody tr")).toHaveLength(1);
  });

  it("narrows rows by search and reports no match", async () => {
    const w = mountCatalog([model(1), model(2), model(3)]);
    await flushPromises();
    await w.get('[data-testid="model-search"]').setValue("model-2");
    await flushPromises();
    expect(w.findAll("tbody tr")).toHaveLength(1);
    expect(w.text()).not.toContain("No rows match the filter.");
    await w.get('[data-testid="model-search"]').setValue("no-such-model");
    await flushPromises();
    expect(w.findAll("tbody tr")).toHaveLength(0);
    expect(w.text()).toContain("No rows match the filter.");
  });

  it("formats the context window per locale", async () => {
    const w = mountCatalog([model(1)]);
    await flushPromises();
    expect(w.text()).toContain("128,000");
    useLocale().setLocale("id");
    await flushPromises();
    expect(w.text()).toContain("128.000");
    expect(w.text()).not.toContain("128,000");
  });

  it("shows localized capability chips and the observed JSON marker", async () => {
    const w = mountCatalog([
      model(1, { capabilities: ["vision", "pdf", "nf:json_object=ok"] }),
    ]);
    await flushPromises();
    const chips = w.get('[data-testid="model-capabilities-m-1"]').text();
    expect(chips).toContain("Vision");
    expect(chips).toContain("PDF");
    expect(chips).toContain("JSON mode ✓");
    useLocale().setLocale("id");
    await flushPromises();
    expect(w.get('[data-testid="model-capabilities-m-1"]').text()).toContain("Visi");
  });

  it("shows an em dash for a null context window and no capabilities", async () => {
    const w = mountCatalog([model(1, { contextWindow: null, capabilities: [] })]);
    await flushPromises();
    const row = w.get('[data-testid="model-row-m-1"]').text();
    expect(row).toContain("—");
  });
});
