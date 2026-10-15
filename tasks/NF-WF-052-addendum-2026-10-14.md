# Addendum — Task NF-WF-052: disjoint candidate sources and global overflow boundary (2026-10-14)

## 0. Status and verified artifacts

**Status:** ADDENDUM — supersedes the conflicting sections of `tasks/NF-WF-052-correction-2026-10-14.md` listed in §6 below and, through it, the conflicting sections of the amendment and frozen original listed there. All other sections of the three prior artifacts remain in force. The task remains **NOT READY** on the original's Open decisions 1–4 (ordering policy, cap value, compiler adoption, ADR-0017 deferral); this addendum resolves none of them and adds no new gates.

**Frozen artifacts read (sha256 verified against the working tree before drafting):**

| Artifact | sha256 | Match |
|---|---|---|
| `tasks/NF-WF-052-global-memory-union-read.md` | `ccffa3bb4f40d303551992f75f3431a51217513ee6ef4921812c55ded41793a3` | yes (frozen, byte-identical, untouched) |
| `tasks/NF-WF-052-amendment-2026-10-14.md` | `7075d793d3974d8d5478bf9270b2e41ae2e9e64096836edea46648507d5d7f04` | yes (frozen, byte-identical, untouched) |
| `tasks/NF-WF-052-correction-2026-10-14.md` | `1febd2d236277d74bca47893accd07b9cb02c21715ff10896d379c47770162b2` | yes (frozen, byte-identical, untouched) |

**Defect repaired (ISSUES-AND-GAPS.md:31-47, "Batch 7 contract counterexample"):** correction §1.2–§1.4 select projection scopes keyed by `MIN(memoryProjection.createdAt)` and Saga candidates keyed by `Saga.createdAt`, dedupe to the Saga key, and then compute overflow against **per-source last-selected boundaries**. Per-source boundaries do not express the **global** selected window. The verified counterexample (cap 2; Sagas S1 createdAt 2026-01-01, S2 2026-01-02; P contains S1's later projection createdAt 2026-02-01 plus one orphan `arc:ORPH` createdAt 2026-03-01): S selects S1,S2; P contributes no selected rows; the correction's rule yields P full-count = 2, but the true overflow is 1 (the orphan only — S1 is already selected via S). The §1.4 intersection JOIN is empty here, so its subtraction machinery is dead weight as well. Root cause: S1's projection rows and S1's Saga row are **the same candidate** appearing in two sources with different keys (`MIN(P.createdAt)` vs `S.createdAt`), so "last selected per source" is not well-defined against the global window.

**Fix in one sentence:** make the two candidate sources **disjoint by construction** (P = orphan arc scopes only; S = every Saga row, which already covers all saga-backed candidates), then order the merged window by **one normalized key with one global boundary** shared by both sources.

**Scope:** design-contract text only. No implementation, no schema change, no endpoint code, no ADR-0017 action, no NF-WF-053 scope.

---

## 1. Normative source definitions (disjoint by construction)

**Supersedes:** correction §1.2 (Query P) and §1.3's "deduplicate by saga id, keeping the saga row's key" mechanics. Query S is retained unchanged.

**Source S — every Saga row of the novel (unchanged from correction §1.2):**

```sql
SELECT id, created_at
FROM sagas
WHERE novel_id = $1
ORDER BY created_at ASC, id ASC
LIMIT $CAP;
```

Source S is the sole owner of every saga-backed candidate. A saga-backed scope's projection rows confer no separate candidacy: S already discovered the saga, and the scope's block read/freshness derivation proceed per amendment §A3–§A5 against that scope's rows as before.

**Source P — orphan arc scopes ONLY (normative replacement for Query P):**

```sql
SELECT scope, MIN(created_at) AS first_created_at
FROM memory_projections
WHERE novel_id = $1
  AND scope LIKE 'arc:%'
  AND NOT EXISTS (
    SELECT 1 FROM sagas s
    WHERE s.novel_id = memory_projections.novel_id
      AND s.id::text = substring(memory_projections.scope from 5)  -- strip "arc:" prefix
  )
GROUP BY scope
ORDER BY MIN(created_at) ASC, scope ASC   -- scope IS the id part of the key ("arc:{uuid}")
LIMIT $CAP;
```

Semantics: P contains a projection scope iff its embedded arc id has **no** `sagas` row for this novel (tenant-isolated via the `novel_id` match inside the `NOT EXISTS`; `sagas.novel_id` FK is `onDelete: Cascade`, schema.prisma:1752, so orphans arise only mid-cascade-delete or under FK-suppressed tooling — the same reachable states amendment §A2 already documented). The `NOT EXISTS` is the same predicate the amendment's "intersected with the novel's sagas for tenant isolation" described, applied as an exclusion against Saga existence instead of an inclusion join — this is what makes the sources disjoint.

**Consequences of disjointness (all normative):**

1. **No dedupe step exists.** Correction §1.3's "saga-backed candidates present in both lists are the same candidate — deduplicate by saga id, keeping the saga row's key" is **deleted**: a saga id can appear in at most one source (S if the saga row exists, P if it does not — never both, since P's `NOT EXISTS` and S's `WHERE novel_id = $1` are exact complements for the same novel). The merge (§2) is a plain merge of two disjoint sorted lists.
2. **No intersection counting exists.** Correction §1.4's `overCapCount = P_count + S_count − |P_beyond ∩ S_beyond|` and its intersection JOIN (`ON p.scope = 'arc:' || s.id::text`) are **deleted in full**. `overCapCount = P_beyond_count + S_beyond_count` (simple sum, §3).
3. The "dedupe to the Saga key" key-collision defect from the Batch 7 counterexample is structurally impossible: no candidate key exists in both sources.
4. The Prisma non-conformance note of correction §1.2 carries over verbatim: P must be a grouped, aggregate-ordered, LIMITed form (`$queryRaw` with the SQL above); a plain ungrouped `findMany` over `memoryProjection` remains **forbidden** (row-per-build, fetch-all-then-slice). The raw grouped SQL above remains the **reference and only conformant shape** for P.

---

## 2. One normalized ordering key and one global boundary

**Supersedes:** correction §1.1's per-side boundary framing and §1.3's per-source last-selected rule; §1.1's key definition and tie-break comparator are **retained verbatim** (they already normalize P's id part to the scope string and S's to the uuid).

**Normalized key.** Every candidate — from either source — carries the key `(createdAt, id)`:

- S side: `(saga.created_at, saga.id)` (uuid domain).
- P side: `(MIN(memoryProjection.created_at), scope)` (scope-string domain; the literal `arc:{uuid}`, whose `arc:` prefix is constant).

The Batch 7 defect is precisely that the correction derived **two different keys for the same candidate** (S1: `(S.createdAt, S1-uuid)` from S vs `(2026-02-01, "arc:S1")` from P). With disjoint sources each candidate has exactly one key — the normalization is now well-defined instead of dedupe-dependent.

**Global boundary.** Merge the two sorted source lists (standard k-way merge under the §1.1 comparator; ≤ 2·CAP rows materialized; no fetch-all-then-slice). The first CAP entries of the **merged** list are the selected window. Let

```
lastKey = key of the CAP-th entry of the merged window   (null when fewer than CAP candidates exist)
```

`lastKey` is **the single global boundary**. There is no per-source boundary.

**One successor predicate, two projections.** Both sources test overflow with the same predicate against the same `lastKey`:

```
beyond(k) ⟺ k.createdAt > lastKey.createdAt
          OR (k.createdAt = lastKey.createdAt AND k.id > project-id(lastKey, my-domain))
```

where the id projection is **domain-local**: the P side compares P-side keys only, i.e. `scope` strings against the P-domain projection of `lastKey.id`; the S side compares uuids against the S-domain projection. A boundary from the other side is transformed by projection before use:

- If `lastKey` came from S (uuid `u`): the P-side predicate compares against the string `"arc:" || u` — valid because P's id domain and S's uuid domain agree bytewise (§5).
- If `lastKey` came from P (scope string `"arc:" || u`): the S-side predicate compares against the uuid `u` (canonical text parsed back; same domain agreement).

This projection rule replaces the correction's "each side uses the last key *on that side that was selected*; if a side contributed no selected rows, that side's count is its full candidate count" fallback — **that fallback wording is deleted**; it is exactly the machinery the Batch 7 counterexample breaks. Under disjoint sources + global boundary there is no fallback: each side's count predicate is uniformly "key > lastKey (projected into my domain)".

**`firstExcludedOrderingKey`** = the minimum merged key strictly beyond `lastKey`, i.e. the first row of the §4 retrieval merge; `null` when `overCapCount = 0`. It is emitted in the response's ordering-agnostic `{ createdAt, id }` shape (id part rendered per its source domain: scope string for P-side keys, uuid for S-side keys — the response field is a string either way).

---

## 3. Exact overflow counting (simple sum, no intersection)

**Supersedes:** correction §1.4 in full (per-source fallback counting and the intersection JOIN).

If fewer than CAP candidates exist in total, `overflow` is zeroed (`overCapCount: 0, overCapArcIds: [], firstExcludedOrderingKey: null`) and §3/§4 are skipped. Otherwise:

```sql
-- P-side count: DISTINCT orphan scopes whose aggregate key is beyond the global boundary.
-- COUNT over the GROUP BY (one candidate = one scope), never over raw rows:
-- memory_projections holds one row per build attempt per revision per scope
-- (@@unique([novelId, scope, sourceRevisionId]), schema.prisma:2904).
SELECT COUNT(*) FROM (
  SELECT scope
  FROM memory_projections
  WHERE novel_id = $1 AND scope LIKE 'arc:%'
    AND NOT EXISTS (SELECT 1 FROM sagas s
                    WHERE s.novel_id = memory_projections.novel_id
                      AND s.id::text = substring(memory_projections.scope from 5))
  GROUP BY scope
  HAVING (MIN(created_at), scope) > ($last_created_at, $last_scope_projected)
) beyond;

-- S-side count (one row per saga; WHERE-level disjunction exact)
SELECT COUNT(*) FROM sagas
WHERE novel_id = $1
  AND (created_at > $last_created_at
       OR (created_at = $last_created_at AND id > $last_uuid_projected));
```

```
overCapCount = P_beyond_count + S_beyond_count     -- exact: sources are disjoint
```

No intersection aggregate, no `::text` JOIN, no inclusion–exclusion. The HAVING-vs-WHERE placement is retained from correction §1.5's rationale: a P-side WHERE-level predicate would leak a multi-revision scope with one row above the boundary although its aggregate key sits inside the window; the `HAVING` row comparison over `(MIN(created_at), scope)` is the correct candidate-level predicate. (For P the leak consequence is even stronger than undercount: a non-orphan multi-revision scope can no longer appear in P at all — see §7 case 2.)

---

## 4. Bounded overflow-prefix retrieval

Retains correction §1.5's bound and merge mechanics, with the global boundary substituted for per-source boundaries:

```sql
-- P side (per side LIMIT 50, then app-side merge + truncate to 50)
SELECT scope, MIN(created_at) AS first_created_at
FROM memory_projections
WHERE novel_id = $1 AND scope LIKE 'arc:%'
  AND NOT EXISTS (SELECT 1 FROM sagas s
                  WHERE s.novel_id = memory_projections.novel_id
                    AND s.id::text = substring(memory_projections.scope from 5))
GROUP BY scope
HAVING (MIN(created_at), scope) > ($last_created_at, $last_scope_projected)
ORDER BY MIN(created_at) ASC, scope ASC
LIMIT 50;

-- S side
SELECT id, created_at FROM sagas
WHERE novel_id = $1
  AND (created_at > $last_created_at
       OR (created_at = $last_created_at AND id > $last_uuid_projected))
ORDER BY created_at ASC, id ASC
LIMIT 50;
```

`overCapArcIds` = first 50 ids of the app-side merge (P entries rendered as their embedded arc id, S entries as the saga id) under the §1.1/§2 comparator, **using the same successor predicate** as §3. `overCapCount` remains the authoritative total. Ids beyond 50 are never enumerated.

**Bound table (amends correction §1.6):** unchanged row bounds — P/S select ≤ CAP each; counts 1 row each; overflow ids ≤ 50 each; per selected scope one freshness read + one row read. The P-side queries additionally carry the `NOT EXISTS` anti-join (per candidate scope a `sagas` PK lookup, indexed; P's ungrouped scope population per novel is bounded by the arc-scope population and every subsequent step is LIMIT-bounded). No query returns unbounded rows; "no fetch-all-then-slice anywhere" remains a §8 contract check.

---

## 5. Domain-agreement note (normative)

The id parts of the two sources live in different domains that must compare identically for the merged ordering, the global boundary, and its projections to be well-defined:

- **S side:** the candidate id is the `sagas.id` uuid. Postgres compares `uuid` bytewise over the canonical 16-byte encoding.
- **P side:** the candidate id is the scope **string** `"arc:{uuid}"` (`arcScope` helper format, packages/memory/src/constants.ts:37). The `arc:` prefix is constant, so scope-string lexicographic order equals lexicographic order of the embedded UUID text. The UUID text stored in `scope` is the canonical lowercase hyphenated form (composed from canonical uuid text via `arcScope`), and lexicographic order of canonical lowercase hyphenated UUID text is **identical** to Postgres `uuid` bytewise order (fixed-width hex groups, most-significant first, `-` < any hex digit at the fixed positions).

Therefore: `ORDER BY MIN(created_at) ASC, scope ASC` (P) and `ORDER BY created_at ASC, id ASC` (S) and the app-side merge comparator all induce the **same total order** on their respective id domains, and the §2 projections of the global `lastKey` across domains are order-preserving.

**Boundary predicates never compare across domains within one query.** Each P-side SQL predicate compares scope strings only (`$last_scope_projected`); each S-side predicate compares uuids only (`$last_uuid_projected`). Cross-domain agreement is used exactly once, in the app-side merge and in the projection of `lastKey` between the two predicate forms — never inside a SQL comparison. (This retains correction §1.1's invariant while removing its dependence on per-source last-selected keys.)

**Normative guard (canonical-form invariant):** scope strings carry canonical lowercase hyphenated UUID text **by construction** (`arcScope` composes from canonical Postgres `uuid` text; Prisma and `::text` emit canonical lowercase). Non-canonical forms (uppercase/braced) are unreachable via every app path. Defensive requirement: if FK-suppressed tooling ever inserts a non-canonical scope string, the P-side read path SHOULD canonicalize before ordering (or exclude as UNRESOLVABLE_SOURCE per amendment §A5) rather than rank on divergent text — a conformant implementation documents which of the two it does.

---

## 6. Supersession map vs. the correction (and through it, the amendment/original)

| Correction section (tasks/NF-WF-052-correction-2026-10-14.md) | Status under this addendum |
|---|---|
| Preamble / status / scope | **PRESERVED** (chain retained; NOT READY retained; design-contract-only retained) |
| §1.1 (key + tie-break + domain agreement) | **PRESERVED verbatim** as the normalized key definition; its per-side boundary framing is superseded by §2 (one global boundary + domain projection) |
| §1.2 (two bounded source queries; Prisma non-conformance note) | **SUPERSEDED by §1** — Query P redefined to orphan scopes only via `NOT EXISTS`; Query S retained unchanged; Prisma note carried forward |
| §1.3 (merge + dedupe by saga id) | **SUPERSEDED by §1/§2** — dedupe mechanics deleted (sources disjoint); plain merge of disjoint lists; global boundary replaces per-source last-selected keys |
| §1.4 (count with fallback + intersection JOIN) | **SUPERSEDED by §3** — fallback counting and the intersection JOIN deleted; simple sum |
| §1.5 (overflow ids) | **PRESERVED with §2/§4 substitutions** (global boundary, P gains NOT EXISTS; bounds unchanged) |
| §1.6 (bound table) | **PRESERVED as amended by §4** |
| §2 (every-Saga normative; orphan handling) | **PRESERVED in full** (consistent: P now implements the orphan half via NOT EXISTS; S the every-Saga half) |
| §3 (required-reading link fixes) | **PRESERVED in full** |
| §4 (unchanged policy positions) | **PRESERVED in full** (open decisions untouched; no new gates) |
| §5 (relationship to prior artifacts) | **PRESERVED**, extended by this addendum as the newest dated artifact in the chain |
| §6 (supersession maps) | **PRESERVED**, amended where this table supersedes rows above |
| §7 (contract checks) | **PRESERVED**, extended by §8 below |

Through the correction's own maps: amendment §A1 (output shape, overflow aggregate, reason enum) remains in force as amended by correction §1 and now §1–§4 here; amendment §A2–§A6, §B, §C, §E remain in force as the correction preserved them; the original's sections not superseded remain in force.

---

## 7. Proof table (concrete model/query assertions)

Notation: `CAP` = cap; S-side key `(S.createdAt, sagaId)`; P-side key `(MIN(P.createdAt), scope)`; `>` = the §1.1 successor comparator with §5 domain agreement. Each row states a concrete seeded model and the exact expected result under **old** (correction §1.2–§1.4) vs **new** (this addendum) semantics.

**Case 1 — the Batch 7 checkpoint #284 counterexample (must fail old, pass new).**
Model: cap 2. Sagas: S1 (createdAt 2026-01-01), S2 (2026-01-02). P rows: one OK row for scope `arc:{S1}` at createdAt **2026-02-01** (a later projection of S1); one row for orphan scope `arc:{ORPH}` at 2026-03-01.
- Old: S selects S1,S2 (last S-side selected key (2026-01-02, S2)); P's select (ordered by MIN createdAt: S1@2026-02-01, ORPH@2026-03-01) contributes no selected rows → correction's fallback → P full-count = **2**; S_beyond = 0; intersection JOIN over P-beyond ∩ S-beyond = ∅ → `overCapCount = 2 + 0 − 0 = 2`. **Wrong:** S1 is already selected via S; the unique overflow is {ORPH} → true count **1**. The §1.4 subtraction is dead weight (∅ intersection) and cannot repair the per-source boundary defect.
- New: P = orphan scopes only → P = {ORPH} (the S1 projection row is excluded by the `NOT EXISTS`). Merged window = [S1, S2] (keys (2026-01-01,S1),(2026-01-02,S2)); lastKey = (2026-01-02, S2), projected to P domain as `"arc:" || S2`. P count: ORPH key (2026-03-01, "arc:{ORPH}") > boundary → **1**. S count: 0. `overCapCount = 1 + 0 = 1`. ✔ Exact.

**Case 2 — late projections (saga-backed scope must not appear in P at all).**
Model: saga S3 (createdAt 2026-01-03) whose **only** projection row has createdAt 2026-04-01, later than every other candidate.
- Old: S3 appears in P with key (2026-04-01, "arc:S3") and separately in S with key (2026-01-03, S3-uuid) — two different keys for one candidate; the dedupe-by-saga-id step must reconcile them, and which key "wins" changes selection and boundary results (the root defect).
- New: S3's scope fails the P `NOT EXISTS` (saga row exists) → **absent from P entirely**; fully owned by S with key (2026-01-03, S3-uuid). P contributes only true orphans. Query assertion: `SELECT scope FROM memory_projections WHERE novel_id=$1 AND scope='arc:{S3}' AND NOT EXISTS(...)` returns **0 rows**. ✔

**Case 3 — equal createdAt across S and P.**
Model: saga SX (createdAt T, id U_S) and orphan scope `arc:{O}` (MIN createdAt T, scope string `"arc:{O}"`, embedded id U_O). Tie on createdAt T.
- Old: SX has two keys (S: (T, U_S-uuid); P: (T, "arc:SX")) — cross-source tie-breaking is undefined until dedupe picks a key; the correction's comparator names different domains per side with no cross-domain rule for the same candidate.
- New: tie broken by id in **one merged domain** (§5): compare `U_S` (uuid domain) vs `U_O` (scope-string domain strips its constant prefix → U_O text), which agree bytewise — so whichever canonical uuid text is lexicographically smaller comes first, identically in the S-side SQL ORDER BY, the P-side SQL ORDER BY, and the app-side merge. The **uuid-domain comparison applies** to the tie (both ids rendered as canonical uuid text). Boundary predicates never compare across domains within one query (§5). Assert: app merge order == SQL ORDER BY order on both sides for equal-`createdAt` seeds. ✔

**Case 4 — duplicate builds (multiple rows per scope).**
Model: orphan scope `arc:{O}` with **3** stored rows (one per source revision; legal under `@@unique([novelId, scope, sourceRevisionId])`, schema.prisma:2904 — one row per build attempt per revision).
- Old (and any naive form): a row-level COUNT with the boundary predicate counts up to **3** for one candidate.
- New: `GROUP BY scope` collapses to **one** candidate keyed `(MIN(created_at), 'arc:{O}')`; both the §3 count (COUNT over the grouped subquery) and the §4 id list (one row per scope) treat it once. Query assertion: grouped count returns 1, not 3. ✔

**Case 5 — one empty source.**
- P empty (no orphan scopes — the normal healthy state: every arc scope is saga-backed): P count = 0, P id list = ∅; `overCapCount = 0 + S_beyond_count`. The global boundary falls wholly to S-side keys; the P-side predicate (against the projected boundary) trivially matches nothing. Assert exact sum == S_beyond_count == number of sagas ranked > CAP.
- S empty (no Saga rows; only orphan projections — reachable mid-cascade-delete): S count = 0, S list = ∅; `overCapCount = P_beyond_count`; boundary falls wholly to P-side keys. Assert exact sum == P_beyond_count.
- Both empty or total ≤ CAP: zeroed `overflow` object (`{overCapCount: 0, overCapArcIds: [], firstExcludedOrderingKey: null}`); §3/§4 skipped. ✔

**Case 6 — no overflow (all candidates ≤ cap).**
Model: total distinct candidates ≤ CAP. Merged window = all candidates; lastKey = key of the last candidate; both successor predicates match nothing. Expected: `overflow = { overCapCount: 0, overCapArcIds: [], firstExcludedOrderingKey: null }` (amendment §A1 zeroed shape). Assert counts return 0 and the id queries return ∅. ✔

**Case 7 — over cap (exact counts, truncation, first-excluded key).**
Model: candidates C1..C30 (cap 20), mixed sources, total order under the §1.1 comparator. Expected: selected = first 20 of the **merged** order (deterministic, byte-identical across repeated calls); `overCapCount = 10` = (P keys beyond lastKey) + (S keys beyond lastKey), no double count (disjoint sources make the sum exact); `overCapArcIds` = first 10 merged ids beyond lastKey, rendered as arc ids (P) / saga ids (S); `firstExcludedOrderingKey` = key of C21 = min key strictly beyond lastKey. If ≥ 51 overflow candidates: list truncated at 50, count still authoritative. ✔

---

## 8. Contract checks (added by this addendum; extends correction §7)

- Diff review confirms Query P carries the `NOT EXISTS` against `sagas` (novel-scoped) and P contains **no** saga-backed scope (test: seed a saga-backed multi-revision scope and assert it is absent from P's select, count, and id queries).
- Diff review confirms **no dedupe-by-saga-id step and no intersection JOIN** exist anywhere in the read path; `overCapCount` is a two-term sum.
- Diff review confirms a **single global boundary** (`lastKey` from the merged window) feeds both sides' predicates, with per-domain projection (§2) and no per-source last-selected fallback or "full count if side contributed no selected rows" branch.
- Diff review confirms the merge comparator, both SQL ORDER BYs, and the successor predicates agree under the §5 domain agreement (test: equal-`createdAt` seeds across sources assert one total order; test: a boundary from S produces the exact P predicate `"arc:" || last_uuid` and vice versa).
- Diff review confirms overflow counting is GROUP BY-scoped on the P side (row-level COUNT forbidden) and every query in the read path is LIMIT- or aggregate-bounded (correction §1.6 table, as amended §4).
- Diff review confirms all prior contract checks remain in force: no schema change, no model calls, `summary: null` / `summaryStatus: "SKIPPED"` on every returned block, discovery queries `sagas` (not `outline_nodes`), no fetch-all-then-slice.
- Frozen-artifact integrity: `tasks/NF-WF-052-global-memory-union-read.md`, `tasks/NF-WF-052-amendment-2026-10-14.md`, `tasks/NF-WF-052-correction-2026-10-14.md` remain byte-identical to the hashes in §0; this addendum is a separate dated artifact and edits none of them.

---

## 9. Verified working-tree line anchors (observed 2026-10-14)

All line numbers below were read from the current working tree while drafting; where a prior artifact cited a range, the observed value is recorded:

- `packages/database/prisma/schema.prisma` — `model Saga` :1749 (uuid PK :1750, `novelId` FK cascade :1751-1752, `createdAt` :1763, `outlineNodes` relation :1765, `@@map("sagas")` :1769; previously cited range :1749-1772 spans the model through its closing brace). `model MemoryProjection` :2884 (`sourceRevisionId` FK :2892, cascade `onDelete: Cascade` on `sourceRevision` :2893, `createdAt` :2903, `@@unique([novelId, scope, sourceRevisionId])` :2904, `@@index([novelId, scope])` :2905, `@@map("memory_projections")` :2906). `@@unique([sagaId, order])` (OutlineNode) :1802.
- `packages/memory/src/constants.ts` — `MEMORY_RECONCILE_INTERVAL_MS` :24; `arcScope` helper :37.
- `packages/ai-services/src/memory.ts` — distinct-scope pattern (`findMany` with `select: { scope: true }`, `distinct: ["scope"]`) :243-247 (correction cited :242-247; explanatory comment line :242 confirmed).
- `packages/memory/src/freshness.ts` — `deriveAsOfFreshness` :36; `deriveFreshness` :108.
- `docs/implementation/ISSUES-AND-GAPS.md` — "Batch 7 contract counterexample" entry :31-47 (defect statement, owner, and "Next:" directives this addendum implements).

---

*End of addendum. The frozen original, amendment, and correction remain authoritative for every section not superseded above. Open decisions 1–4 remain OPEN author decisions; the task remains NOT READY.*
