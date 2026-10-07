# NF-WF-040 — Portable export fixtures and save-race proof

Status: IMPLEMENTED / REVIEWED. Baseline: 68facd7.
Owner: current Codex implementer. Reviewer: separate review_recovery_034 actor.
Goal: close GAP-114's Windows byte-fixture failure and GAP-044's order-dependent
race assertion. Preserve export bytes and real concurrent-save behavior.
Reading: constitution, GAP-044/114, export renderer/generator/test and Git EOL
evidence, writer-ui save race and manuscript service.
Dependencies: NF-WF-039 stopped after API56/57 files,1033/1034 tests; one fixture
failure. Existing source exports LF; Git index stores LF but working fixture CRLF.
Allowed: narrowly scoped .gitattributes rules for the two export text fixtures;
restore their working bytes to the committed LF form; writer-ui race assertion;
task, issue register, verification/progress docs. Forbidden: changing exporter,
normalizing expected bytes in the test to hide drift, global autocrlf changes,
serializing/removing the concurrent-save test, production/schema/model changes.
Inputs/outputs: same byte-stable TXT/MD fixtures; race200/409 plus content matched
to the response that actually won, not array order.
Invariants: raw fixture byte equality retained; Windows/Ubuntu checkout LF;
one save wins and one loses; immutable version advances exactly once.
Acceptance: Git check-attr/ls-files EOL proof; export-render19/19; writer-ui
suite including unchanged concurrent requests and status-derived winner; targeted
lint/typecheck; separate exact-diff review; fresh final verification afterward.
Commands: API vitest export-render/writer-ui; git check-attr; lint/typecheck.
Prerequisites: existing PostgreSQL5433 and dedicated writer-ui scratch DB only.
Migration/rollback: none; revert attributes/assertion only. No author data mutation.
Handoff: actual counts and review in task/CURRENT; Engram attribution unavailable.

Contract and exact-diff review APPROVE by review_recovery_034. Observed:
export-render/writer-ui2 files30/30 tests; both fixtures i/lf w/lf with explicit
text eol=lf. Raw byte assertions and Promise.all preserved. API typecheck and
targeted lint/diff checks exit0. Fresh NF039 follows.
