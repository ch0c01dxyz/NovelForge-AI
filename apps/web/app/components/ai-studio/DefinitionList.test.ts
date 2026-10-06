/**
 * DefinitionList component tests (NF-WF-018A).
 *
 * - Renders definitions with name, key, version, and status.
 * - The Run button appears only for PUBLISHED workflows when canRun.
 * - Selecting a definition emits select.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import DefinitionList from "./DefinitionList.vue";

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

const definitions = [
  {
    id: "wf-1",
    scope: "WORKSPACE",
    workspaceId: "ws-1",
    key: "chapter-draft",
    name: "Chapter Draft",
    description: null,
    status: "PUBLISHED",
    version: 3,
    versionId: "v-3",
    createdAt: "2026-10-06T00:00:00Z",
    updatedAt: "2026-10-06T00:00:00Z",
  },
  {
    id: "wf-2",
    scope: "WORKSPACE",
    workspaceId: "ws-1",
    key: "chapter-draft-2",
    name: "Chapter Draft 2",
    description: null,
    status: "DRAFT",
    version: 1,
    versionId: "v-1",
    createdAt: "2026-10-06T00:00:00Z",
    updatedAt: "2026-10-06T00:00:00Z",
  },
];

const apiMock = vi.fn();

vi.mock("../../composables/useAiStudio", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../composables/useAiStudio")>();
  return {
    ...original,
    useAiStudio: () => ({ listDefinitions: apiMock }),
  };
});

function mountList(props: Record<string, unknown> = {}) {
  return mount(DefinitionList, {
    props: {
      workspaceId: "ws-1",
      kind: "workflow",
      canManage: true,
      canRun: true,
      ...props,
    },
  });
}

describe("DefinitionList", () => {
  beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockResolvedValue(definitions);
  });

  it("renders definitions with name, version, and status", async () => {
    const wrapper = mountList();
    await flushPromises();
    expect(apiMock).toHaveBeenCalledWith("ws-1", "workflow");
    const text = wrapper.text();
    expect(text).toContain("Chapter Draft");
    expect(text).toContain("chapter-draft");
    expect(text).toContain("aiStudio.definitions.version|version=3");
    expect(text).toContain("aiStudio.definitions.status.PUBLISHED");
  });

  it("shows the Run button only for PUBLISHED workflows when canRun", async () => {
    const wrapper = mountList();
    await flushPromises();
    const buttons = wrapper.findAll("button");
    const runButtons = buttons.filter((b) =>
      b.text().includes("aiStudio.definitions.runWorkflow"),
    );
    // Only the PUBLISHED workflow gets a Run button.
    expect(runButtons).toHaveLength(1);
  });

  it("hides the Run button when canRun is false", async () => {
    const wrapper = mountList({ canRun: false });
    await flushPromises();
    const buttons = wrapper.findAll("button");
    const runButtons = buttons.filter((b) =>
      b.text().includes("aiStudio.definitions.runWorkflow"),
    );
    expect(runButtons).toHaveLength(0);
  });

  it("emits select with the definition id", async () => {
    const wrapper = mountList();
    await flushPromises();
    const nameButtons = wrapper.findAll("button").filter((b) =>
      b.text().includes("Chapter Draft 2"),
    );
    await nameButtons[0]!.trigger("click");
    expect(wrapper.emitted("select")).toEqual([["wf-2"]]);
  });
});
