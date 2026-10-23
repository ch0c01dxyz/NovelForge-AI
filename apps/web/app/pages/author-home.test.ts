import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { ref, type Ref } from "vue";
import Home from "./author.vue";
import Wizard from "../components/author/NewNovelWizard.vue";
import { ApiError } from "../composables/useApi";
import { useLocale } from "../composables/useLocale";
import { en } from "../i18n/en";
import { id } from "../i18n/id";

const api = vi.hoisted(() => vi.fn());
const ownershipPolicy = vi.hoisted(() => vi.fn());
vi.mock("../composables/useApi", async (original) => ({
  ...(await original<object>()),
  useApi: () => ({ api: (path: string, init?: RequestInit) => path === "/workspaces/ownership-policy" ? ownershipPolicy() : api(path, init) }),
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
const wrappers: VueWrapper[] = [];
const links = { BrandLogo: true, NuxtLink: { props: ["to"], template: '<a :href="to"><slot /></a>' } };
function mounted(component: typeof Home | typeof Wizard) {
  const wrapper = mount(component, { global: { stubs: links } });
  wrappers.push(wrapper);
  return wrapper;
}
beforeEach(() => {
  states.clear();
  cookie.value = null;
  localStorage.clear();
  navigate.mockReset();
  api.mockReset().mockImplementation(async (path: string, init?: RequestInit) => {
    if (path === "/auth/session") return { userId: "author", platformRole: null };
    if (path === "/novels" || (path === "/workspaces" && !init)) return [];
    if (path === "/workspaces") return { id: "new-workspace" };
    return { id: "new-novel" };
  });
  ownershipPolicy.mockReset().mockResolvedValue({ ownedCount: 0, maxOwned: 1, canCreate: true });
});
afterEach(() => wrappers.splice(0).forEach((w) => w.unmount()));
const posts = () => api.mock.calls.filter(([, init]) => init?.method === "POST");
async function next(w: VueWrapper) {
  await w.get("form").trigger("submit");
  await flushPromises();
}
async function fillNew(w: VueWrapper) {
  await flushPromises();
  await w.get('[data-testid="workspace-name"]').setValue("My stories");
  await w.get('[data-testid="workspace-slug"]').setValue("my-stories");
  await next(w);
  await w.get('[data-testid="novel-title"]').setValue("Moonlit road");
  await w.get('[data-testid="novel-slug"]').setValue("moonlit-road");
  await next(w);
}

describe("author home and creation", () => {
  it("reloads the workspace created in another tab after a stale ownership refusal", async () => {
    let createdElsewhere = false;
    ownershipPolicy.mockImplementation(async () => ({ ownedCount: createdElsewhere ? 1 : 0, maxOwned: 1, canCreate: !createdElsewhere }));
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "/workspaces" && !init) return createdElsewhere ? [{ id: "other-tab", name: "My stories", slug: "my-stories", role: "OWNER", canCreateNovel: true }] : [];
      if (path === "/workspaces") { createdElsewhere = true; throw new ApiError("WORKSPACE_OWNERSHIP_LIMIT", 409); }
      return { id: "novel" };
    });
    const w = mounted(Wizard); await fillNew(w); await next(w);
    expect(w.get("select").findAll("option").map(o => o.text())).toEqual(["My stories"]);
    expect(w.find('input[type="radio"][value="new"]').exists()).toBe(false);
    await next(w); await next(w); await next(w);
    expect(posts().map(([path]) => path)).toEqual(["/workspaces", "/workspaces/other-tab/novels"]);
  });
  it("explains the ownership cap and reuses an existing workspace for another novel", async () => {
    ownershipPolicy.mockResolvedValue({ ownedCount: 1, maxOwned: 1, canCreate: false });
    api.mockImplementation(async (path: string, init?: RequestInit) => path === "/workspaces" && !init
      ? [{ id: "own", name: "My stories", slug: "my-stories", role: "OWNER", canCreateNovel: true }]
      : { id: "next-novel" });
    const w = mounted(Wizard); await flushPromises();
    expect(w.find('input[type="radio"][value="new"]').exists()).toBe(false);
    expect(w.text()).toContain("one workspace");
    await next(w);
    await w.get('[data-testid="novel-title"]').setValue("Another story");
    await w.get('[data-testid="novel-slug"]').setValue("another-story");
    await next(w); await next(w);
    expect(posts().map(([path]) => path)).toEqual(["/workspaces/own/novels"]);
  });
  it("shows the account profile from the authenticated session and retains logout", async () => {
    api.mockImplementation(async (path: string) => path === "/auth/session" ? { userId: "author", platformRole: null, profile: { displayName: "Story Author", email: "author@example.test" } } : []);
    const w = mounted(Home);await flushPromises();
    expect(w.get('[data-testid="account-menu"]').text()).toContain("Story Author");
    await w.get('[data-testid="account-profile"]').trigger("click");await flushPromises();
    expect(w.get('[data-testid="account-profile-dialog"]').text()).toContain("author@example.test");
    expect(posts()).toHaveLength(0);
    await w.get('[data-testid="account-profile-close"]').trigger("click");await flushPromises();
    await w.get('[data-testid="account-logout"]').trigger("click");await flushPromises();
    expect(posts().map(([path]) => path)).toEqual(["/auth/logout"]);
  });
  it("keeps the same novel links in compact grid and list layouts", async () => {
    api.mockImplementation(async (path: string) => path === "/auth/session" ? { userId: "author", platformRole: null } : [{ id: "novel", workspaceId: "workspace", title: "A long novel title", slug: "novel", status: "DRAFT" }]);
    const w = mounted(Home);await flushPromises();
    expect(w.find('[data-testid="novel-library-grid"]').exists()).toBe(true);
    await w.get('[data-testid="view-list"]').trigger("click");
    expect(w.find('[data-testid="novel-library-list"]').exists()).toBe(true);
    expect(w.get('a[href="/workspaces/workspace/novels/novel"]').text()).toContain("A long novel title");
    expect(localStorage.getItem("novelforge.libraryView")).toBe("list");
  });
  it("renders the authenticated cover URL without exposing image data and keeps the title fallback", async () => {
    const coverUrl = "/api/workspaces/w/novels/n/cover?v=hash";
    api.mockImplementation(async path => path === "/auth/session" ? { userId: "a", platformRole: null } : path === "/novels" ? [
      { id: "n", workspaceId: "w", title: "Covered novel", status: "DRAFT", coverUrl },
      { id: "m", workspaceId: "w", title: "Uncovered novel", status: "DRAFT" },
    ] : []);
    const w = mounted(Home);
    await flushPromises();
    expect(w.get("img").attributes()).toMatchObject({ src: coverUrl, alt: "", loading: "lazy" });
    expect(w.findAll("img")).toHaveLength(1);
    expect(w.get('a[href="/workspaces/w/novels/m"]').text()).toContain("U");
  });
  it.each(["en", "id"] as const)(
    "shows the localized CTA and actual-role admin link in %s",
    async (locale) => {
      useLocale().setLocale(locale);
      api.mockImplementation(async (path) =>
        path === "/auth/session" ? { userId: "a", platformRole: "SUPER_ADMIN" } : [],
      );
      const w = mounted(Home);
      await flushPromises();
      expect(w.text()).toContain(locale === "en" ? "Create webnovel" : "Buat webnovel");
    expect(w.get('a[href="/admin"]').attributes("href")).toBe("/admin");
      expect(w.text()).not.toContain("through the API");
      expect(posts()).toHaveLength(0);
    },
  );
  it.each([null, "ADMIN", "OWNER"])(
    "never derives platform administration from role %s",
    async (role) => {
      api.mockImplementation(async (path) =>
        path === "/auth/session" ? { userId: "a", platformRole: role } : [],
      );
      const w = mounted(Home);
      await flushPromises();
      expect(w.find('a[href="/admin"]').exists()).toBe(false);
    },
  );
  it.each(["en", "id"] as const)(
    "places the localized manage-workspaces control next to the create CTA in %s",
    async (locale) => {
      useLocale().setLocale(locale);
      const w = mounted(Home);
      await flushPromises();
      const manage = w.get('[data-testid="manage-workspaces"]');
      expect(manage.text()).toBe(
        locale === "en" ? "Manage workspaces" : "Kelola workspace",
      );
      // Sits beside (precedes) the create CTA in the same action group.
      const create = w
        .findAll("button")
        .find((b) => b.text() === (locale === "en" ? "Create webnovel" : "Buat webnovel"))!;
      expect(create).toBeDefined();
      expect(
        manage.element.compareDocumentPosition(create.element) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      await manage.trigger("click");
      await flushPromises();
      expect(w.find('[role="dialog"]').exists()).toBe(true);
      expect(w.get('[data-testid="ws-close"]').text()).toBeTruthy();
    },
  );
  it.each(["en", "id"] as const)(
    "opens create-webnovel as a modal dialog in %s",
    async (locale) => {
      useLocale().setLocale(locale);
      const w = mounted(Home);
      await flushPromises();
      await w
        .findAll("button")
        .find((b) => b.text() === (locale === "en" ? "Create webnovel" : "Buat webnovel"))!
        .trigger("click");
      await flushPromises();
      const dlg = w.find('[role="dialog"][aria-modal="true"]');
      expect(dlg.exists()).toBe(true);
      expect(dlg.attributes("aria-label")).toBe(
        locale === "en" ? "Create webnovel" : "Buat webnovel",
      );
      // The wizard's own close affordance dismisses the modal.
      await dlg.find("form ~ * button, section button").trigger("click");
      await flushPromises();
      expect(w.find('[role="dialog"]').exists()).toBe(false);
    },
  );
  it("fails closed when session lookup fails and redirects unauthenticated authors", async () => {
    api.mockRejectedValue(new ApiError("UNAUTHORIZED", 401));
    const w = mounted(Home);
    await flushPromises();
    expect(w.find('a[href="/admin"]').exists()).toBe(false);
    expect(navigate).toHaveBeenCalledWith("/login?redirect=/author");
    expect(api).toHaveBeenCalledTimes(1);
  });
  it("saves nothing before final confirmation, then opens the actual created workspace", async () => {
    const w = mounted(Home);
    await flushPromises();
    await w
      .findAll("button")
      .find((b) => b.text() === "Create webnovel")!
      .trigger("click");
    await fillNew(w);
    expect(posts()).toHaveLength(0);
    expect(w.text()).toContain("Moonlit road");
    await next(w);
    expect(posts().map(([path]) => path)).toEqual([
      "/workspaces",
      "/workspaces/new-workspace/novels",
    ]);
    expect(JSON.parse(posts()[0]![1].body)).toEqual({ name: "My stories", slug: "my-stories" });
    expect(navigate).toHaveBeenCalledWith("/workspaces/new-workspace/novels/new-novel");
  });
  it("lists only eligible existing workspaces and never creates another workspace", async () => {
    api.mockImplementation(async (path, init) =>
      path === "/workspaces" && !init
        ? [
            {
              id: "reader",
              name: "Read only",
              slug: "read-only",
              role: "READER",
              canCreateNovel: false,
            },
            { id: "writer", name: "Writing", slug: "writing", role: "OWNER", canCreateNovel: true },
          ]
        : { id: "novel" },
    );
    const w = mounted(Wizard);
    await flushPromises();
    expect(w.find("option[value=reader]").exists()).toBe(false);
    await next(w);
    await w.get('[data-testid="novel-title"]').setValue("Title");
    await w.get('[data-testid="novel-slug"]').setValue("title");
    await next(w);
    await next(w);
    expect(posts().map(([path]) => path)).toEqual(["/workspaces/writer/novels"]);
    expect(w.emitted("created")).toEqual([["writer", "novel"]]);
  });
  it("rejects whitespace names and invalid slugs before progressing", async () => {
    const w = mounted(Wizard);
    await flushPromises();
    await w.get('[data-testid="workspace-name"]').setValue(" ");
    await w.get('[data-testid="workspace-slug"]').setValue("BAD--SLUG");
    await next(w);
    expect(w.get('[data-testid="wizard-next"]').attributes("disabled")).toBeDefined();
    expect(w.find('[data-testid="novel-title"]').exists()).toBe(false);
    expect(posts()).toHaveLength(0);
  });
  it("retains a saved workspace after a rejected novel and safely retries with corrected details", async () => {
    const w = mounted(Wizard);
    await fillNew(w);
    api.mockImplementation(async (path) => {
      if (path === "/workspaces") return { id: "saved" };
      throw new ApiError("CONFLICT", 409);
    });
    await next(w);
    expect(w.text()).toContain("workspace is saved");
    await w
      .findAll("button")
      .find((b) => b.text() === "Back")!
      .trigger("click");
    await w.get('[data-testid="novel-slug"]').setValue("another-title");
    await next(w);
    api.mockResolvedValue({ id: "novel" });
    await next(w);
    expect(posts().filter(([p]) => p === "/workspaces")).toHaveLength(1);
    expect(posts().at(-1)![0]).toBe("/workspaces/saved/novels");
    expect(w.emitted("created")).toEqual([["saved", "novel"]]);
  });
  it("blocks double submissions and ambiguous transport retries", async () => {
    const w = mounted(Wizard);
    await fillNew(w);
    let reject!: (reason: Error) => void;
    api.mockImplementation(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        }),
    );
    await w.get("form").trigger("submit");
    await w.get("form").trigger("submit");
    expect(posts()).toHaveLength(1);
    reject(new Error("connection lost"));
    await flushPromises();
    expect(w.get('[role="alert"]').text()).toContain("may already be saved");
    await next(w);
    expect(posts()).toHaveLength(1);
  });
  it("provides translated creation keys and retains the existing English missing-key fallback", () => {
    expect(Object.keys(id.authorHome).sort()).toEqual(Object.keys(en.authorHome).sort());
    useLocale().setLocale("id");
    expect(useLocale().t("authorHome.confirm")).toBe(id.authorHome.confirm);
    // The shared locale suite owns the missing-key fallback regression.
    expect(Object.values(id.authorHome).every((value) => value.length > 0)).toBe(true);
  });
});
