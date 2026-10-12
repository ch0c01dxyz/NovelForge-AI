/**
 * NF-WF-050C amendment 1 (finding A): ScaleS3SettingToggle regression tests.
 *
 * - Loads GET scale-s3-setting and renders the current state.
 * - OWNER/ADMIN/AUTHOR see Enable/Disable; other roles see the read-only note.
 * - Switching opens the reason form prefilled; confirm PUTs {enabled, reason}.
 * - Saving state blocks duplicate submits; success updates the state badge.
 * - PUT 403 → forbidden error, state reverts to the server value.
 * - Missing role (null) → read-only (server stays the enforcer).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ApiError as ApiErrorCtor } from "../../composables/useApi";
import ScaleS3SettingToggle from "./ScaleS3SettingToggle.vue";

const enDict: Record<string, string> = {
  "workspace.narrative.common.loading": "Loading…",
  "common.cancel": "Cancel",
  "workspace.narrative.scaleReview.s3.setting.title": "AI suggestions (S3)",
  "workspace.narrative.scaleReview.s3.setting.about": "Per-novel, off by default.",
  "workspace.narrative.scaleReview.s3.setting.stateOn": "On",
  "workspace.narrative.scaleReview.s3.setting.stateOff": "Off",
  "workspace.narrative.scaleReview.s3.setting.explain": "Enabling authorizes AI processing.",
  "workspace.narrative.scaleReview.s3.setting.enable": "Enable",
  "workspace.narrative.scaleReview.s3.setting.disable": "Disable",
  "workspace.narrative.scaleReview.s3.setting.readOnly": "Only OWNER, ADMIN or AUTHOR can change this setting.",
  "workspace.narrative.scaleReview.s3.setting.reasonLabel": "Reason",
  "workspace.narrative.scaleReview.s3.setting.reasonInvalid": "Reason is required.",
  "workspace.narrative.scaleReview.s3.setting.saving": "Saving…",
  "workspace.narrative.scaleReview.s3.setting.confirm": "Confirm: turn {state}",
  "workspace.narrative.scaleReview.s3.setting.forbidden": "You are not allowed to change this setting.",
  "workspace.narrative.scaleReview.s3.setting.saveFailed": "Could not save the setting. Try again.",
  "workspace.narrative.scaleReview.s3.setting.defaultReason": "Enable optional AI SCALE suggestions for this novel.",
};

vi.mock("../../composables/useLocale", () => ({
  useLocale: () => ({
    t: (key: string, params?: Record<string, string>) => {
      let result = enDict[key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) result = result.replace(`{${k}}`, v);
      }
      return result;
    },
    locale: { value: "en" },
  }),
}));

let apiImpl: (url: string, opts?: { method?: string; body?: string }) => Promise<unknown> = async () => ({ enabled: false });
let roleImpl: (workspaceId: string) => Promise<string | null> = async () => "AUTHOR";

vi.mock("../../composables/useApi", () => ({
  useApi: () => ({
    api: (url: string, opts?: { method?: string; body?: string }) => apiImpl(url, opts),
  }),
  ApiError: class ApiError extends Error {
    code: string;
    status: number;
    constructor(code: string, status: number) {
      super(`${status} ${code}`);
      this.code = code;
      this.status = status;
    }
  },
}));

vi.mock("../../composables/useAiStudio", () => ({
  useAiStudio: () => ({
    getWorkspaceRole: (workspaceId: string) => roleImpl(workspaceId),
  }),
}));

const WS = "22222222-2222-2222-2222-222222222222";
const NV = "55555555-5555-5555-5555-555555555555";

function mountToggle() {
  return mount(ScaleS3SettingToggle, {
    props: { workspaceId: WS, novelId: NV },
  });
}

beforeEach(() => {
  apiImpl = async () => ({ enabled: false });
  roleImpl = async () => "AUTHOR";
});

describe("ScaleS3SettingToggle", () => {
  it("loads the setting and renders the Off state with manage controls for AUTHOR", async () => {
    const wrapper = mountToggle();
    await flushPromises();
    expect(wrapper.text()).toContain("Off");
    expect(wrapper.find('[data-testid="s3-enable"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="s3-disable"]').exists()).toBe(true);
  });

  it("enable → reason form prefilled → PUT {enabled:true, reason} → badge shows On", async () => {
    const puts: Array<{ body: string }> = [];
    apiImpl = async (_url, opts) => {
      if (opts?.method === "PUT") {
        puts.push({ body: opts.body! });
        return { enabled: true };
      }
      return { enabled: false };
    };
    const wrapper = mountToggle();
    await flushPromises();
    await wrapper.find('[data-testid="s3-enable"]').trigger("click");
    const reason = wrapper.find('[data-testid="s3-reason"]');
    expect((reason.element as HTMLTextAreaElement).value.length).toBeGreaterThan(0);
    await wrapper.find('[data-testid="s3-submit"]').trigger("submit");
    await flushPromises();
    expect(puts).toHaveLength(1);
    const body = JSON.parse(puts[0]!.body);
    expect(body.enabled).toBe(true);
    expect(typeof body.reason).toBe("string");
    expect(body.reason.length).toBeGreaterThan(0);
    expect(wrapper.text()).toContain("On");
  });

  it("empty reason is refused client-side with no PUT", async () => {
    const puts: string[] = [];
    apiImpl = async (_url, opts) => {
      if (opts?.method === "PUT") puts.push(opts.body!);
      return { enabled: false };
    };
    const wrapper = mountToggle();
    await flushPromises();
    await wrapper.find('[data-testid="s3-enable"]').trigger("click");
    const reason = wrapper.find('[data-testid="s3-reason"]');
    await reason.setValue("");
    await wrapper.find('[data-testid="s3-submit"]').trigger("submit");
    await flushPromises();
    expect(puts).toHaveLength(0);
    expect(wrapper.text()).toContain("Reason is required.");
  });

  it("PUT 403 → forbidden alert and the server state is kept (Off)", async () => {
    apiImpl = async (_url, opts) => {
      if (opts?.method === "PUT") {
        throw new ApiErrorCtor("FORBIDDEN", 403);
      }
      return { enabled: false };
    };
    const wrapper = mountToggle();
    await flushPromises();
    await wrapper.find('[data-testid="s3-enable"]').trigger("click");
    await wrapper.find('[data-testid="s3-submit"]').trigger("submit");
    await flushPromises();
    expect(wrapper.text()).toContain("You are not allowed to change this setting.");
    expect(wrapper.text()).toContain("Off");
  });

  it("VIEWER role sees the read-only note and no manage buttons", async () => {
    roleImpl = async () => "VIEWER";
    const wrapper = mountToggle();
    await flushPromises();
    expect(wrapper.find('[data-testid="s3-enable"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("Only OWNER, ADMIN or AUTHOR");
  });

  it("missing role (null) is read-only", async () => {
    roleImpl = async () => null;
    const wrapper = mountToggle();
    await flushPromises();
    expect(wrapper.find('[data-testid="s3-enable"]').exists()).toBe(false);
  });

  it("in-flight duplicate submit is blocked by the saving guard (one PUT)", async () => {
    let resolveFirst: (v: unknown) => void = () => {};
    const puts: string[] = [];
    apiImpl = (_url, opts) => {
      if (opts?.method === "PUT") {
        puts.push(opts.body!);
        if (puts.length === 1) {
          return new Promise((res) => {
            resolveFirst = res;
          });
        }
        return Promise.resolve({ enabled: true });
      }
      return Promise.resolve({ enabled: false });
    };
    const wrapper = mountToggle();
    await flushPromises();
    await wrapper.find('[data-testid="s3-enable"]').trigger("click");
    const first = wrapper.find('[data-testid="s3-submit"]').trigger("submit");
    await flushPromises();
    // Second submit while the first PUT is still in flight must be a no-op.
    await wrapper.find('[data-testid="s3-submit"]').trigger("submit");
    await flushPromises();
    expect(puts).toHaveLength(1);
    resolveFirst({ enabled: true });
    await flushPromises();
    await first;
    expect(puts).toHaveLength(1);
  });
});
