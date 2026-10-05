import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import ApplyBar from "./ApplyBar.vue";

vi.mock("../../composables/useApi", () => ({
  useApi: () => ({
    api: vi.fn(),
  }),
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

const baseProps = {
  workspaceId: "ws",
  novelId: "novel",
  chapterId: "ch",
  chapterNumber: 1,
  chapterStatus: "DRAFT",
  currentVersion: 3,
  diffPinnedVersion: 3,
  saveState: "saved" as const,
  runStatus: "SUCCEEDED",
  runId: "run-1",
  draftProse: "Once upon a time…",
};

describe("ApplyBar", () => {
  beforeEach(() => vi.clearAllMocks());

  it("enables apply when all guards pass", () => {
    const w = mount(ApplyBar, { props: baseProps });
    const btn = w.find("button");
    expect(btn.attributes("disabled")).toBeUndefined();
  });

  it("disables apply with a dirty editor", () => {
    const w = mount(ApplyBar, { props: { ...baseProps, saveState: "dirty" } });
    expect(w.find("button").attributes("disabled")).toBeDefined();
    expect(w.text()).toContain("apply.blockedDirty");
  });

  it("blocks apply when the version moved (stale-source)", () => {
    const w = mount(ApplyBar, {
      props: { ...baseProps, currentVersion: 4, diffPinnedVersion: 3 },
    });
    expect(w.find("button").attributes("disabled")).toBeDefined();
    expect(w.text()).toContain("apply.blockedStale");
    expect(w.text()).toContain("apply.reloadRediff");
  });

  it("shows 'unpublish first' for published chapters", () => {
    const w = mount(ApplyBar, { props: { ...baseProps, chapterStatus: "PUBLISHED" } });
    expect(w.find("button").attributes("disabled")).toBeDefined();
    expect(w.text()).toContain("apply.blockedPublished");
  });

  it("hides the bar unless the run succeeded", () => {
    const w = mount(ApplyBar, { props: { ...baseProps, runStatus: "RUNNING" } });
    expect(w.html()).not.toContain("apply.applyDraft");
  });

  it("emits reload-rediff from the stale recovery path", async () => {
    const w = mount(ApplyBar, {
      props: { ...baseProps, currentVersion: 4, diffPinnedVersion: 3 },
    });
    const recovery = w.findAll("button").find((b) => b.text().includes("apply.reloadRediff"));
    expect(recovery).toBeDefined();
    await recovery!.trigger("click");
    expect(w.emitted("reload-rediff")).toHaveLength(1);
  });
});
