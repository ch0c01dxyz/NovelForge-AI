import { mount, flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import DnaEditor from "./DnaEditor.vue";
const api = vi.hoisted(() => vi.fn());
vi.mock("../../composables/useApi", () => ({ useApi: () => ({ api }), ApiError: class extends Error {} }));
vi.mock("../../composables/useLocale", () => ({ useLocale: () => ({ t: (key: string) => key }) }));
describe("DNA profile envelope", () => {
  it("edits and saves the DNA only while preserving existing keys", async () => {
    const dna = { voice: "quiet", chapterAuthoring: { minimumWordCount: 2500 } };
    api.mockResolvedValue({ novelId: "novel", dna, updatedAt: "2026-10-26" });
    const wrapper = mount(DnaEditor, { props: { workspaceId: "workspace", novelId: "novel" } });
    await flushPromises();
    expect(JSON.parse(wrapper.get("pre").text())).toEqual(dna);
    await wrapper.get("button").trigger("click");
    await wrapper.get("form").trigger("submit");await flushPromises();
    expect(JSON.parse(api.mock.calls.at(-1)![1].body)).toEqual({ dna });
    wrapper.unmount();
  });
});
