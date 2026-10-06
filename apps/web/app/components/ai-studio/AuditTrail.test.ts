/**
 * AuditTrail component tests (NF-WF-018C).
 *
 * - Lists the workspace audit rows with time, actor, action, entity.
 * - The action filter calls the route with the pinned action;
 *   expanding a row reveals the identity-only payload.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import AuditTrail from "./AuditTrail.vue";
import { en } from "../../i18n/en";

vi.mock("../../composables/useLocale", () => ({
  useLocale: () => {
    const t = (path: string) => {
      const parts = path.split(".");
      let node: unknown = en;
      for (const p of parts) node = (node as Record<string, unknown>)?.[p];
      return typeof node === "string" ? node : path;
    };
    return { t, locale: { value: "en" }, setLocale: vi.fn() };
  },
}));

const rows = [
  {
    id: "a-1",
    actorUserId: "u-1",
    actorEmail: "owner@example.com",
    action: "workflow.run",
    entityType: "WorkflowRun",
    entityId: "run-1",
    payload: { workflowKey: "chapter-draft" },
    createdAt: "2026-10-06T03:00:00Z",
  },
  {
    id: "a-2",
    actorUserId: "u-1",
    actorEmail: "owner@example.com",
    action: "agent.created",
    entityType: "Agent",
    entityId: "ag-1",
    payload: { key: "writer" },
    createdAt: "2026-10-06T04:00:00Z",
  },
];

const listWorkspaceAuditLogMock = vi.fn();

vi.mock("../../composables/useReceipts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../composables/useReceipts")>();
  return {
    ...original,
    useReceipts: () => ({
      listWorkspaceAuditLog: listWorkspaceAuditLogMock,
    }),
  };
});

function mountTrail() {
  return mount(AuditTrail, {
    props: { workspaceId: "ws-1" },
    attachTo: document.body,
  });
}

describe("AuditTrail", () => {
  beforeEach(() => {
    listWorkspaceAuditLogMock.mockReset().mockResolvedValue(rows);
    document.body.innerHTML = "";
  });

  it("lists rows and filters by the pinned action", async () => {
    const wrapper = mountTrail();
    await flushPromises();
    expect(listWorkspaceAuditLogMock).toHaveBeenCalledWith("ws-1", { limit: 100 });
    expect(wrapper.html()).toContain("workflow.run");
    expect(wrapper.html()).toContain("owner@example.com");

    const select = wrapper.find("select#audit-action-filter");
    await select.setValue("agent.created");
    await flushPromises();
    expect(listWorkspaceAuditLogMock).toHaveBeenCalledWith("ws-1", {
      action: "agent.created",
      limit: 100,
    });
  });

  it("reveals the identity-only payload on row expand", async () => {
    const wrapper = mountTrail();
    await flushPromises();
    const row = wrapper.find("tbody tr");
    await row.trigger("click");
    await flushPromises();
    expect(wrapper.html()).toContain("chapter-draft");
  });
});
