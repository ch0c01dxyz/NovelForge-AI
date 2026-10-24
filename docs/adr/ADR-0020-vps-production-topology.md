# ADR-0020: VPS production topology — native systemd, distro PostgreSQL 18, Garage object storage

## Status

Accepted (2026-10-24, topology deployed to staging; general production release not approved)

## Context

First production-mode staging deployment of NovelForge to a dedicated Ubuntu 26.04.1 VPS
(4 vCPU / 7.7 GB RAM). Constraints and findings at deploy time:

- Project constitution (AGENTS.md §10) mandates Ubuntu installs with native
  tools, without Docker; Docker Compose remains an optional artifact.
- `ENVIRONMENT-PREFLIGHT.md` names PostgreSQL 16 / Redis 7 / Node 24 as the
  exercised baselines and requires distro-candidate inspection before
  installing anything.
- Ubuntu 26.04 ships PostgreSQL 18.6 with `postgresql-18-pgvector` 0.8.1;
  PostgreSQL 16 has no distro candidate, and PGDG repositories for 26.04 were
  deliberately not added (brand-new release, avoid third-party apt risk for a
  single-node deploy).
- MinIO community server binaries were withdrawn (dl.min.io returns 410 Gone;
  GitHub releases carry no binaries). A self-hosted S3-compatible endpoint is
  required by `@novelforge/config` (`S3_ENDPOINT`, keys required at boot).
- The VPS already ran nginx 1.28 with a certbot-managed Let's Encrypt
  certificate for novamind.my.id and commented proxy scaffolding.

## Decision

1. **Native + systemd** for all services (no Docker): akanesia-router,
   nf-api, nf-web, nf-worker run as the dedicated `novelforge` user;
   PostgreSQL/Redis/Garage/nginx via their own systemd services.
2. **PostgreSQL 18.6 + pgvector 0.8.1 from the distro** instead of the PG16
   baseline. Prisma 7 accesses PG through `pg` (adapter-pg); schema uses only
   features available on 18 (vector(1536), tsvector GIN, btree_gist — all
   verified by `prisma migrate deploy` applying every migration cleanly on an
   empty database). pgvector 0.8.1 is below 0.8.6; the version does not prove
   compatibility with behavior described for 0.8.6 in schema comments. Evidence
   is limited to the migration and restore checks recorded in
   `docs/14-progress/STAGING-AUDIT-2026-10-24.md`; embedding and full-scale
   retrieval acceptance remain separate release gates.
3. **Garage v2.1.0** as the S3-compatible object store (single static binary
   from the official TLS host, single-node layout `replication_factor = 1`,
   bound to 127.0.0.1:3900, bucket `novelforge`, dedicated key). The
   application speaks the generic S3 API; nothing in the codebase depends on
   MinIO-specific administration.
4. **Reuse the existing nginx + certbot** instead of installing Caddy (Caddy
   was installed during the attempt, then purged after the conflict was
   found). Proxy target is nf-web (:3001); `/api/**` continues to flow through
   the Nitro proxy to nf-api (:3000) per the existing architecture.
5. **akanesia-router** replaces OmniRoute as the LLM gateway implementation.
   The NovelForge gateway adapter (`OmniRouteGateway`, packages/ai-core) is
   OpenAI-compatible (`/v1/chat/completions`, `/v1/models`, Bearer auth), so
   the swap is configuration-only: `OMNIROUTE_BASE_URL=http://127.0.0.1:20128`
   + `OMNIROUTE_API_KEY`. Router runs loopback-only with
   `REQUIRE_API_KEY=true`; dashboard access is via SSH tunnel.

## Alternatives considered

- **Docker Compose**: rejected — constitution mandates native Ubuntu installs
  for this workflow; systemd units are simple enough at this scale.
- **PGDG PostgreSQL 16**: rejected — adds a third-party apt repository to a
  brand-new Ubuntu release for no functional gain; PG18 satisfies every
  schema/migration requirement (proven by clean full-migration run).
- **SeaweedFS**: rejected at probe time — its GitHub releases no longer carry
  the plain `weed` linux_amd64 asset; Garage's static musl binary from the
  official host is the smaller, boring dependency.
- **Caddy**: rejected — would require displacing the already-working nginx +
  live certificate.

## Consequences

- Baseline deviation (PG18/Redis 8) is now the staging reality; the
  preflight document remains authoritative for development/test hosts.
- Garage runs `replication_factor = 1`: single-node, no data redundancy.
  Backups (BACKUP-RESTORE-RUNBOOK.md) are the only durability story; scheduled
  backups were initially an open follow-up recorded in progress.md. The later
  staging audit records the implemented PostgreSQL timer and restore evidence;
  object-store/router backup coverage and off-host recovery remain separate gaps.
- Router upstream provider keys are configured manually via the dashboard;
  `OMNIROUTE_API_KEY` in NovelForge's env is a router-issued key and must be
  rotated there if leaked.
- All secrets live in `/root/nf-secrets.env` and the two app `.env` files
  (mode 600); nothing secret is embedded in unit files or the repository.
