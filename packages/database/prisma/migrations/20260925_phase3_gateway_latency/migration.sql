-- Last observed gateway latency, used by LEAST_LATENCY routing.
-- Without a persisted observation the router had nothing to compare and
-- that strategy silently degraded to priority order.

-- AlterTable
ALTER TABLE "ai_gateways" ADD COLUMN "latency_ms" INTEGER;
