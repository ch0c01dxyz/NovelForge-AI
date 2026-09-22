# Deployment --- Windows & Ubuntu

## Supported development/host strategy

Canonical deployment path is Docker Compose.

Windows: - Docker Desktop with WSL2 backend recommended. - Repository
must not depend on Windows-only paths or shell behavior.

Ubuntu: - Docker Engine + Compose plugin.

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
