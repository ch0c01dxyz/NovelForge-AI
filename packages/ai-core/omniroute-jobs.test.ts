import { describe, expect, it, vi } from "vitest";
import { OmniRouteGateway } from "./omniroute.ts";
const config = { id: "g", name: "Gateway", baseUrl: "http://gateway.test", apiKey: "private", timeoutMs: 60_000 };
const id = "a".repeat(64), requestId = "4ace4b84-e91d-49ce-aefb-86698a6caf12";
const receipt = { id, model: "aihorde/model", state: "QUEUED" };

describe("durable gateway image jobs", () => {
  it("submits with a stable request identity and recovers only through owned GET endpoints", async () => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(receipt), { status: 202 }));
    const gateway = new OmniRouteGateway(config, fetch);
    expect(await gateway.submitImageJob({ model: receipt.model, prompt: "Cover", requestId })).toEqual(receipt);
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ method: "POST", redirect: "error", headers: expect.objectContaining({ authorization: "Bearer private", "idempotency-key": requestId }) });
    await gateway.findImageJob(requestId); await gateway.getImageJob(id);
    expect(fetch.mock.calls.map(call => call[0])).toEqual(["http://gateway.test/v1/images/jobs", `http://gateway.test/v1/images/jobs/by-request/${requestId}`, `http://gateway.test/v1/images/jobs/${id}`]);
    expect(fetch.mock.calls.slice(1).every(call => call[1]?.method === "GET")).toBe(true);
  });
  it.each([{ ...receipt, id: "../private" }, { ...receipt, state: "invented" }, { ...receipt, model: null }])("refuses malformed receipts without following URLs", async body => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(body)));
    await expect(new OmniRouteGateway(config, fetch).getImageJob(id)).rejects.toMatchObject({ category: "INVALID_REQUEST" });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("bounds receipt bodies before parsing", async () => {
    const cancel = vi.fn();
    const fetch = vi.fn(async () => new Response(new ReadableStream({ pull(c) { c.enqueue(new Uint8Array(20_000)); }, cancel })));
    await expect(new OmniRouteGateway(config, fetch).getImageJob(id)).rejects.toMatchObject({ category: "INVALID_REQUEST" }); expect(cancel).toHaveBeenCalledOnce();
  });
  it("retrieves result bytes through the configured gateway only", async () => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response(Uint8Array.from([1, 2, 3]), { headers: { "content-type": "image/png" } }));
    expect(await new OmniRouteGateway(config, fetch).getImageJobResult(id, receipt.model)).toMatchObject({ dataBase64: "AQID", reportedModel: null });
    expect(fetch.mock.calls[0]?.[0]).toBe(`http://gateway.test/v1/images/jobs/${id}/result`);
    expect(fetch).toHaveBeenCalledOnce();
  });
});
