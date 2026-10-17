import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { ref, type Ref } from "vue";
import Admin from "./index.vue";

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
const navigate = vi.fn();
vi.stubGlobal("navigateTo", navigate);

const gateways = [
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

const wrappers: VueWrapper[] = [];
async function mountAdmin(): Promise<VueWrapper> {
  const wrapper = mount(Admin, {
    global: { stubs: { NuxtLink: { props: ["to"], template: '<a :href="to"><slot /></a>' } } },
  });
  wrappers.push(wrapper);
  await flushPromises();
  return wrapper;
}
beforeEach(() => {
  states.clear();
  cookie.value = null;
  localStorage.clear();
  navigate.mockReset();
  api.mockReset().mockImplementation(async (path: string, init?: RequestInit) => {
    if (path === "/auth/session") return { userId: "admin", platformRole: "SUPER_ADMIN" };
    if (path === "/gateways" && !init) return gateways;
    if (path === "/models" || path === "/model-profiles" || path === "/admin/audit-log") return [];
    if (path === "/admin/routing-strategy") return { strategy: "PRIORITY" };
    return { status: "ok" };
  });
});
afterEach(() => wrappers.splice(0).forEach((w) => w.unmount()));

async function clickButton(w: VueWrapper, testid: string, text: string) {
  const button = testid
    ? w.find(`[data-testid="${testid}"]`)
    : w.findAll("button").find((b) => b.text() === text);
  expect(button, `button ${testid || text} not found`).toBeTruthy();
  expect(button!.exists(), `button ${testid || text} not found`).toBe(true);
  await button!.trigger("click");
  await flushPromises();
}

describe("admin gateway action toasts", () => {
  it("health check shows a green toast per healthy gateway", async () => {
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (init?.method === "POST" && path === "/gateways/health-check")
        return [{ gatewayId: "gw-1", healthy: true, latencyMs: 42 }];
      if (path === "/auth/session") return { userId: "admin", platformRole: "SUPER_ADMIN" };
      if (path === "/gateways" && !init) return gateways;
      return [];
    });
    const w = await mountAdmin();
    await clickButton(w, "health-check-button", "");
    expect(w.find('[data-testid="toast-success"]').exists()).toBe(true);
    expect(w.get('[data-testid="toast-success"]').text()).toContain("Primary: healthy (42 ms)");
    expect(w.find('[data-testid="toast-error"]').exists()).toBe(false);
  });

  it("health check shows a red toast for an unhealthy gateway", async () => {
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (init?.method === "POST" && path === "/gateways/health-check")
        return [{ gatewayId: "gw-1", healthy: false, latencyMs: 0 }];
      if (path === "/auth/session") return { userId: "admin", platformRole: "SUPER_ADMIN" };
      if (path === "/gateways" && !init) return gateways;
      return [];
    });
    const w = await mountAdmin();
    await clickButton(w, "health-check-button", "");
    expect(w.get('[data-testid="toast-error"]').text()).toContain(
      "Primary: health check failed",
    );
    expect(w.find('[data-testid="toast-success"]').exists()).toBe(false);
  });

  it("a failed health-check request shows the red failure toast", async () => {
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (init?.method === "POST" && path === "/gateways/health-check")
        throw new Error("GATEWAY_TIMEOUT");
      if (path === "/auth/session") return { userId: "admin", platformRole: "SUPER_ADMIN" };
      if (path === "/gateways" && !init) return gateways;
      return [];
    });
    const w = await mountAdmin();
    await clickButton(w, "health-check-button", "");
    expect(w.get('[data-testid="toast-error"]').text()).toContain(
      "Health check could not run.",
    );
  });

  it.each([0, 3])("sync models shows the actual numeric discovered count %i", async (count) => {
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (init?.method === "POST" && path === "/gateways/gw-1/sync-models")
        return { discovered: count };
      if (path === "/auth/session") return { userId: "admin", platformRole: "SUPER_ADMIN" };
      if (path === "/gateways" && !init) return gateways;
      return [];
    });
    const w = await mountAdmin();
    await clickButton(w, "", "Sync models");
    expect(w.get('[data-testid="toast-success"]').text()).toContain(
      `Primary: ${count} models synced`,
    );
  });

  it("a failed model sync shows the red failure toast", async () => {
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (init?.method === "POST" && path === "/gateways/gw-1/sync-models")
        throw new Error("BAD_GATEWAY");
      if (path === "/auth/session") return { userId: "admin", platformRole: "SUPER_ADMIN" };
      if (path === "/gateways" && !init) return gateways;
      return [];
    });
    const w = await mountAdmin();
    await clickButton(w, "", "Sync models");
    expect(w.get('[data-testid="toast-error"]').text()).toContain("Model sync failed.");
  });
});
