/**
 * Composition layer: Prisma-backed implementation of ai-core's
 * `GatewayRegistry` port.
 *
 * This is the only place `@novelforge/ai-core` meets
 * `@novelforge/database` (ADR-0001 §3/§5) — ai-core stays ORM-free.
 *
 * Credentials are decrypted here, per call, and handed to the adapter in
 * memory only. They are never returned to a route, never logged, and
 * never included in an error (CLAUDE.md §14).
 */
import type { NovelForgeDb } from "@novelforge/database";
import { CIRCUIT_THRESHOLD, decryptCredential } from "@novelforge/ai-core";
import type {
  AttemptRecord,
  GatewayRecord,
  GatewayRegistry,
} from "@novelforge/ai-core";
import type { ModelProfile } from "@novelforge/ai-core";

export function createGatewayRegistry(
  db: NovelForgeDb,
  encryptionKey: string,
): GatewayRegistry {
  return {
    async listGateways(): Promise<GatewayRecord[]> {
      const rows = await db.aIGateway.findMany({
        orderBy: [{ priority: "asc" }, { name: "asc" }],
      });
      const out: GatewayRecord[] = [];
      for (const row of rows) {
        // A gateway whose credential cannot be decrypted (rotated key,
        // corrupt row) is skipped rather than crashing the whole route —
        // it is a configuration fault, not a request failure.
        let apiKey: string;
        try {
          apiKey = decryptCredential(row.credentialCiphertext, encryptionKey);
        } catch {
          continue;
        }
        out.push({
          id: row.id,
          name: row.name,
          baseUrl: row.baseUrl,
          apiKey,
          timeoutMs: row.timeoutMs,
          enabled: row.enabled,
          priority: row.priority,
          weight: row.weight,
          health: row.health,
          consecutiveFailures: row.consecutiveFailures,
          latencyMs: row.latencyMs,
          maxRetries: row.maxRetries,
        });
      }
      return out;
    },

    async resolveProfile(profile: ModelProfile) {
      const mappings = await db.modelProfileMapping.findMany({
        where: { profile, enabled: true, model: { enabled: true, gateway: { enabled: true } } },
        orderBy: { priority: "asc" },
        select: { modelRef: true, model: { select: { modelId: true, gatewayId: true, capabilities: true } } },
      });
      return mappings.map((m) => ({
        modelRef: m.modelRef,
        gatewayId: m.model.gatewayId,
        modelId: m.model.modelId,
        capabilities: m.model.capabilities,
      }));
    },

    async recordAttempt(generationId: string, attempt: AttemptRecord) {
      await db.generationAttempt.create({
        data: {
          generationId,
          attemptNumber: attempt.attemptNumber,
          gatewayId: attempt.gatewayId,
          modelId: attempt.modelId,
          requestedModelId: attempt.requestedModelId ?? null,
          reportedModelId: attempt.reportedModelId ?? null,
          inputTokens: attempt.inputTokens ?? null,
          outputTokens: attempt.outputTokens ?? null,
          status: attempt.status,
          errorCategory: attempt.errorCategory,
          errorMessage: attempt.errorMessage,
          latencyMs: attempt.latencyMs,
          endedAt: new Date(),
        },
      });
    },

    async updateGatewayHealth(gatewayId, outcome) {
      if (outcome.ok) {
        // A successful request is not a health check: it clears the
        // breaker and records latency, but must not advance
        // lastHealthCheckAt (that field means "last scheduled probe").
        await db.aIGateway.update({
          where: { id: gatewayId },
          data: {
            health: "HEALTHY",
            consecutiveFailures: 0,
            latencyMs: outcome.latencyMs,
            ...(outcome.probe ? { lastHealthCheckAt: new Date() } : {}),
          },
        });
        return;
      }
      // A scheduled probe failure is not a request failure: record the
      // health/latency signal without tripping the breaker, otherwise
      // three missed probes would take a gateway out of rotation even
      // though no request ever failed.
      if (outcome.probe) {
        await db.aIGateway.update({
          where: { id: gatewayId },
          data: {
            health: "DOWN",
            lastHealthCheckAt: new Date(),
            lastErrorAt: new Date(),
            lastErrorCategory: outcome.category ?? "INTERNAL",
            latencyMs: outcome.latencyMs,
          },
        });
        return;
      }
      // Increment the breaker and set health in ONE statement: computing
      // health from a separate read-back lets two concurrent failures
      // both write DEGRADED after the count already crossed the
      // threshold, leaving a circuit-open gateway marked healthy.
      await db.$executeRaw`
        UPDATE ai_gateways
        SET consecutive_failures = consecutive_failures + 1,
            last_error_at = NOW(),
            last_error_category = ${outcome.category ?? "INTERNAL"}::"ErrorCategory",
            latency_ms = ${outcome.latencyMs},
            health = CASE
              WHEN consecutive_failures + 1 >= ${CIRCUIT_THRESHOLD}
                THEN 'DOWN'::"GatewayHealth"
              ELSE 'DEGRADED'::"GatewayHealth"
            END
        WHERE id = ${gatewayId}::uuid
      `;
    },
  };
}
