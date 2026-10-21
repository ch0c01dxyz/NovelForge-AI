import { describe, expect, it, vi } from "vitest";
import { GatewayManager, type GatewayRegistry } from "./manager.ts";
import { OmniRouteGateway } from "./omniroute.ts";
import type { ImageJobContext } from "./types.ts";
const job: ImageJobContext = { gatewayId: "g", modelRef: "m", modelId: "aihorde/model", requestId: "4ace4b84-e91d-49ce-aefb-86698a6caf12", jobId: "a".repeat(64), timeoutMs: 1800000, deadlineAt: Date.now() + 1800000 };
function setup() {
  let enabled = true;
  const registry: GatewayRegistry = {
    listGateways: vi.fn(async () => [{ id: "g", name: "Gateway", baseUrl: "http://g.test", apiKey: "private", timeoutMs: 1000, enabled, priority: 1, weight: 1, health: "HEALTHY" as const, consecutiveFailures: 0 }]),
    resolveProfile: vi.fn(async () => [{ modelRef: "m", gatewayId: "g", modelId: job.modelId, capabilities: ["image-generation", "nf:image-jobs=v1"] }]),
    recordAttempt: vi.fn(async () => {}), updateGatewayHealth: vi.fn(async () => {}),
  };
  const requests: string[] = [];
  const manager = new GatewayManager(registry, { createGateway: row => new OmniRouteGateway(row, async (url, init) => {
    requests.push(`${init?.method} ${url}`);
    return url.endsWith("/result") ? new Response(Uint8Array.from([1, 2, 3]), { headers: { "content-type": "image/png" } }) : new Response(JSON.stringify({ id: job.jobId, model: job.modelId, state: "SUCCEEDED" }));
  }) });
  return { manager, registry, requests, disable: () => { enabled = false; } };
}
describe("pinned image job observation", () => {
  it("resumes using GET only and leaves terminal-attempt persistence to the fenced transaction", async () => {
    const { manager, requests, registry } = setup();
    await manager.runImageJob(job, { prompt: "Cover", resumeOnly: true, onReceipt: async () => true });
    expect(requests).toHaveLength(2); expect(requests.every(r => r.startsWith("GET"))).toBe(true);
    expect(registry.recordAttempt).not.toHaveBeenCalled();
  });
  it("checks the pinned gateway again before result retrieval and stops if disabled", async () => {
    const { manager, requests, disable } = setup();
    await expect(manager.runImageJob(job, { prompt: "Cover", resumeOnly: true, onReceipt: async () => { disable(); return true; } })).rejects.toMatchObject({ code: "NO_ROUTE" });
    expect(requests).toHaveLength(1); expect(requests[0]).not.toContain("/result");
  });
  it("rechecks model availability between polls without dispatching elsewhere", async () => {
    const { registry } = setup();
    registry.resolveProfile = vi.fn().mockResolvedValueOnce([{ modelRef: "m", gatewayId: "g", modelId: job.modelId }]).mockResolvedValue([]);
    const fetch = vi.fn(async () => new Response(JSON.stringify({ id: job.jobId, model: job.modelId, state: "QUEUED" })));
    const gateway = new OmniRouteGateway({ id: "g", name: "Gateway", baseUrl: "http://g.test", apiKey: "private", timeoutMs: 1000 }, fetch);
    const current = new GatewayManager(registry, { createGateway: () => gateway });
    await expect(current.runImageJob(job, { prompt: "Cover", resumeOnly: true, onReceipt: async () => true, sleep: async () => {} })).rejects.toMatchObject({ code: "NO_ROUTE" });
    expect(fetch).toHaveBeenCalledOnce();
  });
});
