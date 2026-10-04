# Coding environment preflight — Ubuntu native and Windows Docker reuse

Status: mandatory environment policy for every model/role. Setup commands are
instructions, not execution receipts. Issue: GAP-027. Follow the constitution
and the current task's exact scope; provisioning does not approve implementation.

## Detect, inspect and reuse first

Record OS/release, architecture, source revision, installed tool versions,
service endpoints and task prerequisites with credentials redacted. Inspect
`package.json`, the lockfile, `.env.example` and the selected tests. Never reuse
another host's absolute paths, localhost ports or Engram session identity.

On Ubuntu, this preflight is required. Install/configure missing prerequisites
needed by the task before implementation or runtime verification. Reuse
compatible installed/native or supplied services; do not reinstall everything.
Do not install Docker, Docker Compose or a container runtime for this workflow.
For documentation-only review, do not provision unused databases/gateways.

On Windows, use the author's existing running Docker services and data. Native
installation instructions below do not apply. Inspect `docker ps`, published
ports and health first; do not create a replacement stack, run compose down,
remove volumes, reset data, change credentials or restart healthy containers.
Use existing data for authorized nondestructive reads; run mutation/migration
tests only in confirmed dedicated scratch databases, never the working database.

## Ubuntu tools and services

| Requirement | Selection and validation |
|---|---|
| Git, certificates, curl | Clone/read the project and retrieve verified official packages |
| Node.js | Satisfy the repository engines and dependencies; Node 24 is the previously exercised baseline. Verify compatibility before choosing another supported version |
| pnpm | Use the exact `packageManager` value in package.json, currently 12.5.1; no npm/yarn lockfile substitution |
| PostgreSQL + client | PostgreSQL 16 matches the existing infrastructure/test baseline; install matching pgvector binaries and verify SQL connectivity |
| Redis | Existing baseline Redis 7; verify the task's actual endpoint and PONG before queue/API readiness checks |
| Python 3, build-essential, pkg-config | Install when verification helpers or native dependency/extension compilation need them |
| Gateway, S3-compatible storage, browser tooling | Configure only when the selected task requires real integration; do not invent endpoints/keys or install every optional tool |
| Engram MCP / worker harness | Verify actual availability on this host; host hook owns session registration. Record missing capability and use the existing fallback protocol |

Inspect package availability and reuse existing tools. On a dedicated Ubuntu
development host with installation privileges, missing prerequisites can be
installed through its package manager. Do not upgrade shared services blindly.

```bash
cat /etc/os-release
uname -m
git --version
node --version
pnpm --version
psql --version
redis-server --version
```

Install the missing basic tools as needed:

```bash
sudo apt-get update
sudo apt-get install -y git curl ca-certificates
```

Install Node through the environment's approved version manager or a verified
[official Node distribution](https://nodejs.org/en/download). Check downloaded
archive signatures/checksums; do not blindly pipe a remote installer into a
privileged shell. Install the pinned pnpm through an existing user-level manager
or a private prefix, without changing the repository's dependency versions:

```bash
npm install --prefix "$HOME/.local/share/novelforge-tools" pnpm@12.5.1
export PATH="$HOME/.local/share/novelforge-tools/node_modules/.bin:$PATH"
pnpm --version
pnpm install --frozen-lockfile
```

For PostgreSQL 16/pgvector, inspect `apt-cache policy` first. If the Ubuntu
repository lacks the required packages, configure the official
[PostgreSQL Ubuntu repository](https://www.postgresql.org/download/linux/ubuntu/)
for the actual release/architecture. Then install only the missing packages whose candidates meet the selected
versions. If the distro Redis candidate does not satisfy Redis 7, use the
[official Redis Linux installation guidance](https://redis.io/docs/latest/operate/oss_and_stack/install/install-redis/install-redis-on-linux/)
for a compatible native package; do not silently accept an incompatible version.
The following command is an example package list, not permission to upgrade
already compatible shared services:

```bash
sudo apt-get install -y postgresql-16 postgresql-client-16 postgresql-16-pgvector redis-server
```

The [pgvector installation guide](https://github.com/pgvector/pgvector#installation)
describes matching extension packages/builds. Start only the required services,
using the host's service manager. Use `systemctl` where available; a minimal
Ubuntu runner may need native processes instead. Lack of systemd does not
justify installing Docker. Record startup failures as blockers, not successes.

## Credentials, connectivity and database isolation

Copy `.env.example` only if a local `.env` does not already exist, then configure
private host-specific values. On native Ubuntu, Compose names `postgres`,
`redis` and `host.docker.internal` are not automatically valid: use the actual
service hosts/ports. Keep secrets out of Git, command output and memory.
Windows uses its existing container endpoints and authorized credentials.

Create separate development/test database roles and databases as needed on an
isolated development instance. Check each selected suite: many create/drop
their own `novelforge_test_*` database through the `/postgres` admin database,
so CREATEDB permission and pgvector extension provisioning are prerequisites.
Some extensions require elevated rights during migration; configure a dedicated
test-instance role or administrator-provisioned extension strategy. Never grant
an agent superuser access to a shared/live database merely to pass a test.

Before test preparation, explicitly confirm host, port, role, scratch database
names and ownership. Check PostgreSQL server version, vector availability and
Redis PONG on those endpoints. Installing the extension package is not the same
as enabling `vector` in each newly created database. Inspect the repository's
migrations; do not edit applied migration history or bypass failed deployment.

`pnpm --filter @novelforge/database db:test:prepare` terminates connections and
recreates `novelforge_test`; some test suites recreate additional named test
databases. Run only on a confirmed disposable instance/namespace with no other
test owner. Never point these commands at the author's working data. Its helper
prints a connection URL: redact credentials from captured receipts and memory.

## Verification and handoff

Run the current task's targeted commands, then applicable lint/typecheck/build
checks. Do not treat successful installation, zero selected tests or unavailable
services as a passing workflow. Record actual commands, versions, selected test
counts, failures and untested paths in progress/test-matrix; unresolved problems
belong in ISSUES-AND-GAPS.md. Never claim Ubuntu validation from a Windows run.

The legacy `scripts/verify-clone.sh` and `.ps1` include a Compose-config check
and are Compose-specific receipts. On native Ubuntu, run their relevant project
checks individually; do not install Docker to satisfy the final Compose step:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
# After confirming disposable database prerequisites, run the task tests.
pnpm -r --filter './apps/*' build
```

Full DB/E2E/release checks still require the task's explicit evidence. If package
repositories, permissions, credentials or tools are unavailable, record the
exact blocker and continue independent review/preparation; never weaken
authorization, skip required tests or replace real infrastructure with fake success.
