# NF-WF-026 — Production Worker AI Wiring (GAP-028)

Current status: IMPLEMENTATION COMMITTED (e23dd8d, closure annotation cc8d515), post-pull verification ongoing under GAP-106. The historical checkboxes below are the original acceptance checklist, not new dispatch instructions. No live provider deployment acceptance is inferred.
Historical contract status: APPROVED (round 2, 2026-10-07 — v1 CHANGES_REQUESTED, v2 APPROVE).

## Normative vs informative

Normative: the contract sections (Goal, Scope, Behavior and invariants,
Acceptance). Informative: rationale, examples, and appendices.

## Goal and reason

Close GAP-028: enable the production worker (`apps/worker`) to execute
AGENT, SKILL, and RETRIEVAL workflow steps by moving the AI, retrieval,
and context-compiler service factories from `apps/api/src` to a new
shared package `@novelforge/ai-services`. Currently these step kinds
fail on the production worker with a clear "not configured" error
because the factories live in `apps/api/src`, which `apps/worker` must
not import (NF-WF-004 contract forbidden path).

**Scope correction (per review P1-1):** `context-compiler.ts` is a pure
module (zero imports); the `ContextCompilerPort` the worker needs is
assembled from 7 tier-reader service factories. This contract scopes the
full transitive closure explicitly below.

This is M2/M8 infrastructure work. Its dependency is NF-WF-004
(durable workflow execution).

## Required reading

- `AGENTS.md` (constitution, especially §10 development rules, §12
  multi-LLM orchestration protocol)
- `docs/06-ai/MODEL-EVIDENCE-POLICY.md`
- `docs/implementation/ISSUES-AND-GAPS.md` (GAP-028)
- `packages/workflow-executor/ports.ts` (the `generate`, `retrieval`,
  `compiler` ports)
- `packages/workflow-executor/executor.ts` (how the ports are consumed)
- `apps/worker/src/workflow-jobs.ts` (current worker wiring)
- `apps/api/src/workflow-test-driver.ts` (reference wiring to mirror)

## Dependencies and evidence

- NF-WF-004: IMPLEMENTED (durable workflow execution; the executor
  ports exist)
- NF-WF-023: battery GREEN on current host (no regressions expected)

## Scope

### New package

Create `@novelforge/ai-services` (`packages/ai-services/`), following
the existing package conventions (package.json, tsconfig.json,
index.ts barrel). Allowed dependency direction (per review P3-2):
`ai-services → database, ai-core, auth, retrieval, shared`;
never the reverse. If `AuditService` types move into the new package,
`apps/api` imports the type from there (ripple noted).

### Allowed — modules to move (explicit list per review P1-2)

**Core AI path (3 factories):**
- `apps/api/src/services/ai.ts` → `createAiServices` (~1187 lines)
- `apps/api/src/services/retrieval.ts` → `createRetrievalServices`
  (~1167 lines)
- `apps/api/src/services/context-compiler.ts` →
  `fetchAndCompileContext`, `renderContextText` (pure functions,
  ~1479 lines, zero imports — move verbatim)

**Transitive dependencies (per review P1-2):**
- `apps/api/src/ai-registry.ts` → `createGatewayRegistry` (139 lines;
  clean, only needs `@novelforge/database` + `@novelforge/ai-core`)
  — **MOVE**
- `apps/api/src/services/platform.ts` → error classes
  (`BadGatewayError`, `ConflictError`, `NotFoundError`; 538 lines)
  — **MOVE** (no shared-package equivalent exists)
- `apps/api/src/services/audit.ts` → `AuditService` type (37 lines)
  — **MOVE** (type + factory if needed; `apps/api` re-imports
  from the new package)

**Tier-reader factories for the compiler (per review P1-1, option a):**
- `apps/api/src/services/canon.ts` (~2683 lines)
- `apps/api/src/services/planning.ts` (~874 lines)
- `apps/api/src/services/characters.ts` (~759 lines)
- `apps/api/src/services/relationships.ts` (~754 lines)
- `apps/api/src/services/narrative.ts` (~712 lines)
- `apps/api/src/services/memory.ts` (~377 lines)
- `apps/api/src/services/state-assembly.ts` (~671 lines)
- `apps/api/src/services/revisions.ts` → `readHeadRevisionId` only
  (extract the single function; do not move the entire module)

**Wiring:**
- New `createWorkerAiPath` function in `@novelforge/ai-services`
  that assembles `{ generate, retrieval, compiler }` from
  `{ db, audit, registry, encryptionKey, createGateway, tierReaders }`,
  mirroring `workflow-test-driver.ts`'s `createTestDriver` assembly.
- Update `apps/worker/src/workflow-jobs.ts` to call
  `createWorkerAiPath` with real dependencies.
- Update `apps/api/src` to import all moved factories from
  `@novelforge/ai-services` (no behavior change).
- **Production `createGateway` (per review P2-3):** the factory
  *code* moves with `ai-registry.ts`; the *configuration* (gateway
  records, encryption key) remains deployment-specific, sourced
  from environment variables in the worker's startup (mirroring
  the API's `buildApp` wiring). The contract does not specify
  production gateway credentials (author's deployment concern).

**Enforcement (per review P2-1):**
- Add ESLint `no-restricted-imports` rule in `eslint.config.js`
  (or equivalent): for `apps/worker/**`, forbid imports matching
  `apps/api/src/**`. 
- Add a negative test: a synthetic file importing from
  `apps/api/src` must be flagged by the rule (or the Verification
  grep below serves as the CI check).

### Forbidden

- Duplicating the service wiring into `apps/worker` (GAP-028
  explicitly forbids this).
- Behavior changes to any moved logic (this is a move, not a
  rewrite).
- New capabilities, new API routes, schema changes.
- Weakening any invariant from prior workflows.
- The new package must not import from `apps/api/src`.
- `apps/api/src/services/definitions.ts` (1239 lines) — **DO NOT
  MOVE** in this task. If `retrieval.ts` needs `appendVersionWithRetry`
  or `prismaCode` from it, extract only those functions to the new
  package (or inject as ports). Moving the entire module is out of
  scope.

### Inputs

- The modules listed in "Allowed" above.
- The `WorkflowExecutorDeps` ports in
  `packages/workflow-executor/ports.ts`.
- The worker's `createWorkflowJobHandler` in
  `apps/worker/src/workflow-jobs.ts`.
- `apps/api/src/workflow-test-driver.ts` as the reference wiring.

### Outputs

- `@novelforge/ai-services` package with all moved factories.
- The worker constructs the real AI path via `createWorkerAiPath`.
- ESLint rule forbidding `apps/worker` → `apps/api/src`.
- `apps/api` imports from the new package; API behavior unchanged.

### Out of scope

- Production LLM gateway credentials/configuration (author's
  deployment).
- Performance optimization of moved services.
- New workflow step kinds.
- Moving `definitions.ts` in full (see Forbidden).

## Behavior and invariants

### Invariant 1 — Move, don't rewrite
The service logic moves verbatim (modulo import path updates and
dependency injection). No behavior change. Existing tests for the
moved services must pass unchanged (modulo import updates).

### Invariant 2 — No forbidden imports
After the move:
- `apps/worker` must not import from `apps/api/src` (enforced by
  ESLint `no-restricted-imports`).
- `@novelforge/ai-services` must not import from `apps/api/src`.
- `apps/api` may import from `@novelforge/ai-services`.

### Invariant 3 — Dependency hygiene
The moved factories must not depend on HTTP/Fastify/API routes.
All transitive `apps/api/src` dependencies are listed in Scope;
any not listed must be converted to injected ports (and the
contract amended).

### Invariant 4 — Test coverage
The worker's AI path is proven by an end-to-end test: a workflow
with an AGENT step executes to completion on the worker with a
fake gateway (mirroring `workflow-test-driver.ts`).

**GAP-028 fidelity note (per review P2-4):** GAP-028's closure
check specifies "in a staging deployment." This contract accepts a
fake-gateway worker test as the close-out evidence because (a) the
production gateway configuration is the author's deployment
concern, not code; (b) the test exercises the exact code path
(factory → port → executor → step) that staging would; (c)
backends are MODEL_UNVERIFIED per GAP-013 regardless. The delta is
acknowledged here, not hidden.

## Acceptance

- [ ] All modules in the "Allowed" list live in
  `@novelforge/ai-services` (not `apps/api/src`).
- [ ] `apps/worker` wires the real `generate`, `retrieval`, and
  `compiler` ports via `createWorkerAiPath` (no "not configured"
  for AGENT/SKILL/RETRIEVAL).
- [ ] `apps/api` imports the factories from `@novelforge/ai-services`;
  API behavior unchanged.
- [ ] ESLint `no-restricted-imports` forbids `apps/worker` →
  `apps/api/src`; negative test passes.
- [ ] Worker end-to-end test: AGENT step executes to completion
  with fake gateway.
- [ ] Test suites pass (per review P3-1, explicitly):
  - `apps/api` vitest (full suite)
  - `apps/worker` vitest (full suite)
  - `packages/workflow-executor` vitest
  - `packages/ai-services` vitest (new)
- [ ] GAP-028 CLOSED with evidence.
- [ ] No new GAPs (or each is recorded with severity).

## Verification (parent)

- [ ] Contract reviewed APPROVE by separate actor (this is v2;
  re-review required).
- [ ] Implementation by separate actor from contract author.
- [ ] Diff review by separate actor (APPROVE or
      APPROVE_WITH_FINDINGS with fixes applied).
- [ ] `grep -r "from.*apps/api/src" apps/worker/src
      packages/ai-services/src` returns zero matches (excluding
      comments).
- [ ] Backends MODEL_UNVERIFIED per GAP-013 (standing).

## Amendment 1 — Three transitive module moves (2026-10-07)

**Status:** Documented deviation; moves verified correct by diff
reviewer (F4, CHANGES_REQUESTED → fixed).

The implementer moved three modules not on the contract's explicit
"Allowed" list. All three are transitive dependencies of listed
modules (verified via import grep); the moves were verbatim (no
logic changes):

| Module | Moved because | Imported by |
|---|---|---|
| `evidence-findings.ts` | Transitive dep of `state-assembly.ts` (listed) | `packages/ai-services/src/state-assembly.ts` |
| `policy-errors.ts` | Transitive dep of `narrative.ts` (listed) | `packages/ai-services/src/narrative.ts` |
| `revision-birth.ts` | Transitive dep of `state-assembly.ts` (listed) | `packages/ai-services/src/state-assembly.ts` |

**Rationale:** Per Invariant 3 (dependency hygiene), all transitive
`apps/api/src` dependencies of the listed modules must either move
or become injected ports. These three had no existing shared-package
equivalent and were small, cohesive units; moving them verbatim was
the minimal correct action. The alternative (port injection) would
have added indirection without benefit.

**Paperwork note:** This amendment documents the deviation after
the fact. The moves themselves were correct; the contract's
"Allowed" list is hereby extended to include these three modules.
No behavior change resulted.
