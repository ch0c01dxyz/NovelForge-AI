# Deployment --- Windows & Ubuntu

## Supported development/host strategy

Coding environments follow the mandatory
[environment preflight](ENVIRONMENT-PREFLIGHT.md):

- Ubuntu: native Node/pnpm, PostgreSQL/pgvector and Redis as required by the
  selected task; install missing prerequisites without Docker.
- Windows: reuse the author's existing running Docker services/data, inspect
  health/ports and isolate scratch tests; do not recreate/reset the stack.

Docker Compose remains an optional deployment artifact. Historical Compose
receipts do not impose a Docker dependency on Ubuntu coding agents. Production
host preparation still needs its own approved deployment plan/evidence.
Repository code must not depend on Windows-only paths or shell behavior.

## Services

`web` Nuxt/Nitro\
`api` Fastify\
`worker` BullMQ worker\
`postgres` PostgreSQL + pgvector\
`redis` Redis\
`object-storage` S3-compatible service for local/dev if needed

OmniRoute may be external or separately deployed; configure by
environment.

## Environment principles

Provide `.env.example`; validate env on boot; never commit credentials.

Examples: DATABASE_URL REDIS_URL OBJECT_STORAGE\_\* OMNIROUTE_BASE_URL
OMNIROUTE_API_KEY or encrypted-secret bootstrap reference
APP_ENCRYPTION_KEY SESSION/AUTH secrets

## Production

Support reverse proxy/TLS, health/readiness checks, persistent volumes,
scheduled backups, log collection, job monitoring, and rolling
application updates where practical.

Do not make Kubernetes a Phase-0 requirement.

## M8 production release evidence

Before claiming production readiness, record the deployed source revision,
resolved configuration (secrets redacted), migration compatibility and real
start/readiness smoke tests on Windows/Ubuntu paths. Run a populated-data
upgrade and a backup/restore drill; choose and record recovery/latency/resource
budgets before measuring them. Do not infer backup health from job success alone.

Exercise worker restart, Redis outage, duplicate delivery, pending approval,
stale projections, scheduled release and graceful shutdown. Define alerting
for incomplete/stuck runs, failed rebuilds, gateway failures, queue backlog,
storage growth and backup failures. Provide retention/archive policy for
audit/generation/retrieval records without destroying required provenance.

Verify TLS/proxy streaming behavior, session/CSRF/rate limits, tenant isolation,
credential rotation, accessibility and measured long-novel load. Document a
rollback/forward-fix procedure that preserves committed revisions; no automatic
destructive schema rollback. Open P0/P1 issues block the affected release.
Release approval/deployment authorization is separate from a model marking
its implementation task complete.
