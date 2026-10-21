import { describe, expect, it, vi } from "vitest";
import { OmniRouteGateway } from "./omniroute.ts";

const config = { id: "images", name: "Images", baseUrl: "http://gateway.test/", apiKey: "private-key", timeoutMs: 1_000 };
const base64 = Buffer.from("image bytes decoded by the cover normalizer").toString("base64");
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("image transport", () => {
  it("keeps an explicitly long image request alive beyond the generic timeout and stops at its deadline", async () => {
    vi.useFakeTimers();
    try {
      let signal: AbortSignal | undefined;
      const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
        signal = init?.signal ?? undefined;
        return await new Promise<Response>((_resolve, reject) => signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }));
      });
      const result = new OmniRouteGateway(config, fetch).generateImage({ model: "queue-model", prompt: "Cover", timeoutMs: 1_800_000 });
      const failed = expect(result).rejects.toMatchObject({ category: "TRANSIENT" });
      await vi.advanceTimersByTimeAsync(1_799_999);
      expect(signal?.aborted).toBe(false); expect(fetch).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(1); await failed;
      expect(signal?.aborted).toBe(true); expect(fetch).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it.each([0, -1, NaN, Infinity, 3_600_001])("refuses an invalid image deadline %s before dispatch", async timeoutMs => {
    const fetch = vi.fn(async () => response({ data: [{ b64_json: base64 }] }));
    await expect(new OmniRouteGateway(config, fetch).generateImage({ model: "image", prompt: "Cover", timeoutMs })).rejects.toMatchObject({ category: "INVALID_REQUEST" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("requests binary only from the configured gateway and preserves unknown attribution", async () => {
    const bytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response(bytes, { headers: { "content-type": "image/png" } }));
    const result = await new OmniRouteGateway(config, fetch).generateImage({ model: "provider/image", prompt: "Cover", responseFormat: "binary" });
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]?.[0]).toBe("http://gateway.test/v1/images/generations?response_format=binary");
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ redirect: "error" });
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toMatchObject({ n: 1 });
    expect(result).toEqual({ dataBase64: Buffer.from(bytes).toString("base64"), model: "provider/image", reportedModel: null, inputTokens: null, outputTokens: null });
  });

  it.each(["text/html", "application/json", "image/svg+xml"])("refuses binary responses with unsupported content type %s without following links", async contentType => {
    const cancel = vi.fn();
    const fetch = vi.fn(async () => new Response(new ReadableStream({ cancel }), { headers: { "content-type": contentType } }));
    await expect(new OmniRouteGateway(config, fetch).generateImage({ model: "image", prompt: "Cover", responseFormat: "binary" })).rejects.toMatchObject({ category: "INVALID_REQUEST" });
    expect(fetch).toHaveBeenCalledOnce(); expect(cancel).toHaveBeenCalledOnce();
  });

  it("bounds binary bytes independently of the larger base64 envelope", async () => {
    const cancel = vi.fn();
    const fetch = vi.fn(async () => new Response(new ReadableStream<Uint8Array>({ pull(controller) { controller.enqueue(new Uint8Array(12 * 1024 * 1024 + 1)); }, cancel }), { headers: { "content-type": "image/jpeg" } }));
    await expect(new OmniRouteGateway(config, fetch).generateImage({ model: "image", prompt: "Cover", responseFormat: "binary" })).rejects.toMatchObject({ category: "INVALID_REQUEST" });
    expect(fetch).toHaveBeenCalledOnce(); expect(cancel).toHaveBeenCalledOnce();
  });

  it("uses the separate image catalog without advertising chat capability", async () => {
    const fetch = vi.fn(async (_url: string) => response({ data: [{ id: "provider/image", name: "Image" }, { name: "missing ID" }] }));
    const result = await new OmniRouteGateway(config, fetch).listImageModels();
    expect(fetch.mock.calls[0]?.[0]).toBe("http://gateway.test/v1/models/image");
    expect(result).toEqual([{ modelId: "provider/image", displayName: "Image", capabilities: ["image-generation"] }]);
  });

  it("dispatches exactly one image with Bearer auth and preserves unknown attribution", async () => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => response({ data: [{ b64_json: base64 }] }));
    const result = await new OmniRouteGateway(config, fetch).generateImage({ model: "provider/image", prompt: "A book cover" });
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]?.[0]).toBe("http://gateway.test/v1/images/generations");
    const init = fetch.mock.calls[0]?.[1];
    expect(init?.headers).toMatchObject({ authorization: "Bearer private-key" });
    expect(JSON.parse(String(init?.body))).toEqual({ model: "provider/image", prompt: "A book cover", n: 1, response_format: "b64_json" });
    expect(result).toEqual({ dataBase64: base64, model: "provider/image", reportedModel: null, inputTokens: null, outputTokens: null });
  });

  it("retains reported model and validated usage", async () => {
    const gateway = new OmniRouteGateway(config, async () => response({ model: "served-image", usage: { input_tokens: 12, output_tokens: -2 }, data: [{ b64_json: base64 }] }));
    expect(await gateway.generateImage({ model: "requested", prompt: "Cover" })).toMatchObject({ model: "served-image", reportedModel: "served-image", inputTokens: 12, outputTokens: null });
  });

  it.each([
    { data: [{ url: "http://127.0.0.1/private" }] },
    { data: [] },
    { data: [{ b64_json: base64 }, { b64_json: base64 }] },
    { data: [{ b64_json: "invalid base64" }] },
    { data: [{ b64_json: "YR==" }] },
    { data: [{ b64_json: "" }] },
  ])("rejects incomplete, URL-only, noncanonical or multiple images without fetching URLs", async body => {
    const fetch = vi.fn(async () => response(body));
    await expect(new OmniRouteGateway(config, fetch).generateImage({ model: "image", prompt: "Cover" })).rejects.toMatchObject({ category: "INVALID_REQUEST" });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("bounds streamed response bytes and cancels the reader", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ pull(controller) { controller.enqueue(new Uint8Array(17 * 1024 * 1024)); }, cancel });
    const gateway = new OmniRouteGateway(config, async () => new Response(stream));
    await expect(gateway.generateImage({ model: "image", prompt: "Cover" })).rejects.toMatchObject({ category: "INVALID_REQUEST" });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("does not retry or expose provider error bodies", async () => {
    const fetch = vi.fn(async () => response({ error: "private-key secret prompt" }, 429));
    await expect(new OmniRouteGateway(config, fetch).generateImage({ model: "image", prompt: "private prompt" })).rejects.toMatchObject({ category: "RATE_LIMIT", message: "generateImage: gateway rate limit exceeded" });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([undefined, "binary"] as const)("cancels an interrupted image response and never returns partial output (%s)", async responseFormat => {
    const cancel = vi.fn();
    const gateway = new OmniRouteGateway(config, async (_url, init) => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"data":[{"b64_json":"'));
        init?.signal?.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")), { once: true });
      }, cancel,
    }), { headers: { "content-type": "image/png" } }));
    const controller = new AbortController();
    const result = gateway.generateImage({ model: "image", prompt: "Cover", responseFormat, signal: controller.signal });
    controller.abort();
    await expect(result).rejects.toMatchObject({ category: "DETERMINISTIC" });
    // Errored streams are already closed; cancel does not re-open them.
    expect(cancel).not.toHaveBeenCalled();
  });
});
