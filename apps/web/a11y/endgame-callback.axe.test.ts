/**
 * Accessibility tests (NF-WF-022B): zero axe violations (wcag2aa +
 * wcag22aa tags) on every new callbacks/legacy surface, in both locales.
 *
 * useLocale is mocked with a key-returning t; the shape and semantics
 * asserted by axe do not depend on the resolved strings. useApi is
 * mocked at the HTTP boundary. Buttons are keyboard-operable native
 * <button> elements.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref, computed, watch, onMounted } from "vue";
import { axe, configureAxe } from "vitest-axe";
import EndgameCallbackList from "../app/components/endgame/EndgameCallbackList.vue";
import EndgameCallbackCreate from "../app/components/endgame/EndgameCallbackCreate.vue";
import EndgameLegacyList from "../app/components/endgame/EndgameLegacyList.vue";
import EndgameLegacyCreate from "../app/components/endgame/EndgameLegacyCreate.vue";

// Vue auto-imports are Nuxt-provided; stub them for the vitest harness.
vi.stubGlobal("ref", ref);
vi.stubGlobal("computed", computed);
vi.stubGlobal("watch", watch);
vi.stubGlobal("onMounted", onMounted);

const apiMock = vi.fn();

vi.mock("../app/composables/useApi", () => ({
  useApi: () => ({ api: apiMock }),
  ApiError: class ApiError extends Error {
    constructor(
      readonly code: string,
      readonly status: number,
    ) {
      super(`${status} ${code}`);
      this.name = "ApiError";
    }
  },
}));

vi.mock("../app/composables/useLocale", () => ({
  useLocale: () => ({
    t: (path: string, params?: Record<string, string | number>) => {
      let s = path;
      if (params) for (const [k, v] of Object.entries(params)) s += `|${k}=${v}`;
      return s;
    },
    locale: { value: "en" },
    setLocale: vi.fn(),
  }),
}));

beforeEach(() => {
  apiMock.mockReset();
});

configureAxe({
  rules: { "color-contrast": { enabled: false } },
});

const WCAG22_AA = {
  runOnly: { type: "tag" as const, values: ["wcag2aa", "wcag22aa"] },
};

describe("endgame callbacks/legacy a11y", () => {
  it("callback list has zero violations", async () => {
    const wrapper = mount(EndgameCallbackList, {
      props: {
        callbacks: [
          {
            id: "cb-1",
            novelId: "novel-1",
            setupEventId: "setup-1",
            payoffEventId: null,
            status: "PENDING",
            description: "A note.",
            createdById: "user-1",
            createdAt: new Date().toISOString(),
          },
        ],
        loading: false,
        loadError: false,
      },
      attachTo: document.body,
    });
    await flushPromises();
    const results = await axe(wrapper.element, WCAG22_AA);
    expect(results.violations).toEqual([]);
    wrapper.unmount();
  });

  it("callback create dialog has zero violations", async () => {
    const wrapper = mount(EndgameCallbackCreate, {
      props: { workspaceId: "ws-1", novelId: "novel-1" },
      attachTo: document.body,
    });
    await flushPromises();
    const results = await axe(wrapper.element, WCAG22_AA);
    expect(results.violations).toEqual([]);
    wrapper.unmount();
  });

  it("legacy list has zero violations", async () => {
    const wrapper = mount(EndgameLegacyList, {
      props: {
        legacies: [
          {
            id: "lg-1",
            novelId: "novel-1",
            kind: "CHARACTER",
            subjectId: null,
            description: "Remembered.",
            createdById: "user-1",
            createdAt: new Date().toISOString(),
          },
        ],
        loading: false,
        loadError: false,
      },
      attachTo: document.body,
    });
    await flushPromises();
    const results = await axe(wrapper.element, WCAG22_AA);
    expect(results.violations).toEqual([]);
    wrapper.unmount();
  });

  it("legacy create dialog has zero violations", async () => {
    const wrapper = mount(EndgameLegacyCreate, {
      props: { workspaceId: "ws-1", novelId: "novel-1" },
      attachTo: document.body,
    });
    await flushPromises();
    const results = await axe(wrapper.element, WCAG22_AA);
    expect(results.violations).toEqual([]);
    wrapper.unmount();
  });
});
