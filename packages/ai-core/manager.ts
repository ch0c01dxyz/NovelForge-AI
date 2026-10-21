/**
 * Gateway manager — resolves a capability profile to concrete attempts,
 * runs bounded retry/fallback, and records every attempt.
 *
 * Depends on injected ports, not on Prisma: `ai-core` may import only
 * contracts/shared (ADR-0001 §3), so persistence is a port the API
 * composition root implements. That also keeps the whole retry policy
 * unit-testable with fakes.
 */
import {
  GatewayError,
  isGatewayFault,
  isRetryable,
  type ErrorCategory,
} from "./errors.ts";
import { OmniRouteGateway, type FetchLike } from "./omniroute.ts";
import { reportedTokens, JSON_MODE_INCOMPATIBLE } from "./types.ts";
import {
  backoffDelayMs,
  DEFAULT_GATEWAY_RETRIES,
  planAttempts,
  shouldTryNext,
  type Candidate,
  type RoutingStrategy,
} from "./router.ts";
import type {
  AIGateway,
  ChatMessage,
  EmbedResult,
  GatewayModel,
  GenerateResult,
  ModelProfile,
  StreamChunk,
} from "./types.ts";

/** A gateway row plus its decrypted credential, ready to build an adapter. */
export interface GatewayRecord {
  id: string;
  name: string;
  baseUrl: string;
  /** Decrypted in memory only; never persisted or logged. */
  apiKey: string;
  timeoutMs: number;
  enabled: boolean;
  priority: number;
  weight: number;
  health: "UNKNOWN" | "HEALTHY" | "DEGRADED" | "DOWN";
  consecutiveFailures: number;
  /** Last observed round-trip latency; null until measured. */
  latencyMs?: number | null;
  /**
   * Extra transport attempts allowed against THIS gateway after its first
   * failure. Bounded by the request's overall attempt cap.
   */
  maxRetries?: number;
}

export interface AttemptRecord {
  attemptNumber: number;
  gatewayId: string | null;
  modelId: string | null;
  requestedModelId?: string | null;
  reportedModelId?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  status: "SUCCEEDED" | "FAILED" | "TIMEOUT" | "RATE_LIMITED";
  errorCategory: ErrorCategory | "NONE";
  errorMessage: string | null;
  latencyMs: number | null;
}

/**
 * Persistence port. Implemented by the API composition root against
 * Prisma; faked in tests.
 */
export interface GatewayRegistry {
  /**
   * Every configured gateway with its credential decrypted. Disabled
   * gateways are included so admin views and health probes can see them;
   * routing filters on `enabled` itself (`planAttempts`).
   */
  listGateways(): Promise<GatewayRecord[]>;
  /**
   * Concrete models mapped to a profile, best-first, each tied to an
   * enabled gateway. Empty when the profile has no mapping.
   * `capabilities` carries the mapped model's catalog capabilities when
   * a local AIModel row exists; undefined = UNKNOWN (no row or older
   * fake), never a verified value.
   */
  resolveProfile(
    profile: ModelProfile,
  ): Promise<Array<{ gatewayId: string; modelId: string; modelRef?: string; capabilities?: string[] }>>;
  /** Persist an attempt row (append-only). */
  recordAttempt(generationId: string, attempt: AttemptRecord): Promise<void>;
  /** Update breaker/health counters after an attempt. */
  updateGatewayHealth(
    gatewayId: string,
    outcome: {
      ok: boolean;
      category: ErrorCategory | null;
      latencyMs: number;
      /**
       * True for a scheduled liveness probe. A probe failure is not a
       * request failure, so it updates health/latency without counting
       * against the circuit breaker.
       */
      probe?: boolean;
    },
  ): Promise<void>;
}

export interface GenerateOptions {
  profile: ModelProfile;
  preferredModelRef?: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Optional structured-output mode, mapped by the adapter (types.ts). */
  outputMode?: "json_object";
  /** Logical generation id to attach attempts to. */
  generationId: string;
  signal?: AbortSignal;
  /** Override strategy; defaults to PRIORITY. */
  strategy?: RoutingStrategy;
  /** Cap on transport attempts (bounded, CLAUDE.md §27). */
  maxAttempts?: number;
  /** Injected for tests: sleep between retries. */
  sleep?: (ms: number) => Promise<void>;
  /** Injected for tests: deterministic jitter. */
  random?: () => number;
  /** Shared round-robin cursor source. */
  roundRobinCursor?: () => number;
}

/** How many transport attempts a single logical request may make. */
export const DEFAULT_MAX_ATTEMPTS = 7;

/** Options shared by every operation that routes through a profile. */
export interface RouteAttemptOptions {
  profile: ModelProfile;
  preferredModelRef?: string;
  /** Logical generation id to attach attempts to. */
  generationId: string;
  /**
   * Optional structured-output request context. Only `generate`/
   * `generateStream` set it (`embed` never does); when present, routing
   * excludes candidates whose recorded capability data marks them
   * incompatible with the mode (manager.requestEligible).
   */
  outputMode?: "json_object";
  signal?: AbortSignal;
  /** Override strategy; defaults to PRIORITY. */
  strategy?: RoutingStrategy;
  /** Cap on transport attempts (bounded, CLAUDE.md §27). */
  maxAttempts?: number;
  /** Injected for tests: sleep between retries. */
  sleep?: (ms: number) => Promise<void>;
  /** Injected for tests: deterministic jitter. */
  random?: () => number;
  /** Shared round-robin cursor source. */
  roundRobinCursor?: () => number;
}

export interface EmbedOptions extends RouteAttemptOptions {
  input: string[];
}

/**
 * No model is mapped to the requested capability profile. This is a
 * configuration gap the operator must fix (map a model to the profile),
 * not a transient failure — callers surface it as 409, never as a 500
 * retry loop.
 */
export class NoRouteError extends Error {
  readonly code = "NO_ROUTE" as const;
  constructor(
    readonly profile: ModelProfile,
    /** Distinguishes an eligibility exhaustion from an empty mapping. */
    detail?: string,
  ) {
    super(
      detail ??
        `no gateway model is configured for profile ${profile}`,
    );
    this.name = "NoRouteError";
  }
}

export class GatewayManager {
  /**
   * Round-robin position, advanced by the manager itself so ROUND_ROBIN
   * actually rotates across requests. Callers may still inject their own
   * cursor source (e.g. a shared counter) via GenerateOptions.
   */
  private roundRobinCursor = 0;

  constructor(
    private readonly registry: GatewayRegistry,
    private readonly deps: {
      /** Build an adapter per gateway; injectable for tests. */
      createGateway?: (
        rec: GatewayRecord,
        fetchImpl?: FetchLike,
      ) => AIGateway;
      fetchImpl?: FetchLike;
      /**
       * Deployment routing policy. Applied when a request does not name
       * one, so configuring WEIGHTED/LEAST_LATENCY has an effect.
       */
      defaultStrategy?: RoutingStrategy;
    } = {},
  ) {}

  /** Next round-robin position, advancing the manager's own counter. */
  private nextCursor(): number {
    const cursor = this.roundRobinCursor;
    this.roundRobinCursor = (this.roundRobinCursor + 1) % 1_000_000;
    return cursor;
  }

  private build(rec: GatewayRecord): AIGateway {
    if (this.deps.createGateway) return this.deps.createGateway(rec);
    return new OmniRouteGateway(
      {
        id: rec.id,
        name: rec.name,
        baseUrl: rec.baseUrl,
        apiKey: rec.apiKey,
        timeoutMs: rec.timeoutMs,
      },
      this.deps.fetchImpl,
    );
  }

  /**
   * Request-aware candidate eligibility (NF053 JSON follow-up). A
   * structured-output request must not silently route through a
   * candidate whose recorded capability data marks it incompatible with
   * the mode; ordinary requests are unchanged. Absence of capability
   * data is UNKNOWN, not verified — such candidates stay eligible and
   * strict output validation remains the authority. This only filters;
   * it never reorders the authored mapping priority.
   */
  private requestEligible(
    candidates: Candidate[],
    outputMode: RouteAttemptOptions["outputMode"],
  ): Candidate[] {
    if (outputMode !== "json_object") return candidates;
    return candidates.filter(
      (c) => !c.capabilities?.includes(JSON_MODE_INCOMPATIBLE),
    );
  }

  /**
   * Build the attempt plan for one logical request, failing explicitly
   * before any adapter call when no compatible route exists (never
   * falling back to a candidate the request excluded).
   */
  private planFor(opts: RouteAttemptOptions, candidates: Candidate[]): Candidate[] {
    const eligible = this.requestEligible(candidates, opts.outputMode);
    this.assertPreference(opts, eligible);
    const plan = planAttempts(eligible, opts.strategy ?? this.deps.defaultStrategy ?? "PRIORITY", {
      random: opts.random,
      roundRobinCursor: (opts.roundRobinCursor ?? (() => this.nextCursor()))(),
      maxAttempts: opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      preferredModelRef: opts.preferredModelRef,
    });
    if (plan.length === 0) {
      if (opts.outputMode === "json_object" && candidates.length > 0) {
        // The profile has mapped models, but every one of them is
        // excluded for this request: a configuration/compatibility gap,
        // not a transient failure — surface it as the same operator
        // action a missing mapping needs (NoRouteError → 409).
        throw new NoRouteError(
          opts.profile,
          "no candidate model mapped to this profile is eligible for the requested JSON output mode",
        );
      }
      throw new NoRouteError(opts.profile);
    }
    return plan;
  }

  private assertPreference(opts: Pick<RouteAttemptOptions, "profile" | "preferredModelRef">, eligible: Candidate[]): void {
    if (opts.preferredModelRef !== undefined && !eligible.some(c => c.enabled && c.modelRef === opts.preferredModelRef)) {
      throw new NoRouteError(opts.profile, "selected model is not enabled or compatible with this profile and request");
    }
  }

  /** Refuse a stale explicit selection before a caller commits SSE headers. */
  async validatePreference(opts: Pick<RouteAttemptOptions, "profile" | "preferredModelRef" | "outputMode">): Promise<void> {
    if (opts.preferredModelRef === undefined) return;
    const { candidates } = await this.candidates(opts.profile);
    this.assertPreference(opts, this.requestEligible(candidates, opts.outputMode));
  }

  /**
   * Assemble the ordered candidate list: profile mapping joined with live
   * gateway state (enabled, priority, weight, breaker counters).
   *
   * Returns the gateway records alongside the candidates so a caller does
   * not re-read (and re-decrypt every credential) immediately after.
   */
  async candidates(profile: ModelProfile): Promise<{
    candidates: Candidate[];
    gateways: Map<string, GatewayRecord>;
  }> {
    const [gateways, mapping] = await Promise.all([
      this.registry.listGateways(),
      this.registry.resolveProfile(profile),
    ]);
    const byId = new Map(gateways.map((g) => [g.id, g]));
    const out: Candidate[] = [];
    for (const m of mapping) {
      const g = byId.get(m.gatewayId);
      if (!g) continue; // gateway deleted or disabled since mapping
      out.push({
        gatewayId: g.id,
        gatewayName: g.name,
        modelId: m.modelId,
        modelRef: m.modelRef,
        priority: g.priority,
        weight: g.weight,
        latencyMs: g.latencyMs ?? null,
        consecutiveFailures: g.consecutiveFailures,
        enabled: g.enabled,
        maxRetries: g.maxRetries ?? DEFAULT_GATEWAY_RETRIES,
        capabilities: m.capabilities,
      });
    }
    return { candidates: out, gateways: byId };
  }

  /**
   * Run a non-streaming generation with bounded retry/fallback.
   *
   * Every attempt is recorded. On total failure the last classified error
   * is thrown — callers persist the generation as FAILED with that
   * category, never the raw provider message.
   */
  async generate(opts: GenerateOptions): Promise<GenerateResult> {
    return this.routeAttempts(opts, "generate", (adapter, target) =>
      adapter.generate({
        model: target.modelId,
        messages: opts.messages,
        temperature: opts.temperature,
        maxTokens: opts.maxTokens,
        outputMode: opts.outputMode,
        signal: opts.signal,
      }),
    );
  }

  private async retryGateway(opts: RouteAttemptOptions, target: Candidate): Promise<GatewayRecord | undefined> {
    const live = await this.candidates(opts.profile);
    const eligible = this.requestEligible(live.candidates, opts.outputMode).some(c =>
      c.enabled && c.gatewayId === target.gatewayId && c.modelId === target.modelId && c.modelRef === target.modelRef);
    return eligible ? live.gateways.get(target.gatewayId) : undefined;
  }

  /**
   * Embed a batch of texts, routed by the EMBEDDING profile.
   *
   * Shares `routeAttempts` with `generate`, so it inherits the same bounded
   * retry, jittered backoff, non-retryable classification and circuit
   * breaker. That sharing is the point: a second hand-written loop would be
   * a second place for the retry policy to drift (CLAUDE.md §27).
   *
   * `input` is a batch because one HTTP call for N chunks is far cheaper
   * than N calls; the caller decides the batch size.
   */
  async embed(opts: EmbedOptions): Promise<EmbedResult> {
    if (opts.input.length === 0) {
      // Not a gateway failure, and retrying it would only loop: an empty
      // batch is a caller bug. Return immediately rather than opening a
      // transport attempt and recording a failure against a healthy gateway.
      return { vectors: [], model: "", inputTokens: 0 };
    }
    return this.routeAttempts(opts, "embed", (adapter, target) =>
      adapter.embed({ model: target.modelId, input: opts.input, signal: opts.signal }),
    );
  }

  /**
   * The routing, retry, attempt-recording and breaker loop.
   *
   * `op` is used only in the synthesised error message, so a failure is
   * attributable to the operation that caused it.
   */
  private async routeAttempts<T extends { model: string; reportedModel?: string | null; inputTokens?: number | null; outputTokens?: number | null }>(
    opts: RouteAttemptOptions,
    op: string,
    call: (adapter: AIGateway, target: Candidate) => Promise<T>,
  ): Promise<T> {
    const { candidates, gateways } = await this.candidates(opts.profile);
    const plan = this.planFor(opts, candidates);

    const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));

    let last: GatewayError | null = null;
    let attemptNumber = 0;
    for (let i = 0; i < plan.length; i++) {
      const target = plan[i]!;
      const rec = i === 0 ? gateways.get(target.gatewayId) : await this.retryGateway(opts, target);
      if (!rec) continue;
      attemptNumber++;
      const adapter = this.build(rec);
      const started = Date.now();
      try {
        const result = await call(adapter, target);
        const latencyMs = Date.now() - started;
        await this.registry.recordAttempt(opts.generationId, {
          attemptNumber,
          gatewayId: target.gatewayId,
          modelId: result.model || target.modelId,
          requestedModelId: target.modelId,
          reportedModelId: result.reportedModel ?? null,
          inputTokens: reportedTokens(result.inputTokens),
          outputTokens: op === "embed" ? null : reportedTokens(result.outputTokens),
          status: "SUCCEEDED",
          errorCategory: "NONE",
          errorMessage: null,
          latencyMs,
        });
        await this.registry.updateGatewayHealth(target.gatewayId, {
          ok: true,
          category: null,
          latencyMs,
        });
        return result;
      } catch (err) {
        const gerr =
          err instanceof GatewayError
            ? err
            : new GatewayError("INTERNAL", `${op}: gateway error`);
        last = gerr;
        const latencyMs = Date.now() - started;
        await this.registry.recordAttempt(opts.generationId, {
          attemptNumber,
          gatewayId: target.gatewayId,
          modelId: target.modelId,
          requestedModelId: target.modelId,
          reportedModelId: null,
          inputTokens: null,
          outputTokens: null,
          status: attemptStatus(gerr.category, gerr.partial),
          errorCategory: gerr.category,
          errorMessage: gerr.message,
          latencyMs,
        });
        // Only failures attributable to the gateway instance may count
        // against its breaker; a malformed request or a cancellation
        // would fail identically everywhere.
        if (isGatewayFault(gerr.category)) {
          await this.registry.updateGatewayHealth(target.gatewayId, {
            ok: false,
            category: gerr.category,
            latencyMs,
          });
        }
        if (!shouldTryNext(gerr.category, i + 1, plan.length)) break;
        // Back off before the next transport attempt.
        const delay = backoffDelayMs(i + 1, 250, 8_000, opts.random);
        if (delay > 0) await sleep(delay);
      }
    }
    throw last ?? new NoRouteError(opts.profile);
  }

  /**
   * Streamed generation. Retries only while NOTHING has been emitted — a
   * stream that already produced text is marked partial and rethrown so
   * the caller records INCOMPLETE instead of duplicating output
   * (OMNIROUTE-INTEGRATION.md "Streaming").
   */
  async *generateStream(
    opts: GenerateOptions,
  ): AsyncGenerator<StreamChunk, void, unknown> {
    const { candidates, gateways } = await this.candidates(opts.profile);
    const plan = this.planFor(opts, candidates);

    const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));

    let last: GatewayError | null = null;
    let attemptNumber = 0;
    for (let i = 0; i < plan.length; i++) {
      const target = plan[i]!;
      const rec = i === 0 ? gateways.get(target.gatewayId) : await this.retryGateway(opts, target);
      if (!rec) continue;
      attemptNumber++;
      const adapter = this.build(rec);
      const started = Date.now();
      let emitted = false;
      let reportedModelId: string | null = null;
      let inputTokens: number | null = null;
      let outputTokens: number | null = null;
      const stream = adapter.generateStream({
        model: target.modelId,
        messages: opts.messages,
        temperature: opts.temperature,
        maxTokens: opts.maxTokens,
        outputMode: opts.outputMode,
        signal: opts.signal,
      });

      // Deliberate structure: `yield` sits inside try/FINALLY, never
      // inside a catch. A throw from the consumer's loop body (a DB write
      // failing mid-persist, the client disconnecting) is injected at the
      // yield point; with a catch here it would be misread as a gateway
      // failure and could take a healthy gateway out of rotation. Only a
      // throw from `stream.next()` — the transport — is a gateway error.
      let failure: GatewayError | null = null;
      let finished = false;
      try {
        while (true) {
          let next: IteratorResult<StreamChunk>;
          try {
            next = await stream.next();
          } catch (err) {
            failure =
              err instanceof GatewayError
                ? err
                : new GatewayError("INTERNAL", "generateStream: gateway error");
            break;
          }
          if (next.done) {
            finished = true;
            break;
          }
          if (typeof next.value.model === "string" && next.value.model.length > 0) reportedModelId = next.value.model;
          if (next.value.usage) {
            inputTokens = reportedTokens(next.value.usage.inputTokens) ?? inputTokens;
            outputTokens = reportedTokens(next.value.usage.outputTokens) ?? outputTokens;
          }
          emitted ||= next.value.delta.length > 0;
          yield next.value;
        }
      } finally {
        // Release the upstream body on every exit path, including a
        // consumer abandoning the generator early.
        await stream.return(undefined).catch(() => undefined);
        await this.registry.recordAttempt(opts.generationId, {
          attemptNumber, gatewayId: target.gatewayId, modelId: reportedModelId ?? target.modelId,
          requestedModelId: target.modelId, reportedModelId, inputTokens, outputTokens,
          status: finished ? "SUCCEEDED" : failure ? attemptStatus(failure.category, emitted) : "FAILED",
          errorCategory: finished ? "NONE" : failure?.category ?? "DETERMINISTIC",
          errorMessage: finished ? null : failure?.message ?? "stream abandoned by consumer",
          latencyMs: Date.now() - started,
        });
      }

      const latencyMs = Date.now() - started;
      if (finished) {
        await this.registry.updateGatewayHealth(target.gatewayId, {
          ok: true,
          category: null,
          latencyMs,
        });
        return;
      }

      const gerr = failure!;
      last = gerr;
      if (isGatewayFault(gerr.category)) {
        await this.registry.updateGatewayHealth(target.gatewayId, {
          ok: false,
          category: gerr.category,
          latencyMs,
        });
      }
      // Never restart a stream that already produced content.
      if (emitted) throw gerr;
      if (!shouldTryNext(gerr.category, i + 1, plan.length)) break;
      const delay = backoffDelayMs(i + 1, 250, 8_000, opts.random);
      if (delay > 0) await sleep(delay);
    }
    throw last ?? new NoRouteError(opts.profile);
  }

  /** Discover a single gateway's model catalog (admin sync path). */
  async listModelsFor(gatewayId: string): Promise<GatewayModel[]> {
    const rec = (await this.registry.listGateways()).find((g) => g.id === gatewayId);
    if (!rec) {
      // The registry omits gateways whose credential cannot be decrypted,
      // so this is a configuration fault (bad key / disabled), not a
      // transport failure — callers map it to a diagnosable error.
      throw new GatewayError(
        "INVALID_REQUEST",
        "gateway not found, disabled, or credential unreadable",
      );
    }
    return this.build(rec).listModels();
  }

  /** Health probe across all enabled gateways (background job entry). */
  async checkHealth(): Promise<
    Array<{ gatewayId: string; healthy: boolean; latencyMs: number }>
  > {
    const gateways = (await this.registry.listGateways()).filter((g) => g.enabled);
    const out: Array<{ gatewayId: string; healthy: boolean; latencyMs: number }> = [];
    for (const rec of gateways) {
      const adapter = this.build(rec);
      const started = Date.now();
      const probe = await adapter.healthCheck();
      const latencyMs = Date.now() - started;
      // Record the classified reason, so an auth failure is not filed as
      // a transient outage. A failed probe is not a per-request failure,
      // so it does not count against the breaker.
      await this.registry.updateGatewayHealth(rec.id, {
        ok: probe.healthy,
        category: probe.category,
        latencyMs,
        probe: true,
      });
      out.push({ gatewayId: rec.id, healthy: probe.healthy, latencyMs });
    }
    return out;
  }
}

function attemptStatus(
  category: ErrorCategory,
  partial: boolean,
): AttemptRecord["status"] {
  if (category === "RATE_LIMIT") return "RATE_LIMITED";
  if (category === "TRANSIENT" && partial) return "TIMEOUT";
  return "FAILED";
}

/** Re-exported for callers that classify their own errors. */
export { isRetryable };
