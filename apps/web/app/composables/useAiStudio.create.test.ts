import { beforeEach, expect, it, vi } from "vitest";
import { useAiStudio } from "./useAiStudio";
const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("./useApi", async original => ({ ...await original<typeof import("./useApi")>(), useApi: () => ({ api }) }));
beforeEach(() => { api.mockReset().mockResolvedValue({ id: "created" }); });
it("installs only in the requested workspace with an empty server-owned template body", async () => {
  await useAiStudio().installStarterPack("own-workspace");
  expect(api).toHaveBeenCalledWith("/workspaces/own-workspace/studio/starter-pack", { method: "POST", body: "{}" });
});
it.each(["agent", "skill", "workflow"] as const)("forces workspace-only %s creation despite caller metadata", async kind => {
  await expect(useAiStudio().createDefinition("own-workspace", kind, { key: "example", scope: "PLATFORM", workspaceId: "foreign", novelId: "foreign-novel", name: "Example" })).resolves.toEqual({ id: "created" });
  expect(api).toHaveBeenCalledWith(`/${kind}s`, expect.objectContaining({ method: "POST" }));
  expect(JSON.parse(api.mock.calls[0]![1].body)).toEqual({ key: "example", scope: "WORKSPACE", workspaceId: "own-workspace", name: "Example" });
});
