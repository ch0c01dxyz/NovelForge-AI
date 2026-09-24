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
  HealthResult,
  StreamChunk,
} from "./types.ts";

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
  choices?: Array<{ delta?: { content?: string | null }; finish_reason?: string | null }>;
}

interface OpenAIModelEntry {
  id?: string;
  name?: string;
  context_length?: number;
  capabilities?: string[];
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
  private withTimeout(callerSignal?: AbortSignal): {
    signal: AbortSignal;
    timedOut: () => boolean;
    cleanup: () => void;
  } {
    const controller = new AbortController();
    let fired = false;
    const timer = setTimeout(() => {
      fired = true;
      controller.abort();
    }, this.timeoutMs);
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
    const t = this.withTimeout(signal);
    try {
      const res = await this.fetchImpl(`${this.base}/v1/models`, {
        headers: this.headers(),
        signal: t.signal,
      });
      if (!res.ok) await this.fail(res, "listModels");
      const body = (await res.json()) as OpenAIModelsResponse;
      return (body.data ?? [])
        .filter((m): m is OpenAIModelEntry & { id: string } =>
          typeof m.id === "string",
        )
        .map((m) => ({
          modelId: m.id,
          displayName: m.name,
          capabilities: m.capabilities ?? ["chat"],
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
      const body = (await res.json()) as OpenAIChatResponse;
      return {
        content: body.choices?.[0]?.message?.content ?? "",
        model: body.model ?? req.model,
        inputTokens: body.usage?.prompt_tokens ?? null,
        outputTokens: body.usage?.completion_tokens ?? null,
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
        body: JSON.stringify(this.chatBody(req, true)),
      });
      if (!res.ok) await this.fail(res, "generateStream");
      if (!res.body) {
        throw new GatewayError("INTERNAL", "generateStream: empty response body");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      /** Parse one complete `data:` line; returns true when the stream ended. */
      const handleLine = (line: string): { done: boolean; delta: string | null } => {
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
        return {
          done: false,
          delta: typeof delta === "string" && delta.length > 0 ? delta : null,
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
            if (tail.delta !== null) {
              received = true;
              yield { delta: tail.delta };
            }
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          let ended = false;
          for (const line of lines) {
            const { done: streamDone, delta } = handleLine(line);
            if (streamDone) {
              ended = true;
              break;
            }
            if (delta !== null) {
              received = true;
              yield { delta };
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
      const body = (await res.json()) as OpenAIEmbedResponse;
      return {
        vectors: (body.data ?? []).map((d) => d.embedding ?? []),
        model: body.model ?? req.model,
        inputTokens: body.usage?.prompt_tokens ?? null,
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
    if (stream) body.stream = true;
    return body;
  }
}
