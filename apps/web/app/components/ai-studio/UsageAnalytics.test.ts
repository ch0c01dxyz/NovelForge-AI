import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { axe } from "vitest-axe";
import UsageAnalytics from "./UsageAnalytics.vue";
import { useLocale } from "../../composables/useLocale";
import { ApiError } from "../../composables/useApi";

const mocks = vi.hoisted(() => ({ usage: vi.fn(), novels: vi.fn() }));
vi.mock("../../composables/useReceipts", () => ({ useReceipts: () => ({ usageAnalytics: mocks.usage, listNovels: mocks.novels }) }));
const response = {
  summary: { requests: 2, attempts: 3, inputTokens: "12", outputTokens: "7", totalTokens: "19", unknownUsageRequests: 1, unknownUsageAttempts: 1, legacyRequests: 1 },
  rows: [{ component: "CHAPTER", task: "chapter.generate", artifactId: null, model: "served-model", requests: 2, inputTokens: "12", outputTokens: "7", totalTokens: "19", unknownUsageRecords: 1, legacyRecords: 1 }],
  hasMore: false,
};
beforeEach(() => { mocks.usage.mockReset().mockResolvedValue(response); mocks.novels.mockReset().mockResolvedValue([{ id: "novel", title: "Novel", slug: "novel" }]); useLocale().setLocale("en"); });

describe("generation usage analytics", () => {
  it.each(["en", "id"] as const)("renders observed tokens, model, coverage and accessible filters in %s", async locale => {
    useLocale().setLocale(locale);
    const wrapper = mount(UsageAnalytics, { props: { workspaceId: "workspace" } });
    await flushPromises();
    expect(wrapper.text()).toContain("19");
    expect(wrapper.text()).toContain("served-model");
    expect(wrapper.text()).toContain(locale === "en" ? "Recorded tokens" : "Token tercatat");
    expect(wrapper.text()).toContain(locale === "en" ? "incomplete" : "tidak lengkap");
    await wrapper.get("select[data-filter=novel]").setValue("novel"); await flushPromises();
    expect(mocks.usage).toHaveBeenLastCalledWith("workspace", expect.objectContaining({ novelId: "novel", offset: 0 }));
    expect((await axe(wrapper.element)).violations).toEqual([]);
    wrapper.unmount();
  });

  it("keeps errors visible and prevents a stale novel response replacing the current one", async () => {
    const wrapper = mount(UsageAnalytics, { props: { workspaceId: "workspace" } }); await flushPromises();
    let resolveOld!: (value: typeof response) => void;
    mocks.usage.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    await wrapper.get("select[data-filter=novel]").setValue("novel");
    mocks.usage.mockResolvedValueOnce({ ...response, rows: [{ ...response.rows[0], model: "new-model" }] });
    await wrapper.get("select[data-filter=novel]").setValue(""); await flushPromises();
    resolveOld(response); await flushPromises();
    expect(wrapper.text()).toContain("new-model");
    expect(wrapper.text()).not.toContain("served-model");
    mocks.usage.mockRejectedValueOnce(new Error("Analytics unavailable"));
    await wrapper.get("button[data-refresh]").trigger("click"); await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe(useLocale().t("usage.loadError"));
    wrapper.unmount();
  });

  it.each(["en", "id"] as const)("localizes transport errors and retries missing novels in %s", async locale => {
    useLocale().setLocale(locale);
    mocks.usage.mockRejectedValueOnce(new ApiError("SERVICE_UNAVAILABLE", 503));
    mocks.novels.mockRejectedValueOnce(new ApiError("SERVICE_UNAVAILABLE", 503));
    const wrapper = mount(UsageAnalytics, { props: { workspaceId: "workspace" } });
    await flushPromises();
    expect(wrapper.text()).toContain(useLocale().t("usage.loadError"));
    expect(wrapper.text()).not.toContain("SERVICE_UNAVAILABLE");
    await wrapper.get("button[data-refresh]").trigger("click"); await flushPromises();
    expect(mocks.novels).toHaveBeenCalledTimes(2);
    expect(wrapper.findAll('[role="alert"]')).toHaveLength(0);
    expect(wrapper.get("select[data-filter=novel]").text()).toContain("Novel");
    wrapper.unmount();
  });
});
