/**
 * NF-WF-022B: Callbacks + legacy component tests.
 *
 * Tests mock at the HTTP/`useApi` boundary (per the 021 contract reviewer's
 * Q5 interpretation). The full loop is covered API-level against the real
 * backend in apps/api (endgame-callback.test.ts).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref, computed, watch, onMounted } from "vue";
import EndgameCallbackList from "./EndgameCallbackList.vue";
import EndgameCallbackCreate from "./EndgameCallbackCreate.vue";
import EndgameLegacyList from "./EndgameLegacyList.vue";
import EndgameLegacyCreate from "./EndgameLegacyCreate.vue";
import type {
  EndgameCallbackShape,
  EndgameLegacyShape,
} from "./endgameCallbackApi";

// Vue auto-imports are Nuxt-provided; stub them for the vitest harness.
vi.stubGlobal("ref", ref);
vi.stubGlobal("computed", computed);
vi.stubGlobal("watch", watch);
vi.stubGlobal("onMounted", onMounted);

const apiMock = vi.fn();

vi.mock("../../composables/useApi", () => ({
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

vi.mock("../../composables/useLocale", () => ({
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

function makeCallback(overrides: Partial<EndgameCallbackShape> = {}): EndgameCallbackShape {
  return {
    id: "cb-1",
    novelId: "novel-1",
    setupEventId: "setup-uuid-1",
    payoffEventId: null,
    status: "PENDING",
    description: "The key will matter.",
    createdById: "user-1",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeLegacy(overrides: Partial<EndgameLegacyShape> = {}): EndgameLegacyShape {
  return {
    id: "lg-1",
    novelId: "novel-1",
    kind: "CHARACTER",
    subjectId: null,
    description: "The hero is remembered.",
    createdById: "user-1",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("EndgameCallbackList", () => {
  it("renders callbacks with unpaid highlighted", () => {
    const wrapper = mount(EndgameCallbackList, {
      props: {
        callbacks: [
          makeCallback({ id: "cb-1", status: "PENDING" }),
          makeCallback({ id: "cb-2", status: "PAID", payoffEventId: "payoff-uuid" }),
        ],
        loading: false,
        loadError: false,
      },
    });
    expect(wrapper.find('[data-testid="cb-item-cb-1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="cb-item-cb-2"]').exists()).toBe(true);
    // Unpaid item gets the warning highlight class.
    expect(wrapper.find('[data-testid="cb-item-cb-1"]').classes().join(" ")).toContain("nf-warn");
    expect(wrapper.find('[data-testid="cb-status-cb-1"]').text()).toContain("unpaidBadge");
    expect(wrapper.find('[data-testid="cb-status-cb-2"]').text()).toContain("paidBadge");
  });

  it("unpaid-only filter hides paid callbacks", async () => {
    const wrapper = mount(EndgameCallbackList, {
      props: {
        callbacks: [
          makeCallback({ id: "cb-1", status: "PENDING" }),
          makeCallback({ id: "cb-2", status: "PAID", payoffEventId: "payoff-uuid" }),
        ],
        loading: false,
        loadError: false,
      },
    });
    await wrapper.find('[data-testid="cb-unpaid-only"]').setValue(true);
    expect(wrapper.find('[data-testid="cb-item-cb-1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="cb-item-cb-2"]').exists()).toBe(false);
  });

  it("shows empty state when no callbacks", () => {
    const wrapper = mount(EndgameCallbackList, {
      props: { callbacks: [], loading: false, loadError: false },
    });
    expect(wrapper.find('[data-testid="cb-empty"]').exists()).toBe(true);
  });

  it("emits create on button click", async () => {
    const wrapper = mount(EndgameCallbackList, {
      props: { callbacks: [], loading: false, loadError: false },
    });
    await wrapper.find('[data-testid="cb-create-open"]').trigger("click");
    expect(wrapper.emitted("create")).toBeTruthy();
  });
});

describe("EndgameCallbackCreate", () => {
  it("submits setup + payoff to the API", async () => {
    apiMock.mockResolvedValue({ callback: makeCallback({ status: "PAID" }) });
    const wrapper = mount(EndgameCallbackCreate, {
      props: { workspaceId: "ws-1", novelId: "novel-1" },
    });
    await wrapper.find('[data-testid="cb-setup-input"]').setValue("setup-uuid-1");
    await wrapper.find('[data-testid="cb-payoff-input"]').setValue("payoff-uuid-1");
    await wrapper.find('[data-testid="cb-desc-input"]').setValue("A note.");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(apiMock).toHaveBeenCalledOnce();
    const [path, init] = apiMock.mock.calls[0] as [string, RequestInit];
    expect(path).toContain("/endgame/callbacks");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string) as Record<string, string>;
    expect(body.setupEventId).toBe("setup-uuid-1");
    expect(body.payoffEventId).toBe("payoff-uuid-1");
    expect(wrapper.emitted("created")).toBeTruthy();
  });

  it("submits without payoff for an unpaid setup", async () => {
    apiMock.mockResolvedValue({ callback: makeCallback() });
    const wrapper = mount(EndgameCallbackCreate, {
      props: { workspaceId: "ws-1", novelId: "novel-1" },
    });
    await wrapper.find('[data-testid="cb-setup-input"]').setValue("setup-uuid-2");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    const [, init] = apiMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, string>;
    expect(body.setupEventId).toBe("setup-uuid-2");
    expect(body.payoffEventId).toBeUndefined();
  });
});

describe("EndgameLegacyList", () => {
  it("renders legacies with kind badges and filter", async () => {
    const wrapper = mount(EndgameLegacyList, {
      props: {
        legacies: [
          makeLegacy({ id: "lg-1", kind: "CHARACTER" }),
          makeLegacy({ id: "lg-2", kind: "WORLD" }),
        ],
        loading: false,
        loadError: false,
      },
    });
    expect(wrapper.find('[data-testid="legacy-item-lg-1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="legacy-kind-lg-1"]').text()).toContain("CHARACTER");
    await wrapper.find('[data-testid="legacy-kind-filter"]').setValue("WORLD");
    expect(wrapper.find('[data-testid="legacy-item-lg-1"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="legacy-item-lg-2"]').exists()).toBe(true);
  });
});

describe("EndgameLegacyCreate", () => {
  it("submits kind + description to the API", async () => {
    apiMock.mockResolvedValue({ legacy: makeLegacy() });
    const wrapper = mount(EndgameLegacyCreate, {
      props: { workspaceId: "ws-1", novelId: "novel-1" },
    });
    await wrapper.find('[data-testid="legacy-kind-input"]').setValue("THEMATIC");
    await wrapper.find('[data-testid="legacy-desc-input"]').setValue("Redemption endures.");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(apiMock).toHaveBeenCalledOnce();
    const [path, init] = apiMock.mock.calls[0] as [string, RequestInit];
    expect(path).toContain("/endgame/legacy");
    const body = JSON.parse(init.body as string) as Record<string, string>;
    expect(body.kind).toBe("THEMATIC");
    expect(body.description).toBe("Redemption endures.");
    expect(wrapper.emitted("created")).toBeTruthy();
  });
});
