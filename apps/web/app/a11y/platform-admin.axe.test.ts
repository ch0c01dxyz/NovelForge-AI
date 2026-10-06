/**
 * Accessibility tests (NF-WF-018B, WCAG 2.2 AA contract): zero axe
 * violations (wcag2aa + wcag22aa tags) on every platform-admin surface
 * in both locales. The checked-in suite is the automated half of the
 * audit; the manual checklist follows the apps/web/a11y/AUDIT-014.md
 * pattern. The full screen-reader pass is a human task (GAP-051).
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref, computed, onMounted, onUnmounted } from "vue";
import { axe, configureAxe } from "vitest-axe";
import GatewayList from "../components/platform-admin/GatewayList.vue";
import GatewayForm from "../components/platform-admin/GatewayForm.vue";
import ModelCatalog from "../components/platform-admin/ModelCatalog.vue";
import ProfileMappings from "../components/platform-admin/ProfileMappings.vue";
import RoutingOverview from "../components/platform-admin/RoutingOverview.vue";
import { en } from "../i18n/en";
import { id } from "../i18n/id";
import type { GatewayView } from "../composables/usePlatformAdmin";

vi.stubGlobal("ref", ref);
vi.stubGlobal("computed", computed);
vi.stubGlobal("onMounted", onMounted);
vi.stubGlobal("onUnmounted", onUnmounted);

// Real i18n resources (both locales), minimal interpolation.
function tFor(locale: typeof en | typeof id) {
  return (path: string, params?: Record<string, string | number>) => {
    const parts = path.split(".");
    let node: unknown = locale;
    for (const p of parts) node = (node as Record<string, unknown>)?.[p];
    let s = typeof node === "string" ? node : path;
    if (params)
      for (const [k, v] of Object.entries(params))
        s = s.replace(`{${k}}`, String(v));
    return s;
  };
}

let currentT: (path: string, params?: Record<string, string | number>) => string =
  tFor(en);

vi.mock("../composables/useLocale", () => ({
  useLocale: () => ({
    t: (p: string, params?: Record<string, string | number>) => currentT(p, params),
    locale: { value: "en" },
    setLocale: vi.fn(),
  }),
}));

configureAxe({ rules: {} });

const WCAG22_AA = {
  runOnly: { type: "tag" as const, values: ["wcag2aa", "wcag22aa"] },
};

// jsdom has no layout; axe needs the rect stubs the 014 suite uses.
const stubs = {
  transition: false,
  "transition-group": false,
};

const gateways: GatewayView[] = [
  {
    id: "gw-1",
    name: "OpenAI",
    baseUrl: "https://api.openai.com",
    enabled: true,
    priority: 100,
    weight: 1,
    timeoutMs: 60000,
    maxRetries: 2,
    health: "HEALTHY",
    lastHealthCheckAt: "2026-10-06T00:00:00Z",
    lastErrorAt: null,
    lastErrorCategory: null,
    consecutiveFailures: 0,
    hasCredential: true,
  },
  {
    id: "gw-2",
    name: "Local",
    baseUrl: "http://localhost:11434",
    enabled: false,
    priority: 50,
    weight: 1,
    timeoutMs: 60000,
    maxRetries: 2,
    health: "UNKNOWN",
    lastHealthCheckAt: null,
    lastErrorAt: null,
    lastErrorCategory: null,
    consecutiveFailures: 0,
    hasCredential: false,
  },
];

const models = [
  {
    id: "m-1",
    gatewayId: "gw-1",
    modelId: "gpt-x",
    displayName: "GPT X",
    capabilities: ["chat"],
    contextWindow: 128000,
    enabled: true,
  },
];

const mappings = [
  { profile: "CREATIVE_WRITER", modelId: "gpt-x", gatewayId: "gw-1", priority: 100, enabled: true },
];

const profiles = ["CREATIVE_WRITER", "DEEP_PLANNER", "EMBEDDING"];

describe.each([
  ["en", en],
  ["id", id],
] as const)("Platform admin a11y (%s)", (_name, locale) => {
  beforeEach(() => {
    currentT = tFor(locale);
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("GatewayList has no violations", async () => {
    const wrapper = mount(GatewayList, {
      props: { gateways, loading: false, error: null },
      attachTo: document.body,
      global: { stubs },
    });
    await flushPromises();
    const results = await axe(wrapper.element, WCAG22_AA);
    expect(results.violations, "axe violations").toEqual([]);
  });

  it("GatewayForm (create) has no violations", async () => {
    const wrapper = mount(GatewayForm, {
      props: { mode: "create", gateway: null },
      attachTo: document.body,
      global: { stubs },
    });
    await flushPromises();
    const results = await axe(wrapper.element, WCAG22_AA);
    expect(results.violations, "axe violations").toEqual([]);
  });

  it("ModelCatalog has no violations", async () => {
    const wrapper = mount(ModelCatalog, {
      props: { models, gateways, loading: false, error: null },
      attachTo: document.body,
      global: { stubs },
    });
    await flushPromises();
    const results = await axe(wrapper.element, WCAG22_AA);
    expect(results.violations, "axe violations").toEqual([]);
  });

  it("ProfileMappings has no violations", async () => {
    const wrapper = mount(ProfileMappings, {
      props: {
        mappings,
        models,
        profiles,
        loading: false,
        error: null,
        saving: false,
      },
      attachTo: document.body,
      global: { stubs },
    });
    await flushPromises();
    const results = await axe(wrapper.element, WCAG22_AA);
    expect(results.violations, "axe violations").toEqual([]);
  });

  it("RoutingOverview has no violations", async () => {
    const wrapper = mount(RoutingOverview, {
      props: { gateways, strategy: "PRIORITY", loading: false, error: null },
      attachTo: document.body,
      global: { stubs },
    });
    await flushPromises();
    const results = await axe(wrapper.element, WCAG22_AA);
    expect(results.violations, "axe violations").toEqual([]);
  });
});
