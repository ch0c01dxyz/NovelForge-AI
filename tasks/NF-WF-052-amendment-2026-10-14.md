# Amendment — Task NF-WF-052: Global novel memory (L5) union read of arc scopes

- **Date:** 2026-10-14
- **Status:** AMENDMENT — supersedes the conflicting sections of `tasks/NF-WF-052-global-memory-union-read.md` listed below; all other sections of the original remain in force.
- **Original preserved:** `tasks/NF-WF-052-global-memory-union-read.md`, sha256 `ccffa3bb4f40d303551992f75f3431a51217513ee6ef4921812c55ded41793a3`, byte-identical, untouched.
- **Supersedes:** original §Outputs (excluded/OVER_CAP shape and provenance sub-shape, amended per A5), §Behavior invariants 2 and 4 (discovery + bounded selection, amended per A2/A1), invariant 3 and 5 handling (FAILED-entry semantics and as-of discipline, amended per A3/A4), the happy-path discovery sentence in §Behavior, the failure-handling paragraph (excluded-reason enum now MISSING | UNRESOLVABLE_SOURCE — OVER_CAP removed), the negative-scenario bullet list in §Acceptance (amended per §B), and the required-reading list.
- **Not resolved here:** Open decisions 1–4 of the original remain OPEN author decisions. This amendment records **recommendations with effects**, not selections. The task is **not READY**.
- **Scope of this document:** design-contract text only. No implementation, no schema/model changes, no ADR-0017 selection, no NF-WF-053 authorization.

---

## A1. Bounded arc selection and bounded OVER_CAP reporting

**Amends:** §Outputs and Invariant 4 of the original.

**Conflict resolved:** the original caps *considered* scopes at `MEMORY_ARC_SCOPES_MAX` but simultaneously promises every over-cap arc in `excluded` — an unbounded output contradicting the bound.

**Amended semantics (single bounded rule):**

1. Candidate arc scopes are ordered by the deterministic ordering key (§A2). The first `MEMORY_ARC_SCOPES_MAX` candidates are **selected**; the rest are never enumerated entry-by-entry.
2. Over-cap arcs are reported as **exactly one aggregate object** on the response:

   ```json
   "overflow": {
     "overCapCount": 5,
     "overCapArcIds": ["…up to 50 saga ids…"],
     "firstExcludedOrderingKey": { "createdAt": "…", "id": "…" }
   }
   ```

   - `overCapCount`: total candidates beyond the cap (exact integer, cheap to compute alongside selection).
   - `overCapArcIds`: **truncated to the first 50** excluded ids in the same ordering; if `overCapCount > 50` the array is a prefix, and `overCapCount` is the authoritative total.
   - `firstExcludedOrderingKey`: the ordering key of the first excluded arc, so a consumer can resume/paginate later without this response growing with the novel.
3. `OVER_CAP` is **removed** from the `excluded[]` per-scope reason enum. `excluded[]` now carries only `"MISSING" | "UNRESOLVABLE_SOURCE"` (both naturally bounded: MISSING is bounded by the saga count under the same cap-aware discovery, and UNRESOLVABLE_SOURCE is an anomaly path — see §A5).
4. Output is bounded absolutely: ≤ `MEMORY_ARC_SCOPES_MAX` included entries + ≤ (selected candidates) excluded entries + 1 overflow object. Response size expectation at the default cap of 20: O(20) arc blocks, each a stored structural payload; no response grows with total saga count.

**Amended output shape (replaces the original §Outputs 200 body):**

```
200 {
  global: {
    scopes: ArcMemoryEntry[],          // ≤ MEMORY_ARC_SCOPES_MAX
    excluded: ExcludedScope[],         // reason: "MISSING" | "UNRESOLVABLE_SOURCE" only
    overflow: { overCapCount: number, overCapArcIds: string[] /* ≤50 */,
                firstExcludedOrderingKey: { createdAt: string, id: string } | null },
    asOf: { revisionId: string, chapter: null },
    arcScopesMax: number
  }
}
```

`overflow` is all-zero/empty (`overCapCount: 0, overCapArcIds: [], firstExcludedOrderingKey: null`) when nothing is over cap.

## A2. Arc discovery: projection rows ∪ outline-derived sagas (MISSING sagas surface)

**Amends:** §Behavior happy path and Invariant 2 of the original.

**Conflict resolved:** discovery from existing `memory_projection` rows alone cannot see sagas with **no** rows yet, yet the acceptance criteria require MISSING sagas to be reported.

**Amended discovery rule:** the candidate arc-scope set is the **union** of:

1. **Projection-derived arcs:** distinct `scope` values with prefix `arc:` over `memoryProjection` filtered to the novel (`distinct: ["scope"]`, the same pattern as `getMemoryStatus`, packages/ai-services/src/memory.ts:242-247, intersected with the novel's sagas for tenant isolation); and
2. **Outline-derived saga arcs:** every `Saga` row of the novel (id → `arc:{sagaId}`), which includes sagas that exist in the approved outline but have no projection rows yet.

Effect: a saga with no rows is a candidate, fails the freshness read as MISSING, and appears in `excluded[]` with `reason: "MISSING"` — satisfying the original acceptance criterion that was unreachable under projection-only discovery. The same union also fixes the as-of mode: a saga whose rows all postdate the as-of revision is correctly MISSING relative to R, not invisible.

**Ordering key over the union (deterministic):**

- For candidates backed by a `Saga` row (both sources): `(saga.createdAt, saga.id)` — the original Open decision 1 default, kept as the recommended default (see §C1).
- For an orphan arc scope (projection rows exist, saga row absent — only possible mid-cascade-delete): `MIN(memoryProjection.createdAt)` for that scope as `createdAt`, the scope's arc id as `id`. Documented so ordering is total and stable in every reachable state.

Selection (§A1) applies to this combined, totally ordered candidate list.

## A3. STALE / FAILED scopes are INCLUDED and flagged, never excluded

**Amends:** Invariant 2 wording of the original (any reading of "excluded" for stale/failed scopes is corrected).

**Amended rule:** an arc scope whose newest row is STALE or FAILED is an **included** `ArcMemoryEntry` carrying `freshness: "STALE" | "FAILED"` — it is never silently served as current and never dropped:

- `freshness: "FRESH"` — content served as current.
- `freshness: "STALE"` — content served, explicitly flagged as not reflecting the head (or the as-of revision R).
- `freshness: "FAILED"` — the stored FAILED row's `structural` payload (empty facts/threads/promises, per `processRebuild`'s FAILED-row create, packages/memory/src/rebuild.ts) is served with `freshness: "FAILED"`. `lastError` and `attempts` are **not** surfaced on this read path; diagnostics remain in `GET .../memory/status` (`getMemoryStatus`). The scope is never rendered as FRESH and never dropped silently.
- `freshness: "MISSING"` — never an included entry; appears in `excluded[]` with `reason: "MISSING"` (per-scope MISSING is a valid state, NF-WF-009 Invariant 9).

**Per-scope freshness semantics table (normative):**

| Derived freshness (Invariant 2, packages/memory/src/freshness.ts) | In response | Where | Entry fields | Notes |
|---|---|---|---|---|
| FRESH (newest OK row number == head number, or == R.number in as-of mode) | Included | `scopes[]` | full ArcMemoryEntry + provenance | current content |
| STALE (newest OK row number ≠ head/R number) | Included | `scopes[]` | full ArcMemoryEntry + provenance, `freshness: "STALE"` | flagged, not silently current |
| FAILED (newest row `buildStatus = FAILED`) | Included | `scopes[]` | full ArcMemoryEntry, `freshness: "FAILED"`, empty structural | flagged; no lastError/attempts here (use /memory/status) |
| MISSING (no rows, or no rows ≤ R.number in as-of mode) | Excluded | `excluded[]` | `{ arcScope, sagaId, reason: "MISSING" }` | valid state (Invariant 9); reachable for every outline saga via §A2 union discovery |
| Over cap (candidate ranked > MEMORY_ARC_SCOPES_MAX) | Excluded (aggregate only) | `overflow` | counted in `overCapCount`; id maybe in `overCapArcIds` (≤50) | never an entry in `excluded[]` (§A1) |
| UNRESOLVABLE_SOURCE (defensive; see §A5) | Excluded | `excluded[]` | `{ arcScope, sagaId, reason: "UNRESOLVABLE_SOURCE" }` | anomaly path, never silently merged |

## A4. As-of behavior (explicit `asOfRevisionId`)

**Amends/clarifies:** Invariant 5 of the original with the concrete `deriveAsOfFreshness` path.

- With `?asOfRevisionId=<uuid>`: resolve the revision (`db.revision.findUnique`); unknown or not this novel → 404; **cross-branch** (revision's `branchId` ≠ the checked-out branch, per NF-WF-020B/GAP-040 as implemented in `recallNovel`) → **400 INVALID_INPUT**. Same-branch resolution pins `(branchId, Revision.number)`.
- Per-scope read uses **`deriveAsOfFreshness`** (packages/memory/src/freshness.ts:36): the newest row with `sourceRevision.number ≤ R.number` **within the same branch**. Relative to R: row number == R.number → FRESH; older → STALE; FAILED row → FAILED; no rows ≤ R.number → MISSING (→ `excluded[]` via §A2).
- No entry may reflect a revision newer than R — guaranteed by the `number: { lte: revisionNumber }` where-clause.
- Without `asOfRevisionId`: main-branch head via `deriveFreshness` (packages/memory/src/freshness.ts:108). A novel with no head returns **200** with `scopes: []`, `excluded: []`, zeroed `overflow` (matching `recallNovel`'s no-head behavior; never a 500).
- The query parameter name is `asOfRevisionId` (camelCase, zod-validated uuid in the route, mirroring the as-of route's `revisionId` semantics).

## A5. Provenance per entry and the UNRESOLVABLE_SOURCE guard

**Amends/clarifies:** Invariant 3 of the original.

Every included `ArcMemoryEntry` carries provenance tracing the composed block to its stored row:

```
provenance: {
  revisionId: string,        // the scope's sourceRevisionId (verbatim)
  builtAt: string,           // ISO-8601 from the stored row
  sourceRevisionNumber: number,
  arcScope: string,          // "arc:{sagaId}"
  sagaId: string
}
```

Fact ids inside `structural` are preserved verbatim from the stored row — no re-derivation, no reshaping that could drop fact ids. `summary: null`, `summaryStatus: "SKIPPED"` on every returned block (Q1, unchanged).

**UNRESOLVABLE_SOURCE is a defensive path, not an expected state.** `memory_projections.source_revision_id` is an FK to `revisions` with cascade delete (schema.prisma:2892-2894), so an orphaned row is unreachable under normal FK integrity — deleting a revision deletes its projection rows (which then reclassify the scope as MISSING). The guard exists for FK-integrity-violating states (e.g. restore/import tooling running with triggers disabled). Amended behavior: before freshness derivation, if the row's source revision does not resolve, the scope is **excluded** with `reason: "UNRESOLVABLE_SOURCE"` — never merged, never a 500, and the response never contains an unattributable entry. This guard also prevents a null-deref in the freshness join on such rows.

## A6. Explicit query/output bounds (normative)

| Bound | Value | Effect |
|---|---|---|
| Arc scopes considered per request | ≤ `MEMORY_ARC_SCOPES_MAX` (default **20**, new constant in packages/memory/src/constants.ts beside `MEMORY_RECONCILE_INTERVAL_MS` (:24)) | hard cap on included entries; remainder → `overflow` aggregate |
| Per-arc block cap | **none needed** | each included scope returns exactly one stored structural row (one `readBlock` per selected scope; no N+1 beyond that) |
| `overflow.overCapArcIds` | ≤ 50 ids | truncation is explicit; `overCapCount` is the authoritative total |
| Response size | O(`MEMORY_ARC_SCOPES_MAX`) blocks; independent of total saga count | no unbounded response in any novel state |
| Sub-queries | 1 distinct-scope query + 1 saga/outline-node query + per selected scope: 1 freshness read + 1 row read | same indexed per-scope reads as existing routes |

## B. Amended acceptance criteria — concrete negative-test fixtures

Fixture convention: `arcScope(sagaId)` denotes the canonical scope string `arc:${sagaId}` (packages/memory/src/constants.ts arcScope helper); tests may inline the literal string instead of importing the helper. — concrete negative-test fixtures

Replaces the negative-scenario bullet list in the original §Acceptance. All fixtures run against the dedicated `novelforge_test_memory` DB with the seed helpers of `apps/api/src/memory.test.ts` (`seedUser`, `seedNovel`, `makeBranch`, `makeRevision`, `makeChapter`, `processRebuild`); note `createNovel` seeds revision 1 and a main branch, so `makeRevision` appends numbers 2, 3, … Each fixture names its test and asserts exact response fields.

1. **`GET global flags STALE arc scope with correct metadata`** — seed: user `stale@example.com`, novel, `makeRevision` (→ rev 2), saga `S1` (`db.saga.create({ data: { novelId, kind: "SAGA", title: "S1", createdById } })`), `makeRevision` (→ rev 3, head), `processRebuild({ scope: arcScope(S1.id), sourceRevisionId: rev2.id })`. Call `GET .../memory/global`. Assert 200; `scopes` has exactly 1 entry with `freshness: "STALE"`, `sourceRevisionNumber: 2`, `provenance.revisionId === rev2.id`, `sagaId === S1.id`; `overflow.overCapCount === 0`.
2. **`GET global surfaces FAILED arc scope, never dropped or rendered FRESH`** — seed: `processRebuild({ scope: "arc:00000000-0000-4000-8000-000000000000", sourceRevisionId: rev.id })` (arc id of a nonexistent saga → build throws → FAILED row persisted, `buildStatus: "FAILED"`, attempts 1). Assert the response contains an entry with `arcScope: "arc:0000…"`, `freshness: "FAILED"`, `structural` equal to the empty stored payload `{ facts: [], threads: [], promises: [] }`; assert no `lastError` field on the entry; assert it is not in `excluded[]`.
3. **`GET global caps arc scopes and reports a bounded overflow aggregate deterministically`** — seed: 25 sagas `S1..S25` created sequentially (so `(createdAt, id)` ordering is insertion order), each with an OK `processRebuild` row at head (`arcScope(Si.id)`). Assert: `scopes.length === 20`; `scopes[i].sagaId` equals `S1..S20` ids in order; `overflow.overCapCount === 5`; `overflow.overCapArcIds` equals the `S21..S25` ids in order (≤ 50, here exactly 5); `overflow.firstExcludedOrderingKey` matches `S21`'s `{ createdAt, id }`; **repeat the call and assert byte-identical ordering** (determinism check); assert no `OVER_CAP` reason appears anywhere in `excluded[]`.
4. **`GET global excludes an unresolvable-provenance row instead of merging it`** — seed: create a revision `R`, then raw-SQL with FK enforcement disabled: `SET session_replication_role = replica;` insert a `memory_projections` row for `arcScope(S1.id)` with `source_revision_id` = a second revision's id, then `DELETE` that second revision (cascade suppressed by the replica setting, leaving the orphan row), `RESET session_replication_role;`. Assert 200; the response contains **no entry** with that arcScope in `scopes[]`; `excluded[]` contains `{ arcScope, sagaId: S1.id, reason: "UNRESOLVABLE_SOURCE" }`.
5. **`GET global rejects cross-branch asOfRevisionId with 400 INVALID_INPUT`** — seed: second branch via `db.novelBranch.create`, revision on it. Call `GET .../memory/global?asOfRevisionId=<foreign-branch-rev>`; assert 400, `{ error: "INVALID_INPUT" }`.
6. **`GET global requires authentication and workspace membership`** — no cookie → 401 `{ error: "UNAUTHENTICATED" }`; authenticated non-member → 404 (ADR-0004: does not reveal existence); owner → 200. **Correction to the original's "member without novel:read → capability refusal" fixture:** every workspace role (`VIEWER`, `EDITOR`, `AUTHOR`, `OWNER`) holds `novel:read` (packages/auth/authorization.ts `ROLE_CAPABILITIES`), so the refusal path cannot be seeded at role level for this route. The gate is still `requireCapability(membership.role, "novel:read")` via the shared `gate` helper; its 403 `FORBIDDEN` mapping is covered by `packages/auth` authorization tests, and this suite asserts the gate is exercised by the non-member 404 and the owner 200. A role-level negative test here would be dead weight.
7. **`GET global reports outline saga with no rows as MISSING`** — seed: saga `S2` with one `OutlineNode` (kind CHAPTER, order 1) and **no** projection rows; saga `S1` with an OK row. Assert `excluded[]` contains `{ arcScope: "arc:" + S2.id, sagaId: S2.id, reason: "MISSING" }` and `scopes[]` contains only `S1` — this fixture is the direct proof of the §A2 union-discovery fix (impossible under projection-only discovery).
8. **`GET global returns 200 empty union for a no-head novel`** — seed: novel, then `db.revision.deleteMany({ where: { novelId } })` and `db.novelBranch.updateMany({ where: { novelId }, data: { headRevisionId: null } })`. Assert 200 with `scopes: []`, `excluded: []`, `overflow.overCapCount === 0`, and (when the as-of variant is exercised) `asOf.revisionId === ""` — no 500.
9. **`GET global as-of never returns a row newer than R`** — seed: saga `S1`, OK rows at rev 2 and rev 3 (head). Call with `?asOfRevisionId=<rev2>`. Assert the entry has `sourceRevisionNumber: 2`, `freshness: "FRESH"` (== R.number per `deriveAsOfFreshness`); call with `?asOfRevisionId=<rev1>` (no rows ≤ 1) → `excluded[]` `reason: "MISSING"`.

Remaining acceptance items (real caller through registered Fastify routes, contract checks for zero schema change / zero model calls / summary null + SKIPPED, separate review) are unchanged from the original.

## C. Policy recommendations (with effects — NOT author selections)

### C1. Ordering policy: `(createdAt, id)` lexicographic
- **Recommendation:** keep the original default. `Saga` has no number column (schema.prisma:1749-1772); outline-node `order` is unique per parent only (`@@unique([sagaId, order])`), so a global chapter-position ordering requires an extra aggregation with tie-breaking anyway — and top-level sagas may have no outline nodes at all.
- **Effect on a novel with > 20 arcs:** arcs ranked 21+ by creation time appear **only** in the `overflow` aggregate (`overCapCount` + up to 50 truncated ids + `firstExcludedOrderingKey`); their blocks are **absent from the union** until the cap or the ordering decision changes. Consumers see the oldest-created 20 arcs, never a partial or shifted window between calls.
- **If the author prefers outline-position ordering instead:** same cap mechanics, different ranking; newly re-ordered arcs cross the cap boundary, so which arcs are block-visible vs overflow-only changes. The `firstExcludedOrderingKey` field is ordering-agnostic and supports either choice.

### C2. `MEMORY_ARC_SCOPES_MAX = 20`
- **Recommendation:** 20, as a named constant (a bound, not configuration plumbing — no env var, per the original's no-env-var rule).
- **Effect (quantified):** with 25 arcs, exactly 20 blocks are served and 5 are metadata-only; with 100 arcs, 20 blocks + `overCapCount: 80` + 50 truncated ids. Block payloads are stored structural JSON (facts/threads/promises), so the response stays O(20 × one row). Raising the cap later is a one-constant change with no consumer break (the shape is cap-independent).

### C3. Routes-only; compiler adoption deferred
- **Recommendation:** expose L5 to HTTP API consumers now (`GET .../memory/global`); do **not** wire it into the NF-WF-003 context compiler in this slice.
- **Effect:** L5 is available to author tooling/observability immediately; compiler tiers (L0–L4 selection policy) are **unchanged** — generation context, prompt composition, and 003's ports are untouched until a later task adopts L5 as a tier. That later task is a separate author decision because it changes generation context (the original Open decision 3's own reasoning). Nothing in this slice's types or route shape preempts or blocks that adoption.

### C4. ADR-0017 remains deferred (unchanged from the original)
This amendment neither consumes nor amends ADR-0017 (PROPOSED); it adds no `DerivedRebuildIntent` consumption and stores nothing. Storing L5 or wiring summaries still reverses frozen decisions and requires an explicit author/ADR action.

## D. Corrected required-reading list

All paths verified to exist in the working tree at amendment time (replaces the original §Required reading; content requirements unchanged, additions marked +):

- [Operating constitution](../../AGENTS.md) (§5 canon authority; §8 hierarchical memory; invariant 14).
- [Evidence policy](../../docs/06-ai/MODEL-EVIDENCE-POLICY.md).
- [NF-WF-009 contract](NF-WF-009-revision-derived-memory.md) (Invariants 1-11, esp. 2/6/9/11; F3; Q1 adjudication; routes and error-mapping conventions).
- [ADR-0017](../../docs/adr/ADR-0017-derived-rebuild-intent-end-state.md) — PROPOSED, not accepted; neither consumed nor amended.
- Existing implementation: packages/ai-services/src/memory.ts (`recallNovel`, `readBlock`, `readAsOf`, `getMemoryStatus`; distinct-scope pattern :241-246), packages/memory/src/freshness.ts (`deriveFreshness` :108, `deriveAsOfFreshness` :36), packages/memory/src/types.ts, packages/memory/src/constants.ts, packages/memory/src/rebuild.ts (`processRebuild` FAILED-row persistence), packages/memory/src/settle.ts (`mainBranchHead`), apps/api/src/memory-routes.ts, apps/api/src/services/memory-queue.ts.
- + packages/database/prisma/schema.prisma — `Saga` (:1749-1772, no number column; `createdAt` is the only stable creation timestamp), `OutlineNode` (:1782+, `@@unique([sagaId, order])`), `MemoryProjection` (:2884+, FK `source_revision_id` → `revisions` cascade) — grounding for §A2, §A5, §C1.
- + packages/auth/authorization.ts — `ROLE_CAPABILITIES` / `requireCapability` / `ForbiddenError` (→ 403 mapping) — grounding for fixture 6's correction.
- + apps/api/src/memory.test.ts — seed helpers and route-test patterns this amendment's fixtures build on.
- [NF-WF-030](NF-WF-030-gap095-memory-reconciliation.md) and [NF-WF-051](NF-WF-051-memory-reconciliation-sweeper.md) — reconciliation receipts (unchanged).
- [Environment preflight](../../docs/11-deployment/ENVIRONMENT-PREFLIGHT.md) (unchanged).
- [ISSUES-AND-GAPS](../../docs/implementation/ISSUES-AND-GAPS.md) — NF-WF-009 F3 entry (unchanged).

## E. Open decisions still requiring the author (task stays NOT READY)

1. Ordering policy (§C1 — default if unrecorded: `(createdAt, id)`).
2. `MEMORY_ARC_SCOPES_MAX` value (§C2 — default if unrecorded: 20).
3. Compiler adoption of L5 (§C3 — default if unrecorded: routes-only).
4. ADR-0017 deferral acknowledgment (§C4).

This amendment resolves **conflicts**, not these decisions. READY is still gated on recording them, per the original contract.

---

*End of amendment. The frozen original remains authoritative for every section not explicitly superseded above.*
