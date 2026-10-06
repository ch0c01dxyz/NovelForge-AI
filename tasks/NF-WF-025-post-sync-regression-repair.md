# NF-WF-025 — Post-sync regression repair

Status: IMPLEMENTED / REVIEWED (bounded scope). Baseline: 72b3948, 2026-10-07.
Implementer: current Codex actor. Reviewer: separate review_workflow_docs actor.

## Contract

Goal: restore truthful dispatch and verification, reject unsafe S2 metadata merges, preserve terminal/approval simulation states, and repair current lint/typecheck/accessibility fixtures.
Required reading: START-HERE, AGENTS, CURRENT, DELIVERY-PLAN, issue register; relevant merge, simulation, API wrapper callers and tests. Dependency evidence: committed NF-WF-024 implementation (55998d0) and red regressions on this host.
Allowed paths: semantic-merge service/tests; simulation-debugger service/tests; what-if accessibility test; story-versioning dependency-edges test; active startup/progress/delivery pointers, task status annotations and the single issue register.
Forbidden: production data, auth weakening, migrations, provider/model mandates, automatic branch provisioning, semantic whole-row application or unrelated feature expansion.
Inputs: existing MergeChange and simulation endpoints. Outputs: unchanged schemas and safer lifecycle outcomes; accurate handoff.
Invariants: coupled metadata remains conflicted; debugger never reopens COMPLETED or replaces PAUSED_PROPOSAL; no stepping at an approval boundary; authorization unchanged.
Acceptance: new regressions fail before repair and pass after; existing focused suites, lint and typecheck pass; accessibility tests assert real fixture rendering rather than error state; independent exact-diff review.
Commands: pnpm lint; pnpm typecheck; targeted vitest in API/web/story-versioning. Windows prerequisites: reuse nf-pg-5433 and Redis; only disposable novelforge_test_simulation_debugger database may be recreated by its suite. Ubuntu follows native preflight.
Migration/rollback: none; revert this bounded diff if required, without rewriting canonical data.
Handoff: record actual commands/results in CURRENT and GAP-099/102/103/104. GAP-100/101 remain unresolved pending contracts; no release completion claim. Engram attribution unavailable: use repository fallback; do not invent session identity.

## Verification receipt — 2026-10-07

Current Windows host: pnpm lint and pnpm typecheck exit 0. Semantic merge 23/23; debugger 12/12 on dedicated scratch PostgreSQL database; story-versioning 26/26; what-if accessibility 3/3. New semantic and two debugger regressions were observed failing before repair. Reviewer review_workflow_docs APPROVE (separate actor, no blocking findings). API proposal observation is not UI acceptance; key-based accessibility fixtures are not translated-locale evidence. Full release battery/e2e not run. GAP-099/102/103/104 resolved within this scope; GAP-100/101 remain blocked; platform release is not accepted.
