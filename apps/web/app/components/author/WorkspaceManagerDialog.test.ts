import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { ref, type Ref } from "vue";
import Dialog from "./WorkspaceManagerDialog.vue";
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
  const wrapper = mount(Dialog);
  wrappers.push(wrapper);
  return wrapper;
}
beforeEach(() => {
  states.clear();
  cookie.value = null;
  localStorage.clear();
  api.mockReset().mockImplementation(async () => []);
});
afterEach(() => wrappers.splice(0).forEach((w) => w.unmount()));
const rows = () => [
  {
    id: "ws-1",
    name: "Alpha",
    slug: "alpha",
    role: "OWNER",
    canCreateNovel: true,
    canRename: true,
    canDelete: true,
    novelCount: 0,
  },
  {
    id: "ws-2",
    name: "Beta",
    slug: "beta",
    role: "AUTHOR",
    canCreateNovel: true,
    canRename: false,
    canDelete: false,
    novelCount: 3,
  },
  {
    id: "ws-3",
    name: "Gamma",
    slug: "gamma",
    role: "OWNER",
    canCreateNovel: true,
    canRename: true,
    canDelete: true,
    novelCount: 5,
  },
];

describe("workspace manager dialog", () => {
  it.each(["en", "id"] as const)("renders localized labels in %s", async (locale) => {
    useLocale().setLocale(locale);
    const w = mounted();
    await flushPromises();
    expect(w.get("h3").text()).toBe(useLocale().t("authorHome.wsManagerTitle"));
    expect(w.get('[data-testid="ws-create"]').text()).toBe(
      useLocale().t("authorHome.wsCreate"),
    );
    expect(w.get('[data-testid="ws-empty"]').text()).toBe(
      useLocale().t("authorHome.wsEmpty"),
    );
    w.unmount();
  });

  it("derives the slug from the name until the slug is edited, then creates", async () => {
    const w = mounted();
    await flushPromises();
    await w.get('[data-testid="ws-new-name"]').setValue("My Stories");
    expect((w.get('[data-testid="ws-new-slug"]').element as HTMLInputElement).value).toBe(
      "my-stories",
    );
    await w.get("form").trigger("submit");
    await flushPromises();
    expect(api).toHaveBeenCalledWith("/workspaces", {
      method: "POST",
      body: JSON.stringify({ name: "My Stories", slug: "my-stories" }),
    });
    // The new OWNER row appears without a reload.
    expect(w.find('[data-testid="ws-row-my-stories"]').exists()).toBe(true);
  });

  it("maps a slug conflict to the actionable 409 copy", async () => {
    const { ApiError } = await import("../../composables/useApi");
    api.mockImplementation(async (_path: string, init?: RequestInit) => {
      if (init?.method === "POST") throw new ApiError("CONFLICT", 409);
      return [];
    });
    const w = mounted();
    await flushPromises();
    await w.get('[data-testid="ws-new-name"]').setValue("Alpha");
    await w.get("form").trigger("submit");
    await flushPromises();
    expect(w.get('[data-testid="ws-error"]').text()).toBe(
      useLocale().t("authorHome.wsSlugConflict"),
    );
  });

  it("renames inline and updates the row", async () => {
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (init?.method === "PATCH") return { id: "ws-1", name: "Renamed", slug: "alpha" };
      return rows();
    });
    const w = mounted();
    await flushPromises();
    await w.get('[data-testid="ws-rename-alpha"]').trigger("click");
    await w.get('[data-testid="ws-rename-input-alpha"]').setValue("  Renamed  ");
    await w.get('[data-testid="ws-rename-save-alpha"]').trigger("click");
    await flushPromises();
    expect(api).toHaveBeenCalledWith("/workspaces/ws-1", {
      method: "PATCH",
      body: JSON.stringify({ name: "Renamed" }),
    });
    expect(w.get('[data-testid="ws-row-alpha"]').text()).toContain("Renamed");
    expect(w.find('[data-testid="ws-rename-input-alpha"]').exists()).toBe(false);
  });

  it("disables and explains deletion for non-empty workspaces, hides disallowed actions", async () => {
    api.mockImplementation(async () => rows());
    const w = mounted();
    await flushPromises();
    // Non-OWNER row: no rename/delete actions at all (permission-hidden).
    expect(w.find('[data-testid="ws-rename-beta"]').exists()).toBe(false);
    expect(w.find('[data-testid="ws-delete-beta"]').exists()).toBe(false);
    // OWNER row with novels: delete rendered but disabled with the reason.
    const blocked = w.get('[data-testid="ws-delete-gamma"]');
    expect(blocked.attributes("disabled")).toBeDefined();
    expect(blocked.attributes("title")).toBe(useLocale().t("authorHome.wsDeleteBlocked"));
    expect(w.find('[data-testid="ws-delete-alpha"]').exists()).toBe(true);
  });

  it("deletes through the confirm dialog and removes the row", async () => {
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (init?.method === "DELETE") return { status: "ok" };
      return rows();
    });
    const w = mounted();
    await flushPromises();
    await w.get('[data-testid="ws-delete-alpha"]').trigger("click");
    await flushPromises();
    await w.get('[data-testid="confirm-ok"]').trigger("click");
    await flushPromises();
    expect(api).toHaveBeenCalledWith("/workspaces/ws-1", { method: "DELETE" });
    expect(w.find('[data-testid="ws-row-alpha"]').exists()).toBe(false);
  });

  it("shows the forbidden copy on 403", async () => {
    const { ApiError } = await import("../../composables/useApi");
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (init?.method === "DELETE") throw new ApiError("FORBIDDEN", 403);
      return rows();
    });
    const w = mounted();
    await flushPromises();
    await w.get('[data-testid="ws-delete-alpha"]').trigger("click");
    await flushPromises();
    await w.get('[data-testid="confirm-ok"]').trigger("click");
    await flushPromises();
    expect(w.get('[role="alertdialog"] [role="alert"]').text()).toBe(useLocale().t("authorHome.forbidden"));
  });

  it("keeps submitted identity and prevents close during pending creation", async () => {
    let finish!: (value: { id: string }) => void;
    api.mockImplementation(async (_path: string, init?: RequestInit) =>
      init?.method === "POST" ? new Promise((resolve) => { finish = resolve; }) : [],
    );
    const w = mounted(); await flushPromises();
    await w.get('[data-testid="ws-new-name"]').setValue("Original");
    await w.get("form").trigger("submit"); await flushPromises();
    expect(w.get('[data-testid="ws-close"]').attributes("disabled")).toBeDefined();
    await w.get('[data-testid="ws-new-name"]').setValue("Changed while pending");
    await w.get('[data-testid="ws-close"]').trigger("click");
    expect(w.emitted("close")).toBeUndefined();
    finish({ id: "new-ws" }); await flushPromises();
    expect(w.get('[data-testid="ws-row-original"]').text()).toContain("Original");
    expect(w.text()).not.toContain("Changed while pending");
  });

  it("does not create while its initial workspace list is unresolved", async () => {
    let finish!: (value: ReturnType<typeof rows>) => void;
    api.mockImplementation((_path: string, init?: RequestInit) =>
      init?.method === "POST" ? Promise.resolve({ id: "new-ws" }) : new Promise((resolve) => { finish = resolve; }),
    );
    const w = mounted(); await flushPromises();
    await w.get('[data-testid="ws-new-name"]').setValue("New");
    await w.get("form").trigger("submit");
    expect(api.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
    finish(rows()); await flushPromises();
    await w.get("form").trigger("submit"); await flushPromises();
    expect(w.find('[data-testid="ws-row-alpha"]').exists()).toBe(true);
    expect(w.find('[data-testid="ws-row-new"]').exists()).toBe(true);
  });

  it("blocks retries when creation may have committed without a response", async () => {
    api.mockImplementation(async (_path: string, init?: RequestInit) => {
      if (init?.method === "POST") throw new TypeError("network lost");
      return [];
    });
    const w = mounted(); await flushPromises();
    await w.get('[data-testid="ws-new-name"]').setValue("Uncertain");
    await w.get("form").trigger("submit"); await flushPromises();
    expect(w.get('[data-testid="ws-error"]').text()).toBe(useLocale().t("authorHome.wsAmbiguous"));
    await w.get("form").trigger("submit"); await flushPromises();
    expect(api.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });

  it("shows history refusal inside the active confirmation with accurate copy", async () => {
    const { ApiError } = await import("../../composables/useApi");
    api.mockImplementation(async (_path: string, init?: RequestInit) => {
      if (init?.method === "DELETE") throw new ApiError("WORKSPACE_HAS_REFERENCED_HISTORY", 409);
      return rows();
    });
    const w = mounted(); await flushPromises();
    await w.get('[data-testid="ws-delete-alpha"]').trigger("click");
    await w.get('[data-testid="confirm-ok"]').trigger("click"); await flushPromises();
    expect(w.get('[role="alertdialog"] [role="alert"]').text()).toBe(useLocale().t("authorHome.wsHistoryBlocked"));
    expect(w.text()).not.toContain(useLocale().t("authorHome.wsSlugConflict"));
  });
});
