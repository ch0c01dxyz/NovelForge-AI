/**
 * ai-core unit tests: error classification, credential crypto, routing
 * policy, and manager retry/fallback. No network, no database — the
 * manager's ports are faked (CLAUDE.md §25 "provide mock/fake AI
 * providers").
 */
import { describe, expect, it } from "vitest";
import {
  classifyStatus,
  classifyThrown,
  GatewayError,
  isGatewayFault,
  isRetryable,
  messageFor,
} from "./errors.ts";
import {
  CredentialError,
  decryptCredential,
  encryptCredential,
  secretsEqual,
} from "./crypto.ts";
import {
  backoffDelayMs,
  CIRCUIT_THRESHOLD,
  isCircuitOpen,
  planAttempts,
  shouldTryNext,
  type Candidate,
} from "./router.ts";
import {
  GatewayManager,
  NoRouteError,
  type AttemptRecord,
  type GatewayRecord,
  type GatewayRegistry,
} from "./manager.ts";
import {
  JSON_MODE_INCOMPATIBLE,
  JSON_MODE_OK,
  type AIGateway,
  type GenerateRequest,
  type GenerateResult,
  type StreamChunk,
} from "./types.ts";

const KEY = "test-secret-key";

function cand(over: Partial<Candidate> = {}): Candidate {
  return {
    gatewayId: "g1",
    gatewayName: "one",
    modelId: "m1",
    priority: 100,
    weight: 1,
    latencyMs: null,
    consecutiveFailures: 0,
    enabled: true,
    ...over,
  };
}

describe("error classification", () => {
  it("maps statuses to retry-relevant categories", () => {
    expect(classifyStatus(401)).toBe("AUTH");
    expect(classifyStatus(403)).toBe("AUTH");
    expect(classifyStatus(429)).toBe("RATE_LIMIT");
    expect(classifyStatus(408)).toBe("TRANSIENT");
    expect(classifyStatus(500)).toBe("TRANSIENT");
    expect(classifyStatus(503)).toBe("TRANSIENT");
    expect(classifyStatus(404)).toBe("UNSUPPORTED");
    expect(classifyStatus(400)).toBe("INVALID_REQUEST");
    expect(classifyStatus(422)).toBe("INVALID_REQUEST");
  });

  it("only treats transient and rate-limit as retryable", () => {
    expect(isRetryable("TRANSIENT")).toBe(true);
    expect(isRetryable("RATE_LIMIT")).toBe(true);
    expect(isRetryable("AUTH")).toBe(false);
    expect(isRetryable("INVALID_REQUEST")).toBe(false);
    expect(isRetryable("UNSUPPORTED")).toBe(false);
    expect(isRetryable("DETERMINISTIC")).toBe(false);
  });

  it("does not retry a caller cancellation but does retry our timeout", () => {
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    expect(classifyThrown(abort, false)).toBe("DETERMINISTIC");
    expect(classifyThrown(abort, true)).toBe("TRANSIENT");
    expect(classifyThrown(new Error("fetch failed"), false)).toBe("TRANSIENT");
  });

  it("produces messages that never carry provider detail", () => {
    // A provider body must never be interpolated into a persisted message.
    for (const c of [
      "TRANSIENT",
      "RATE_LIMIT",
      "AUTH",
      "INVALID_REQUEST",
      "UNSUPPORTED",
      "DETERMINISTIC",
      "INTERNAL",
    ] as const) {
      const msg = messageFor(c, 500);
      expect(msg).not.toContain("sk-");
      expect(msg.length).toBeLessThan(80);
    }
  });
});

describe("credential encryption", () => {
  it("round-trips a credential", () => {
    const stored = encryptCredential("sk-secret-value", KEY);
    expect(stored).not.toContain("sk-secret-value");
    expect(decryptCredential(stored, KEY)).toBe("sk-secret-value");
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const a = encryptCredential("same", KEY);
    const b = encryptCredential("same", KEY);
    expect(a).not.toBe(b);
    expect(decryptCredential(a, KEY)).toBe(decryptCredential(b, KEY));
  });

  it("rejects a tampered ciphertext rather than returning garbage", () => {
    const stored = encryptCredential("secret", KEY);
    const parts = stored.split(":");
    const tampered = [parts[0], parts[1], parts[2], "AAAA"].join(":");
    expect(() => decryptCredential(tampered, KEY)).toThrow(CredentialError);
  });

  it("rejects a wrong key", () => {
    const stored = encryptCredential("secret", KEY);
    expect(() => decryptCredential(stored, "other-key")).toThrow(CredentialError);
  });

  it("rejects malformed input", () => {
    expect(() => decryptCredential("nonsense", KEY)).toThrow(CredentialError);
    expect(() => decryptCredential("v2:a:b:c", KEY)).toThrow(CredentialError);
  });

  it("never echoes the ciphertext or key in the error message", () => {
    try {
      decryptCredential("v1:AAAA:BBBB:CCCC", KEY);
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as Error).message).not.toContain("AAAA");
      expect((e as Error).message).not.toContain(KEY);
    }
  });

  it("compares secrets without throwing on length mismatch", () => {
    expect(secretsEqual("abc", "abc")).toBe(true);
    expect(secretsEqual("abc", "abd")).toBe(false);
    expect(secretsEqual("abc", "abcd")).toBe(false);
  });
});

describe("routing policy", () => {
  it("opens the circuit at the threshold", () => {
    expect(isCircuitOpen(0)).toBe(false);
    expect(isCircuitOpen(CIRCUIT_THRESHOLD - 1)).toBe(false);
    expect(isCircuitOpen(CIRCUIT_THRESHOLD)).toBe(true);
    expect(isCircuitOpen(CIRCUIT_THRESHOLD + 5)).toBe(true);
  });

  it("orders by priority and dedupes gateways for fallback", () => {
    const plan = planAttempts(
      [
        cand({ gatewayId: "b", priority: 200 }),
        cand({ gatewayId: "a", priority: 100 }),
        cand({ gatewayId: "a", priority: 100, modelId: "m2" }),
      ],
      "PRIORITY",
    );
    // Both gateways first (a then b), then the repeat model on a.
    expect(plan.map((c) => `${c.gatewayId}:${c.modelId}`)).toEqual([
      "a:m1",
      "b:m1",
      "a:m2",
    ]);
  });

  it("skips circuit-open gateways while a healthy one exists", () => {
    const plan = planAttempts(
      [
        cand({ gatewayId: "bad", priority: 1, consecutiveFailures: CIRCUIT_THRESHOLD }),
        cand({ gatewayId: "good", priority: 9 }),
      ],
      "PRIORITY",
    );
    expect(plan.map((c) => c.gatewayId)).toEqual(["good"]);
  });

  it("keeps circuit-open gateways when nothing else is available", () => {
    const plan = planAttempts(
      [cand({ gatewayId: "bad", consecutiveFailures: 99 })],
      "PRIORITY",
    );
    expect(plan).toHaveLength(1);
  });

  it("excludes disabled gateways entirely", () => {
    const plan = planAttempts(
      [cand({ gatewayId: "off", enabled: false }), cand({ gatewayId: "on" })],
      "PRIORITY",
    );
    expect(plan.map((c) => c.gatewayId)).toEqual(["on"]);
  });

  it("orders by observed latency, unmeasured last", () => {
    const plan = planAttempts(
      [
        cand({ gatewayId: "slow", latencyMs: 900 }),
        cand({ gatewayId: "fast", latencyMs: 50 }),
        cand({ gatewayId: "unknown", latencyMs: null }),
      ],
      "LEAST_LATENCY",
    );
    expect(plan.map((c) => c.gatewayId)).toEqual(["fast", "slow", "unknown"]);
  });

  it("rotates for round-robin", () => {
    const pool = [cand({ gatewayId: "a", priority: 1 }), cand({ gatewayId: "b", priority: 2 })];
    expect(planAttempts(pool, "ROUND_ROBIN", { roundRobinCursor: 0 }).map((c) => c.gatewayId)).toEqual(["a", "b"]);
    expect(planAttempts(pool, "ROUND_ROBIN", { roundRobinCursor: 1 }).map((c) => c.gatewayId)).toEqual(["b", "a"]);
  });

  it("honours weighted ordering deterministically under a fixed RNG", () => {
    const pool = [
      cand({ gatewayId: "heavy", weight: 100 }),
      cand({ gatewayId: "light", weight: 1 }),
    ];
    // random()=0 -> first pick is the heaviest.
    expect(planAttempts(pool, "WEIGHTED", { random: () => 0 }).map((c) => c.gatewayId)[0]).toBe("heavy");
  });

  it("caps attempts", () => {
    const pool = [cand({ gatewayId: "a" }), cand({ gatewayId: "b" }), cand({ gatewayId: "c" })];
    expect(planAttempts(pool, "PRIORITY", { maxAttempts: 2 })).toHaveLength(2);
  });

  it("stops on invalid request and cancellation, continues past auth", () => {
    expect(shouldTryNext("INVALID_REQUEST", 1, 3)).toBe(false);
    expect(shouldTryNext("DETERMINISTIC", 1, 3)).toBe(false);
    expect(shouldTryNext("AUTH", 1, 3)).toBe(true);
    expect(shouldTryNext("UNSUPPORTED", 1, 3)).toBe(true);
    expect(shouldTryNext("TRANSIENT", 1, 3)).toBe(true);
    expect(shouldTryNext("TRANSIENT", 3, 3)).toBe(false);
  });

  it("backs off with bounded jitter", () => {
    expect(backoffDelayMs(1, 250, 8000, () => 1)).toBeLessThanOrEqual(250);
    expect(backoffDelayMs(5, 250, 8000, () => 1)).toBeLessThanOrEqual(8000);
    // Full jitter means the delay can be near zero.
    expect(backoffDelayMs(1, 250, 8000, () => 0)).toBe(0);
  });
});

// ---- manager tests with fakes -------------------------------------------

interface FakeOptions {
  /** Per-gateway behaviour: succeed, or fail with this category. */
  behaviour: Record<string, { ok: boolean; category?: string; partial?: boolean }>;
}

function fakeRegistry(
  gateways: GatewayRecord[],
  capabilities?: Record<string, string[]>,
): GatewayRegistry & { attempts: AttemptRecord[]; health: string[] } {
  const attempts: AttemptRecord[] = [];
  const health: string[] = [];
  return {
    attempts,
    health,
    async listGateways() {
      return gateways;
    },
    async resolveProfile() {
      return gateways.map((g) => ({
        gatewayId: g.id,
        modelId: `${g.name}-model`,
        ...(capabilities ? { capabilities: capabilities[g.id] } : {}),
      }));
    },
    async recordAttempt(_gen, a) {
      attempts.push(a);
    },
    async updateGatewayHealth(id, o) {
      health.push(`${id}:${o.ok ? "ok" : (o.category ?? "err")}`);
    },
  };
}

function fakeGateway(rec: GatewayRecord, opts: FakeOptions): AIGateway {
  const b = opts.behaviour[rec.id] ?? { ok: true };
  const fail = () => {
    const cat = (b.category ?? "TRANSIENT") as
      | "TRANSIENT"
      | "RATE_LIMIT"
      | "AUTH"
      | "UNSUPPORTED"
      | "INVALID_REQUEST";
    throw new GatewayError(cat, "boom", undefined, b.partial);
  };
  return {
    id: rec.id,
    name: rec.name,
    async listModels() {
      return [];
    },
    async generate(): Promise<GenerateResult> {
      if (!b.ok) fail();
      return { content: `from ${rec.name}`, model: `${rec.name}-model`, inputTokens: 1, outputTokens: 2, finishReason: "stop" };
    },
    async *generateStream(): AsyncGenerator<StreamChunk> {
      if (!b.ok) {
        if (b.partial) yield { delta: "partial " };
        fail();
      }
      yield { delta: "hello " };
      yield { delta: "world" };
    },
    async embed() {
      if (!b.ok) fail();
      return { vectors: [[0.1]], model: rec.name, inputTokens: 1 };
    },
    async healthCheck() {
      return b.ok
        ? { healthy: true, category: null }
        : { healthy: false, category: "TRANSIENT" as const };
    },
  };
}

function gw(over: Partial<GatewayRecord> = {}): GatewayRecord {
  return {
    id: "g1",
    name: "one",
    baseUrl: "http://localhost:1",
    apiKey: "k",
    timeoutMs: 1000,
    enabled: true,
    priority: 100,
    weight: 1,
    health: "UNKNOWN",
    consecutiveFailures: 0,
    ...over,
  };
}

function makeManager(gateways: GatewayRecord[], behaviour: FakeOptions["behaviour"]) {
  const registry = fakeRegistry(gateways);
  const manager = new GatewayManager(registry, {
    createGateway: (rec) => fakeGateway(rec, { behaviour }),
  });
  return { manager, registry };
}

describe("attempt usage provenance", () => {
  it("keeps unreported embedding counters and response model unknown", async () => {
    const registry = fakeRegistry([gw()]);
    const manager = new GatewayManager(registry, { createGateway: rec => ({
      ...fakeGateway(rec, { behaviour: {} }),
      async embed() { return { vectors: [[1]], model: "requested-fallback", inputTokens: null }; },
    }) });
    await manager.embed({ profile: "EMBEDDING", input: ["text"], generationId: "gen" });
    expect(registry.attempts[0]).toMatchObject({ reportedModelId: null, inputTokens: null, outputTokens: null });
  });

  it("records metadata-only failure and retries without treating usage as emitted text", async () => {
    const registry = fakeRegistry([gw(), gw({ id: "g2", name: "two" })]);
    let calls = 0;
    const manager = new GatewayManager(registry, { createGateway: rec => ({
      ...fakeGateway(rec, { behaviour: {} }),
      async *generateStream() {
        calls++;
        yield { delta: "", model: "served", usage: { inputTokens: calls, outputTokens: 0 } };
        if (calls === 1) throw new GatewayError("TRANSIENT", "failed");
        yield { delta: "done" };
      },
    }) });
    let text = "";
    for await (const frame of manager.generateStream({ profile: "CREATIVE_WRITER", messages: [], generationId: "gen", sleep: async () => {} })) text += frame.delta;
    expect(text).toBe("done");
    expect(registry.attempts).toHaveLength(2);
    expect(registry.attempts[0]).toMatchObject({ inputTokens: 1, outputTokens: 0, status: "FAILED" });
    expect(registry.attempts[1]).toMatchObject({ inputTokens: 2, outputTokens: 0, status: "SUCCEEDED" });
  });
  it("snapshots requested and reported models separately from counters", async () => {
    const registry = fakeRegistry([gw()]);
    const manager = new GatewayManager(registry, { createGateway: rec => ({
      ...fakeGateway(rec, { behaviour: {} }),
      async generate() { return { content: "ok", model: "served", reportedModel: "served", inputTokens: 7, outputTokens: 2, finishReason: "stop" }; },
    }) });
    await manager.generate({ profile: "CREATIVE_WRITER", messages: [], generationId: "gen" });
    expect(registry.attempts[0]).toMatchObject({ requestedModelId: "one-model", reportedModelId: "served", inputTokens: 7, outputTokens: 2 });
  });

  it.each([false, true])("retains one cumulative stream snapshot on complete/abandon=%s", async abandon => {
    const registry = fakeRegistry([gw()]);
    const manager = new GatewayManager(registry, { createGateway: rec => ({
      ...fakeGateway(rec, { behaviour: {} }),
      async *generateStream() {
        yield { delta: "", model: "served", usage: { inputTokens: 4, outputTokens: 1 } };
        yield { delta: "text", model: "served", usage: { inputTokens: 4, outputTokens: 3 } };
      },
    }) });
    const stream = manager.generateStream({ profile: "CREATIVE_WRITER", messages: [], generationId: "gen" });
    for await (const frame of stream) { if (abandon && frame.delta) break; }
    expect(registry.attempts).toHaveLength(1);
    expect(registry.attempts[0]).toMatchObject({ requestedModelId: "one-model", reportedModelId: "served", inputTokens: 4, outputTokens: 3, status: abandon ? "FAILED" : "SUCCEEDED" });
  });
});

describe("gateway manager", () => {
  it.each([false, true])("prefers an internal model identity before the cap (stream=%s)", async stream => {
    const registry = fakeRegistry([gw(), gw({ id: "g2", name: "two", priority: 900, consecutiveFailures: 9 })]);
    registry.resolveProfile = async () => [
      { modelRef: "first", gatewayId: "g1", modelId: "same-provider-model" },
      { modelRef: "second", gatewayId: "g2", modelId: "same-provider-model" },
    ];
    const manager = new GatewayManager(registry, { createGateway: rec => fakeGateway(rec, { behaviour: {} }) });
    const opts = { profile: "CREATIVE_WRITER" as const, generationId: "preference", messages: [], preferredModelRef: "second", maxAttempts: 1 };
    if (stream) { for await (const chunk of manager.generateStream(opts)) expect(chunk.delta).toBeTruthy(); }
    else await manager.generate(opts);
    expect(registry.attempts).toHaveLength(1);
    expect(registry.attempts[0]).toMatchObject({ gatewayId: "g2", requestedModelId: "same-provider-model", status: "SUCCEEDED" });
  });

  it.each(["missing", "disabled", "incompatible"])("refuses an explicit %s preference before any dispatch", async reason => {
    const registry = fakeRegistry([gw(), gw({ id: "g2", name: "two", enabled: reason !== "disabled" })]);
    registry.resolveProfile = async () => [
      { modelRef: "first", gatewayId: "g1", modelId: "one" },
      { modelRef: "second", gatewayId: "g2", modelId: "two", capabilities: reason === "incompatible" ? [JSON_MODE_INCOMPATIBLE] : [] },
    ];
    const manager = new GatewayManager(registry, { createGateway: () => { throw Error("must not dispatch"); } });
    const opts = { profile: "CREATIVE_WRITER" as const, generationId: "preference", messages: [], preferredModelRef: reason === "missing" ? "unknown" : "second", outputMode: "json_object" as const };
    await expect(manager.generate(opts)).rejects.toBeInstanceOf(NoRouteError);
    await expect(async () => { for await (const _chunk of manager.generateStream(opts)) { /* consume */ } }).rejects.toBeInstanceOf(NoRouteError);
    expect(registry.attempts).toHaveLength(0);
  });

  it.each([false, true])("rechecks mapping eligibility between fallback attempts (stream=%s)", async stream => {
    const registry = fakeRegistry([gw(), gw({ id: "g2", name: "two" }), gw({ id: "g3", name: "three" })]);
    let disabled = false;
    registry.resolveProfile = async () => ["g1", "g2", "g3"].filter(id => !disabled || id !== "g2").map(id => ({ modelRef: id, gatewayId: id, modelId: id }));
    const manager = new GatewayManager(registry, { createGateway: rec => fakeGateway(rec, { behaviour: { g1: { ok: false, category: "RATE_LIMIT" } } }) });
    const opts = { profile: "CREATIVE_WRITER" as const, generationId: "preference", messages: [], preferredModelRef: "g1", sleep: async () => { disabled = true; }, random: () => 1 };
    if (stream) { for await (const _chunk of manager.generateStream(opts)) { /* consume */ } }
    else await manager.generate(opts);
    expect(registry.attempts.map(a => [a.attemptNumber, a.gatewayId])).toEqual([[1, "g1"], [2, "g3"]]);
  });

  it("returns the first successful attempt", async () => {
    const { manager, registry } = makeManager([gw()], { g1: { ok: true } });
    const result = await manager.generate({
      profile: "CREATIVE_WRITER",
      messages: [{ role: "user", content: "hi" }],
      generationId: "gen1",
    });
    expect(result.content).toBe("from one");
    expect(registry.attempts).toHaveLength(1);
    expect(registry.attempts[0]!.status).toBe("SUCCEEDED");
  });

  it("falls back to a second gateway on transient failure", async () => {
    const { manager, registry } = makeManager(
      [gw({ id: "g1", name: "one", priority: 1 }), gw({ id: "g2", name: "two", priority: 2 })],
      { g1: { ok: false, category: "TRANSIENT" }, g2: { ok: true } },
    );
    const result = await manager.generate({
      profile: "CREATIVE_WRITER",
      messages: [],
      generationId: "gen1",
      sleep: async () => {},
      random: () => 0,
    });
    expect(result.content).toBe("from two");
    expect(registry.attempts.map((a) => a.status)).toEqual(["FAILED", "SUCCEEDED"]);
    expect(registry.attempts.map((a) => a.attemptNumber)).toEqual([1, 2]);
  });

  it("does not retry an invalid request", async () => {
    const { manager, registry } = makeManager(
      [gw({ id: "g1", priority: 1 }), gw({ id: "g2", priority: 2 })],
      { g1: { ok: false, category: "INVALID_REQUEST" }, g2: { ok: true } },
    );
    await expect(
      manager.generate({ profile: "CREATIVE_WRITER", messages: [], generationId: "gen1", sleep: async () => {} }),
    ).rejects.toBeInstanceOf(GatewayError);
    // Only the first gateway was tried — retrying a 4xx elsewhere is futile.
    expect(registry.attempts).toHaveLength(1);
  });

  it("tries another gateway after an auth failure", async () => {
    const { manager, registry } = makeManager(
      [gw({ id: "g1", name: "one", priority: 1 }), gw({ id: "g2", name: "two", priority: 2 })],
      { g1: { ok: false, category: "AUTH" }, g2: { ok: true } },
    );
    const r = await manager.generate({
      profile: "CREATIVE_WRITER", messages: [], generationId: "gen1", sleep: async () => {},
    });
    expect(r.content).toBe("from two");
    expect(registry.attempts).toHaveLength(2);
  });

  it("records rate-limit attempts with the right status", async () => {
    const { manager, registry } = makeManager(
      [gw({ id: "g1", priority: 1 }), gw({ id: "g2", priority: 2 })],
      { g1: { ok: false, category: "RATE_LIMIT" }, g2: { ok: true } },
    );
    await manager.generate({
      profile: "CREATIVE_WRITER", messages: [], generationId: "gen1", sleep: async () => {}, random: () => 0,
    });
    expect(registry.attempts[0]!.status).toBe("RATE_LIMITED");
    expect(registry.attempts[0]!.errorCategory).toBe("RATE_LIMIT");
  });

  it("throws NoRouteError when the profile has no mapping", async () => {
    const registry = fakeRegistry([]);
    const manager = new GatewayManager(registry);
    await expect(
      manager.generate({ profile: "EMBEDDING", messages: [], generationId: "gen1" }),
    ).rejects.toBeInstanceOf(NoRouteError);
  });

  it("stops after maxAttempts", async () => {
    const { manager, registry } = makeManager(
      [gw({ id: "g1", priority: 1 }), gw({ id: "g2", priority: 2 }), gw({ id: "g3", priority: 3 })],
      { g1: { ok: false, category: "TRANSIENT" }, g2: { ok: false, category: "TRANSIENT" }, g3: { ok: true } },
    );
    await expect(
      manager.generate({
        profile: "CREATIVE_WRITER", messages: [], generationId: "gen1",
        sleep: async () => {}, random: () => 0, maxAttempts: 2,
      }),
    ).rejects.toBeInstanceOf(GatewayError);
    expect(registry.attempts).toHaveLength(2);
  });

  it("updates gateway health on success and failure", async () => {
    const { manager, registry } = makeManager(
      [gw({ id: "g1", priority: 1 }), gw({ id: "g2", priority: 2 })],
      { g1: { ok: false, category: "TRANSIENT" }, g2: { ok: true } },
    );
    await manager.generate({
      profile: "CREATIVE_WRITER", messages: [], generationId: "gen1", sleep: async () => {}, random: () => 0,
    });
    expect(registry.health).toEqual(["g1:TRANSIENT", "g2:ok"]);
  });

  it("streams successfully", async () => {
    const { manager, registry } = makeManager([gw()], { g1: { ok: true } });
    const chunks: string[] = [];
    for await (const c of manager.generateStream({
      profile: "CREATIVE_WRITER", messages: [], generationId: "gen1",
    })) {
      chunks.push(c.delta);
    }
    expect(chunks.join("")).toBe("hello world");
    expect(registry.attempts[0]!.status).toBe("SUCCEEDED");
  });

  it("does NOT restart a stream that already emitted content", async () => {
    const { manager, registry } = makeManager(
      [gw({ id: "g1", priority: 1 }), gw({ id: "g2", priority: 2 })],
      { g1: { ok: false, category: "TRANSIENT", partial: true }, g2: { ok: true } },
    );
    const chunks: string[] = [];
    await expect(
      (async () => {
        for await (const c of manager.generateStream({
          profile: "CREATIVE_WRITER", messages: [], generationId: "gen1",
          sleep: async () => {}, random: () => 0,
        })) {
          chunks.push(c.delta);
        }
      })(),
    ).rejects.toBeInstanceOf(GatewayError);
    // Partial output was emitted, then the error surfaced — no retry, so
    // the second gateway was never contacted (no duplicate text).
    expect(chunks.join("")).toBe("partial ");
    expect(registry.attempts).toHaveLength(1);
  });

  it("retries a stream that failed before emitting anything", async () => {
    const { manager, registry } = makeManager(
      [gw({ id: "g1", priority: 1 }), gw({ id: "g2", priority: 2 })],
      { g1: { ok: false, category: "TRANSIENT", partial: false }, g2: { ok: true } },
    );
    const chunks: string[] = [];
    for await (const c of manager.generateStream({
      profile: "CREATIVE_WRITER", messages: [], generationId: "gen1",
      sleep: async () => {}, random: () => 0,
    })) {
      chunks.push(c.delta);
    }
    expect(chunks.join("")).toBe("hello world");
    expect(registry.attempts).toHaveLength(2);
  });

  it("marks a mid-stream failure as TIMEOUT status", async () => {
    const { manager, registry } = makeManager(
      [gw({ id: "g1" })],
      { g1: { ok: false, category: "TRANSIENT", partial: true } },
    );
    await expect(
      (async () => {
        for await (const _c of manager.generateStream({
          profile: "CREATIVE_WRITER", messages: [], generationId: "gen1", sleep: async () => {},
        })) {
          void _c;
        }
      })(),
    ).rejects.toBeInstanceOf(GatewayError);
    expect(registry.attempts[0]!.status).toBe("TIMEOUT");
  });

  it("probes health across enabled gateways only", async () => {
    const { manager, registry } = makeManager(
      [gw({ id: "g1", enabled: true }), gw({ id: "g2", enabled: false })],
      { g1: { ok: true }, g2: { ok: false } },
    );
    const results = await manager.checkHealth();
    expect(results).toHaveLength(1);
    expect(results[0]!.gatewayId).toBe("g1");
    expect(registry.health).toEqual(["g1:ok"]);
  });
});

describe("embedding routes through the same policy as generate", () => {
  it("returns vectors from the first successful attempt and records it", async () => {
    const { manager, registry } = makeManager([gw()], { g1: { ok: true } });
    const result = await manager.embed({
      profile: "EMBEDDING",
      input: ["alpha", "beta"],
      generationId: "gen-embed",
    });
    expect(result.vectors).toEqual([[0.1]]);
    expect(registry.attempts).toHaveLength(1);
    expect(registry.attempts[0]!.status).toBe("SUCCEEDED");
  });

  it("fails over to a second gateway exactly as generate does", async () => {
    // The property that matters: embed was not given its own retry loop, so
    // it must inherit bounded retry and fallback rather than failing on the
    // first gateway that blinks.
    const { manager, registry } = makeManager(
      [gw({ id: "g1", name: "one", priority: 1 }), gw({ id: "g2", name: "two", priority: 2 })],
      { g1: { ok: false, category: "TRANSIENT" }, g2: { ok: true } },
    );
    const result = await manager.embed({
      profile: "EMBEDDING",
      input: ["x"],
      generationId: "gen-embed",
    });
    expect(result.model).toBe("two");
    expect(registry.attempts.map((a) => a.status)).toEqual(["FAILED", "SUCCEEDED"]);
  });

  it("does not retry a deterministic failure", async () => {
    // A malformed request fails identically everywhere; retrying it would
    // waste the budget and delay the caller's error (CLAUDE.md §27).
    const { manager, registry } = makeManager(
      [gw({ id: "g1", name: "one" }), gw({ id: "g2", name: "two" })],
      { g1: { ok: false, category: "INVALID_REQUEST" }, g2: { ok: true } },
    );
    await expect(
      manager.embed({ profile: "EMBEDDING", input: ["x"], generationId: "g" }),
    ).rejects.toBeInstanceOf(GatewayError);
    expect(registry.attempts).toHaveLength(1);
  });

  it("counts a gateway fault against the breaker", async () => {
    const { manager, registry } = makeManager([gw()], { g1: { ok: false, category: "TRANSIENT" } });
    await expect(
      manager.embed({ profile: "EMBEDDING", input: ["x"], generationId: "g" }),
    ).rejects.toBeInstanceOf(GatewayError);
    // The fake records `${id}:${ok ? "ok" : category}`.
    expect(registry.health).toContain("g1:TRANSIENT");
  });

  it("returns an empty result for an empty batch without opening an attempt", async () => {
    // An empty batch is a caller bug, not a gateway fault. Recording an
    // attempt (and possibly a health failure) against a healthy gateway
    // would be wrong.
    const { manager, registry } = makeManager([gw()], { g1: { ok: true } });
    const result = await manager.embed({
      profile: "EMBEDDING",
      input: [],
      generationId: "g",
    });
    expect(result.vectors).toEqual([]);
    expect(registry.attempts).toHaveLength(0);
    expect(registry.health).toEqual([]);
  });

  it("raises NoRouteError when nothing is mapped to the profile", async () => {
    const { manager } = makeManager([], {});
    await expect(
      manager.embed({ profile: "EMBEDDING", input: ["x"], generationId: "g" }),
    ).rejects.toBeInstanceOf(NoRouteError);
  });
});

describe("strategy and cursor wiring", () => {
  it("applies the deployment default strategy when a request names none", async () => {
    // Two gateways; WEIGHTED with a fixed RNG picking the light one
    // proves the configured strategy is actually consulted.
    const registry = fakeRegistry([
      gw({ id: "heavy", name: "heavy", weight: 100, priority: 1 }),
      gw({ id: "light", name: "light", weight: 1, priority: 2 }),
    ]);
    const manager = new GatewayManager(registry, {
      createGateway: (rec) => fakeGateway(rec, { behaviour: {} }),
      defaultStrategy: "WEIGHTED",
    });
    // random() near 1 selects the last remaining pick -> the light one.
    const result = await manager.generate({
      profile: "CREATIVE_WRITER",
      messages: [],
      generationId: "gen1",
      random: () => 0.999,
    });
    // Whatever it picked, the point is that the strategy ran: PRIORITY
    // would have picked "heavy" deterministically (priority 1).
    expect(result.content).toBe("from light");
  });

  it("still lets a request override the default strategy", async () => {
    const registry = fakeRegistry([
      gw({ id: "heavy", name: "heavy", weight: 100, priority: 1 }),
      gw({ id: "light", name: "light", weight: 1, priority: 2 }),
    ]);
    const manager = new GatewayManager(registry, {
      createGateway: (rec) => fakeGateway(rec, { behaviour: {} }),
      defaultStrategy: "WEIGHTED",
    });
    const result = await manager.generate({
      profile: "CREATIVE_WRITER",
      messages: [],
      generationId: "gen1",
      strategy: "PRIORITY",
    });
    expect(result.content).toBe("from heavy");
  });

  it("advances its own round-robin cursor across requests", async () => {
    const registry = fakeRegistry([
      gw({ id: "a", name: "a", priority: 1 }),
      gw({ id: "b", name: "b", priority: 2 }),
    ]);
    const manager = new GatewayManager(registry, {
      createGateway: (rec) => fakeGateway(rec, { behaviour: {} }),
      defaultStrategy: "ROUND_ROBIN",
    });
    const first = await manager.generate({
      profile: "CREATIVE_WRITER", messages: [], generationId: "g1",
    });
    const second = await manager.generate({
      profile: "CREATIVE_WRITER", messages: [], generationId: "g2",
    });
    // Without a self-advancing cursor both requests would hit "a".
    expect([first.content, second.content]).toEqual(["from a", "from b"]);
  });

  it("honours a caller-supplied cursor source over its own", async () => {
    const registry = fakeRegistry([
      gw({ id: "a", name: "a", priority: 1 }),
      gw({ id: "b", name: "b", priority: 2 }),
    ]);
    const manager = new GatewayManager(registry, {
      createGateway: (rec) => fakeGateway(rec, { behaviour: {} }),
      defaultStrategy: "ROUND_ROBIN",
    });
    const result = await manager.generate({
      profile: "CREATIVE_WRITER",
      messages: [],
      generationId: "g1",
      roundRobinCursor: () => 1,
    });
    expect(result.content).toBe("from b");
  });

  it("respects a per-gateway maxRetries of 0", async () => {
    // maxRetries: 0 means "never retry this instance" — the stored
    // setting must have an effect rather than being inert.
    const registry = fakeRegistry([
      gw({ id: "solo", name: "solo", maxRetries: 0 }),
    ]);
    const manager = new GatewayManager(registry, {
      createGateway: (rec) => fakeGateway(rec, { behaviour: { solo: { ok: false, category: "TRANSIENT" } } }),
    });
    await expect(
      manager.generate({
        profile: "CREATIVE_WRITER", messages: [], generationId: "gen1",
        sleep: async () => {}, random: () => 0, maxAttempts: 5,
      }),
    ).rejects.toBeInstanceOf(GatewayError);
    expect(registry.attempts).toHaveLength(1);
  });
});

describe("circuit breaker is not poisoned by caller-induced failures", () => {
  it("does not penalize a gateway for an invalid request", async () => {
    const { manager, registry } = makeManager(
      [gw({ id: "g1" })],
      { g1: { ok: false, category: "INVALID_REQUEST" } },
    );
    await expect(
      manager.generate({
        profile: "CREATIVE_WRITER", messages: [], generationId: "gen1",
        sleep: async () => {},
      }),
    ).rejects.toBeInstanceOf(GatewayError);
    // The attempt is recorded, but the gateway's breaker is untouched —
    // a malformed request would fail identically on every gateway.
    expect(registry.attempts).toHaveLength(1);
    expect(registry.health).toEqual([]);
  });

  it("does not penalize a gateway when the caller cancels", async () => {
    const { manager, registry } = makeManager(
      [gw({ id: "g1" })],
      { g1: { ok: false, category: "DETERMINISTIC" } },
    );
    await expect(
      manager.generate({
        profile: "CREATIVE_WRITER", messages: [], generationId: "gen1",
        sleep: async () => {},
      }),
    ).rejects.toBeInstanceOf(GatewayError);
    expect(registry.health).toEqual([]);
  });

  it("DOES penalize a gateway for a transient failure", async () => {
    const { manager, registry } = makeManager(
      [gw({ id: "g1" })],
      { g1: { ok: false, category: "TRANSIENT" } },
    );
    await expect(
      manager.generate({
        profile: "CREATIVE_WRITER", messages: [], generationId: "gen1",
        sleep: async () => {}, random: () => 0,
      }),
    ).rejects.toBeInstanceOf(GatewayError);
    expect(registry.health).toEqual(["g1:TRANSIENT"]);
  });
});

describe("streaming does not misattribute consumer errors", () => {
  it("propagates a consumer throw without blaming the gateway", async () => {
    const { manager, registry } = makeManager([gw({ id: "g1" })], { g1: { ok: true } });
    // Consume one chunk, then throw from the consumer's own body — the
    // shape of a DB write failing while persisting streamed text.
    const boom = new Error("consumer write failed");
    await expect(
      (async () => {
        for await (const _c of manager.generateStream({
          profile: "CREATIVE_WRITER", messages: [], generationId: "gen1",
        })) {
          throw boom;
        }
      })(),
    ).rejects.toBe(boom);
    // The gateway is healthy and no failure was recorded against it.
    expect(registry.health).toEqual([]);
    expect(registry.attempts).toHaveLength(1);
    expect(registry.attempts[0]).toMatchObject({ status: "FAILED", errorCategory: "DETERMINISTIC", errorMessage: "stream abandoned by consumer" });
  });

  it("still records a real transport failure mid-stream", async () => {
    const { manager, registry } = makeManager(
      [gw({ id: "g1" })],
      { g1: { ok: false, category: "TRANSIENT", partial: true } },
    );
    await expect(
      (async () => {
        for await (const _c of manager.generateStream({
          profile: "CREATIVE_WRITER", messages: [], generationId: "gen1",
          sleep: async () => {},
        })) {
          void _c;
        }
      })(),
    ).rejects.toBeInstanceOf(GatewayError);
    expect(registry.attempts).toHaveLength(1);
    expect(registry.attempts[0]!.errorCategory).toBe("TRANSIENT");
  });
});

describe("error classification: only real network faults are transient", () => {
  it("treats a programmer error as INTERNAL, not TRANSIENT", () => {
    // A TypeError from our own code must not be retried or blamed on a
    // provider — retrying a bug multiplies the damage.
    expect(classifyThrown(new TypeError("x is not a function"), false)).toBe(
      "INTERNAL",
    );
    expect(classifyThrown(new RangeError("bad"), false)).toBe("INTERNAL");
  });

  it("treats a real network failure as TRANSIENT", () => {
    const econnreset = Object.assign(new Error("socket hang up"), {
      code: "ECONNRESET",
    });
    expect(classifyThrown(econnreset, false)).toBe("TRANSIENT");
    expect(classifyThrown(new Error("fetch failed"), false)).toBe("TRANSIENT");
    const wrapped = new TypeError("fetch failed");
    (wrapped as { cause?: unknown }).cause = Object.assign(new Error("dns"), {
      code: "ENOTFOUND",
    });
    expect(classifyThrown(wrapped, false)).toBe("TRANSIENT");
  });

  it("classifies a gateway fault only for genuine provider failures", () => {
    expect(isGatewayFault("TRANSIENT")).toBe(true);
    expect(isGatewayFault("RATE_LIMIT")).toBe(true);
    expect(isGatewayFault("AUTH")).toBe(true);
    expect(isGatewayFault("UNSUPPORTED")).toBe(true);
    expect(isGatewayFault("INVALID_REQUEST")).toBe(false);
    expect(isGatewayFault("DETERMINISTIC")).toBe(false);
  });
});

describe("structured-output option propagation", () => {
  function recordingGateway(): { gateway: AIGateway; seen: GenerateRequest[] } {
    const seen: GenerateRequest[] = [];
    return {
      seen,
      gateway: {
        id: "g1",
        name: "one",
        async listModels() {
          return [];
        },
        async generate(req) {
          seen.push(req);
          return { content: "ok", model: "m", inputTokens: 1, outputTokens: 1, finishReason: "stop" };
        },
        async *generateStream() {
          yield { delta: "x" };
        },
        async embed() {
          return { vectors: [[0.1]], model: "m", inputTokens: 1 };
        },
        async healthCheck() {
          return { healthy: true, category: null };
        },
      },
    };
  }

  it("forwards outputMode to the adapter when set", async () => {
    const { gateway, seen } = recordingGateway();
    const manager = new GatewayManager(fakeRegistry([gw()]), { createGateway: () => gateway });
    await manager.generate({
      profile: "CREATIVE_WRITER",
      messages: [],
      generationId: "gen",
      outputMode: "json_object",
    });
    expect(seen[0]!.outputMode).toBe("json_object");
  });

  it("leaves outputMode unset for ordinary callers", async () => {
    const { gateway, seen } = recordingGateway();
    const manager = new GatewayManager(fakeRegistry([gw()]), { createGateway: () => gateway });
    await manager.generate({ profile: "CREATIVE_WRITER", messages: [], generationId: "gen" });
    expect(seen[0]!.outputMode).toBeUndefined();
  });
});

describe("request-aware JSON-mode candidate eligibility", () => {
  function twoGatewaySetup(
    capabilities: Record<string, string[]>,
  ) {
    const g1 = gw({ id: "g1", name: "one", priority: 100 });
    const g2 = gw({ id: "g2", name: "two", priority: 100 });
    return {
      registry: fakeRegistry([g1, g2], capabilities),
      behaviour: { g1: { ok: false, category: "INVALID_REQUEST" }, g2: { ok: true } } as Record<string, { ok: boolean; category?: string }>,
    };
  }

  it("skips a candidate recorded incompatible and preserves authored order among the eligible", async () => {
    const { registry, behaviour } = twoGatewaySetup({
      g1: [JSON_MODE_INCOMPATIBLE],
      g2: [JSON_MODE_OK],
    });
    const manager = new GatewayManager(registry, {
      createGateway: (rec) => fakeGateway(rec, { behaviour }),
    });
    const result = await manager.generate({
      profile: "LONG_CONTEXT_REVIEWER",
      messages: [],
      generationId: "gen",
      outputMode: "json_object",
    });
    // Authored order was [g1, g2]; the ineligible first candidate is
    // filtered, never reordered around, and g1 is never contacted.
    expect(result.model).toBe("two-model");
    expect(registry.attempts).toHaveLength(1);
    expect(registry.attempts[0]!.gatewayId).toBe("g2");
  });

  it("fails explicitly with no adapter call when every mapped candidate is incompatible", async () => {
    const { registry, behaviour } = twoGatewaySetup({
      g1: [JSON_MODE_INCOMPATIBLE],
      g2: [JSON_MODE_INCOMPATIBLE],
    });
    const manager = new GatewayManager(registry, {
      createGateway: (rec) => fakeGateway(rec, { behaviour }),
    });
    await expect(
      manager.generate({
        profile: "LONG_CONTEXT_REVIEWER",
        messages: [],
        generationId: "gen",
        outputMode: "json_object",
      }),
    ).rejects.toThrow(/eligible for the requested JSON output mode/);
    // Explicit refusal BEFORE any transport attempt: no candidate known
    // to reject the mode is tried, and nothing is recorded as an attempt.
    expect(registry.attempts).toHaveLength(0);
  });

  it("leaves ordinary (non-JSON) requests routing through all mapped candidates", async () => {
    const { registry, behaviour } = twoGatewaySetup({
      g1: [JSON_MODE_INCOMPATIBLE],
      g2: [JSON_MODE_OK],
    });
    // Only the routing behavior is under test here: let both candidates
    // succeed so the first authored candidate serves the request.
    behaviour.g1 = { ok: true };
    const manager = new GatewayManager(registry, {
      createGateway: (rec) => fakeGateway(rec, { behaviour }),
    });
    // Without outputMode the marker must not globally disable the model:
    // the authored first candidate still serves the request.
    const result = await manager.generate({
      profile: "LONG_CONTEXT_REVIEWER",
      messages: [],
      generationId: "gen",
    });
    expect(result.model).toBe("one-model");
    expect(registry.attempts).toHaveLength(1);
    expect(registry.attempts[0]!.gatewayId).toBe("g1");
  });

  it("treats unknown capability data as UNKNOWN and keeps the candidate eligible", async () => {
    const g1 = gw({ id: "g1", name: "one" });
    const registry = fakeRegistry([g1]);
    const manager = new GatewayManager(registry, {
      createGateway: (rec) => fakeGateway(rec, { behaviour: {} }),
    });
    const result = await manager.generate({
      profile: "LONG_CONTEXT_REVIEWER",
      messages: [],
      generationId: "gen",
      outputMode: "json_object",
    });
    expect(result.model).toBe("one-model");
  });

  it("applies the same eligibility to streamed generations", async () => {
    const { registry, behaviour } = twoGatewaySetup({
      g1: [JSON_MODE_INCOMPATIBLE],
      g2: [],
    });
    const manager = new GatewayManager(registry, {
      createGateway: (rec) => fakeGateway(rec, { behaviour }),
    });
    const chunks: string[] = [];
    for await (const c of manager.generateStream({
      profile: "LONG_CONTEXT_REVIEWER",
      messages: [],
      generationId: "gen",
      outputMode: "json_object",
    })) {
      chunks.push(c.delta);
    }
    expect(chunks.join("")).toBe("hello world");
    // Only the eligible candidate was ever contacted.
    expect(registry.attempts.map((a) => a.gatewayId)).toEqual(["g2"]);
  });
});
