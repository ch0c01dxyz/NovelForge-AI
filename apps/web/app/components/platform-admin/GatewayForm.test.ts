/**
 * GatewayForm component tests (NF-WF-018B).
 *
 * - The apiKey field is never prefilled in any mode (write-only).
 * - Rotate mode shows only the apiKey field.
 * - Edit mode has no apiKey field at all.
 * - Submit emits the payload; the field is wiped after submit.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import GatewayForm from "./GatewayForm.vue";
import { en } from "../../i18n/en";
import type { GatewayView } from "../../composables/usePlatformAdmin";

vi.mock("../../composables/useLocale", () => ({
  useLocale: () => ({
    t: (path: string, params?: Record<string, string | number>) => {
      const parts = path.split(".");
      let node: unknown = en;
      for (const p of parts) node = (node as Record<string, unknown>)?.[p];
      let s = typeof node === "string" ? node : path;
      if (params)
        for (const [k, v] of Object.entries(params)) s = s.replace(`{${k}}`, String(v));
      return s;
    },
    locale: { value: "en" },
    setLocale: vi.fn(),
  }),
}));

const gateway: GatewayView = {
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
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GatewayForm", () => {
  it("never prefills the apiKey field in edit mode (the field is absent)", async () => {
    const wrapper = mount(GatewayForm, {
      props: { mode: "edit", gateway },
    });
    await flushPromises();
    const input = wrapper.find('[data-testid="gateway-apikey-input"]');
    expect(input.exists()).toBe(false);
  });

  it("rotate mode shows only the apiKey field, empty", async () => {
    const wrapper = mount(GatewayForm, {
      props: { mode: "rotate", gateway },
    });
    await flushPromises();
    const input = wrapper.find('[data-testid="gateway-apikey-input"]');
    expect(input.exists()).toBe(true);
    expect((input.element as HTMLInputElement).value).toBe("");
    // No name/baseUrl fields in rotate mode.
    expect(wrapper.html()).not.toContain('type="url"');
  });

  it("create mode submits the full payload and wipes the key", async () => {
    const wrapper = mount(GatewayForm, {
      props: { mode: "create", gateway: null },
    });
    await flushPromises();
    const input = wrapper.find('[data-testid="gateway-apikey-input"]');
    await input.setValue("brand-new-key-123");
    // Fill the required name/baseUrl via the component's inputs.
    const textInputs = wrapper.findAll('input[type="text"]');
    await textInputs[0]!.setValue("NewGW");
    const urlInput = wrapper.find('input[type="url"]');
    await urlInput.setValue("https://example.com");
    await wrapper.find('[data-testid="gateway-form-save"]').trigger("click");
    await flushPromises();
    const emitted = wrapper.emitted("submit");
    expect(emitted).toHaveLength(1);
    const payload = emitted![0]![0] as Record<string, unknown>;
    expect(payload.name).toBe("NewGW");
    expect(payload.apiKey).toBe("brand-new-key-123");
    // The field is wiped the moment it leaves the form.
    expect((input.element as HTMLInputElement).value).toBe("");
  });

  it("dialog is labelled and Esc-dismissable", async () => {
    const wrapper = mount(GatewayForm, {
      props: { mode: "create", gateway: null },
      attachTo: document.body,
    });
    await flushPromises();
    const dialog = wrapper.find('[role="dialog"]');
    expect(dialog.exists()).toBe(true);
    expect(dialog.attributes("aria-modal")).toBe("true");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await flushPromises();
    expect(wrapper.emitted("close")).toHaveLength(1);
    wrapper.unmount();
  });

  it("an invalid (empty) form does not submit", async () => {
    const wrapper = mount(GatewayForm, {
      props: { mode: "create", gateway: null },
    });
    await flushPromises();
    await wrapper.find('[data-testid="gateway-form-save"]').trigger("click");
    expect(wrapper.emitted("submit")).toBeUndefined();
  });
});
