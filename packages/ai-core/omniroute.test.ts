/**
 * OmniRoute transport tests.
 *
 * The gateway adapter is the only place that speaks HTTP to a provider,
 * and the SSE parser is the highest-risk code in it (buffer drain,
 * final frame, multibyte splits, reader release). Every test injects a
 * fake `fetch` — no test ever reaches a real provider (CLAUDE.md §25).
 */
import { describe, expect, it, vi } from "vitest";
import { OmniRouteGateway, type FetchLike } from "./omniroute.ts";
import { GatewayError } from "./errors.ts";
import type { GenerateRequest, StreamChunk } from "./types.ts";

const CONFIG = {
  id: "g1",
  name: "test",
  baseUrl: "http://gw.test",
  apiKey: "sk-secret-abc",
  timeoutMs: 5_000,
};

/** Build a fetch that records calls and returns one scripted response. */
function fakeFetch(
  responder: (url: string, init?: RequestInit) => Response | Promise<Response>,
): { fetch: FetchLike; calls: Array<{ url: string; init?: RequestInit }> } {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, ...(init ? { init } : {}) });
    return responder(url, init);
  };
  return { fetch: fetchImpl, calls };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** A response whose body is an SSE byte stream, chunked as given. */
function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

function sseChunk(content: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
}

async function collect(gen: AsyncGenerator<StreamChunk>): Promise<string> {
  let out = "";
  for await (const c of gen) out += c.delta;
  return out;
}

const REQ: GenerateRequest = {
  model: "m1",
  messages: [{ role: "user", content: "hi" }],
};

describe("OmniRouteGateway request shape", () => {
  it("sends a Bearer Authorization header and never a URL credential", async () => {
    const { fetch, calls } = fakeFetch(() =>
      jsonResponse({
        model: "m1",
        choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 3, completion_tokens: 4 },
      }),
    );
    const gw = new OmniRouteGateway(CONFIG, fetch);
    const result = await gw.generate(REQ);

    expect(result.content).toBe("ok");
    expect(result.inputTokens).toBe(3);
    expect(result.outputTokens).toBe(4);
    const { url, init } = calls[0]!;
    const headers = init?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer sk-secret-abc");
    // The credential must not appear in the URL (query or path).
    expect(url).not.toContain("sk-secret");
    expect(url).toBe("http://gw.test/v1/chat/completions");
  });

  it("strips a trailing slash from the base URL", async () => {
    const { fetch, calls } = fakeFetch(() => jsonResponse({ choices: [] }));
    const gw = new OmniRouteGateway({ ...CONFIG, baseUrl: "http://gw.test/" }, fetch);
    await gw.generate(REQ);
    expect(calls[0]!.url).toBe("http://gw.test/v1/chat/completions");
  });

  it("never leaks the credential in a failure message", async () => {
    const { fetch } = fakeFetch(
      () => new Response("upstream said: key sk-secret-abc is bad", { status: 401 }),
    );
    const gw = new OmniRouteGateway(CONFIG, fetch);
    await expect(gw.generate(REQ)).rejects.toMatchObject({ category: "AUTH" });
    try {
      await gw.generate(REQ);
    } catch (e) {
      const err = e as GatewayError;
      expect(err.message).not.toContain("sk-secret");
      expect(err.message).not.toContain("upstream said");
    }
  });

  it("classifies a 5xx as TRANSIENT and a 400 as INVALID_REQUEST", async () => {
    for (const [status, category] of [
      [503, "TRANSIENT"],
      [400, "INVALID_REQUEST"],
      [429, "RATE_LIMIT"],
      [404, "UNSUPPORTED"],
    ] as const) {
      const { fetch } = fakeFetch(() => new Response("nope", { status }));
      const gw = new OmniRouteGateway(CONFIG, fetch);
      await expect(gw.generate(REQ)).rejects.toMatchObject({ category });
    }
  });
});

describe("OmniRouteGateway SSE parsing", () => {
  it("yields deltas in order", async () => {
    const { fetch } = fakeFetch(() =>
      sseResponse([sseChunk("Hel"), sseChunk("lo "), sseChunk("world")]),
    );
    const gw = new OmniRouteGateway(CONFIG, fetch);
    expect(await collect(gw.generateStream(REQ))).toBe("Hello world");
  });

  it("keeps a final frame that has no trailing newline", async () => {
    // The regression: the loop used to break on `done` without parsing
    // the leftover buffer, silently dropping the last token.
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(encoder.encode(sseChunk("first ")));
        // Final frame, deliberately without the trailing blank line.
        c.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ choices: [{ delta: { content: "last" } }] })}`,
          ),
        );
        c.close();
      },
    });
    const { fetch } = fakeFetch(() => new Response(body, { status: 200 }));
    const gw = new OmniRouteGateway(CONFIG, fetch);
    expect(await collect(gw.generateStream(REQ))).toBe("first last");
  });

  it("survives a multibyte character split across chunks", async () => {
    // A 3-byte emoji split mid-sequence must be reassembled, not dropped.
    const full = new TextEncoder().encode(sseChunk("héllo 🌍"));
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(full.slice(0, 20));
        c.enqueue(full.slice(20, 24));
        c.enqueue(full.slice(24));
        c.close();
      },
    });
    const { fetch } = fakeFetch(() => new Response(body, { status: 200 }));
    const gw = new OmniRouteGateway(CONFIG, fetch);
    expect(await collect(gw.generateStream(REQ))).toBe("héllo 🌍");
  });

  it("stops at [DONE] and ignores trailing noise", async () => {
    const { fetch } = fakeFetch(() =>
      sseResponse([sseChunk("a"), "data: [DONE]\n\n", sseChunk("never")]),
    );
    const gw = new OmniRouteGateway(CONFIG, fetch);
    expect(await collect(gw.generateStream(REQ))).toBe("a");
  });

  it("skips a malformed frame without aborting the stream", async () => {
    const { fetch } = fakeFetch(() =>
      sseResponse([sseChunk("a"), "data: {not json\n\n", sseChunk("b")]),
    );
    const gw = new OmniRouteGateway(CONFIG, fetch);
    expect(await collect(gw.generateStream(REQ))).toBe("ab");
  });

  it("releases the response reader when the consumer abandons early", async () => {
    const cancel = vi.fn();
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(encoder.encode(sseChunk("one")));
        c.enqueue(encoder.encode(sseChunk("two")));
        // Never closes — the consumer will break out.
      },
      cancel,
    });
    const { fetch } = fakeFetch(() => new Response(body, { status: 200 }));
    const gw = new OmniRouteGateway(CONFIG, fetch);

    const seen: string[] = [];
    for await (const c of gw.generateStream(REQ)) {
      seen.push(c.delta);
      break; // abandon after the first chunk
    }
    expect(seen).toEqual(["one"]);
    // The body was cancelled, so the socket is not held until GC.
    expect(cancel).toHaveBeenCalled();
  });

  it("marks a mid-stream failure as partial", async () => {
    const encoder = new TextEncoder();
    // Pull-based so the failure happens AFTER the first chunk is
    // delivered: controller.error() would discard a queued chunk.
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        if (pulls++ === 0) c.enqueue(encoder.encode(sseChunk("partial ")));
        else c.error(new Error("socket reset"));
      },
    });
    const { fetch } = fakeFetch(() => new Response(body, { status: 200 }));
    const gw = new OmniRouteGateway(CONFIG, fetch);

    let emitted = "";
    await expect(
      (async () => {
        for await (const c of gw.generateStream(REQ)) emitted += c.delta;
      })(),
    ).rejects.toMatchObject({ partial: true });
    expect(emitted).toBe("partial ");
  });

  it("does not mark a pre-content failure as partial", async () => {
    const { fetch } = fakeFetch(() => new Response("nope", { status: 500 }));
    const gw = new OmniRouteGateway(CONFIG, fetch);
    await expect(gw.generateStream(REQ).next()).rejects.toMatchObject({
      partial: false,
    });
  });

  it("fails when the response has no body", async () => {
    const { fetch } = fakeFetch(() => new Response(null, { status: 200 }));
    const gw = new OmniRouteGateway(CONFIG, fetch);
    await expect(gw.generateStream(REQ).next()).rejects.toBeInstanceOf(GatewayError);
  });
});

describe("OmniRouteGateway timeout and health", () => {
  it("aborts a hung request as TRANSIENT", async () => {
    const { fetch } = fakeFetch(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          // Honour the abort signal the adapter passes in.
          init?.signal?.addEventListener("abort", () =>
            reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
          );
        }),
    );
    const gw = new OmniRouteGateway({ ...CONFIG, timeoutMs: 20 }, fetch);
    await expect(gw.generate(REQ)).rejects.toMatchObject({ category: "TRANSIENT" });
  });

  it("does not retry a caller cancellation", async () => {
    const controller = new AbortController();
    const { fetch } = fakeFetch(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
          );
        }),
    );
    const gw = new OmniRouteGateway({ ...CONFIG, timeoutMs: 5_000 }, fetch);
    const p = gw.generate({ ...REQ, signal: controller.signal });
    controller.abort();
    await expect(p).rejects.toMatchObject({ category: "DETERMINISTIC" });
  });

  it("reports health with a classified reason", async () => {
    const ok = new OmniRouteGateway(
      CONFIG,
      fakeFetch(() => jsonResponse({ data: [] })).fetch,
    );
    expect(await ok.healthCheck()).toEqual({ healthy: true, category: null });

    const denied = new OmniRouteGateway(
      CONFIG,
      fakeFetch(() => new Response("no", { status: 401 })).fetch,
    );
    // A rejected probe is distinguishable from an unreachable gateway.
    expect(await denied.healthCheck()).toEqual({
      healthy: false,
      category: "AUTH",
    });

    const unreachable = new OmniRouteGateway(
      CONFIG,
      fakeFetch(() => {
        throw Object.assign(new Error("refused"), { code: "ECONNREFUSED" });
      }).fetch,
    );
    expect(await unreachable.healthCheck()).toEqual({
      healthy: false,
      category: "TRANSIENT",
    });
  });

  it("discovers models and normalizes the catalog", async () => {
    const { fetch } = fakeFetch(() =>
      jsonResponse({
        data: [
          { id: "m-a", name: "Model A", capabilities: ["chat"], context_length: 8000 },
          { id: "m-b" },
          { notAnId: true },
        ],
      }),
    );
    const gw = new OmniRouteGateway(CONFIG, fetch);
    const models = await gw.listModels();
    expect(models).toHaveLength(2);
    expect(models[0]).toEqual({
      modelId: "m-a",
      displayName: "Model A",
      capabilities: ["chat"],
      contextWindow: 8000,
    });
    // Missing capability metadata defaults rather than throwing.
    expect(models[1]!.capabilities).toEqual(["chat"]);
  });

  it("recovers a completion body with a trailing SSE sentinel", async () => {
    // Measured against a real deployment: some upstreams behind 9Router
    // append `data: [DONE]` to a NON-streaming body. A bare res.json()
    // threw, the throw classified INTERNAL, INTERNAL is not retryable,
    // and the fallback chain stopped before its next model was tried.
    const payload = {
      choices: [{ message: { role: "assistant", content: "OK" }, finish_reason: "stop" }],
      model: "m-a",
    };
    const { fetch } = fakeFetch(
      () =>
        new Response(`${JSON.stringify(payload)}data: [DONE]\n\n`, {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const gw = new OmniRouteGateway(CONFIG, fetch);
    const result = await gw.generate({ model: "m-a", messages: [{ role: "user", content: "hi" }] });
    expect(result.content).toBe("OK");
  });

  it("still rejects a genuinely malformed body", async () => {
    // Salvage must not become "accept anything": a body that is not a
    // complete JSON value has to keep failing.
    const { fetch } = fakeFetch(
      () =>
        new Response('{"choices":[{"message":{"content":"trunc', {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const gw = new OmniRouteGateway(CONFIG, fetch);
    await expect(
      gw.generate({ model: "m-a", messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toBeInstanceOf(GatewayError);
  });

  it("normalizes a capability map to tags, dropping flags and thinkingFormat", async () => {    // 9Router sends `capabilities` as an object, not a tag list. Forwarding
    // it verbatim reached Prisma's `String[]` column and failed the whole
    // sync transaction with `Argument \`set\` is missing`. The tag-list
    // case above passed throughout, which is why this shipped broken.
    const { fetch } = fakeFetch(() =>
      jsonResponse({
        data: [
          {
            id: "map-model",
            capabilities: {
              vision: true,
              tools: false,
              reasoning: true,
              thinkingFormat: "deepseek",
              contextWindow: 1000000,
            },
          },
          { id: "empty-map", capabilities: {} },
          { id: "scalar", capabilities: "chat" },
        ],
      }),
    );
    const gw = new OmniRouteGateway(CONFIG, fetch);
    const models = await gw.listModels();
    // Truthy flags only: `tools: false` is dropped, and the two non-flag
    // keys never become capabilities named after themselves.
    expect(models[0]!.capabilities).toEqual(["vision", "reasoning"]);
    // An unrecognized shape falls back rather than storing an empty array.
    expect(models[1]!.capabilities).toEqual(["chat"]);
    expect(models[2]!.capabilities).toEqual(["chat"]);
  });

  it("never exposes the credential as an enumerable property", async () => {
    const gw = new OmniRouteGateway(CONFIG, fakeFetch(() => jsonResponse({})).fetch);
    // A #private field is invisible to JSON.stringify and structured
    // logging, so a logger dumping the adapter cannot leak the key.
    expect(JSON.stringify(gw)).not.toContain("sk-secret");
    expect(Object.keys(gw)).not.toContain("apiKey");
    expect(Object.values(gw)).not.toContain("sk-secret-abc");
  });
});
