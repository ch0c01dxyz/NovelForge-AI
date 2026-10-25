import { describe, expect, it } from "vitest";
import { GatewayManager, type GatewayRecord, type GatewayRegistry } from "./manager.ts";
import { OmniRouteGateway } from "./omniroute.ts";

const record: GatewayRecord = {
  id: "embedding-gateway", name: "Embedding", baseUrl: "http://embedding.test",
  apiKey: "fixture", timeoutMs: 1000, enabled: true, priority: 0,
  weight: 1, health: "UNKNOWN", consecutiveFailures: 0,
};

function transport() {
  const bodies: unknown[] = [];
  const gateway = new OmniRouteGateway(record, async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ model: "embedding-model", data: [{ embedding: [1] }] }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  });
  return { gateway, bodies };
}

describe("embedding output dimensions", () => {
  it("preserves the requested width through routing and HTTP without altering returned vectors", async () => {
    const { gateway, bodies } = transport();
    const registry: GatewayRegistry = {
      async listGateways() { return [record]; },
      async resolveProfile() { return [{ gatewayId: record.id, modelId: "embedding-model" }]; },
      async recordAttempt() {},
      async updateGatewayHealth() {},
    };
    const manager = new GatewayManager(registry, { createGateway: () => gateway });
    const result = await manager.embed({ profile: "EMBEDDING", generationId: "probe", input: ["text"], dimensions: 1536 });
    expect(bodies).toEqual([{ model: "embedding-model", input: ["text"], dimensions: 1536 }]);
    expect(result.vectors).toEqual([[1]]);
  });

  it("omits output dimensions when the caller does not request them", async () => {
    const { gateway, bodies } = transport();
    await gateway.embed({ model: "embedding-model", input: ["text"] });
    expect(bodies).toEqual([{ model: "embedding-model", input: ["text"] }]);
  });

  it.each([0, -1, 1.5, Infinity, NaN])("refuses invalid width %s before transport", async dimensions => {
    const { gateway, bodies } = transport();
    await expect(gateway.embed({ model: "embedding-model", input: ["text"], dimensions })).rejects.toMatchObject({ category: "INVALID_REQUEST" });
    expect(bodies).toEqual([]);
  });
});
