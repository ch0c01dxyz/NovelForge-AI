# NF-WF-052 — Anomaly response decision proposal

Status: PROPOSED; author approval required before filing an amendment or
implementation. Existing ordering/cap20/routes-only decisions stay approved.

This approval candidate incorporates the two LOW wording findings on the
separately reviewed proposal at
`.nf-batch-worktrees/nf052-a14-amendment-proposal.md`, SHA256
`4ed6749f44fa9c395266d6c7d13ee39dd5fab62f63ba0fd011311b7bfa10165a`.
That original remains frozen; its review is retained and is not represented
as a new review of this document. No production change is made here.

## Proposed author decision

Keep `excluded[]` exclusively for selected canonical candidate exclusions:
MISSING or UNRESOLVABLE_SOURCE. Its length cannot exceed selected candidates
or MEMORY_ARC_SCOPES_MAX. Move noncanonical diagnostic scopes to:

```
global.anomalies: {
  total: number,
  surfaced: Array<{ arcScope: string, sagaId: string }>,
  complete: boolean
}
```

- `total`: exact distinct-scope count using the same novel-scoped,
  noncanonical predicate as the detection query, grouped before counting.
  The aggregate returns one row; underlying scan cost is not claimed constant.
- `surfaced`: first at most MEMORY_ARC_SCOPES_MAX distinct scopes in
  `(MIN(created_at), scope)` order, raw text preserved. The cap is currently
  20; do not introduce an independent literal bound or configuration.
- Every surfaced entry has the contractual meaning UNRESOLVABLE_SOURCE.
  This constant reason is intentionally omitted from the entry shape;
  consumers must not infer another reason. Raw `sagaId` is diagnostic text,
  not proof of a valid or existing Saga identifier.
- `complete` is true exactly when total equals surfaced.length. An inspected
  view with no anomalies returns `{ total: 0, surfaced: [], complete: true }`.

Canonical selection, canonical overflow, provenance, freshness and all other
behavior remain unchanged. Noncanonical diagnostics never consume the
canonical window and never appear as canonical overflow or selected exclusions.
Preserve existing empty/no-head behavior; document its no-inspection short
circuit separately rather than claiming it scanned and proved database health.

Examples for an inspected novel:
- 20 selected MISSING + 20 malformed scopes: excluded=20, anomaly total=20,
  surfaced=20, complete=true.
- 25 malformed scopes: anomaly total=25, surfaced=20, complete=false.
- Canonical-only data: zeroed anomalies; existing canonical values unchanged.

This changes the response contract and the location of malformed-scope
diagnostics. The endpoint is still isolated, not shipped to main; no new UI
or compiler integration is included. One grouped count query is added. No
schema change, model call, canon mutation or runtime restart is needed.

## After approval only

File the reviewed amendment with these exact bound/reason corrections;
implement in the isolated candidate, retain combined saturation and tail
regressions, and verify focused suites and exact diff independently. Preserve
the previous patch. No main integration, staging, commit, push or deployment
is authorized by approval of this response contract alone.
