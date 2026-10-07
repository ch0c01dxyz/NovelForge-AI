# NF-WF-038 — Portable agent-template parsing

Status: IMPLEMENTED / REVIEWED. Baseline: 36519e2.
Owner: current Codex implementer. Reviewer: separate review_recovery_034 actor.
Goal: close GAP-113; make checked-in agent templates load on Windows CRLF and
Ubuntu LF without changing semantic contracts or relaxing frontmatter validation.
Reading: constitution, GAP-113, workflow-template loader/callers/tests, E2E seed.
Dependency: NF-WF-037 pushed; release battery stopped at the new parser defect.
Allowed: workflow-template parser and targeted regression test, task/issue/progress
and release receipt. Forbidden: malformed-frontmatter acceptance, schema/model/auth
changes, production data reset, editing all template files to conceal the parser bug.
Inputs/outputs: same AgentSpec; normalize line endings at the shared parser boundary.
Invariants: required fields remain validated here; downstream schemas unchanged; equivalent LF
and CRLF files produce equivalent AgentSpec, including prompt body.
Acceptance: LF/CRLF equivalence test plus invalid-frontmatter refusal; targeted
template suite, typecheck/lint and separate exact-diff review; fresh release attempt.
Commands: pnpm exec vitest run packages/workflow-templates; pnpm lint/typecheck.
Prerequisites: installed workspace deps; no services needed for parser tests.
Migration/rollback: none; revert parser fix only, immutable story data unaffected.
Handoff: verified commands here/CURRENT; Engram runtime attribution unavailable.

Contract APPROVE by review_recovery_034. Existing parser checks required fields,
not role/profile schemas; normalize once and test LF/CRLF/lone-CR equivalence.

Verification: real Windows E2E failed before collection at36519e2; after fix,
workflow-template10/10 with newline/negative regression. Template typecheck and
targeted lint exit0. Exact-diff review_recovery_034 APPROVE, no findings.
