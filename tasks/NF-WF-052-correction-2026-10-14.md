# Correction — Task NF-WF-052: query semantics for the global memory union read

- **Date:** 2026-10-14
- **Title:** NF-WF-052 query-semantics correction — 2026-10-14
- **Status:** CORRECTION — supersedes the conflicting parts of `tasks/NF-WF-052-amendment-2026-10-14.md` (sha256 `7075d793…7f04`) listed in §6 below, and the parts of the frozen original `tasks/NF-WF-052-global-memory-union-read.md` (sha256 `ccffa3bb…793a3`) that the amendment superseded and this correction re-specifies. All sections not listed as superseded remain in force.
- **Scope:** design-contract text only. No implementation steps, no schema change, no model calls, no ADR-0017 selection, no NF-WF-053 shape, no new gates.
- **Task readiness:** unchanged — NOT READY on the original's Open decisions 1–4. This correction resolves query semantics, not author decisions.

---

## 1. Database-side deterministic candidate selection (normative)

**Supersedes:** amendment §A1 (which implies select-then-enumerate overflow computation and does not specify database-level limits or merge mechanics) and the original Invariant 4's "cheap to compute alongside selection" phrasing.

**Conflict resolved:** the amendment's semantics are correct but its computation sketch leaves open a fetch-all-then-slice implementation, which is forbidden. This section pins the exact database-side shape. No implementation may fetch all candidates and slice in application memory.

### 1.1 Ordering key and tie-break (normative)

The ordering key for every candidate arc scope is the pair `(createdAt, id)`:

- For saga-backed candidates: `(saga.createdAt, saga.id)` (`sagas.created_at`, packages/database/prisma/schema.prisma:1763).
- For orphan arc scopes (projection rows exist, saga row absent — reachable only mid-cascade-delete or under FK-suppressed tooling): `(MIN(memoryProjection.createdAt) for that scope, scopeString)`, where `scopeString` is the literal `arc:{arcId}`. This keeps the key total and stable in every reachable state, as amendment §A2 defined; retained unchanged.

**Exact tie-break comparator for equal `createdAt` (both within a source query and across the merged lists):**

```
compare(a, b) =
  if a.createdAt <  b.createdAt  -> a first
  if a.createdAt >  b.createdAt  -> b first
  else compare(a.id, b.id) in that side's id domain:
       S side: ascending UUID byte order (Postgres uuid comparison order)
       P side: ascending scope-STRING lexicographic order (the id part is the
       literal "arc:{uuid}" string)
```

**Domain agreement (normative):** ids are unique per candidate, so each side's comparator is a strict total order; no further tie-break exists or is needed. The S-side `uuid` comparison is bytewise on the canonical 16-byte encoding. The P-side id part is the scope string `"arc:{uuid}"`: its `arc:` prefix is constant, so string-lexicographic order of the scope equals lexicographic order of the embedded canonical lowercase UUID text, which in turn equals Postgres `uuid` bytewise order. SQL `ORDER BY created_at ASC, id ASC` (S) and `ORDER BY MIN(created_at) ASC, scope ASC` (P) therefore agree exactly with each other and with the app-side merge comparator; the per-side boundary predicates of §1.4/§1.5 never compare across domains (P against `$last_scope`, S against `$last_id`). The tie-break is identical to amendment §A2's recommendation but is here NORMATIVE, not a default-if-unrecorded choice; it matches Open decision 1's recorded default (`(createdAt, id)`), which remains an author decision only in the sense that the author may later replace the whole key — this correction does not close Open decision 1, it only makes the implementation deterministic under the default.

### 1.2 The two bounded source queries (normative)

Let `CAP = MEMORY_ARC_SCOPES_MAX` (constant, default 20; amendment §C2 recommendation retained, decision still OPEN).

**Query P — projection-arc distinct scopes (bounded):**

```sql
SELECT scope, MIN(created_at) AS first_created_at
FROM memory_projections
WHERE novel_id = $1 AND scope LIKE 'arc:%'
GROUP BY scope
ORDER BY MIN(created_at) ASC, scope ASC   -- scope IS the id part of the key ("arc:{uuid}")
LIMIT $CAP;
```

**Prisma note (normative):** the raw `GROUP BY` SQL above is the **reference (and only conformant) shape** for Query P. Prisma's `groupBy` cannot ORDER BY an aggregate with LIMIT deterministically, and a plain `findMany` over `memoryProjection` has NO scope-level grouping — it returns one row per build attempt per scope for the whole novel (unbounded, row-per-build). A `findMany` without the grouping semantics is therefore **non-conformant as written** (it is exactly the fetch-all-then-slice §1.2 forbids). A conformant implementation uses `$queryRaw` with the SQL above (or an equivalent grouped, aggregate-ordered, LIMITed form).

```ts
// NON-CONFORMANT as written — shown only to mark the forbidden shape:
db.memoryProjection.findMany({
  where: { novelId, scope: { startsWith: "arc:" } },
  select: { scope: true, createdAt: true },
  orderBy: [{ createdAt: "asc" }, { scope: "asc" }],
}) // no grouping, no LIMIT: returns every projection row of the novel — FORBIDDEN
```

**Query S — saga arcs (bounded):**

```sql
SELECT id, created_at
FROM sagas
WHERE novel_id = $1
ORDER BY created_at ASC, id ASC
LIMIT $CAP;
```

Both queries are bounded at the database (`LIMIT $CAP`). Each returns at most CAP rows. No `COUNT` over the full candidate set is issued here; overflow counting is §1.4.

### 1.3 Merge of the two sorted lists (normative)

Merge P and S in application code with the standard k-way merge step (both inputs are already sorted by the §1.1 comparator), applying the comparator: on equal `createdAt`, the smaller `id` (ascending UUID byte order) comes first. Orphan-scope keys (P rows with no matching saga id) use their `(MIN(created_at), scopeString)` key. Saga-backed candidates present in both lists are the same candidate — deduplicate by saga id, keeping the saga row's key.

The merged list is total-ordered; the first CAP entries are the **selected window**. Total rows materialized in memory: ≤ 2·CAP. **No fetch-all-then-slice anywhere**: neither source query is unbounded, and the merge never requests more rows than the two LIMITed result sets.

### 1.4 overflow.count without unbounded fetch (normative)

**Supersedes:** amendment §A1's "overCapCount: … cheap to compute alongside selection" — which is only true without a database bound; with §1.2's LIMITs it would be wrong. The count is computed exactly, without fetching all candidates, as follows.

Let `lastKey` = the `(createdAt, id)` of the CAP-th (last) selected candidate from §1.3. If fewer than CAP candidates exist, `overflow` is zeroed and §1.4/§1.5 are skipped entirely.

**Count query per source (exact predicate shape):**

```sql
-- P-side count: DISTINCT SCOPES whose aggregate key is beyond the boundary.
-- COUNT must run over the GROUP BY (one candidate = one scope), never over raw
-- rows: memory_projections holds one row per build attempt per scope
-- (@@unique([novelId, scope, sourceRevisionId]), schema.prisma:2904), so a
-- row-level COUNT overcounts by the number of stored revisions per scope.
SELECT COUNT(*) FROM (
  SELECT scope
  FROM memory_projections
  WHERE novel_id = $1 AND scope LIKE 'arc:%'
  GROUP BY scope
  HAVING (MIN(created_at), scope) > ($last_created_at, $last_scope)
) beyond;

-- S-side count (sagas: one row per saga, so WHERE-level predicate is exact)
SELECT COUNT(*) FROM sagas
WHERE novel_id = $1
  AND (created_at > $last_created_at
       OR (created_at = $last_created_at AND id > $last_id));
```

The predicate is the ordering-key successor predicate `(created_at, id) > (last_created_at, last_id)` expressed as a disjunction (S side) and as a `HAVING` row comparison over the aggregate key (P side) — the standard keyset-pagination predicate, exact under the §1.1 comparator. The P-side boundary compares scope STRINGS against the last selected P-side scope (`$last_scope`); the S-side boundary compares UUIDs against the last selected S-side id (`$last_id`); comparison domains are never mixed in one query. If the last selected key came from the merged list, each side uses the last key *on that side that was selected*; if a side contributed no selected rows, that side's count is its full candidate count — one unfiltered aggregate on that side with the same WHERE/GROUP BY base and no successor predicate, still returning one row.

**Exact dedupe of the union count.** A saga-backed scope beyond the boundary appears in BOTH beyond-sets (its `arc:{id}` aggregate in P, its saga row in S), but it is one candidate. `overCapCount = |P_beyond ∪ S_beyond| = P_count + S_count − |P_beyond ∩ S_beyond|`, with the intersection computed as one predicate-bounded aggregate (never a row fetch):

```sql
SELECT COUNT(*) FROM (
  SELECT scope
  FROM memory_projections
  WHERE novel_id = $1 AND scope LIKE 'arc:%'
  GROUP BY scope
  HAVING (MIN(created_at), scope) > ($last_created_at, $last_scope)
) p
JOIN (
  SELECT id FROM sagas
  WHERE novel_id = $1
    AND (created_at > $last_created_at
         OR (created_at = $last_created_at AND id > $last_id))
) s ON p.scope = 'arc:' || s.id::text;  -- ::text required: Postgres has no text || uuid operator; ::text emits canonical lowercase, matching arcScope format
```

`firstExcludedOrderingKey` = the minimum key satisfying the successor predicate — obtained from the §1.5 query's first row, or `null` when `overCapCount = 0`.

### 1.5 overflow.overCapArcIds — bounded (normative)

A second bounded query per source, same successor predicate, same ORDER BY, LIMIT 50 total across both sources (fetch up to 50 from each side in id order, merge, truncate to 50):

```sql
-- per source, then app-side merge + truncate to 50
-- P side: the successor predicate MUST sit in HAVING over the aggregate key.
-- A WHERE-level predicate (before GROUP BY) would leak a multi-revision scope
-- with one row at/below the boundary and one row above it into the overflow
-- list although its aggregate key (MIN(created_at), scope) is inside the
-- selected window.
SELECT scope, MIN(created_at) AS first_created_at
FROM memory_projections
WHERE novel_id = $1 AND scope LIKE 'arc:%'
GROUP BY scope
HAVING (MIN(created_at), scope) > ($last_created_at, $last_scope)
ORDER BY MIN(created_at) ASC, scope ASC
LIMIT 50;

-- S side (one row per saga; WHERE-level predicate exact)
SELECT id, created_at FROM sagas
WHERE novel_id = $1
  AND (created_at > $last_created_at
       OR (created_at = $last_created_at AND id > $last_id))
ORDER BY created_at ASC, id ASC
LIMIT 50;
```

`overCapArcIds` is the first 50 merged ids in ordering order; `overCapCount` remains the authoritative total (§1.4). Ids beyond 50 are never enumerated.

### 1.6 Bound table (amends amendment §A6 sub-query row)

| Query | Rows returned | Unbounded? |
|---|---|---|
| P select (§1.2) | ≤ CAP | no (`LIMIT CAP`) |
| S select (§1.2) | ≤ CAP | no (`LIMIT CAP`) |
| P/S counts (§1.4) | 1 row each | no (aggregates; predicate-bounded scan, indexed by `novel_id` / scope prefix) |
| P/S overflow ids (§1.5) | ≤ 50 each | no (`LIMIT 50`) |
| per selected scope: freshness read + row read | 1 each | no (existing indexed per-scope reads) |

No query in the request path returns unbounded rows. "No fetch-all-then-slice anywhere" is a contract check in §7.

## 2. Discovery clarification: every-Saga is normative (normative)

**Clarifies (does not supersede) amendment §A2's union rule; resolves its internal ambiguity about which source is authoritative.**

The candidate arc-scope set is defined as: **every `Saga` row of the novel** (`db.saga.findMany({ where: { novelId } })`, projected to `arc:{sagaId}`), **plus** orphan arc scopes from `memoryProjection` rows with scope prefix `arc:` whose saga id has no `sagas` row. OutlineNode rows are NOT a discovery source.

**Why (schema-grounded):**

- `Saga` rows exist and are created independent of `OutlineNode` (schema.prisma:1749-1770 — `Saga` has no FK to or from `OutlineNode` for existence; the relation is one-directional `Saga.outlineNodes OutlineNode[]`, :1765). A saga with zero outline nodes is a valid, reachable state; the original acceptance criterion "MISSING arc (saga without rows) → excluded with MISSING" targets exactly this.
- Outline nodes are the **authoring surface** (schema.prisma:1782+ — `OutlineNode` hangs under a Saga and points at Chapter/Scene leaf rows); they plan chapters, they do not define the arc inventory. Deriving candidates from OutlineNode would additionally require per-parent `order` aggregation with a secondary tie-break (`@@unique([sagaId, order])` is unique per parent only, schema.prisma:1802) and would still miss sagas without nodes — strictly worse than every-Saga on both correctness and query cost.
- `db.saga.findMany` over the novel is tenant-isolated by `novelId` (the `novel_id` FK, schema.prisma:1751-1753) and is bounded by §1.2's `LIMIT CAP` — discovery and selection are the same bounded query S.

**Orphan arc scope handling: retained exactly as amendment §A2 defines** — a projection-only scope with no saga row is a candidate keyed `(MIN(memoryProjection.createdAt), scopeString)`, participates in selection and overflow normally, and, when selected, reads its block and derives freshness like any other scope; its `sagaId` response field carries the arc id from the scope string. No change.

## 3. Corrected required-reading links (normative)

**Supersedes:** the original §Required reading's relative-link prefixes and amendment §D, which repeat them.

**Conflict resolved:** the frozen original and the amendment both link `../../AGENTS.md` etc. from within `tasks/`. `tasks/` is one level below the repo root, so `../../` escapes the repository. Correct prefixes are `../` for repo-root files and `../docs/…` for docs. Same-directory links (`NF-WF-*.md`) are unchanged and already correct.

Corrected required-reading list (every link's resolved repo-relative target verified to exist in the working tree):

| Link (as written in tasks/) | Resolved repo-relative target | Exists (OBSERVED) |
|---|---|---|
| [Operating constitution](../AGENTS.md) | `AGENTS.md` | yes |
| [Evidence policy](../docs/06-ai/MODEL-EVIDENCE-POLICY.md) | `docs/06-ai/MODEL-EVIDENCE-POLICY.md` | yes |
| [ADR-0017](../docs/adr/ADR-0017-derived-rebuild-intent-end-state.md) | `docs/adr/ADR-0017-derived-rebuild-intent-end-state.md` | yes |
| [Environment preflight](../docs/11-deployment/ENVIRONMENT-PREFLIGHT.md) | `docs/11-deployment/ENVIRONMENT-PREFLIGHT.md` | yes |
| [ISSUES-AND-GAPS](../docs/implementation/ISSUES-AND-GAPS.md) | `docs/implementation/ISSUES-AND-GAPS.md` | yes |
| [NF-WF-009 contract](NF-WF-009-revision-derived-memory.md) | `tasks/NF-WF-009-revision-derived-memory.md` | unchanged from original (same-directory link; correct as-is) |
| [NF-WF-030](NF-WF-030-gap095-memory-reconciliation.md) | `tasks/NF-WF-030-gap095-memory-reconciliation.md` | unchanged (same-directory) |
| [NF-WF-051](NF-WF-051-memory-reconciliation-sweeper.md) | `tasks/NF-WF-051-memory-reconciliation-sweeper.md` | unchanged (same-directory) |

Implementation references (paths, not links, as in the original): packages/ai-services/src/memory.ts (`recallNovel`, `readBlock`, `readAsOf`, `getMemoryStatus` — distinct-scope pattern at :242-247), packages/memory/src/freshness.ts (`deriveAsOfFreshness` :36, `deriveFreshness` :108), packages/memory/src/types.ts, packages/memory/src/constants.ts (`MEMORY_RECONCILE_INTERVAL_MS` :24, `arcScope` :37), packages/memory/src/rebuild.ts (`processRebuild` :186, FAILED-row persistence :212-218), packages/memory/src/settle.ts, apps/api/src/memory-routes.ts (the three existing memory routes; the global route is added here per the original's Scope), apps/api/src/services/memory-queue.ts, packages/database/prisma/schema.prisma (`Saga` :1749-1770, `OutlineNode` :1782+, `@@unique([sagaId, order])` :1802, `MemoryProjection` :2884+, FK `sourceRevisionId` → revisions cascade :2892-2894), packages/auth/authorization.ts, apps/api/src/memory.test.ts (seed helpers).

## 4. Unchanged policy positions (restated to prevent drift)

- **Ordering key** stays `(createdAt, id)` (§1.1). Open decision 1 remains an author decision; this correction makes only the default deterministic and total.
- **Cap** stays the `MEMORY_ARC_SCOPES_MAX` constant, proposed default 20 (amendment §C2 recommendation retained; decision still OPEN; no env var).
- **Compiler adoption** remains explicitly PENDING an author decision — routes-only is this slice's recommendation (amendment §C3), and nothing here adds compiler wiring. **No NF-WF-053 shape is introduced or referenced as a gate; no ADR-0017 acknowledgment is added as a gate.** ADR-0017 remains PROPOSED and untouched; NF-WF-053 remains undrafted and outside this task's authority. Neither appears in this task's acceptance criteria as a condition.
- No implementation steps are prescribed beyond the query shapes of §1 (which are contract, not code); no schema change; no model calls. All of the original's forbidden-paths rules remain in force.

## 5. Relationship to the frozen original and the amendment

This correction is a dated artifact. It does not edit either file. Where §1–§3 above conflict with the amendment or the original, **this correction wins**; everywhere else the amendment's supersession of the original stands, and beyond the amendment's supersessions the original stands.

## 6. Section-by-section supersession map

### vs. amendment `tasks/NF-WF-052-amendment-2026-10-14.md`

| Amendment section | Status under this correction |
|---|---|
| Preamble / status block | **PRESERVED** (supersession-of-original chain retained; task NOT READY retained) |
| §A1 (bounded selection + overflow shape) | **SUPERSEDED by §1** — output shape (`scopes[]`, `excluded[]`, `overflow{overCapCount, overCapArcIds≤50, firstExcludedOrderingKey}`, reasons `MISSING | UNRESOLVABLE_SOURCE`) is PRESERVED verbatim; the computation semantics are replaced by the database-bounded shapes of §1.2–§1.5 |
| §A2 (union discovery + orphan keys) | **PRESERVED with clarification** — the union is retained; §2 resolves it normatively as every-Saga + orphan projection scopes; OutlineNode is named as non-normative and excluded as a discovery source; orphan handling kept as-is |
| §A3 (STALE/FAILED included, freshness table) | **PRESERVED in full** |
| §A4 (as-of semantics) | **PRESERVED in full** |
| §A5 (provenance + UNRESOLVABLE_SOURCE guard) | **PRESERVED in full** |
| §A6 (bounds table) | **SUPERSEDED by §1.6** (sub-query row re-specified; all bound values unchanged) |
| §B (acceptance fixtures 1–9) | **PRESERVED**, with one consequence of §1: fixture 3's determinism assertion additionally holds because both source queries and the merge are deterministic under the §1.1 comparator; no fixture text is changed |
| §C1 (ordering recommendation) | **PRESERVED** (§1.1 pins the default's tie-break normatively; the decision itself stays OPEN) |
| §C2 (cap = 20) | **PRESERVED** |
| §C3 (routes-only) | **PRESERVED** |
| §C4 (ADR-0017 deferred) | **PRESERVED**; §4 restates it is not a gate |
| §D (corrected required reading) | **SUPERSEDED by §3** (§D retained the broken `../../` prefixes; §3 fixes them) |
| §E (open decisions) | **PRESERVED in full** (all four remain OPEN author decisions) |

### vs. frozen original `tasks/NF-WF-052-global-memory-union-read.md`

| Original section | Status |
|---|---|
| Header/metadata, Goal, Environment, Dependencies, Scope (allowed/forbidden paths), Migration, Documentation | **PRESERVED** (as already amended where the amendment superseded them) |
| §Required reading | **SUPERSEDED by §3 of this correction** (link prefixes fixed; content requirements unchanged) |
| §Outputs | **SUPERSEDED** (per amendment A1/A5, whose output shape §1 preserves; computation per §1) |
| §Behavior invariants 1–7, happy path, failure handling | **PRESERVED** as amended by A2/A3/A4/A5, with Invariant 4's bounded-retrieval wording now specified concretely by §1 (no fetch-all-then-slice is a normative constraint) |
| §Acceptance | **PRESERVED** as amended by §B, plus §1 as a contract-check item (§7) |
| Open decisions 1–4 | **PRESERVED OPEN** |

## 7. Contract checks added by this correction

- Diff review confirms no query in the read path lacks a LIMIT (§1.6 table) and no code path fetches the full candidate list (no fetch-all-then-slice).
- Diff review confirms the merge comparator and the successor predicate of §1.4 agree with the SQL `ORDER BY` on both sources (test: construct candidates with equal `createdAt` across both sources and assert total order determinism).
- Diff review confirms discovery queries `sagas` (not `outline_nodes`) for the saga-arc source.

---

*End of correction. The frozen original and the amendment remain authoritative for every section not superseded above.*


[You have received this identical output 4 times. Re-reading 'agent://NF052CorrectionDraft/document_markdown' will not change it — use a narrower selector (path:A-B), or proceed with the edit.]