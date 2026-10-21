import { describe, expect, it, vi } from "vitest";
import { GatewayError } from "./errors.ts";
import { GatewayManager, type GatewayRegistry } from "./manager.ts";
import { OmniRouteGateway } from "./omniroute.ts";

function fixture(capabilities = ["image-generation"]) {
  const registry: GatewayRegistry = {
    listGateways: vi.fn(async () => [{ id: "g", name: "Gateway", baseUrl: "http://gw.test", apiKey: "secret", timeoutMs: 1000, enabled: true, priority: 1, weight: 1, health: "HEALTHY" as const, consecutiveFailures: 0, maxRetries: 9 }]),
    resolveProfile: vi.fn(async () => [{ gatewayId: "g", modelId: "image", modelRef: "ref", capabilities }]),
    recordAttempt: vi.fn(async () => {}), updateGatewayHealth: vi.fn(async () => {}),
  };
  const transport = vi.fn(async () => new Response(JSON.stringify({ data: [{ b64_json: "YQ==" }] })));
  const manager = new GatewayManager(registry, { createGateway: row => new OmniRouteGateway(row, transport) });
  return { manager, registry, transport };
}

describe("image routing boundary", () => {
  it("passes a long image deadline from model capability data without changing the gateway timeout", async () => {
    const { manager, transport } = fixture(["image-generation", "nf:image-timeout-ms=1800000"]);
    const request = vi.spyOn(OmniRouteGateway.prototype, "generateImage");
    try {
      await manager.generateImage({ generationId: "gen", prompt: "Cover" });
      expect(request).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: 1_800_000 }));
      expect(transport).toHaveBeenCalledOnce();
    } finally { request.mockRestore(); }
  });

  it.each(["bad", "0", "3600001"])("refuses malformed configured image deadline %s without dispatch", async value => {
    const { manager, transport } = fixture(["image-generation", `nf:image-timeout-ms=${value}`]);
    await expect(manager.generateImage({ generationId: "gen", prompt: "Cover" })).rejects.toMatchObject({ category: "INVALID_REQUEST" });
    expect(transport).not.toHaveBeenCalled();
  });
  it("selects binary transport from model capability data without provider branches", async () => {
    const { manager, transport } = fixture(["image-generation", "nf:image-output=binary"]);
    transport.mockImplementation(async () => new Response(Uint8Array.from([1, 2, 3]), { headers: { "content-type": "image/webp" } }));
    await manager.generateImage({ generationId: "gen", prompt: "Cover" });
    expect(transport).toHaveBeenCalledWith("http://gw.test/v1/images/generations?response_format=binary", expect.anything());
    expect(transport).toHaveBeenCalledOnce();
  });
  it("routes through the image profile and appends an attributed attempt", async () => {
    const { manager, registry, transport } = fixture();
    await expect(manager.generateImage({ generationId: "gen", prompt: "Cover", preferredModelRef: "ref" })).resolves.toMatchObject({ model: "image", reportedModel: null });
    expect(registry.resolveProfile).toHaveBeenCalledWith("IMAGE_GENERATOR");
    expect(registry.recordAttempt).toHaveBeenCalledWith("gen", expect.objectContaining({ requestedModelId: "image", reportedModelId: null, inputTokens: null, outputTokens: null, status: "SUCCEEDED" }));
    expect(transport).toHaveBeenCalledOnce();
  });

  it.each([[], ["nf:image-output=binary"]])("never repeats an ambiguous image dispatch despite gateway retry settings (%j)", async (...markers) => {
    const { manager, registry, transport } = fixture(["image-generation", ...markers]);
    transport.mockRejectedValue(new GatewayError("TRANSIENT", "image outcome uncertain"));
    await expect(manager.generateImage({ generationId: "gen", prompt: "Cover" })).rejects.toMatchObject({ category: "TRANSIENT" });
    expect(transport).toHaveBeenCalledOnce();
    expect(registry.recordAttempt).toHaveBeenCalledOnce();
  });

  it.each([{ capabilities: ["vision"] }, { capabilities: ["image-generation", "nf:image-output=incompatible"] }])("refuses image-ineligible mappings before dispatch", async ({ capabilities }) => {
    const { manager, transport } = fixture(capabilities);
    await expect(manager.generateImage({ generationId: "gen", prompt: "Cover" })).rejects.toMatchObject({ code: "NO_ROUTE" });
    expect(transport).not.toHaveBeenCalled();
  });

  it("refuses image profiles on chat, streaming and embedding before any transport", async () => {
    const { manager, transport } = fixture();
    await expect(manager.generate({ profile: "IMAGE_GENERATOR", generationId: "gen", messages: [] })).rejects.toMatchObject({ category: "UNSUPPORTED" });
    await expect(manager.generateStream({ profile: "IMAGE_GENERATOR", generationId: "gen", messages: [] }).next()).rejects.toMatchObject({ category: "UNSUPPORTED" });
    await expect(manager.embed({ profile: "IMAGE_GENERATOR", generationId: "gen", input: [] })).rejects.toMatchObject({ category: "UNSUPPORTED" });
    expect(transport).not.toHaveBeenCalled();
  });
});
