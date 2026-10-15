# Dispatch Manifest — NF-WF-052 Global Novel Memory (L5 union read)

Date: 2026-10-14. HEAD: 50609c0d2704380ac2b48fa5eb01164fe8e858ca.
Purpose: dispatch preparation record for the NF-WF-052 implementation. This
manifest authorizes no implementation by itself; see §5 (pending decisions)
and the status line in §7.

## 1. Identity and contract chain

| Artifact | File | Status | sha256 |
|---|---|---|---|
| Original contract | tasks/NF-WF-052-global-memory-union-read.md | PLANNED (READY-gated on author decisions) | ccffa3bb4f40d303551992f75f3431a51217513ee6ef4921812c55ded41793a3 |
| Amendment | tasks/NF-WF-052-amendment-2026-10-14.md | in force (output shape, overflow aggregates, reason enum) | 7075d793d3974d8d5478bf9270b2e41ae2e9e64096836edea46648507d5d7f04 |
| Correction | tasks/NF-WF-052-correction-2026-10-14.md | in force where preserved | 1febd2d236277d74bca47893accd07b9cb02c21715ff10896d379c47770162b2 |
| Addendum | tasks/NF-WF-052-addendum-2026-10-14.md | in force; supersedes P/counting/boundary mechanics per its §6 map | 7bd1074cf628e146b834b62243ee4fcaf86d428102b1670419b832f0bfb49c0b |

Hashes computed this session via `sha256sum tasks/NF-WF-052-*.md` (OBSERVED);
all four match the frozen chain values recorded 2026-10-14.

## 2. Allowed paths (original Scope section, addendum-consistent)

- packages/ai-services/src/memory.ts — add `readGlobalMemory` (L5 union) to
  `createMemoryServices`; extend nothing else.
- packages/memory/src/types.ts — new `GlobalMemoryResult` (+ per-arc entry
  shape) as NEW exported types only; do not alter `MemoryBlock`,
  `RecallNovelResult`, or `MemoryScopeStatus`.
- packages/memory/src/constants.ts — add `MEMORY_ARC_SCOPES_MAX` (default
  20, see §5) — a bound, not configuration plumbing.
- apps/api/src/memory-routes.ts — add the single GET route
  (`GET /api/workspaces/:workspaceId/novels/:novelId/memory/global`).
- New focused test suite beside apps/api/src/memory.test.ts.

Forbidden: any Prisma schema change/migration/new stored projection; any
model/LLM call or gateway use; compiler wiring (no producer-side context
build); ADR-0017 changes; any change to recallNovel, freshness, or rebuild
paths. Everything not listed as allowed is forbidden.

## 3. Dependencies (status copied from original contract)

| Dependency | Status |
|---|---|
| NF-WF-009 | MERGED (main tree) |
| NF-WF-030 | MERGED (main tree) |
| NF-WF-051 | MERGED (main tree, per checkpoint #269) |
| ADR-0017 | NOT a blocker; untouched (PROPOSED only) |

## 4. Verification commands — PROPOSED (finalize at dispatch)

- `pnpm vitest run <new-suite-path> apps/api/src/memory.test.ts`
- Scoped lint/typecheck: `pnpm -F @novelforge/web exec tsc --noEmit` and
  repo lint scoped to the five allowed paths (actual filter names verified
  by the implementer before first run).
- Grep-based contract checks (addendum §8, extends correction §7):
  - Query P carries `NOT EXISTS` against `sagas` (novel-scoped); P's
    select/count/id contain no saga-backed scope.
  - No dedupe-by-saga-id step and no intersection JOIN anywhere in the read
    path; `overCapCount` is a two-term sum.
  - P count is GROUP BY-scoped (per-scope MIN(created_at)), not a global
    aggregate.
  - One global boundary `lastKey` (normalized (createdAt, id)); no
    per-source last-selected keys.
  - Zero model calls (no gateway import); summary/summaryStatus remain
    null/SKIPPED on all returned blocks.

## 5. Pending author decisions — ALL PENDING; no implementation until recorded

1. Arc ordering policy. Default (proposed): normalized key (createdAt, id).
2. `MEMORY_ARC_SCOPES_MAX` cap value. Default (proposed): 20.
3. Compiler adoption. Default (proposed): routes-only (endpoint composes and
   returns the view; the NF-WF-003 context compiler is NOT wired).

All three are PENDING despite recorded defaults. ADR-0017 and NF-WF-053 are
NOT gates for this dispatch.

## 6. Required explanation — "Oldest-created 20 arcs and routes-only behavior"

Selection. The endpoint resolves the novel's arc scopes from two disjoint
sources: source S — every Saga row of the novel (the sole owner of
saga-backed candidates), ordered
`ORDER BY created_at ASC, id ASC`; source P — orphan arc projections (arc
scopes with no backing saga), contributing key `(MIN(created_at), scope)`.
A selected saga scope with zero projection rows is not served as an entry —
it is returned in `excluded[]` with reason MISSING (original Invariant 2).
Under the addendum's normalized key `(createdAt, id)` (with §5 domain
agreement: P's id part is the scope string, S's the saga uuid), the two
lists merge into ONE ordered window. The first 20 entries of the MERGED list
(cap default, decision 2) are the selected arcs; their blocks are composed
via the existing readBlock path (live head or as-of mode) with derived
freshness and full provenance.

Overflow is surfaced, not silent. Entries 21 onward of the merged list are
NOT dropped: each is returned in `excluded[]` with reason `OVER_CAP`. The
global boundary itself is `lastKey` = the normalized key of
the CAP-th (20th) merged entry; `firstExcludedOrderingKey` is the minimum
key strictly beyond it (the normalized key of merged entry 21) — these are
two different keys and must not be conflated. The response additionally
carries `overCapCount` (exact, a two-term sum of the S-side and P-side
overflow counts — no intersection JOIN, no fallback counting),
`overCapArcIds` (the first 50 merged overflow ids, bounded prefix), and
`firstExcludedOrderingKey`. MISSING and UNRESOLVABLE_SOURCE remain valid
exclusion reasons per the amendment's enum.

Routes-only. The endpoint composes and returns this read-only projection and
nothing else. Nothing consumes it in generation: the NF-WF-003 context
compiler is NOT wired to it (compiler adoption is pending decision 3). There
is no write path, no rebuild trigger, no canon effect — summaries stay
null/SKIPPED, no stored projection is created, and the output never creates,
updates, approves, or supersedes anything (Invariant 3/6/9, original §6
read-only invariant). `arcScopesMax` is echoed in the payload so consumers
can interpret the cap boundary.

## 7. Status

NOT READY — blocked solely on the three pending author decisions in §5.
Addendum APPROVE status retained. The seven-case proof (addendum §7) is
retained as the acceptance reference for the implemented semantics.
