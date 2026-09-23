# ADR-0001: Module boundary conventions and the contracts package

## Status

Accepted (2026-09-23)

## Context

NovelForge is a modular monolith (ADR-002) whose modules must stay
separable: the story-domain packages carry the core invariants
(CLAUDE.md §2), and SYSTEM-ARCHITECTURE.md states that "module
boundaries are enforced in code, contracts, repositories, events, and
tests." Before this ADR the boundaries existed only as prose in
documentation, so nothing prevented a domain package from growing a
dependency on HTTP handlers, UI code, or an LLM provider SDK.

`@novelforge/contracts` exists as the machine-readable boundary layer:
typed domain event names plus a module boundary map, as data only.

## Decision

1. **`@novelforge/contracts` is the single source of typed contracts.**
   It exports the canonical domain event names and Zod envelope
   placeholder (`events.ts`) and the module boundary map
   (`boundaries.ts`). Contracts are data and types only — no business
   logic, no provider SDK imports, no workspace imports (leaf package).
   Its only runtime dependency is `zod`.

2. **Domain packages must not import HTTP/UI/provider code.** The eight
   story-domain packages (story-core, story-intelligence,
   character-intelligence, relationship-intelligence, story-simulation,
   narrative-rhythm, endgame-intelligence, story-versioning) depend only
   on contracts/shared and, where needed, story-core and validation.
   Domain logic must not depend directly on HTTP/UI/provider
   implementations (CLAUDE.md §10).

3. **`ai-core` is the only provider-adjacent package.** All OmniRoute /
   gateway / provider-SDK concerns live there (CLAUDE.md §6). Retrieval
   may depend on ai-core for embeddings; no domain package may.

4. **`shared` has no domain dependencies.** Like contracts, shared is a
   leaf: pure utilities importable by everything, importing nothing from
   the workspace.

5. **`api` and `worker` are composition roots** and may import any
   package except `web`; `web` is frontend-only and imports just
   contracts and shared, talking to the API over HTTP.

6. **Boundaries are tested, not trusted.** A vitest test in
   `packages/contracts/boundaries.test.ts` parses the "Recommended
   monorepo" package list and the "Event model" names out of
   SYSTEM-ARCHITECTURE.md and asserts the boundary map matches, so
   documentation and contracts cannot silently drift.

## Alternatives

- **Prose-only conventions** — status quo; unenforceable, drifts.
- **ESLint import rules / dependency-cruiser per package** — enforce at
  lint time but scatter the boundary data across tool configs; can be
  layered on top later reading the same `MODULE_BOUNDARIES` map.
- **Separate microservices now** — rejected by ADR-002.

## Consequences

- Adding a package requires updating SYSTEM-ARCHITECTURE.md,
  `MODULE_BOUNDARIES`, and the boundary test together — a deliberate
  friction that keeps the architecture document authoritative.
- `mayImport()` is advisory data today; a lint rule (NF-0005 scope)
  should consume `MODULE_BOUNDARIES` to enforce it mechanically.
- Domain packages stay testable without HTTP, UI, or provider mocks.
