import { describe, expect, it, vi } from "vitest";
import { OmniRouteGateway } from "./omniroute.ts";
import { GatewayManager, type GatewayRegistry } from "./manager.ts";
import type { AIGateway } from "./types.ts";

const config = { id: "gateway", name: "Gateway", baseUrl: "http://gateway.test/", apiKey: "fixture-key", timeoutMs: 1000 };

describe("embedding catalog boundary", () => {
  it("discovers the dedicated endpoint with only advertised embeddings capability, preserving text/image paths", async () => {
    const transport = vi.fn(async (_url: string, _init?: RequestInit) => Response.json({ data: [{ id: "provider/embedding", name: "Embedding" }, { name: "missing identity" }] }));
    const gateway = new OmniRouteGateway(config, transport);
    expect(await gateway.listEmbeddingModels()).toEqual([{ modelId: "provider/embedding", displayName: "Embedding", capabilities: ["embeddings"] }]);
    expect(transport.mock.calls[0]?.[0]).toBe("http://gateway.test/v1/models/embedding");
    expect(transport.mock.calls[0]?.[1]).toMatchObject({ headers: { authorization: "Bearer fixture-key" } });
    await gateway.listModels(); await gateway.listImageModels();
    expect(transport.mock.calls.map(call => call[0])).toEqual(["http://gateway.test/v1/models/embedding", "http://gateway.test/v1/models", "http://gateway.test/v1/models/image"]);
  });

  it("does not fall back to the text catalog when the dedicated endpoint is unavailable", async () => {
    const transport = vi.fn(async () => Response.json({ error: "private upstream detail" }, { status: 404 }));
    await expect(new OmniRouteGateway(config, transport).listEmbeddingModels()).rejects.toMatchObject({ category: "UNSUPPORTED" });
    expect(transport).toHaveBeenCalledOnce();
  });

  function manager(adapter: Pick<AIGateway, "listModels" | "listEmbeddingModels">, enabled = true) {
    const registry: GatewayRegistry = {
      listGateways: async () => [{ ...config, enabled, priority: 1, weight: 1, health: "HEALTHY", consecutiveFailures: 0, maxRetries: 0 }],
      resolveProfile: async () => [], recordAttempt: async () => {}, updateGatewayHealth: async () => {},
    };
    return new GatewayManager(registry, { createGateway: () => adapter as AIGateway });
  }

  it("uses only the embedding port and refuses adapters without one instead of fabricating support from text models", async () => {
    const text = vi.fn(async () => [{ modelId: "chat", capabilities: ["chat"] }]);
    const embeddings = vi.fn(async () => [{ modelId: "embed", capabilities: ["embeddings"] }]);
    expect(await manager({ listModels: text, listEmbeddingModels: embeddings }).listEmbeddingModelsFor("gateway")).toEqual([{ modelId: "embed", capabilities: ["embeddings"] }]);
    expect(embeddings).toHaveBeenCalledOnce(); expect(text).not.toHaveBeenCalled();
    await expect(manager({ listModels: text }).listEmbeddingModelsFor("gateway")).rejects.toMatchObject({ category: "UNSUPPORTED" });
    expect(text).not.toHaveBeenCalled();
  });

  it("does not contact a disabled gateway during catalog discovery", async () => {
    const embeddings = vi.fn(async () => []);
    await expect(manager({ listModels: async () => [], listEmbeddingModels: embeddings }, false).listEmbeddingModelsFor("gateway")).rejects.toMatchObject({ category: "INVALID_REQUEST" });
    expect(embeddings).not.toHaveBeenCalled();
  });
});
