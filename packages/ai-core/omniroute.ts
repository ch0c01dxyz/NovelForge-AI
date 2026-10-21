/**
 * OmniRoute gateway adapter — OpenAI-compatible transport (ADR-0004).
 *
 * This is the ONLY place in the codebase that speaks to an LLM provider.
 * It is transport only: no retry/fallback policy (that is the router's
 * job), no prompt assembly, no persistence.
 *
 * Security (CLAUDE.md §14): the credential travels as an Authorization
 * Bearer header, never a URL query parameter, and is never logged. Error
 * messages are built from the classified category, never from the raw
 * provider body.
 */
import {
  classifyStatus,
  classifyThrown,
  GatewayError,
  messageFor,
} from "./errors.ts";
import type {
  AIGateway,
  ChatMessage,
  EmbedRequest,
  EmbedResult,
  GatewayModel,
  GenerateRequest,
  GenerateResult,
  GenerateImageRequest,
  GenerateImageResult,
  HealthResult,
  StreamChunk,
  ImageJobReceipt,
} from "./types.ts";
import { MAX_GENERATED_IMAGE_BASE64_LENGTH, MAX_GENERATED_IMAGE_BYTES, MAX_IMAGE_TIMEOUT_MS, reportedTokens } from "./types.ts";

export interface OmniRouteConfig {
  id: string;
  name: string;
  baseUrl: string;
  /** Decrypted credential, held only in memory for the call. */
  apiKey: string;
  timeoutMs: number;
}

/** Minimal fetch surface, injectable so tests never touch the network. */
export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

async function boundedBytes(res: Response, limit: number): Promise<Buffer> {
  const reader = res.body?.getReader();
  if (!reader) throw new GatewayError("INVALID_REQUEST", "invalid or oversized gateway response");
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > limit) throw new GatewayError("INVALID_REQUEST", "invalid or oversized gateway response");
      chunks.push(value);
    }
    return Buffer.concat(chunks, length);
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}

interface OpenAIChatResponse {
  model?: string;
  choices?: Array<{
    message?: { content?: string | null };
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

interface OpenAIStreamChunk {
  model?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  choices?: Array<{ delta?: { content?: string | null }; finish_reason?: string | null }>;
}

interface OpenAIModelEntry {
  id?: string;
  name?: string;
  context_length?: number;
  /**
   * Providers disagree here: some send a tag list (`["chat","vision"]`),
   * some a capability map (`{vision: true, tools: false}`). Typed as
   * `unknown` because the declared shape was a lie that a cast hid —
   * 9Router sends the map, which reached Prisma's `String[]` column
   * verbatim and failed the whole sync transaction. Narrowed in
   * `normalizeCapabilities`.
   */
  capabilities?: unknown;
}

interface OpenAIModelsResponse {
  data?: OpenAIModelEntry[];
}

interface OpenAIEmbedResponse {
  model?: string;
  data?: Array<{ embedding?: number[] }>;
  usage?: { prompt_tokens?: number };
}

/** Trim a trailing slash so `${base}/v1/...` never doubles up. */
function normalizeBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

/**
 * Parse a JSON body from a gateway response.
 *
 * Some OpenAI-compatible upstreams behind 9Router append an SSE sentinel
 * (`data: [DONE]`) to a NON-streaming body — measured against a real
 * deployment, not assumed. A bare `res.json()` throws on the trailing
 * bytes, and the throw was classified INTERNAL, which is not retryable,
 * so one malformed upstream ended the whole fallback chain before the
 * next model was ever tried. The JSON object is still complete and
 * usable; only the tail is noise, so parse the leading value and ignore
 * what follows it.
 */
function parseJsonBody(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (err) {
    // `JSON.parse` reports the offset it stopped at in its message. If
    // that prefix is a complete value, the remainder is trailing junk
    // rather than a truncated body — salvage the value, never guess at
    // a partial one.
    const at = /position (\d+)/.exec(err instanceof Error ? err.message : "")?.[1];
    if (at !== undefined) {
      const prefix = text.slice(0, Number(at)).trimEnd();
      if (prefix.endsWith("}")) {
        try {
          return JSON.parse(prefix);
        } catch {
          // Fall through: a prefix that still will not parse is a
          // genuinely malformed body.
        }
      }
    }
    throw err;
  }
}

/**
 * Reduce a provider's capability metadata to the tag list NovelForge
 * stores (`ai_models.capabilities String[]`).
 *
 * Accepts a tag list as-is, and converts a capability map to the keys
 * whose value is truthy. `thinkingFormat` carries a mode string rather
 * than a flag, so a truthy check would store it as a capability named
 * after itself — it is skipped. A missing or unrecognized shape yields
 * `["chat"]`, the same default the catalog used before this was a map.
 *
 * ponytail: the map form keeps only truthy keys, so `vision: false` is
 * dropped rather than stored as "no vision" — a tag list cannot express
 * absence. Add a JSON column when a consumer needs the negatives.
 */
function normalizeCapabilities(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    const tags = raw.filter((t): t is string => typeof t === "string");
    return tags.length > 0 ? tags : ["chat"];
  }
  if (raw && typeof raw === "object") {
    const tags = Object.entries(raw)
      .filter(([key, value]) => value === true && key !== "thinkingFormat")
      .map(([key]) => key);
    return tags.length > 0 ? tags : ["chat"];
  }
  return ["chat"];
}

export class OmniRouteGateway implements AIGateway {
  readonly id: string;
  readonly name: string;
  private readonly base: string;
  /**
   * True private field (`#`), not TypeScript `private`: a TS modifier is
   * compile-time only, so `JSON.stringify(adapter)` or a structured
   * logger serializing the object would emit the plaintext credential.
   * A `#` field is invisible to own-property enumeration.
   */
  #apiKey: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;

  constructor(config: OmniRouteConfig, fetchImpl: FetchLike = fetch) {
    this.id = config.id;
    this.name = config.name;
    this.base = normalizeBase(config.baseUrl);
    this.#apiKey = config.apiKey;
    this.timeoutMs = config.timeoutMs;
    this.fetchImpl = fetchImpl;
  }

  /**
   * Combine the caller's signal with our own timeout so a slow gateway
   * cannot hang a request indefinitely. Returns the signal plus a flag
   * set when OUR timer fired (distinguishing a timeout from a caller
   * cancellation, which must not be retried).
   */
  private withTimeout(callerSignal?: AbortSignal, timeoutMs = this.timeoutMs): {
    signal: AbortSignal;
    timedOut: () => boolean;
    cleanup: () => void;
  } {
    const controller = new AbortController();
    let fired = false;
    const timer = setTimeout(() => {
      fired = true;
      controller.abort();
    }, timeoutMs);
    const onAbort = () => controller.abort();
    if (callerSignal) {
      if (callerSignal.aborted) controller.abort();
      else callerSignal.addEventListener("abort", onAbort, { once: true });
    }
    return {
      signal: controller.signal,
      timedOut: () => fired,
      cleanup: () => {
        clearTimeout(timer);
        callerSignal?.removeEventListener("abort", onAbort);
      },
    };
  }

  private headers(): Record<string, string> {
    return {
      "content-type": "application/json",
      authorization: `Bearer ${this.#apiKey}`,
    };
  }

  /** Convert a non-OK response into a classified GatewayError. */
  private async fail(res: Response, what: string): Promise<never> {
    const category = classifyStatus(res.status);
    // Drain the body so the connection can be reused, but never surface
    // its contents — provider bodies can echo request material.
    await res.text().catch(() => undefined);
    throw new GatewayError(
      category,
      `${what}: ${messageFor(category, res.status)}`,
      res.status,
    );
  }

  async listModels(signal?: AbortSignal): Promise<GatewayModel[]> {
    return this.listCatalog(false, signal);
  }

  async listImageModels(signal?: AbortSignal): Promise<GatewayModel[]> {
    return this.listCatalog(true, signal);
  }

  private async listCatalog(images: boolean, signal?: AbortSignal): Promise<GatewayModel[]> {
    const t = this.withTimeout(signal);
    try {
      const res = await this.fetchImpl(`${this.base}/v1/models${images ? "/image" : ""}`, {
        headers: this.headers(),
        signal: t.signal,
      });
      if (!res.ok) await this.fail(res, "listModels");
      const body = parseJsonBody(await res.text()) as OpenAIModelsResponse;
      return (body.data ?? [])
        .filter((m): m is OpenAIModelEntry & { id: string } =>
          typeof m.id === "string",
        )
        .map((m) => ({
          modelId: m.id,
          displayName: m.name,
          capabilities: images ? ["image-generation"] : normalizeCapabilities(m.capabilities),
          contextWindow: m.context_length,
        }));
    } catch (err) {
      if (err instanceof GatewayError) throw err;
      const category = classifyThrown(err, t.timedOut());
      throw new GatewayError(category, `listModels: ${messageFor(category)}`);
    } finally {
      t.cleanup();
    }
  }

  private async imageJobRequest<T>(path: string, init: RequestInit, read: (res: Response) => Promise<T>): Promise<T> {
    const t = this.withTimeout(init.signal ?? undefined, Math.min(this.timeoutMs, 30_000));
    try {
      const res = await this.fetchImpl(`${this.base}/v1/images/jobs${path}`, { ...init, headers: { ...this.headers(), ...init.headers }, redirect: "error", signal: t.signal });
      if (!res.ok) { await res.body?.cancel().catch(() => undefined); throw new GatewayError(classifyStatus(res.status), "image job request could not be completed", res.status); }
      return await read(res);
    } catch (error) {
      if (error instanceof GatewayError) throw error;
      throw new GatewayError(classifyThrown(error, t.timedOut()), "image job request could not be completed");
    } finally { t.cleanup(); }
  }

  private async imageJobReceipt(res: Response): Promise<ImageJobReceipt> {
    let value: ImageJobReceipt;
    try { value = JSON.parse((await boundedBytes(res, 16_384)).toString("utf8")) as ImageJobReceipt; }
    catch { throw new GatewayError("INVALID_REQUEST", "invalid image job receipt"); }
    if (!value || !/^[a-f0-9]{64}$/.test(value.id) || typeof value.model !== "string" || !value.model.length || value.model.length > 512 ||
      !["SUBMITTING", "QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "UNKNOWN"].includes(value.state)) throw new GatewayError("INVALID_REQUEST", "invalid image job receipt");
    const progress: NonNullable<ImageJobReceipt["progress"]> = {};
    for (const key of ["queuePosition", "waitSeconds", "processing"] as const) {
      const n = value.progress?.[key]; if (typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 2_147_483_647) progress[key] = n;
    }
    return { id: value.id, model: value.model, state: value.state, ...(Object.keys(progress).length ? { progress } : {}) };
  }

  async submitImageJob(input: { model: string; prompt: string; requestId: string; signal?: AbortSignal }): Promise<ImageJobReceipt> {
    if (!/^[a-f0-9-]{36}$/i.test(input.requestId)) throw new GatewayError("INVALID_REQUEST", "invalid image request identity");
    return this.imageJobRequest("", { method: "POST", signal: input.signal, headers: { "idempotency-key": input.requestId }, body: JSON.stringify({ model: input.model, prompt: input.prompt, n: 1 }) }, res => this.imageJobReceipt(res));
  }
  async findImageJob(requestId: string, signal?: AbortSignal): Promise<ImageJobReceipt> {
    if (!/^[a-f0-9-]{36}$/i.test(requestId)) throw new GatewayError("INVALID_REQUEST", "invalid image request identity");
    return this.imageJobRequest(`/by-request/${requestId}`, { method: "GET", signal }, res => this.imageJobReceipt(res));
  }
  async getImageJob(id: string, signal?: AbortSignal): Promise<ImageJobReceipt> {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new GatewayError("INVALID_REQUEST", "invalid image job identity");
    return this.imageJobRequest(`/${id}`, { method: "GET", signal }, res => this.imageJobReceipt(res));
  }
  async getImageJobResult(id: string, model: string, signal?: AbortSignal): Promise<GenerateImageResult> {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new GatewayError("INVALID_REQUEST", "invalid image job identity");
    return this.imageJobRequest(`/${id}/result`, { method: "GET", signal }, async res => {
      if (!["image/jpeg", "image/png", "image/webp"].includes((res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase())) { await res.body?.cancel().catch(() => undefined); throw new GatewayError("INVALID_REQUEST", "invalid image job result"); }
      const bytes = await boundedBytes(res, MAX_GENERATED_IMAGE_BYTES);
      if (!bytes.length) throw new GatewayError("INVALID_REQUEST", "empty image job result");
      return { dataBase64: bytes.toString("base64"), model, reportedModel: null, inputTokens: null, outputTokens: null };
    });
  }

  async generateImage(req: GenerateImageRequest): Promise<GenerateImageResult> {
    if (req.timeoutMs !== undefined && (!Number.isSafeInteger(req.timeoutMs) || req.timeoutMs < 1000 || req.timeoutMs > MAX_IMAGE_TIMEOUT_MS)) {
      throw new GatewayError("INVALID_REQUEST", "image timeout configuration is invalid");
    }
    const t = this.withTimeout(req.signal, req.timeoutMs);
    try {
      const binary = req.responseFormat === "binary";
      const res = await this.fetchImpl(`${this.base}/v1/images/generations${binary ? "?response_format=binary" : ""}`, {
        method: "POST", headers: this.headers(), signal: t.signal, redirect: "error",
        body: JSON.stringify({ model: req.model, prompt: req.prompt, n: 1, response_format: "b64_json" }),
      });
      if (!res.ok) {
        await res.body?.cancel().catch(() => undefined);
        const category = classifyStatus(res.status);
        throw new GatewayError(category, `generateImage: ${messageFor(category, res.status)}`, res.status);
      }
      // Cap the stream before parsing: Content-Length is optional and untrusted.
      const invalid = () => new GatewayError("INVALID_REQUEST", "generateImage: invalid or oversized image response");
      if (binary && !["image/jpeg", "image/png", "image/webp"].includes((res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase())) { await res.body?.cancel().catch(() => undefined); throw invalid(); }
      const payload = await boundedBytes(res, binary ? MAX_GENERATED_IMAGE_BYTES : MAX_GENERATED_IMAGE_BASE64_LENGTH + 64 * 1024);
      if (binary) {
        if (!payload.length) throw invalid();
        return { dataBase64: payload.toString("base64"), model: req.model, reportedModel: null, inputTokens: null, outputTokens: null };
      }
      let body: { data?: Array<{ b64_json?: unknown }>; model?: unknown; usage?: { input_tokens?: unknown; output_tokens?: unknown; prompt_tokens?: unknown; completion_tokens?: unknown } };
      try { body = JSON.parse(payload.toString("utf8")); }
      catch { throw invalid(); }
      if (!body || !Array.isArray(body.data) || body.data.length !== 1) throw invalid();
      const dataBase64 = body.data[0]?.b64_json;
      if (typeof dataBase64 !== "string" || !dataBase64.length ||
        dataBase64.length > MAX_GENERATED_IMAGE_BASE64_LENGTH || dataBase64.length % 4 !== 0 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(dataBase64)) throw invalid();
      const bytes = Buffer.from(dataBase64, "base64");
      if (bytes.length > MAX_GENERATED_IMAGE_BYTES || bytes.toString("base64") !== dataBase64) throw invalid();
      const reportedModel = typeof body.model === "string" && body.model.trim().length > 0 ? body.model : null;
      return {
        dataBase64, model: reportedModel ?? req.model, reportedModel,
        inputTokens: reportedTokens(body.usage?.input_tokens ?? body.usage?.prompt_tokens),
        outputTokens: reportedTokens(body.usage?.output_tokens ?? body.usage?.completion_tokens),
      };
    } catch (err) {
      if (err instanceof GatewayError) throw err;
      const category = classifyThrown(err, t.timedOut());
      throw new GatewayError(category, `generateImage: ${messageFor(category)}`);
    } finally { t.cleanup(); }
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const t = this.withTimeout(req.signal);
    try {
      const res = await this.fetchImpl(`${this.base}/v1/chat/completions`, {
        method: "POST",
        headers: this.headers(),
        signal: t.signal,
        body: JSON.stringify(this.chatBody(req, false)),
      });
      if (!res.ok) await this.fail(res, "generate");
      const body = parseJsonBody(await res.text()) as OpenAIChatResponse;
      return {
        content: body.choices?.[0]?.message?.content ?? "",
        model: body.model ?? req.model,
        reportedModel: typeof body.model === "string" && body.model.length > 0 ? body.model : null,
        inputTokens: reportedTokens(body.usage?.prompt_tokens),
        outputTokens: reportedTokens(body.usage?.completion_tokens),
        finishReason: body.choices?.[0]?.finish_reason ?? null,
      };
    } catch (err) {
      if (err instanceof GatewayError) throw err;
      const category = classifyThrown(err, t.timedOut());
      throw new GatewayError(category, `generate: ${messageFor(category)}`);
    } finally {
      t.cleanup();
    }
  }

  /**
   * Streaming completion. A failure AFTER the first delta is marked
   * `partial` so callers persist INCOMPLETE rather than SUCCESS
   * (OMNIROUTE-INTEGRATION.md "Streaming"; CLAUDE.md §6).
   */
  async *generateStream(req: GenerateRequest): AsyncGenerator<StreamChunk> {
    const t = this.withTimeout(req.signal);
    let received = false;
    try {
      const res = await this.fetchImpl(`${this.base}/v1/chat/completions`, {
        method: "POST",
        headers: this.headers(),
        signal: t.signal,
        body: JSON.stringify({ ...this.chatBody(req, true), stream_options: { include_usage: true } }),
      });
      if (!res.ok) await this.fail(res, "generateStream");
      if (!res.body) {
        throw new GatewayError("INTERNAL", "generateStream: empty response body");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      /** Parse one complete `data:` line; returns true when the stream ended. */
      const handleLine = (line: string): { done: boolean; delta: string | null; metadata?: Omit<StreamChunk, "delta"> } => {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) return { done: false, delta: null };
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") return { done: true, delta: null };
        let chunk: OpenAIStreamChunk;
        try {
          chunk = JSON.parse(payload) as OpenAIStreamChunk;
        } catch {
          // A malformed frame is not worth aborting a long stream over.
          return { done: false, delta: null };
        }
        const delta = chunk.choices?.[0]?.delta?.content;
        const metadata: Omit<StreamChunk, "delta"> = {
          ...(typeof chunk.model === "string" && chunk.model.length > 0 ? { model: chunk.model } : {}),
          ...(chunk.usage && typeof chunk.usage === "object" ? { usage: {
            inputTokens: reportedTokens(chunk.usage.prompt_tokens),
            outputTokens: reportedTokens(chunk.usage.completion_tokens),
          } } : {}),
        };
        return {
          done: false,
          delta: typeof delta === "string" && delta.length > 0 ? delta : null,
          metadata,
        };
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            // Flush any withheld multibyte character, then process the
            // final line: an SSE stream may end without a trailing
            // newline, and that last frame is real content.
            buffer += decoder.decode();
            const tail = handleLine(buffer);
            if (tail.delta !== null || Object.keys(tail.metadata ?? {}).length > 0) {
              received ||= tail.delta !== null;
              yield { delta: tail.delta ?? "", ...tail.metadata };
            }
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          let ended = false;
          for (const line of lines) {
            const { done: streamDone, delta, metadata } = handleLine(line);
            if (streamDone) {
              ended = true;
              break;
            }
            if (delta !== null || Object.keys(metadata ?? {}).length > 0) {
              received ||= delta !== null;
              yield { delta: delta ?? "", ...metadata };
            }
          }
          if (ended) break;
        }
      } finally {
        // Release the response body on every exit path — a `return` after
        // [DONE], an early consumer abandon, or a throw. Without this the
        // socket stays open until GC.
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
    } catch (err) {
      if (err instanceof GatewayError) {
        throw new GatewayError(
          err.category,
          err.message,
          err.status,
          received,
        );
      }
      const category = classifyThrown(err, t.timedOut());
      throw new GatewayError(
        category,
        `generateStream: ${messageFor(category)}`,
        undefined,
        received,
      );
    } finally {
      t.cleanup();
    }
  }

  async embed(req: EmbedRequest): Promise<EmbedResult> {
    const t = this.withTimeout(req.signal);
    try {
      const res = await this.fetchImpl(`${this.base}/v1/embeddings`, {
        method: "POST",
        headers: this.headers(),
        signal: t.signal,
        body: JSON.stringify({ model: req.model, input: req.input }),
      });
      if (!res.ok) await this.fail(res, "embed");
      const body = parseJsonBody(await res.text()) as OpenAIEmbedResponse;
      return {
        vectors: (body.data ?? []).map((d) => d.embedding ?? []),
        model: body.model ?? req.model,
        reportedModel: typeof body.model === "string" && body.model.length > 0 ? body.model : null,
        inputTokens: reportedTokens(body.usage?.prompt_tokens),
      };
    } catch (err) {
      if (err instanceof GatewayError) throw err;
      const category = classifyThrown(err, t.timedOut());
      throw new GatewayError(category, `embed: ${messageFor(category)}`);
    } finally {
      t.cleanup();
    }
  }

  async healthCheck(signal?: AbortSignal): Promise<HealthResult> {
    const t = this.withTimeout(signal);
    try {
      const res = await this.fetchImpl(`${this.base}/v1/models`, {
        method: "GET",
        headers: this.headers(),
        signal: t.signal,
      });
      await res.text().catch(() => undefined);
      if (res.ok) return { healthy: true, category: null };
      // Distinguish "the gateway answered but rejected us" (bad key) from
      // "the gateway is unreachable" — an operator needs to tell those
      // apart when a probe fails.
      return { healthy: false, category: classifyStatus(res.status) };
    } catch (err) {
      return {
        healthy: false,
        category: classifyThrown(err, t.timedOut()),
      };
    } finally {
      t.cleanup();
    }
  }

  private chatBody(req: GenerateRequest, stream: boolean) {
    const body: Record<string, unknown> = {
      model: req.model,
      messages: req.messages.map((m: ChatMessage) => ({
        role: m.role,
        content: m.content,
      })),
    };
    if (req.temperature !== undefined) body.temperature = req.temperature;
    if (req.maxTokens !== undefined) body.max_tokens = req.maxTokens;
    if (req.outputMode === "json_object") body.response_format = { type: "json_object" };
    if (stream) body.stream = true;
    return body;
  }
}
