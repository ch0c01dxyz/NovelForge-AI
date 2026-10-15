# NF-WF-052 — Approved anomaly response amendment

Date: 2026-10-15. Status: AUTHOR APPROVED; implementation pending.
The author explicitly accepted adding the proposed anomalies object and
applying it to the isolated candidate. This is direct conversational approval,
not a reviewer verdict or an inference from memory. No further policy approval
is needed for this slice.

## Precedence and preserved scope

This files the decision proposed in
`NF-WF-052-anomalies-decision-proposal-2026-10-15.md`, including its two LOW
wording corrections to the retained separately reviewed drafting artifact
SHA256 `4ed6749f44fa9c395266d6c7d13ee39dd5fab62f63ba0fd011311b7bfa10165a`.
Preserve the proposal and all earlier frozen artifacts. This amendment
supersedes conflicting noncanonical-surfacing instructions under addendum
section 5 and extends A1.4's response bound as stated below. It does not
reopen canonical ordering, cap20, routes-only, provenance, freshness, as-of,
server authorization or canonical overflow semantics.

## Approved response contract

`excluded[]` contains only selected canonical candidate exclusions, reason
MISSING or UNRESOLVABLE_SOURCE. Its length is at most selected candidates,
which is at most MEMORY_ARC_SCOPES_MAX.

Add one sibling object under `global`:

```
anomalies: {
  total: number,
  surfaced: Array<{ arcScope: string, sagaId: string }>,
  complete: boolean
}
```

- `total` is the exact distinct noncanonical scope count for the inspected
  novel view, grouped before COUNT, using the same novel-scoped predicate as
  the bounded detection query. One returned aggregate row does not imply a
  constant-cost scan.
- `surfaced` contains at most MEMORY_ARC_SCOPES_MAX distinct scopes in
  `(MIN(created_at), scope)` order, raw text preserved. Use the shared cap,
  currently 20, rather than an independent literal/configuration.
- Every surfaced item means UNRESOLVABLE_SOURCE; this constant reason is
  intentionally omitted from its shape. Raw sagaId is diagnostic text and
  does not prove a valid/existing Saga identifier.
- `complete` equals `total === surfaced.length`. An inspected view with no
  anomalies returns `{ total: 0, surfaced: [], complete: true }`.
- Noncanonical diagnostics do not consume the canonical window and do not
  enter scopes[], excluded[] or canonical overflow. Do not silently slice
  exclusions or shrink the canonical window.
- Preserve existing empty/no-head behavior and document its no-inspection
  short circuit; an empty view must not be described as proof of database
  health. Do not add a new metadata policy without evidence of a real need.

Absolute bounds: scopes <= cap; excluded <= selected <= cap;
anomalies.surfaced <= cap; one exact anomaly count and one canonical overflow
object. No response grows with total scope count.

Required combined fixture: 20 selected MISSING plus 20 malformed scopes
produces excluded=20, anomalies.total=20, surfaced=20, complete=true.
Required tail fixture: 25 malformed scopes yields total=25, surfaced=20,
complete=false. Canonical-only responses have zeroed anomalies and unchanged
existing canonical values. Multiple projection rows of one malformed scope
must count once.

## Authorized execution and verification

Implement only the approved response change in the existing isolated NF052
candidate. Update additive types, construction and affected/new focused API
tests within the existing allowed paths. Reuse the retained guard and fixture
evidence; preserve prior patch76e4d435 and v2 diff31bb473e artifacts.
Run affected memory suites, relevant backend typechecks and scoped lint;
obtain separate review of the exact final diff. Produce a complete source-only
current-main-WIP-relative patch with proper new-file metadata and dry-run
applicability, preserving NF051 WIP. Coordinator owns shared evidence docs.

No UI, compiler, LLM, worker, schema/migration artifact, runtime restart or
acceptance-data change. Suite-owned scratch fixtures are allowed. No main
integration, staging, commit, push, Git merge, deployment or destructive
cleanup is authorized. Max three children including reviewers.
