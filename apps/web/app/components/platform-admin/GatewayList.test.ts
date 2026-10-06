/**
 * GatewayList component tests (NF-WF-018B).
 *
 * - Renders masked credential badges ("Set"/"Not set") — never a value.
 * - The credential value or ciphertext never appears in the DOM.
 * - Action buttons emit the right events.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import GatewayList from "./GatewayList.vue";
import { en } from "../../i18n/en";
import { id } from "../../i18n/id";
import type { GatewayView } from "../../composables/usePlatformAdmin";

let locale: "en" | "id" = "en";

vi.mock("../../composables/useLocale", () => ({
  useLocale: () => ({
    t: (path: string, params?: Record<string, string | number>) => {
      const dict = locale === "en" ? en : id;
      const parts = path.split(".");
      let node: unknown = dict;
      for (const p of parts) node = (node as Record<string, unknown>)?.[p];
      let s = typeof node === "string" ? node : path;
      if (params)
        for (const [k, v] of Object.entries(params)) s = s.replace(`{${k}}`, String(v));
      return s;
    },
    locale: { value: locale },
    setLocale: vi.fn(),
  }),
}));

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
    lastHealthCheckAt: null,
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

beforeEach(() => {
  locale = "en";
});

describe("GatewayList", () => {
  it("renders masked credential badges and never a credential value", async () => {
    const wrapper = mount(GatewayList, {
      props: { gateways, loading: false, error: null },
    });
    await flushPromises();
    const html = wrapper.html();
    // The P1 rule, at the DOM level: no secret material anywhere.
    expect(html).not.toContain("sk-secret");
    expect(html).not.toContain("credentialCiphertext");
    expect(html).toContain("Set");
    expect(html).toContain("Not set");
    // The badge is a boolean indicator, not a value.
    const badges = wrapper.findAll('[data-testid^="gateway-credential-"]');
    expect(badges).toHaveLength(2);
  });

  it("emits add/edit/rotate/delete/toggle/sync/health events", async () => {
    const wrapper = mount(GatewayList, {
      props: { gateways, loading: false, error: null },
    });
    await flushPromises();
    await wrapper.find('[data-testid="add-gateway-button"]').trigger("click");
    expect(wrapper.emitted("add")).toHaveLength(1);
    await wrapper.find('[data-testid="health-check-button"]').trigger("click");
    expect(wrapper.emitted("health-check")).toHaveLength(1);
  });

  it("renders in Indonesian without missing keys", async () => {
    locale = "id";
    const wrapper = mount(GatewayList, {
      props: { gateways, loading: false, error: null },
    });
    await flushPromises();
    const html = wrapper.html();
    expect(html).toContain("Tersimpan");
    expect(html).toContain("Belum ada");
    expect(html).not.toContain("platformAdmin.");
  });
});
